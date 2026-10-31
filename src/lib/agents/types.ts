import type {
  AgentName, Case, ManufacturerWarrantyResult, SellerInvestigationResult, ServiceCentreResult,
} from "../contracts";

export interface AgentContext {
  investigationId: string;
  caseId: string;
  input: Case;
  /** Emit a progress message to the investigation event stream. Never pass prompts or secrets. */
  emit?: (message: string) => void;
}

export interface AgentResultMap {
  seller: SellerInvestigationResult;
  manufacturer: ManufacturerWarrantyResult;
  service_centre: ServiceCentreResult;
}

export interface InvestigationAgent<N extends AgentName = AgentName> {
  readonly name: N;
  run(context: AgentContext): Promise<AgentResultMap[N]>;
}
