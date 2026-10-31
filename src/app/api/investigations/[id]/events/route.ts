import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!store.getInvestigation(id)) return new Response("Investigation not found", { status: 404 });

  const encoder = new TextEncoder();
  let cursor = 0;
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const interval = setInterval(() => {
        if (closed) return;
        const all = store.getEvents(id);
        while (cursor < all.length) send(all[cursor++]);
        const result = store.getInvestigation(id);
        if (result && ["completed", "partial", "failed"].includes(result.status) && cursor >= all.length) {
          clearInterval(interval);
          closed = true;
          controller.close();
        }
      }, 400);
      // Initial keepalive
      controller.enqueue(encoder.encode(": connected\n\n"));
      const cancel = () => { closed = true; clearInterval(interval); };
      // Store cancellation hook on stream controller where supported.
      (controller as ReadableStreamDefaultController & { _cancel?: () => void })._cancel = cancel;
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
