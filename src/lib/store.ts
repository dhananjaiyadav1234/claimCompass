import type { Case, Investigation, InvestigationEvent } from "./contracts";

/**
 * Process-local in-memory store (hackathon foundation).
 * Limitations: data is lost on restart, not shared across server instances/serverless
 * invocations. Kept on globalThis so Next.js route bundles and dev HMR share one instance.
 * Replace with Supabase/Postgres + a durable job queue before multi-instance deployment.
 */
interface StoreData {
  cases: Map<string, Case>;
  investigations: Map<string, Investigation>;
  events: Map<string, InvestigationEvent[]>;
}

const g = globalThis as unknown as { __claimCompassStore?: StoreData };
const data: StoreData = (g.__claimCompassStore ??= {
  cases: new Map(),
  investigations: new Map(),
  events: new Map(),
});

export const store = {
  saveCase(value: Case) { data.cases.set(value.caseId, value); },
  getCase(id: string) { return data.cases.get(id); },
  saveInvestigation(value: Investigation) { data.investigations.set(value.investigationId, value); },
  getInvestigation(id: string) { return data.investigations.get(id); },
  /** Apply a mutation and persist, so partial results survive later failures. */
  updateInvestigation(id: string, mutate: (inv: Investigation) => void): Investigation | undefined {
    const inv = data.investigations.get(id);
    if (!inv) return undefined;
    mutate(inv);
    inv.updatedAt = new Date().toISOString();
    return inv;
  },
  addEvent(event: Omit<InvestigationEvent, "seq">): InvestigationEvent {
    const list = data.events.get(event.investigationId) ?? [];
    const full = { ...event, seq: list.length + 1 };
    list.push(full);
    data.events.set(event.investigationId, list);
    return full;
  },
  getEvents(id: string, afterSeq = 0) { return (data.events.get(id) ?? []).filter(e => e.seq > afterSeq); },
  /** Test helper. */
  clear() { data.cases.clear(); data.investigations.clear(); data.events.clear(); },
};
