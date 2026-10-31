/**
 * TinyFish adapter. Generic: no seller/manufacturer logic belongs here.
 *
 * Built on the official SDK (@tiny-fish/sdk 0.11.0) `client.agent.stream()`:
 * events STARTED → STREAMING_URL → PROGRESS* → COMPLETE. The COMPLETE event carries
 * `status` (RunStatus), `result` (object|null) and `error` ({message, category, code?}|null).
 * See docs/TINYFISH_INTEGRATION.md.
 */
import { TinyFish, AuthenticationError, PaymentRequiredError, RateLimitError, RequestTimeoutError, APITimeoutError, SDKError } from "@tiny-fish/sdk";
import type { AgentRunParams, CompleteEvent } from "@tiny-fish/sdk";
import type { ZodType, ZodTypeDef } from "zod";

export type TinyFishErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "BILLING"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "BLOCKED"
  | "CANCELLED"
  | "TASK_FAILED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export class TinyFishError extends Error {
  constructor(
    readonly code: TinyFishErrorCode,
    message: string,
    readonly runId?: string | null,
  ) {
    super(message);
    this.name = "TinyFishError";
  }
}

export interface TinyFishTaskInput<T = Record<string, unknown>> {
  /** Page to start on (required by TinyFish). */
  url: string;
  /** Natural-language goal. */
  goal: string;
  /** JSON Schema (top-level object) asking TinyFish for structured output. */
  outputSchema?: Record<string, unknown>;
  /** Optional Zod schema to validate the final result; failure => INVALID_RESPONSE. */
  resultSchema?: ZodType<T, ZodTypeDef, unknown>;
  /** Overall wall-clock budget. Default 120s. */
  timeoutMs?: number;
  /** Cap on agent steps (passed to TinyFish agent_config.max_steps). */
  maxSteps?: number;
  browserProfile?: "lite" | "stealth";
  onProgress?: (purpose: string) => void;
}

export interface TinyFishTaskResult<T = Record<string, unknown>> {
  runId: string | null;
  status: "COMPLETED";
  result: T;
  streamingUrl?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  progress: string[];
}

/** The slice of the SDK we use; lets tests inject a fake. */
export interface TinyFishLike {
  search?: { query(params: { query: string; location?: string; language?: string }): Promise<{ results: Array<{ position: number; title: string; url: string; snippet: string; site_name: string }> }> };
  fetch?: { getContents(params: { urls: string[]; format?: "markdown" }): Promise<{ results: Array<{ url: string; final_url: string | null; text: unknown }>; errors: Array<{ url: string; error: string }> }> };
  runs?: { get(runId: string): Promise<{ error?: { message?: string } | null }> };
  agent: { stream(params: AgentRunParams, options?: { signal?: AbortSignal; onStarted?: (e: { run_id: string }) => void; onStreamingUrl?: (e: { streaming_url: string }) => void; onProgress?: (e: { purpose: string }) => void }): Promise<AsyncIterable<{ type: string } & Partial<CompleteEvent>>> };
}

const DEFAULT_TIMEOUT_MS = 120_000;
const BLOCKED_PATTERN = /captcha|bot[- ]?(detect|protect)|access denied|forbidden|blocked|cloudflare|verify you are (a )?human|unusual traffic|\b403\b/i;

export function getTinyFishApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.TINYFISH_API_KEY?.trim();
  if (!key) {
    throw new TinyFishError("NOT_CONFIGURED", "TinyFish is not configured: set TINYFISH_API_KEY in .env.local (get a key at https://agent.tinyfish.ai/api-keys).");
  }
  return key;
}

function createClient(): TinyFishLike {
  return new TinyFish({ apiKey: getTinyFishApiKey(), maxRetries: 1 }) as unknown as TinyFishLike;
}

function redact(text: string): string {
  const key = process.env.TINYFISH_API_KEY?.trim();
  const cleaned = key ? text.split(key).join("[redacted]") : text;
  return cleaned.slice(0, 300);
}

function mapSdkError(error: unknown): TinyFishError {
  if (error instanceof TinyFishError) return error;
  if (error instanceof AuthenticationError) return new TinyFishError("AUTH_FAILED", "TinyFish rejected the API key.");
  if (error instanceof PaymentRequiredError) return new TinyFishError("BILLING", "TinyFish reports a billing/credit problem.");
  if (error instanceof RateLimitError) return new TinyFishError("RATE_LIMITED", "TinyFish rate limit reached.");
  if (error instanceof APITimeoutError || error instanceof RequestTimeoutError) return new TinyFishError("TIMEOUT", "TinyFish request timed out.");
  if (error instanceof SDKError) return new TinyFishError("PROVIDER_ERROR", redact(error.message));
  return new TinyFishError("PROVIDER_ERROR", redact(error instanceof Error ? error.message : "Unknown TinyFish error"));
}

function mapRunFailure(event: Partial<CompleteEvent>): TinyFishError {
  const message = redact(event.error?.message ?? `TinyFish run ended with status ${event.status}`);
  const runId = event.run_id ?? null;
  if (event.status === "CANCELLED") return new TinyFishError("CANCELLED", message, runId);
  if (event.error?.category === "BILLING_FAILURE") return new TinyFishError("BILLING", message, runId);
  if (BLOCKED_PATTERN.test(message)) return new TinyFishError("BLOCKED", message, runId);
  return new TinyFishError("TASK_FAILED", message, runId);
}

