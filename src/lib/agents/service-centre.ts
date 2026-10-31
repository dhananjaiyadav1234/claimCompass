import type { AgentResult } from "../contracts";
import type { InvestigationAgent } from "./types";
import { runTinyFishGoal } from "../tinyfish/client";
import { asError } from "./shared";

export const serviceCentreAgent: InvestigationAgent = {
  name: "service_centre",
  async run({ input }): Promise<AgentResult> {
    const goal = `On the official manufacturer website, locate the authorised service-centre locator. Interact with the actual locator: choose the relevant product category if required, select ${input.state || "the appropriate state"} and ${input.city}, submit the search, and extract only the service centres actually returned. Capture centre name, address, phone if displayed, source URL and evidence. Do not invent or supplement results from memory. If the locator is blocked or unavailable, report that clearly and provide the official support fallback if discoverable.`;
    try {
      const raw = await runTinyFishGoal(goal);
      return { agent: "service_centre", status: "partial", summary: "Browser task completed; result normalization is pending.", findings: [], error: { code: "RESULT_NORMALIZATION_PENDING", message: JSON.stringify(raw).slice(0, 500) } };
    } catch (error) {
      return { agent: "service_centre", status: "failed", summary: "Service-centre discovery did not complete.", findings: [], error: asError(error) };
    }
  },
};
