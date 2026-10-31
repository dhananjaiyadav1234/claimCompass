import type {
  AgentName, Case, ManufacturerWarrantyResult, SellerInvestigationResult, ServiceCentreResult,
} from "../contracts";

export interface AgentContext {
  investigationId: string;
  caseId: string;
  input: Case;
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
