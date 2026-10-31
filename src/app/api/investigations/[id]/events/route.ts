import { TERMINAL_INVESTIGATION_STATUSES, type InvestigationEvent } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 300;
const HEARTBEAT_MS = 15_000;

const frame = (e: InvestigationEvent) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!store.getInvestigation(id)) return apiError(404, "INVESTIGATION_NOT_FOUND", "No investigation with that id.");

  // Reconnect: browsers send Last-Event-ID automatically; ?lastEventId= is for manual use.
  const raw = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("lastEventId");
  let cursor = Number.parseInt(raw ?? "0", 10);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastWrite = Date.now();
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; };

  const stream = new ReadableStream({
    start(controller) {
      const write = (s: string) => { controller.enqueue(encoder.encode(s)); lastWrite = Date.now(); };
      const tick = () => {
        try {
          for (const e of store.getEvents(id, cursor)) { write(frame(e)); cursor = e.seq; }
          const inv = store.getInvestigation(id);
          if (inv && TERMINAL_INVESTIGATION_STATUSES.includes(inv.status) && store.getEvents(id, cursor).length === 0) {
            stop();
            controller.close();
          } else if (Date.now() - lastWrite >= HEARTBEAT_MS) {
            write(": heartbeat\n\n");
          }
        } catch { stop(); }
      };
      write("retry: 3000\n\n");
      tick();
      if (timer === undefined && !request.signal.aborted) timer = setInterval(tick, POLL_MS);
      request.signal.addEventListener("abort", () => { stop(); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
