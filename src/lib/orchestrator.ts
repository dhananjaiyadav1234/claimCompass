import { randomUUID } from "node:crypto";
import type { AgentResult, InvestigationResult } from "./contracts";
import { store } from "./store";
import { publishEvent } from "./events";
import { sellerAgent } from "./agents/seller";
import { manufacturerAgent } from "./agents/manufacturer";
import { serviceCentreAgent } from "./agents/service-centre";
import { assessResolution } from "./resolution";

export function startInvestigation(caseId: string): string {
  const input = store.getCase(caseId);
  if (!input) throw new Error("CASE_NOT_FOUND");

  const investigationId = randomUUID();
  const now = new Date().toISOString();
  const result: InvestigationResult = {
    investigationId, caseId, status: "running", agents: [],
    missingDocuments: [],
    financialAssessment: {
      purchaseValue: input.purchasePrice,
      confirmedRecovery: null,
      estimatedRecovery: null,
      currency: input.currency,
      note: "Purchase value under investigation; this is not a guaranteed or estimated refund.",
    },
    createdAt: now, updatedAt: now,
  };
  store.saveInvestigation(result);
  publishEvent(investigationId, "status", "Investigation started.");

  // Local hackathon runner. Use a durable queue for multi-instance deployment.
  void executeInvestigation(investigationId, caseId).catch(error => {
    const current = store.getInvestigation(investigationId);
    if (current) {
      current.status = "failed";
      current.updatedAt = new Date().toISOString();
      store.saveInvestigation(current);
    }
    publishEvent(investigationId, "warning", error instanceof Error ? error.message : "Unexpected orchestration error.");
    publishEvent(investigationId, "complete", "Investigation failed.");
  });

  return investigationId;
}

async function executeInvestigation(investigationId: string, caseId: string): Promise<void> {
  const input = store.getCase(caseId);
  const result = store.getInvestigation(investigationId);
  if (!input || !result) throw new Error("CASE_OR_INVESTIGATION_NOT_FOUND");

  const runAgent = async (agent: typeof sellerAgent | typeof manufacturerAgent): Promise<AgentResult> => {
    publishEvent(investigationId, "agent", `${agent.name} investigation started.`, agent.name);
    const agentResult = await agent.run({ investigationId, caseId, input });
    result.agents = [...result.agents.filter(a => a.agent !== agent.name), agentResult];
    result.updatedAt = new Date().toISOString();
    store.saveInvestigation(result);
    publishEvent(investigationId, "agent", `${agent.name} investigation ${agentResult.status}.`, agent.name, { findingsCount: agentResult.findings.length, error: agentResult.error });
    return agentResult;
  };

  const [seller, manufacturer] = await Promise.all([runAgent(sellerAgent), runAgent(manufacturerAgent)]);
  const assessment = assessResolution(input, seller, manufacturer);
  result.recommendation = assessment.recommendation;
  result.missingDocuments = assessment.missingDocuments;

  if (assessment.shouldFindServiceCentre) {
    publishEvent(investigationId, "status", "Warranty evidence suggests checking authorised service options.");
    publishEvent(investigationId, "agent", "Service-centre discovery started.", "service_centre");
    const service = await serviceCentreAgent.run({ investigationId, caseId, input });
    result.agents.push(service);
    publishEvent(investigationId, "agent", `Service-centre discovery ${service.status}.`, "service_centre", { findingsCount: service.findings.length, error: service.error });
  } else {
    publishEvent(investigationId, "status", "Service-centre search skipped because current evidence does not yet support that route.");
  }

  const statuses = result.agents.map(a => a.status);
  result.status = statuses.length > 0 && statuses.every(s => s === "failed") ? "failed" : statuses.some(s => s === "failed" || s === "partial") ? "partial" : "completed";
  result.updatedAt = new Date().toISOString();
  store.saveInvestigation(result);
  publishEvent(investigationId, "complete", `Investigation ${result.status}.`);
}
