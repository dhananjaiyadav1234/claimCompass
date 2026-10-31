# Frontend Integration Guide (for Ananya)

Full types and rules: [`API_CONTRACT.md`](./API_CONTRACT.md). You can import types directly: `import type { InvestigationResultsResponse, InvestigationEvent, CaseInput } from "@/lib/contracts"` (type-only imports; don't import the Zod schemas into client bundles unless you want client-side validation).

**Base URL:** same origin — use relative paths, e.g. `fetch("/api/cases")`. Run locally with `npm run dev`. No env vars needed for the frontend.

| Method | Path |
|---|---|
| POST | `/api/cases` |
| POST | `/api/investigations` |
| GET (SSE) | `/api/investigations/{id}/events` |
| GET | `/api/investigations/{id}/results` |
| POST | `/api/complaints` |

## Enums

- Investigation: `queued | running | completed | completed_with_warnings | failed`
- Agent: `pending | running | completed | partial | not_applicable | blocked | failed`
- Evidence verification: `verified | potentially_applicable | unverified | not_applicable | unknown`
- Event types: `status | agent | finding | warning | complete`

## Errors

Always `{ "error": { "code": "...", "message": "...", "details"?: ... } }`. Codes: `INVALID_REQUEST` (400, `details.fieldErrors` maps field → messages), `CASE_NOT_FOUND` / `INVESTIGATION_NOT_FOUND` (404), `INTERNAL_ERROR` (500).

## Complete flow

```ts
// 1. Case intake
const caseRes = await fetch("/api/cases", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({
    productName: "Sony WH-CH720N", modelNumber: "WH-CH720N", seller: "Amazon",
    purchaseDate: "2026-10-10", purchasePrice: 4000, // currency defaults to INR
    issueDescription: "Left headphone stopped working",
    location: { city: "Bengaluru", state: "Karnataka" },
  }),
});
if (!caseRes.ok) { const { error } = await caseRes.json(); /* show error.details.fieldErrors */ }
const { caseId } = await caseRes.json();            // 201

// 2. Start investigation (returns immediately)
const inv = await (await fetch("/api/investigations", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId }),
})).json();
// { investigationId, status: "queued", createdAt, eventsUrl, resultsUrl }

// 3. Live investigation screen
const es = new EventSource(inv.eventsUrl);
for (const type of ["status", "agent", "finding", "warning"] as const) {
  es.addEventListener(type, (m) => { const e = JSON.parse((m as MessageEvent).data); /* append to timeline */ });
}
es.addEventListener("complete", async () => {
  es.close();                                        // server closes too; don't let it auto-reconnect
  const results = await (await fetch(inv.resultsUrl)).json();   // 4. Dashboard
});
```

Responses (abridged):

```jsonc
// POST /api/investigations → 202
{ "investigationId": "3ed3…", "status": "queued", "createdAt": "2026-10-31T06:15:36.451Z",
  "eventsUrl": "/api/investigations/3ed3…/events", "resultsUrl": "/api/investigations/3ed3…/results" }
```

SSE messages (each `data:` is the full event JSON):

```
id: 3
event: agent
data: {"seq":3,"investigationId":"3ed3…","timestamp":"…","type":"agent","agent":"seller","message":"seller agent started.","data":{"status":"running"}}

id: 5
event: agent
data: {"seq":5,…,"agent":"seller","message":"seller agent failed.","data":{"status":"failed","evidenceCount":0,"error":{"code":"AGENT_NOT_IMPLEMENTED","message":"…"}}}

id: 9
event: complete
data: {"seq":9,…,"type":"complete","message":"Investigation completed_with_warnings.","data":{"status":"completed_with_warnings"}}
```

Results (`GET resultsUrl`, abridged):

```jsonc
{ "investigationId": "…", "caseId": "…", "status": "completed_with_warnings", "isFinal": true,
  "seller":        { "agent": "seller", "status": "completed", "summary": "…", "evidence": [ … ], "missingInformation": [], "limitations": [], "applicableConditions": [], "possibleRoutes": [] },
  "manufacturer":  { "agent": "manufacturer", "status": "failed", "error": { "code": "…", "message": "…" }, … },
  "serviceCentre": { "agent": "service_centre", "status": "not_applicable", "centres": [], … },
  "resolution":    { "primaryRoute": "…", "alternativeRoutes": [], "reasoning": "…", "nextSteps": [], "requiredDocuments": [], "missingInformation": [], "caveats": [], "confidence": "low", "evidenceIds": [] },
  "money":         { "currency": "INR", "purchaseValueUnderInvestigation": 4000, "confirmedRecovery": null, "estimatedRecovery": null, "estimateBasis": null, "confidence": "undetermined", "explanation": "…" },
  "evidence": [ … ] }
```

## Handling partial results

- Render each of `seller`, `manufacturer`, `serviceCentre` independently using its own `status`. Don't hide a completed agent because another failed.
- `pending`/`running` → spinner; `completed` → data; `partial` → data + show `limitations`/`missingInformation`; `blocked`/`failed` → show `error.message` and any fallback (honest failure state, never placeholder data); `not_applicable` → muted "not needed based on current evidence".
- Mid-run, `resolution` is `null`. Show a placeholder until it's set.
- A `failed` agent means "we couldn't check", **not** "not eligible". Word it that way.
- Money: show `purchaseValueUnderInvestigation` labelled **"Purchase value under investigation"**. Show a recovery figure only if `confirmedRecovery` is non-null; show `estimatedRecovery` only with an "Estimate" label and `estimateBasis`. `null` = unknown. Values are plain numbers in `currency`; format in the UI (`Intl.NumberFormat("en-IN", {style:"currency", currency})`).
- Complaint: `POST /api/complaints` returns a draft only (`requiresUserReview: true`, `sentAutomatically: false`). Show it for the user to copy/edit; it contains `[PLACEHOLDERS]` to fill in. Nothing is sent.

## Current limitations

- Backend storage is in-memory: restarting the server loses cases/investigations (re-create the case if you get a 404 after a restart).
- The research agents are not implemented yet (the TinyFish adapter itself is done), so right now every agent comes back `failed` with `AGENT_NOT_IMPLEMENTED` and the investigation ends `failed`. That's expected; build the UI against both states. Real results will arrive in later backend phases with no contract change.
- No auth/CORS (same-origin only), no rate limiting.
- `resolution` is a basic rule set for now and will become richer, but its shape is stable.
