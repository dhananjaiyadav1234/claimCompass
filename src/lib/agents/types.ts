import type { AgentName, AgentResult, CaseInput } from "../contracts";

export interface AgentContext {
  investigationId: string;
  caseId: string;
  input: CaseInput;
}

export interface InvestigationAgent {
  readonly name: AgentName;
  run(context: AgentContext): Promise<AgentResult>;
}
