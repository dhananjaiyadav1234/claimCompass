/**
 * LIVE seller-agent test: real TinyFish search + browser run + page fetch (CONSUMES CREDITS, can take minutes).
 * Run with: npm run live:seller   (requires TINYFISH_API_KEY). Excluded from `npm test`.
 * The case below is only a fixture for this manual run; the agent itself has no hardcoded sellers.
 */
import { expect, it } from "vitest";
import { sellerAgent } from "@/lib/agents/seller";

it("investigates a real seller and returns an honest, typed result", async () => {
  const events: string[] = [];
  const result = await sellerAgent.run({
    investigationId: "live", caseId: "live",
    emit: m => events.push(m),
    input: {
      caseId: "live", createdAt: new Date().toISOString(),
      productName: "Wireless headphones", modelNumber: "WH-CH720N", seller: "Amazon",
      purchaseDate: "2026-10-10", purchasePrice: 4000, currency: "INR",
      issueDescription: "Left side stopped working", location: { city: "Bengaluru", state: "Karnataka", country: "India" },
    },
  });
  console.log(JSON.stringify({ events, status: result.status, summary: result.summary, error: result.error, details: result.details, evidence: result.evidence.map(e => ({ t: e.title, v: e.verification, type: e.sourceType, url: e.sourceUrl, ex: e.excerpt?.slice(0, 120) })), limitations: result.limitations }, null, 2));
  expect(["completed", "partial", "blocked", "failed"]).toContain(result.status);
  expect(result.details?.eligibility.sellerConfirmed ?? false).toBe(false);
}, 420_000);
