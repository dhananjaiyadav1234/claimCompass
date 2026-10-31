import type { InvestigationAgent } from "./types";
import { runTinyFishGoal } from "../tinyfish/client";
import { asError, emptySeller } from "./shared";

export const sellerAgent: InvestigationAgent<"seller"> = {
  name: "seller",
  async run({ input }) {
    const model = input.modelNumber ?? "";
    const goal = `Navigate the official ${input.seller} website. Find official return, refund, replacement and defective-product support policies relevant to ${input.productName} ${model}. Extract exact applicable conditions, dates/windows, exclusions, support route, source page URLs and short evidence excerpts. Do not infer eligibility if purchase-specific facts are insufficient. Return structured factual findings only.`;
    try {
      const raw = await runTinyFishGoal(goal);
      // TODO(Phase 4): parse and validate the real TinyFish result.
      return { ...emptySeller("partial", "Browser task completed; result normalization is pending."), investigatedAt: new Date().toISOString(), error: { code: "RESULT_NORMALIZATION_PENDING", message: JSON.stringify(raw).slice(0, 500) } };
    } catch (error) {
      return { ...emptySeller("failed", "Seller investigation did not complete."), investigatedAt: new Date().toISOString(), error: asError(error) };
    }
  },
};
