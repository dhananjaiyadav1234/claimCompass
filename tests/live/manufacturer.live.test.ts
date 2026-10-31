/**
 * LIVE manufacturer-agent test: real TinyFish search + browser run + page fetch (CONSUMES CREDITS, can take minutes).
 * Run with: npm run live:manufacturer   (requires TINYFISH_API_KEY). Excluded from `npm test`.
 * The case below is only a fixture for this manual run; the agent itself has no hardcoded manufacturers.
 */
import { expect, it } from "vitest";
import { manufacturerAgent } from "@/lib/agents/manufacturer";

it("investigates a real manufacturer warranty and returns an honest, typed result", async () => {
  const events: string[] = [];
  const result = await manufacturerAgent.run({
    investigationId: "live", caseId: "live",
    emit: m => events.push(m),
    input: {
      caseId: "live", createdAt: new Date().toISOString(),
      productName: "Sony WH-CH720N", modelNumber: "WH-CH720N", seller: "Amazon",
      purchaseDate: "2026-10-10", purchasePrice: 4000, currency: "INR",
      issueDescription: "Left side stopped working", location: { city: "Bengaluru", state: "Karnataka", country: "India" },
    },
  });
  console.log(JSON.stringify({
    events, status: result.status, summary: result.summary, error: result.error,
    identity: result.details?.manufacturerIdentity, terms: result.details?.warrantyTerms, claim: result.details?.claimProcess,
    investigationStatus: result.details?.investigationStatus, assessment: result.details?.assessment,
    evidence: result.evidence.map(e => ({ t: e.title, v: e.verification, type: e.sourceType, url: e.sourceUrl, ex: e.excerpt?.slice(0, 140) })),
    limitations: result.limitations,
  }, null, 2));
  expect(["completed", "partial", "blocked", "failed"]).toContain(result.status);
  expect(result.details?.assessment.customerCoverageConfirmed ?? false).toBe(false);
}, 420_000);
