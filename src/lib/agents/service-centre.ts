import type { InvestigationAgent } from "./types";
import { emptyServiceCentre } from "./shared";

export const serviceCentreAgent: InvestigationAgent<"service_centre"> = {
  name: "service_centre",
  // TODO(Phase 6): implement with runTinyFishTask from ../tinyfish/client.
  async run() {
    return {
      ...emptyServiceCentre("failed", "Service-centre discovery is not implemented yet."),
      investigatedAt: new Date().toISOString(),
      error: { code: "AGENT_NOT_IMPLEMENTED", message: "This agent is not implemented yet." },
    };
  },
};
