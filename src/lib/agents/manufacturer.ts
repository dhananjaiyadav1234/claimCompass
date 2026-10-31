import type { InvestigationAgent } from "./types";
import { emptyManufacturer } from "./shared";

export const manufacturerAgent: InvestigationAgent<"manufacturer"> = {
  name: "manufacturer",
  // TODO(Phase 5): implement with runTinyFishTask from ../tinyfish/client.
  async run() {
    return {
      ...emptyManufacturer("failed", "Manufacturer investigation is not implemented yet."),
      investigatedAt: new Date().toISOString(),
      error: { code: "AGENT_NOT_IMPLEMENTED", message: "This agent is not implemented yet." },
    };
  },
};