/**
 * Run one TinyFish browser task to completion. Resolves only for a COMPLETED run with a
 * usable result; every other outcome throws a TinyFishError with a stable `code`.
 */
export async function runTinyFishTask<T = Record<string, unknown>>(
  input: TinyFishTaskInput<T>,
  client?: TinyFishLike,
): Promise<TinyFishTaskResult<T>> {
  const tf = client ?? createClient();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const progress: string[] = [];
  let runId: string | null = null;
  let streamingUrl: string | undefined;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  const params: AgentRunParams = {
    goal: input.goal,
    url: input.url,
    ...(input.outputSchema ? { output_schema: input.outputSchema } : {}),
    ...(input.browserProfile ? { browser_profile: input.browserProfile } : {}),
    agent_config: {
      max_duration_seconds: Math.max(1, Math.floor(timeoutMs / 1000)),
      ...(input.maxSteps ? { max_steps: input.maxSteps } : {}),
    },
  };

  let host = "invalid-url";
  try { host = new URL(input.url).host; } catch { /* leave placeholder */ }

  try {
    const stream = await tf.agent.stream(params, {
      signal: controller.signal,
      onStarted: e => { runId = e.run_id; console.info(`[tinyfish] run started id=${e.run_id} host=${host} goalChars=${input.goal.length}`); },
      onStreamingUrl: e => { streamingUrl = e.streaming_url; },
      onProgress: e => { progress.push(e.purpose); input.onProgress?.(e.purpose); },
    });

    let complete: Partial<CompleteEvent> | undefined;
    for await (const event of stream) {
      if (event.type === "COMPLETE") { complete = event as Partial<CompleteEvent>; break; }
    }

    if (timedOut) throw new TinyFishError("TIMEOUT", `TinyFish task exceeded ${timeoutMs} ms.`, runId);
    if (!complete) throw new TinyFishError("INVALID_RESPONSE", "TinyFish stream ended without a COMPLETE event.", runId);
    runId = complete.run_id ?? runId;
    if (complete.status !== "COMPLETED") {
      // The stream's COMPLETE event can omit the error; the stored run record usually has the reason.
      if (!complete.error?.message && runId && tf.runs) {
        try {
          const rec = await tf.runs.get(runId);
          if (rec.error?.message) complete = { ...complete, error: { ...(complete.error ?? { category: "UNKNOWN", retry_after: null }), message: rec.error.message } as CompleteEvent["error"] };
        } catch { /* keep the generic message */ }
      }
      throw mapRunFailure(complete);
    }

    const raw = complete.result;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new TinyFishError("INVALID_RESPONSE", "TinyFish completed without a structured result object.", runId);
    }
    let result: T = raw as T;
    if (input.resultSchema) {
      const parsed = input.resultSchema.safeParse(raw);
      if (!parsed.success) throw new TinyFishError("INVALID_RESPONSE", "TinyFish result did not match the expected schema.", runId);
      result = parsed.data;
    }
    const finished = Date.now();
    console.info(`[tinyfish] run completed id=${runId} ms=${finished - started} steps=${progress.length}`);
    return { runId, status: "COMPLETED", result, streamingUrl, startedAt, finishedAt: new Date(finished).toISOString(), durationMs: finished - started, progress };
  } catch (error) {
    const mapped = timedOut ? new TinyFishError("TIMEOUT", `TinyFish task exceeded ${timeoutMs} ms.`, runId) : mapSdkError(error);
    console.warn(`[tinyfish] run failed id=${runId ?? "n/a"} code=${mapped.code}`);
    throw mapped;
  } finally {
    clearTimeout(timer);
  }
}

export interface WebSearchHit { title: string; url: string; snippet: string; position: number }

/** TinyFish Search: ranked results only (snippets are NOT evidence). */
export async function searchTinyFish(query: string, opts: { location?: string; language?: string } = {}, client?: TinyFishLike): Promise<WebSearchHit[]> {
  const tf = client ?? createClient();
  if (!tf.search) throw new TinyFishError("PROVIDER_ERROR", "TinyFish search is unavailable.");
  try {
    const res = await tf.search.query({ query, ...opts });
    return res.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet, position: r.position }));
  } catch (error) {
    throw mapSdkError(error);
  }
}

/** TinyFish Fetch: page text (markdown) for up to 10 URLs. Returns url -> text|null (null = could not fetch). */
export async function fetchTinyFishPages(urls: string[], client?: TinyFishLike): Promise<Map<string, string | null>> {
  const tf = client ?? createClient();
  if (!tf.fetch) throw new TinyFishError("PROVIDER_ERROR", "TinyFish fetch is unavailable.");
  const out = new Map<string, string | null>(urls.map(u => [u, null]));
  if (urls.length === 0) return out;
  try {
    const res = await tf.fetch.getContents({ urls: urls.slice(0, 10), format: "markdown" });
    for (const r of res.results) {
      const text = typeof r.text === "string" ? r.text : null;
      out.set(r.url, text);
      if (r.final_url) out.set(r.final_url, text);
    }
    return out;
  } catch (error) {
    throw mapSdkError(error);
  }
}
