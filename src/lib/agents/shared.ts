import { randomUUID } from "node:crypto";
import type {
  AgentError, AgentName, Evidence, ManufacturerWarrantyResult,
  SellerInvestigationResult, ServiceCentreResult,
} from "../contracts";

export function evidence(agent: AgentName, input: Omit<Evidence, "id" | "retrievedAt" | "agent">): Evidence {
  return { ...input, agent, id: randomUUID(), retrievedAt: new Date().toISOString() };
}

export function asError(error: unknown): AgentError {
  const message = error instanceof Error ? error.message : "Unknown agent error";
  return {
    code: message.includes("not configured") ? "TINYFISH_NOT_CONFIGURED" : "AGENT_EXECUTION_FAILED",
    message,
  };
}

const base = { evidence: [], missingInformation: [], limitations: [] };

export function emptySeller(status: SellerInvestigationResult["status"] = "pending", summary = "Not started."): SellerInvestigationResult {
  return { ...base, agent: "seller", status, summary, applicableConditions: [], possibleRoutes: [] };
}

export function emptyManufacturer(status: ManufacturerWarrantyResult["status"] = "pending", summary = "Not started."): ManufacturerWarrantyResult {
  return { ...base, agent: "manufacturer", status, summary, exclusions: [], requiredDocuments: [], claimSteps: [] };
}

export function emptyServiceCentre(status: ServiceCentreResult["status"] = "pending", summary = "Not started."): ServiceCentreResult {
  return { ...base, agent: "service_centre", status, summary, centres: [] };
}
