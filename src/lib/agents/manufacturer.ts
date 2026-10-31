import type { InvestigationAgent } from "./types";
import { runTinyFishGoal } from "../tinyfish/client";
import { asError, emptyManufacturer } from "./shared";

export const manufacturerAgent: InvestigationAgent<"manufacturer"> = {
  name: "manufacturer",
  async run({ input }) {
    const goal = `Navigate the official manufacturer website for ${input.productName} model ${input.modelNumber ?? "(unknown)"}. Find product- and region-relevant warranty terms, duration, start-date rules, exclusions, required documents and claim process. Capture official source URLs and short evidence excerpts. Do not claim coverage is confirmed unless the source and case facts establish it.`;
    try {
      const raw = await runTinyFishGoal(goal);
      // TODO(Phase 5): parse and validate the real TinyFish result.
      return { ...emptyManufacturer("partial", "Browser task completed; result normalization is pending."), investigatedAt: new Date().toISOString(), error: { code: "RESULT_NORMALIZATION_PENDING", message: JSON.stringify(raw).slice(0, 500) } };
    } catch (error) {
      return { ...emptyManufacturer("failed", "Manufacturer investigation did not complete."), investigatedAt: new Date().toISOString(), error: asError(error) };
    }
  },
};
