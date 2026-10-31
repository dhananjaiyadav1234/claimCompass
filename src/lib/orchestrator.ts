import { randomUUID } from "node:crypto";
import type { AgentStatus, Case, Investigation, InvestigationStatus } from "./contracts";
import { store } from "./store";
import { publishEvent } from "./events";
import { sellerAgent } from "./agents/seller";
import { manufacturerAgent } from "./agents/manufacturer";
import { serviceCentreAgent } from "./agents/service-centre";
import { asError, emptyManufacturer, emptySeller, emptyServiceCentre } from "./agents/shared";
import type { InvestigationAgent } from "./agents/types";
import { assessResolution, buildMoney } from "./resolution";

export interface Agents {
  seller: InvestigationAgent<"seller">;
  manufacturer: InvestigationAgent<"manufacturer">;
  serviceCentre: InvestigationAgent<"service_centre">;
}
const defaultAgents: Agents = { seller: sellerAgent, manufacturer: manufacturerAgent, serviceCentre: serviceCentreAgent };

/**
 * Creates and persists the investigation synchronously (status "queued"), then schedules
 * the runner on a later tick so the caller returns immediately. `done` resolves when the
 * background run ends and never rejects; it exists for tests.
 */
export function startInvestigation(caseId: string, agents: Agents = defaultAgents): { investigation: Investigation; done: Promise<void> } {
  const input = store.getCase(caseId);
  if (!input) throw new Error("CASE_NOT_FOUND");

  const now = new Date().toISOString();
  const investigation: Investigation = {
    investigationId: randomUUID(),
    caseId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    seller: emptySeller(),
    manufacturer: emptyManufacturer(),
    serviceCentre: emptyServiceCentre(),
    resolution: null,
    money: buildMoney(input),
  };
  store.saveInvestigation(investigation);
  publishEvent(investigation.investigationId, "status", "Investigation queued.", undefined, { status: "queued" });

  const id = investigation.investigationId;
  const done = new Promise<void>(resolve => {
    setImmediate(() => {
      execute(id, input, agents)
        .catch(error => {
          const err = asError(error);
          store.updateInvestigation(id, inv => { inv.status = "failed"; inv.error = err; inv.completedAt = new Date().toISOString(); });
          publishEvent(id, "warning", "Investigation crashed unexpectedly.", undefined, { code: err.code });
          publishEvent(id, "complete", "Investigation failed.", undefined, { status: "failed" });
        })
        .finally(resolve);
    });
  });
  return { investigation, done };
}

async function runAgent<K extends "seller" | "manufacturer" | "serviceCentre">(
  id: string, key: K, agent: InvestigationAgent, input: Case,
): Promise<Investigation[K]> {
  const agentName = agent.name;
  store.updateInvestigation(id, inv => { inv[key].status = "running"; });
  publishEvent(id, "agent", `${agentName} agent started.`, agentName, { status: "running" });
  let result;
  try {
    result = await agent.run({ investigationId: id, caseId: input.caseId, input, emit: message => { publishEvent(id, "agent", message.slice(0, 200), agentName); } });
  } catch (error) {
    // Agents should not throw, but a crash in one must not erase the other's results.
    const fallback = { seller: emptySeller, manufacturer: emptyManufacturer, serviceCentre: emptyServiceCentre }[key];
    result = { ...fallback("failed", `${agentName} agent crashed.`), error: asError(error), investigatedAt: new Date().toISOString() };
  }
  store.updateInvestigation(id, inv => { (inv as unknown as Record<string, unknown>)[key] = result; });
  publishEvent(id, "agent", `${agentName} agent ${result.status}.`, agentName, {
    status: result.status, evidenceCount: result.evidence.length, ...(result.error ? { error: result.error } : {}),
  });
  for (const e of result.evidence) publishEvent(id, "finding", e.title, agentName, { evidenceId: e.id, sourceUrl: e.sourceUrl, verification: e.verification });
  return result as Investigation[K];
}

async function execute(id: string, input: Case, agents: Agents): Promise<void> {
  store.updateInvestigation(id, inv => { inv.status = "running"; });
  publishEvent(id, "status", "Investigation running.", undefined, { status: "running" });

  const [seller, manufacturer] = await Promise.all([
    runAgent(id, "seller", agents.seller, input),
    runAgent(id, "manufacturer", agents.manufacturer, input),
  ]);

  const { recommendation, shouldFindServiceCentre } = assessResolution(input, seller, manufacturer);
  store.updateInvestigation(id, inv => { inv.resolution = recommendation; });

  if (shouldFindServiceCentre) {
    publishEvent(id, "status", "Warranty evidence suggests checking authorised service options.");
    await runAgent(id, "serviceCentre", agents.serviceCentre, input);
  } else {
    store.updateInvestigation(id, inv => { inv.serviceCentre = emptyServiceCentre("not_applicable", "Skipped: current evidence does not support a service-centre route."); });
    publishEvent(id, "agent", "service_centre agent not_applicable.", "service_centre", { status: "not_applicable" });
  }

  const final = store.getInvestigation(id)!;
  const status = finalStatus([final.seller.status, final.manufacturer.status, final.serviceCentre.status]);
  store.updateInvestigation(id, inv => { inv.status = status; inv.completedAt = new Date().toISOString(); });
  publishEvent(id, "complete", `Investigation ${status}.`, undefined, { status });
}

function finalStatus(statuses: AgentStatus[]): InvestigationStatus {
  const ran = statuses.filter(s => s !== "not_applicable" && s !== "pending");
  if (ran.length === 0 || ran.every(s => s === "failed" || s === "blocked")) return "failed";
  if (ran.some(s => s === "failed" || s === "blocked" || s === "partial")) return "completed_with_warnings";
  return "completed";
}
