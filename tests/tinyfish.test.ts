import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuthenticationError, RateLimitError } from "@tiny-fish/sdk";
import { getTinyFishApiKey, runTinyFishTask, TinyFishError, type TinyFishLike } from "@/lib/tinyfish/client";

const base = { url: "https://example.com", goal: "Extract the title" };

type Ev = Record<string, unknown> & { type: string };
function fake(events: Ev[], opts: { hang?: boolean; throwOnStart?: unknown } = {}): TinyFishLike {
  return {
    agent: {
      async stream(_params, options) {
        if (opts.throwOnStart) throw opts.throwOnStart;
        options?.onStarted?.({ run_id: "run_1" });
        options?.onStreamingUrl?.({ streaming_url: "https://stream.example/run_1" });
        options?.onProgress?.({ purpose: "Opening page" });
        return (async function* () {
          if (opts.hang) await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          for (const e of events) yield e;
        })() as never;
      },
    },
  };
}
const complete = (over: Record<string, unknown> = {}): Ev => ({ type: "COMPLETE", run_id: "run_1", status: "COMPLETED", result: { title: "Example Domain" }, error: null, ...over });

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function code(p: Promise<unknown>) {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(TinyFishError); return (e as TinyFishError).code; }
  throw new Error("expected rejection");
}

describe("TinyFish adapter (mocked)", () => {
  it("fails clearly when the API key is missing", async () => {
    vi.stubEnv("TINYFISH_API_KEY", "");
    expect(() => getTinyFishApiKey({} as NodeJS.ProcessEnv)).toThrow(/TINYFISH_API_KEY/);
    expect(await code(runTinyFishTask(base))).toBe("NOT_CONFIGURED");
  });

  it("returns a normalized successful result with run metadata", async () => {
    const out = await runTinyFishTask({ ...base, resultSchema: z.object({ title: z.string() }) }, fake([{ type: "HEARTBEAT" }, complete()]));
    expect(out).toMatchObject({ runId: "run_1", status: "COMPLETED", result: { title: "Example Domain" }, streamingUrl: "https://stream.example/run_1", progress: ["Opening page"] });
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("times out when the provider never completes", async () => {
    expect(await code(runTinyFishTask({ ...base, timeoutMs: 50 }, fake([], { hang: true })))).toBe("TIMEOUT");
  });

  it("maps provider run failure to TASK_FAILED", async () => {
    const c = complete({ status: "FAILED", result: null, error: { message: "Agent could not finish", category: "AGENT_FAILURE", retry_after: null } });
    expect(await code(runTinyFishTask(base, fake([c])))).toBe("TASK_FAILED");
  });

  it("maps SDK auth / rate-limit errors", async () => {
    const res = new Response(null, { status: 401 });
    expect(await code(runTinyFishTask(base, fake([], { throwOnStart: new AuthenticationError("bad key sk-secret", { response: res }) })))).toBe("AUTH_FAILED");
    expect(await code(runTinyFishTask(base, fake([], { throwOnStart: new RateLimitError("slow down", { response: new Response(null, { status: 429 }) }) })))).toBe("RATE_LIMITED");
  });

  it("flags blocked pages (captcha / access denied)", async () => {
    const c = complete({ status: "FAILED", result: null, error: { message: "Blocked by CAPTCHA on the page", category: "AGENT_FAILURE", retry_after: null } });
    expect(await code(runTinyFishTask(base, fake([c])))).toBe("BLOCKED");
  });

  it("rejects invalid responses: no COMPLETE, null result, schema mismatch", async () => {
    expect(await code(runTinyFishTask(base, fake([{ type: "HEARTBEAT" }])))).toBe("INVALID_RESPONSE");
    expect(await code(runTinyFishTask(base, fake([complete({ result: null })])))).toBe("INVALID_RESPONSE");
    expect(await code(runTinyFishTask({ ...base, resultSchema: z.object({ title: z.number() }) }, fake([complete()])))).toBe("INVALID_RESPONSE");
  });

  it("never leaks the API key in error messages or logs", async () => {
    vi.stubEnv("TINYFISH_API_KEY", "tf-super-secret");
    const warn = vi.spyOn(console, "warn");
    const c = complete({ status: "FAILED", result: null, error: { message: "boom tf-super-secret", category: "UNKNOWN", retry_after: null } });
    try { await runTinyFishTask(base, fake([c])); } catch (e) { expect((e as Error).message).not.toContain("tf-super-secret"); }
    expect(JSON.stringify(warn.mock.calls)).not.toContain("tf-super-secret");
  });
});
