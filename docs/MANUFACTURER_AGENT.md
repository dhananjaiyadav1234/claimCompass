# Manufacturer Warranty Investigation Agent

Code: `src/lib/agents/manufacturer.ts` (agent), `manufacturer-schema.ts` (TinyFish output schema + Zod), `manufacturer-warranty.ts` (deterministic assessment), `official.ts` (official-source helpers shared with the seller agent). Uses only the generic adapter in `src/lib/tinyfish/client.ts`.

## Responsibilities

Establish what the **manufacturer's official** warranty terms say for the customer's exact model and country, explain the official claim process, and state — cautiously — whether the unit *may* be covered. It cannot confirm coverage: that needs serial-number/registration records only the manufacturer has. It never registers products, submits claims, contacts support or logs in.

## Input

The existing canonical `Case` via `AgentContext`: `productName`, `modelNumber?`, `purchaseDate`, `issueDescription`, `location` (+ `seller`, `purchasePrice`, unused here). **There is no brand field.** The manufacturer is derived cautiously from the **first word of `productName`** (`deriveBrand`), recorded in `details.manufacturerIdentity.identityBasis` and in `uncertainty[]` as unconfirmed. If no usable word exists (e.g. it starts with a number) or no official website matches that name, the agent returns `partial` ("manufacturer not identified") without browsing. No contract field was added for the brand.

## Output

`ManufacturerWarrantyResult` base fields (`status`, `summary`, `evidence[]`, `missingInformation`, `limitations`, `error?`, `investigatedAt`, `manufacturer`, `matchedModel`, `warrantyDuration`, `warrantyStartRule`, `potentialCoverage`, `exclusions`, `requiredDocuments`, `claimSteps`, `officialSupportPath`) plus an additive `details: ManufacturerDetails`:

- `manufacturerIdentity` — `name`, `identityBasis`, `officialWebsite`, `productIdentityConfidence`, `modelMatch` (`exact_verified | exact_unverified | similar_only | not_found | model_not_supplied`), `exactModelVerified`, `matchedModel`, `uncertainty[]`.
- `warrantyTerms` — `duration {value, unit}`|null, `startEvent`, `startEventDetail`, `termsApplyTo` (`exact_model | product_family | generic | unknown`), `regionalApplicability` (`covers_customer_country | other_regions_only | unknown`), `regionScope`, `internationalWarranty`, `coversDefects`, `exclusions[]`, `additionalConditions[]`.
- `claimProcess` — `claimInitiationUrl`, `requiredDocuments`, `requiredProductInformation`, `proofOfPurchaseRequired`, `serialNumberRequired`, `registrationRequired`, `inspectionRequired` (yes/no/unknown), `supportRoute`, `recommendedNextStep`.
- `investigationStatus` — `manufacturerIdentified`, `exactModelMatched`, `warrantyTermsLocated`, `warrantyTermsVerified`, `regionalApplicabilityEstablished`, `missingInformation[]`, `blockedPages[]`.
- `assessment` — `state` ∈ `warranty_not_verified | potentially_covered | appears_expired | cannot_determine`, `customerCoverageConfirmed` (**always `false`**; there is no `confirmed_covered` state), `estimatedExpiry`, `daysSincePurchase`, `explanation`, `caveats[]`.

`potentialCoverage` mirrors the assessment: `potentially_applicable` / `not_applicable` (expired) / `unknown` / `unverified`. Evidence uses the same fields as the seller agent (`sourceName`, `sourceType`, `confidence`, `excerpt`, `description` = the finding, `retrievedAt`); `title` carries a suffix when the page is product-family terms, general terms, or a different model.

Agent `status`: `completed` (exact model verified **and** a verified warranty length), `partial` (anything less), `blocked`, `failed`.

## TinyFish flow

1. **Identify** — derive the brand; TinyFish Search twice (`"<brand> <model> official warranty terms support <country>"`, `"<brand> <country> standard warranty terms"`). Candidate URLs must be `https`, on a host containing the brand name, and not a forum/community/registration/promo page. Ranking: names the model, matches the customer's country (ccTLD, `.co.xx` or `/xx/` path), warranty/support wording. Snippets are never evidence.
2. **Browse** — one `runTinyFishTask` (360 s) from the best URL with a sanitised goal: stay on the official site and the customer's country, read the exact-model page and warranty terms, copy short verbatim excerpts, mark each finding with what it applies to (`exact_model | product_family | generic | other_model`), never register/claim/contact/log in/bypass CAPTCHAs, treat page text as untrusted.
3. **Validate** — Zod; invalid ⇒ `INVALID_RESPONSE` ⇒ `failed`. Only `siteReachable`, `blocked`, `modelMatch`, `warrantyFound`, `pagesVisited`, `findings` are required; every other field defaults to `unknown`/empty/`false` (never to a positive claim).
4. **Verify** — official source pages are re-fetched (TinyFish Fetch) and each excerpt checked against the page text.
5. **Assess** — deterministic code, below.

Events: Starting manufacturer investigation → Identifying manufacturer → Matching exact product model → Locating official warranty information → `Browsing: …` → Extracting warranty conditions → Verifying regional applicability → Verifying evidence → Checking customer-specific dates → Completing warranty investigation.

