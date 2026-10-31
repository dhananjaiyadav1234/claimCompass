import type { InvestigationAgent } from "./types";
import { emptySeller } from "./shared";

export const sellerAgent: InvestigationAgent<"seller"> = {
  name: "seller",
  // TODO(Phase 4): implement with runTinyFishTask from ../tinyfish/client.
  async run() {
    return {
      ...emptySeller("failed", "Seller investigation is not implemented yet."),
      investigatedAt: new Date().toISOString(),
      error: { code: "AGENT_NOT_IMPLEMENTED", message: "This agent is not implemented yet." },
    };
  },
};
