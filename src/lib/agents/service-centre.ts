import type { InvestigationAgent } from "./types";
import { runTinyFishGoal } from "../tinyfish/client";
import { asError, emptyServiceCentre } from "./shared";

export const serviceCentreAgent: InvestigationAgent<"service_centre"> = {
  name: "service_centre",
  async run({ input }) {
    const { city, state } = input.location;
    const goal = `On the official manufacturer website, locate the authorised service-centre locator. Interact with the actual locator: choose the relevant product category if required, select ${state || "the appropriate state"} and ${city}, submit the search, and extract only the service centres actually returned. Capture centre name, address, phone if displayed, source URL and evidence. Do not invent or supplement results from memory. If the locator is blocked or unavailable, report that clearly and provide the official support fallback if discoverable.`;
    try {
      const raw = await runTinyFishGoal(goal);
      // TODO(Phase 6): parse and validate the real TinyFish result.
      return { ...emptyServiceCentre("partial", "Browser task completed; result normalization is pending."), investigatedAt: new Date().toISOString(), error: { code: "RESULT_NORMALIZATION_PENDING", message: JSON.stringify(raw).slice(0, 500) } };
    } catch (error) {
      return { ...emptyServiceCentre("failed", "Service-centre discovery did not complete."), investigatedAt: new Date().toISOString(), error: asError(error) };
    }
  },
};
