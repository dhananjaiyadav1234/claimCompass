# TinyFish Integration

## SDK and references

- Package: **`@tiny-fish/sdk` 0.11.0** (official TypeScript SDK, ESM-only, Node ≥ 18). Installed version verified from `node_modules/@tiny-fish/sdk/package.json`; API shapes below were read from its README and `dist/**/*.d.ts`, not assumed.
- References: https://www.npmjs.com/package/@tiny-fish/sdk · https://github.com/tinyfish-io/tinyfish-cookbook · https://docs.tinyfish.ai/for-coding-agents · API keys: https://agent.tinyfish.ai/api-keys
- (The npm page / README and the type declarations shipped in the package were the sources used. The cookbook and docs.tinyfish.ai were not separately crawled for this phase.)

## Setup

1. Create a key at https://agent.tinyfish.ai/api-keys.
2. Put it in `.env.local` (git-ignored) or export it in your shell: `TINYFISH_API_KEY=...`
3. Server-only. Never use a `NEXT_PUBLIC_` prefix. `.env.example` lists the name only.

If the key is missing, `runTinyFishTask` throws `TinyFishError("NOT_CONFIGURED", …)` with setup instructions; nothing is called.

## Verified SDK facts

| Concern | Verified behaviour |
|---|---|
| Auth | `new TinyFish({ apiKey })` (or `TINYFISH_API_KEY` env). 401 → `AuthenticationError`. |
| Start a task | `client.agent.stream(params, options)` (also `run()` blocking, `queue()` + `runs.get()` polling). We use **`stream`** for live progress. |
| Params | `goal` (string, required), `url` (string, **required**), `output_schema` (top-level JSON-Schema object), `browser_profile` (`lite`/`stealth`), `agent_config` (`max_duration_seconds`, `max_steps`, …), `proxy_config`, `capture_config`, `webhook_url` (https). |
| Events | `STARTED{run_id}` → `STREAMING_URL{streaming_url}` → `PROGRESS{purpose}`* → `COMPLETE{run_id,status,result,error}`; `HEARTBEAT` may interleave. |
| Final result | `COMPLETE.status` ∈ `PENDING|RUNNING|COMPLETED|FAILED|CANCELLED`; `result` is `Record<string,unknown> | null`; `error` is `{message, category: SYSTEM_FAILURE|AGENT_FAILURE|BILLING_FAILURE|UNKNOWN, code?, retry_after}` or null. |
| Cancel/timeout | Pass an `AbortSignal`; the SDK also has a client `timeout` (default 600 s) and retries 408/429/5xx (`maxRetries`, default 2; we use 1). |
| Errors | `SDKError` → `APIStatusError` subclasses (`AuthenticationError`, `PaymentRequiredError`, `RateLimitError`, `RequestTimeoutError`, …), `APITimeoutError`. |

**Account gating observed live:** `agent_config.max_steps` was rejected for our account ("not enabled for custom max steps yet… join the beta"). `max_duration_seconds` is accepted. So `maxSteps` is optional in the adapter and **unset by default**; only pass it if your account has the beta.

**Not provided by the SDK:** there is no "blocked page" status. The adapter infers `BLOCKED` from the failed run's error message (captcha / bot protection / access denied / forbidden / Cloudflare / 403). This is a heuristic; agents should additionally ask TinyFish (via `output_schema`) to report blocked/no-results states explicitly.

## Adapter architecture — `src/lib/tinyfish/client.ts`

Generic and reusable; contains no seller/manufacturer logic.

```ts
runTinyFishTask<T>(input: {
  url: string; goal: string;
  outputSchema?: object;        // JSON Schema sent to TinyFish as output_schema
  resultSchema?: ZodType<T>;    // validated locally; mismatch => INVALID_RESPONSE
  timeoutMs?: number;           // default 120_000
  maxSteps?: number;            // optional, beta-gated
  browserProfile?: "lite" | "stealth";
  onProgress?: (purpose: string) => void;   // forward to SSE events
}, client?: TinyFishLike): Promise<{
  runId, status: "COMPLETED", result: T, streamingUrl?, startedAt, finishedAt, durationMs, progress: string[]
}>
```

It resolves only for a `COMPLETED` run with an object result. Everything else throws `TinyFishError` with a stable `code`:

| code | Cause |
|---|---|
| `NOT_CONFIGURED` | `TINYFISH_API_KEY` missing |
| `AUTH_FAILED` / `BILLING` / `RATE_LIMITED` | 401 / 402 or `BILLING_FAILURE` / 429 |
| `TIMEOUT` | our wall-clock budget (`timeoutMs`) elapsed, or SDK timeout |
| `BLOCKED` | failed run whose error looks like captcha/bot/access-denied |
| `CANCELLED` | run status `CANCELLED` |
| `TASK_FAILED` | run `FAILED` for another reason |
| `PROVIDER_ERROR` | other SDK/API error (message redacted + truncated to 300 chars) |
| `INVALID_RESPONSE` | stream ended without `COMPLETE`, null/non-object result, or Zod mismatch |

**Timeouts:** an `AbortController` fires at `timeoutMs`, stopping our read of the stream, and `agent_config.max_duration_seconds` is set to the same budget so TinyFish stops the run too. A timed-out run may still be billed up to that cap. **A failed or timed-out task is not a negative policy finding** — agents must report it as `failed`/`blocked`, never as "not eligible".

**Logging:** one line at start (`run id`, URL host, goal length) and one at completion/failure (`code`). Goals, results and the key are never logged; the key is also redacted from error messages. `agents/shared.ts#asError` maps `TinyFishError` to agent error codes `TINYFISH_<code>`.

**Currently the three agents are stubs** (`AGENT_NOT_IMPLEMENTED`); they do not call TinyFish yet (Phases 4–6).

## Tests

- Mocked (`npm test`, `tests/tinyfish.test.ts`): missing key, success, timeout, provider run failure, SDK auth/rate-limit errors, blocked page, invalid responses (no COMPLETE / null result / schema mismatch), secret redaction.
- **Live smoke test** (`npm run smoke:tinyfish`, `tests/live/tinyfish.live.test.ts`): a real TinyFish run on `https://example.com`; needs `TINYFISH_API_KEY` in the environment; uses credits; excluded from `npm test`.

## Actual smoke-test outcome

Run on 2026-10-31 via `npm run smoke:tinyfish`:

- Run id `dcda16ab-67ef-4799-8c02-bac0f9fedfd8`, status `COMPLETED`, 16.8 s, 4 progress events.
- Result: `{"pageTitle":"Example Domain","heading":"Example Domain","linkText":"Learn more"}`.
- A first attempt failed with the `max_steps` gating described above (that surfaced the issue); `maxSteps` was then removed from the smoke test.
