import type { AgentResult } from "../contracts";
import type { InvestigationAgent } from "./types";
import { runTinyFishGoal } from "../tinyfish/client";
import { asError } from "./shared";

export const manufacturerAgent: InvestigationAgent = {
  name: "manufacturer",
  async run({ input }): Promise<AgentResult> {
    const goal = `Navigate the official manufacturer website for ${input.productName} model ${input.model}. Find product- and region-relevant warranty terms, duration, start-date rules, exclusions, required documents and claim process. Capture official source URLs and short evidence excerpts. Do not claim coverage is confirmed unless the source and case facts establish it.`;
    try {
      const raw = await runTinyFishGoal(goal);
      return { agent: "manufacturer", status: "partial", summary: "Browser task completed; result normalization is pending.", findings: [], error: { code: "RESULT_NORMALIZATION_PENDING", message: JSON.stringify(raw).slice(0, 500) } };
    } catch (error) {
      return { agent: "manufacturer", status: "failed", summary: "Manufacturer investigation did not complete.", findings: [], error: asError(error) };
    }
  },
};