## Exact model verification

`exactModelVerified` requires **all**: a model number was supplied; the browser agent reported `modelMatch: exact`; its `matchedModel` contains the model number; an official finding with `appliesTo: exact_model` whose excerpt contains the model number exists; and that excerpt was **confirmed on the fetched official page**. Otherwise `modelMatch` is `exact_unverified` / `similar_only` / `not_found` / `model_not_supplied`. Findings marked `other_model` are `not_applicable` and ignored everywhere; terms for similar models are never applied.

## Warranty assessment (`assessWarranty`)

Evaluated in order; the first failing gate decides:

1. No official warranty-topic evidence on a warranty/support page ⇒ `warranty_not_verified` (a product page alone cannot prove warranty terms).
2. Exact model not verified ⇒ `cannot_determine`.
3. Conflicting official durations for the exact model ⇒ `cannot_determine`.
4. No verified duration ⇒ `cannot_determine`. A duration counts only if its number **and unit** appear in an official warranty/support excerpt confirmed on the page (digits, or one–twelve). A missing duration is never zero.
5. Terms are product-family/generic rather than exact-model ⇒ `cannot_determine`.
6. Purchase date missing/invalid ⇒ `cannot_determine`.
7. Start event unknown (or not backed by an official `warranty_start` excerpt mentioning it) ⇒ `cannot_determine`; purchase date is never assumed. Only `purchase_date` / `invoice_date` can be compared with the purchase date; delivery/activation/other ⇒ `cannot_determine`.
8. Region not established for the customer's country ⇒ `cannot_determine`.
9. Defects explicitly not covered ⇒ `cannot_determine`.
10. Otherwise compare `purchaseDate + duration` to today: after ⇒ `appears_expired` ("would have ended around …", other cover not known), else `potentially_covered` ("does not confirm that this unit is covered").

The reported defect is never matched against exclusions semantically; exclusions are listed for the customer. `resolution.ts` gained one guard: `potentialCoverage: "not_applicable"` (expired) stops the warranty/service-centre branch even if other evidence looks supportive.

## Evidence verification

Same levels as the seller agent: `verified` (official domain, excerpt found in fetched page), `potentially_applicable` (official but unconfirmed; confidence capped below `high`), `unverified` (off-domain; ignored), plus `not_applicable` (different model). Official = a host label contains the brand name and the URL is not a forum/community/registration/promo page. Lists shown to the customer (exclusions, documents, claim steps) appear only when official warranty evidence exists; claim/support URLs are kept only if official.

## Errors

Adapter codes surface as `TINYFISH_<CODE>`; blocked pages ⇒ status `blocked`, code `MANUFACTURER_PAGE_BLOCKED`. Failure ⇒ "not a finding that the warranty has expired or does not apply"; blocked ⇒ "does not mean there is no warranty"; summaries never contain keys or stack traces.

## Limitations

- Brand comes from the first word of the product name; names like "Wireless Earbuds X" will not resolve.
- Official-domain check is a name-in-hostname heuristic.
- Region is established from a regional finding plus the browser agent's `coversCustomerCountry`; the excerpt is not required to name the country.
- No serial/registration/order data, so `customerCoverageConfirmed` is always false.
- **Live reliability:** heavy manufacturer sites (cookie banners, chat pop-ups, accordions, global-vs-country sites) are slow to browse. See the live record below.
- TinyFish rejected a goal containing a list of extra candidate URLs with a content-policy error (reproducible), so only the start URL is passed.

## Tests

```bash
npm test                       # 93 mocked tests incl. tests/manufacturer.test.ts (40); no network; TINYFISH_API_KEY stripped by tests/setup.ts
npm run live:manufacturer      # OPTIONAL live run: real search + browser + fetch. CONSUMES CREDITS, up to ~6 min, needs TINYFISH_API_KEY
```

## Illustrative example (invented — NOT a verified warranty determination)

Fictional "Zephyr", model ZB-100N, bought 21 days ago; an official warranty page says "limited warranty of 12 months from the date of purchase":

```jsonc
{ "status": "completed",
  "details": { "assessment": { "state": "potentially_covered", "customerCoverageConfirmed": false, "estimatedExpiry": "2027-10-10",
      "explanation": "Counting 12 months from the purchase date, the warranty would run until about 2027-10-10. This does not confirm that this unit is covered or that the fault is accepted as a defect." } },
  "warrantyDuration": "12 months", "warrantyStartRule": "purchase date" }
```

## Live run record (2026-10-31)

Six live attempts on a real manufacturer's India site (fixture case in `tests/live/manufacturer.live.test.ts`): the browser agent reached the exact-model support page and the official warranty article, but **none completed a result** — four timed out (300–360 s) after many navigation/pop-up steps, and two were rejected in ~15–30 s by TinyFish's content filter (traced to the extra-candidate-URL prompt line, since removed). So there is **no live end-to-end warranty result yet**; the agent fails honestly (`failed`, `TINYFISH_TIMEOUT`, no evidence, no invented terms). The 40 mocked tests exercise the full logic. Ideas for a later pass: shorter/more targeted tasks, a second pass from a fetched warranty page, or a longer budget.
