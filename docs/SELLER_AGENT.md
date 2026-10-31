# Seller Investigation Agent

Code: `src/lib/agents/seller.ts` (agent), `seller-schema.ts` (TinyFish output schema + Zod validation), `seller-eligibility.ts` (deterministic eligibility). Built on the generic TinyFish adapter (`src/lib/tinyfish/client.ts`); no second client.

## Responsibilities

Find the **seller's official** return / refund / replacement rules for a *defective* product and report what the customer can reasonably do next. It does **not** decide that a refund or replacement will happen, and it has no access to the customer's order.

## Input

The existing canonical `Case` (`src/lib/contracts.ts`) via `AgentContext`: `productName`, `modelNumber?`, `seller`, `purchaseDate`, `purchasePrice`, `issueDescription`, `location`. (The contract has no separate `brand` field.) No seller, product or city is hardcoded. `context.emit(message)` is optional and feeds the investigation event stream.

## Output

A `SellerInvestigationResult` (`contracts.ts`): the base agent fields (`status`, `summary`, `evidence[]`, `missingInformation`, `limitations`, `error?`, `investigatedAt`) plus `applicableConditions`, `possibleRoutes`, and an additive `details: SellerDetails`:

- `sellerIdentity` — seller/marketplace name, `officialWebsite`, `merchantConfirmed` (always `false`: no order access), `soldBy` (always `"unknown"`), `policyDistinguishesSellerTypes` (yes/no/unknown, from the policy text), `uncertainty[]`.
- `policyFindings` — `defectiveReturn`, `refund`, `replacement`, `timeLimits[]`, `eligibilityConditions[]`, `exclusions[]`, `categoryRestrictions[]`, `distinguishesDefectiveFromChangeOfMind`.
- `customerAction` — `recommendedNextStep`, `claimInitiationUrl`, `supportRoute`, `documentsToPrepare[]` (URLs are kept only if on the seller's official domain; a claim URL may sit behind login).
- `investigationStatus` — `policyLocated`, `policyVerified`, `eligibilityAssessable`, `missingInformation[]`, `blockedPages[]`.
- `eligibility` — see below.

`Evidence` gained optional, additive fields: `sourceName`, `sourceType` (`official_policy | official_help | official_account | unverified`), `confidence`. `title` = topic, `description` = the finding, `excerpt` = quoted text.

Agent `status`: `completed` (policy located on an official page, no block), `partial` (nothing verified / site unidentified / partly blocked), `blocked` (policy pages inaccessible), `failed` (provider/timeout/invalid output/missing key). None of these is a statement that the customer is ineligible.

## Investigation flow

1. **Identify the site** — TinyFish Search for `"<seller> <country> return refund replacement policy defective product"` (retry with a help-centre query). Only `https` results whose host contains the seller's name are considered official; best policy-looking URL is the start page. Snippets are never used as evidence. If none → `partial`, "official website could not be identified".
2. **Browse** — one `runTinyFishTask` with a goal built from the case (defect text sanitised, page text declared untrusted), `output_schema` (JSON Schema), a Zod `resultSchema` and a 300 s budget. The agent is told to stay on the seller's official site, never log in / solve CAPTCHAs / submit forms, copy short excerpts verbatim, and report `blocked` rather than guess.
3. **Validate** — the Zod schema must pass or the run is `INVALID_RESPONSE` → `failed`. Free text is cleaned and truncated.
4. **Verify evidence** — official-domain source pages are re-fetched with TinyFish Fetch and each excerpt is checked against the page text.
5. **Assemble** the result and compute eligibility.

Progress events (via `emit`): Starting seller investigation → Identifying seller website → Locating return policy → `Browsing: <step>` … → Extracting defective-product conditions → Verifying evidence → Completing seller investigation. Prompts and keys are never emitted.

## Source verification rules

| Evidence `verification` | Meaning |
|---|---|
| `verified` | Official-domain page; excerpt found in the independently fetched page text |
| `potentially_applicable` | Official-domain page, but the excerpt could not be confirmed (page JS-rendered, fetch failed, wording differs). Confidence is capped below `high` |
| `unverified` | Page not on the seller's official domain. Excluded from the customer-facing summary; cannot establish a policy |

"Official domain" = a host label contains the seller's name (e.g. `acmemart` in `help.acmemart.com`). **Limitation:** a look-alike such as `acmemart-reviews.example` would pass; the check is a heuristic, not a registry lookup. Product listings are never treated as policy.

## Eligibility assessment

Five separate states, never collapsed: policy exists · policy applies to category · customer appears to satisfy conditions · seller-confirmed (**always `false`**) · cannot determine. `eligibility.assessment`:

- `policy_not_verified` — no official policy evidence.
- `cannot_determine` — the policy differs for third-party sellers, a category restriction may apply, or no verified numeric window.
- `appears_within_window` / `appears_outside_window` — only when a numeric window is stated **and** that number appears in an official `time_limit` excerpt. Compares days since `purchaseDate` (not delivery date) to the window. Outside-window wording says the route "may be closed" and that other routes (e.g. manufacturer warranty) are not ruled out.

This is deterministic code; the LLM/browser agent never decides eligibility.

## Error handling

All TinyFish errors use the adapter's codes, surfaced as `TINYFISH_<CODE>` (`NOT_CONFIGURED`, `AUTH_FAILED`, `BILLING`, `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, …). Blocked pages (browser-reported or provider-failure text) → status `blocked`, code `SELLER_PAGE_BLOCKED`. The agent never throws; messages are safe (no keys/stack traces). Failure ≠ ineligible, blocked ≠ no policy, unknown seller ≠ marketplace is the seller.

## Limitations

- No order access: marketplace-vs-third-party seller for the customer's order, delivery date and order-specific eligibility are unknown.
- Windows are measured from `purchaseDate`; policies often count from delivery.
- A run takes roughly 1–5 minutes (browser navigation); the 300 s budget can still time out → `failed`.
- Excerpt verification depends on TinyFish Fetch being able to read the page.
- TinyFish's structured output rejects JSON-Schema `description` keys (found live), so field semantics live in the goal text.
- Region handling relies on the search/site; multi-region sellers may land on the wrong country site.

## Tests

```bash
npm test                      # 52 mocked tests incl. tests/seller.test.ts (no network; TINYFISH_API_KEY is stripped by tests/setup.ts)
npm run live:seller           # OPTIONAL live run: real search + browser + fetch. CONSUMES CREDITS, 1–5 min, needs TINYFISH_API_KEY
```

The mocked tests drive the real adapter and Zod schema through a fake TinyFish transport.

## Illustrative example (invented — NOT a verified policy result)

Seller "Acme Mart" (fictional), purchase 6 days ago, policy "Defective items can be returned or replaced within 10 days of delivery." on `https://www.acmemart.test/help/returns`:

```jsonc
{ "status": "completed",
  "details": { "eligibility": { "assessment": "appears_within_window", "policyWindowDays": 10, "daysSincePurchase": 6,
      "customerAppearsToSatisfy": "yes", "sellerConfirmed": false, "explanation": "…Only the seller can confirm eligibility…" } },
  "evidence": [{ "title": "Defective-product return", "sourceType": "official_policy", "verification": "verified", "confidence": "high", "excerpt": "Defective items can be returned or replaced within 10 days of delivery." }] }
```

## Live run record (2026-10-31, one manual run)

Third attempt against a real marketplace completed (~246 s) with real official help-centre URLs. Earlier attempts timed out at 180 s/240 s (agent kept expanding FAQs) and one was rejected for a `description` key; goal and budget were adjusted. In that run the policy was found and 3 of 7 excerpts verified; the policy differed for third-party sellers, so eligibility was correctly `cannot_determine`; the agent's claimed 7-day window was not in any cited excerpt, which led to the "number must appear in the excerpt" rule above.
