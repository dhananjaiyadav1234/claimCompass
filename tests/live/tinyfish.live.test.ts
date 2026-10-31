/**
 * LIVE smoke test: makes a real TinyFish request against https://example.com (consumes credits).
 * Run with: npm run smoke:tinyfish   (requires TINYFISH_API_KEY in the environment)
 */
import { expect, it } from "vitest";
import { runTinyFishTask } from "@/lib/tinyfish/client";

it("runs a real TinyFish browser task and returns structured JSON", async () => {
  const progress: string[] = [];
  const out = await runTinyFishTask<{ pageTitle: string; heading: string; linkText: string }>({
    url: "https://example.com",
    goal: "Read this page and report its browser title, the main heading text, and the text of the one link on the page. Do not click anything.",
    outputSchema: {
      type: "object",
      properties: { pageTitle: { type: "string" }, heading: { type: "string" }, linkText: { type: "string" } },
      required: ["pageTitle", "heading", "linkText"],
    },
    timeoutMs: 120_000,
    onProgress: p => progress.push(p),
  });
  console.log(JSON.stringify({ runId: out.runId, status: out.status, durationMs: out.durationMs, progress, result: out.result }, null, 2));
  expect(out.status).toBe("COMPLETED");
  expect(out.runId).toBeTruthy();
  expect(`${out.result.pageTitle} ${out.result.heading}`).toMatch(/example domain/i);
}, 150_000);
