import type { AgentResult } from "../contracts";
import type { InvestigationAgent } from "./types";
import { runTinyFishGoal } from "../tinyfish/client";
import { asError } from "./shared";

export const sellerAgent: InvestigationAgent = {
  name: "seller",
  async run({ input }): Promise<AgentResult> {
    const goal = `Navigate the official ${input.seller} website. Find official return, refund, replacement and defective-product support policies relevant to ${input.productName} ${input.model}. Extract exact applicable conditions, dates/windows, exclusions, support route, source page URLs and short evidence excerpts. Do not infer eligibility if purchase-specific facts are insufficient. Return structured factual findings only.`;
    try {
      const raw = await runTinyFishGoal(goal);
      // TODO: Parse and validate the real TinyFish result into AgentResult.
      return { agent: "seller", status: "partial", summary: "Browser task completed; result normalization is pending.", findings: [], error: { code: "RESULT_NORMALIZATION_PENDING", message: JSON.stringify(raw).slice(0, 500) } };
    } catch (error) {
      return { agent: "seller", status: "failed", summary: "Seller investigation did not complete.", findings: [], error: asError(error) };
    }
  },
};
