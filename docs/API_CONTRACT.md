# ClaimCompass API Contract (v0.1)

Canonical source of truth: [`src/lib/contracts.ts`](../src/lib/contracts.ts). Types below mirror it; if they ever differ, the code wins and this doc is a bug.

Base URL: same origin as the Next.js app (`/api/...`). All bodies are JSON. No auth in this version.

## Enums

```ts
type InvestigationStatus = "queued" | "running" | "completed" | "completed_with_warnings" | "failed";
type AgentStatus = "pending" | "running" | "completed" | "partial" | "not_applicable" | "blocked" | "failed";
type AgentName = "seller" | "manufacturer" | "service_centre";
type VerificationStatus = "verified" | "potentially_applicable" | "unverified" | "not_applicable" | "unknown";
type Confidence = "high" | "medium" | "low" | "undetermined";
type EventType = "status" | "agent" | "finding" | "warning" | "complete";
```

Investigation status: `queued` (saved, not started) → `running` → one of `completed` (all agents that ran succeeded), `completed_with_warnings` (at least one agent partial/failed/blocked but something ran), `failed` (every agent that ran failed/blocked, or orchestration crashed).
`not_applicable` agent = intentionally skipped (e.g. service-centre search when warranty evidence doesn't support it). **A failed agent is not a negative finding.**

## Errors

All errors use one shape:

```ts
interface ApiErrorResponse { error: { code: "INVALID_REQUEST" | "CASE_NOT_FOUND" | "INVESTIGATION_NOT_FOUND" | "INTERNAL_ERROR"; message: string; details?: unknown } }
```

| HTTP | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Body fails validation (`details` = Zod `flatten()` output: `{ formErrors, fieldErrors }`) |
| 404 | `CASE_NOT_FOUND` | Unknown `caseId` |
| 404 | `INVESTIGATION_NOT_FOUND` | Unknown investigation id (also for the SSE endpoint) |
| 500 | `INTERNAL_ERROR` | Unexpected; no stack traces or secrets are returned |

## POST /api/cases

Request:

```ts
interface CaseInput {
  productName: string;            // required, 1–200
  modelNumber?: string;           // optional, ≤100 (strongly recommended: warranty lookup is model-specific)
  seller: string;                 // required, 1–100, e.g. "Amazon"
  purchaseDate: string;           // required, "YYYY-MM-DD", not in the future
  purchasePrice: number;          // required, ≥ 0, numeric (format in UI)
  currency?: string;              // 3-letter ISO uppercase; default "INR"
  issueDescription: string;       // required, 5–2000
  location: { city: string; state?: string; country?: string }; // city required; country default "India"
}
```

Response `201`: `{ caseId: string; case: Case }` where `Case = CaseInput(+defaults) & { caseId: string; createdAt: string }`.

## POST /api/investigations

Request: `{ "caseId": string }`. Returns **immediately** (`202`); research runs in the background.

```ts
interface CreateInvestigationResponse {
  investigationId: string;
  status: "queued";
  createdAt: string;
  eventsUrl: string;   // "/api/investigations/{id}/events"
  resultsUrl: string;  // "/api/investigations/{id}/results"
}
```

The investigation record is persisted before this response is sent, so `resultsUrl` is valid right away. Errors: 400, 404 `CASE_NOT_FOUND`.

## GET /api/investigations/:id/events  (SSE)

`Content-Type: text/event-stream`. Each message:

```
id: 5
event: agent
data: {"seq":5,"investigationId":"…","timestamp":"…","type":"agent","agent":"seller","message":"seller agent failed.","data":{…}}
```

- `id:` = `seq`, a per-investigation counter starting at 1. `event:` = `type`. `data:` = the full `InvestigationEvent` JSON (so you can use `onmessage`-style handling or `addEventListener(type)`).
- Event types: `status` (lifecycle: queued/running/branch decisions), `agent` (agent started / finished / not_applicable; `data.status`, `data.evidenceCount`, `data.error`), `finding` (one per evidence item; `data.evidenceId`, `data.sourceUrl`, `data.verification`), `warning`, `complete` (final; `data.status` is the final InvestigationStatus).
- **Connection behaviour:** first line `retry: 3000`. A `: heartbeat` comment is sent after 15 s of silence. The server closes the stream after delivering `complete`.
- **Reconnect/replay:** all events are retained in memory. Browsers' `EventSource` automatically sends `Last-Event-ID` on reconnect and only later events are replayed; you may also pass `?lastEventId=N`. A fresh connection replays from the start. Because the server closes after `complete`, **do not auto-reconnect after receiving `complete`** — call `EventSource.close()` in that handler.
- Always fetch `/results` for the authoritative state; events are progress notifications.

## GET /api/investigations/:id/results

Works at any time, including mid-run (partial results). Response `200`:

```ts
interface InvestigationResultsResponse {
  investigationId: string; caseId: string;
  status: InvestigationStatus; isFinal: boolean;      // isFinal = status is completed | completed_with_warnings | failed
  createdAt: string; updatedAt: string; completedAt?: string;
  seller: SellerInvestigationResult;                  // always present; status "pending" until it starts
  manufacturer: ManufacturerWarrantyResult;
  serviceCentre: ServiceCentreResult;                 // "pending" → "not_applicable" if skipped
  resolution: ResolutionRecommendation | null;        // null until seller+manufacturer have finished
  money: MoneySummary;
  evidence: Evidence[];                               // flattened from all agents
  error?: { code: string; message: string };          // only if orchestration itself crashed
}

interface AgentResult {
  agent: AgentName; status: AgentStatus; summary: string;
  evidence: Evidence[]; missingInformation: string[]; limitations: string[];
  error?: { code: string; message: string }; investigatedAt?: string;
}
// SellerInvestigationResult        adds: policyCategory?, applicableConditions[], possibleRoutes[]
// ManufacturerWarrantyResult       adds: manufacturer?, matchedModel?, warrantyDuration?, warrantyStartRule?, potentialCoverage?,
//                                        exclusions[], requiredDocuments[], claimSteps[], officialSupportPath?
// ServiceCentreResult              adds: manufacturer?, searchedLocation?, locatorUrl?, centres: ServiceCentre[], fallbackSupportPath?

interface ServiceCentre { name: string; address?: string; phone?: string; openingHours?: string; serviceType?: string; sourceUrl: string }

interface Evidence {
  id: string; agent: AgentName; title: string; description: string;
  sourceUrl: string; sourceTitle?: string; excerpt?: string;
  verification: VerificationStatus; retrievedAt: string;
}

interface ResolutionRecommendation {
  primaryRoute: string; alternativeRoutes: string[]; reasoning: string;
  requiredDocuments: string[]; missingInformation: string[]; nextSteps: string[]; caveats: string[];
  confidence: Confidence; evidenceIds: string[];
}

interface MoneySummary {
  currency: string;
  purchaseValueUnderInvestigation: number; // the purchase price. NOT a recovery amount.
  confirmedRecovery: number | null;        // null = unknown
  estimatedRecovery: number | null;        // null = no estimate; if set, estimateBasis explains it
  estimateBasis: string | null;
  confidence: Confidence; explanation: string;
}
```

Partial-result rules:
- One agent failing never removes another agent's result. Each agent object stands alone.
- Show per-agent status from the agent objects, not just the overall status.
- `resolution` can be `null` early; a recommendation exists even when agents failed (it will say confidence `undetermined`).
- UI must label `purchaseValueUnderInvestigation` as "purchase value under investigation" and never present it as a refund amount.

## POST /api/complaints

Request: `{ caseId: string; investigationId: string }`. Response `200`:

```ts
interface ComplaintDraft {
  subject: string; body: string; evidenceUrls: string[];
  requiresUserReview: true;   // always
  sentAutomatically: false;   // always — ClaimCompass never sends complaints
  generatedAt: string;
}
```

**Drafts only.** Nothing is sent to any seller or manufacturer. Unknown details are placeholders in square brackets (e.g. `[ADD ORDER ID / INVOICE NUMBER]`) for the user to fill. Errors: 400, 404 (`CASE_NOT_FOUND` / `INVESTIGATION_NOT_FOUND`).

## Example flow

1. `POST /api/cases` → `201 { caseId }`
2. `POST /api/investigations { caseId }` → `202 { investigationId, eventsUrl, resultsUrl, … }`
3. Open `EventSource(eventsUrl)`; update the live screen per event; on `complete`, close it.
4. `GET resultsUrl` → render the dashboard (you may also poll this every ~2 s as a fallback).
5. Optionally `POST /api/complaints` → show the draft for the user to copy.

## Known limitations (current build)

- Storage is in-memory and process-local: data is lost on restart and not shared across instances/serverless. Single `next dev` / `next start` process only.
- Agents are not implemented yet (TinyFish integration comes in later phases); until then every agent returns `failed` with `TINYFISH_NOT_CONFIGURED`.
- No auth, rate limiting or request deduplication yet.
