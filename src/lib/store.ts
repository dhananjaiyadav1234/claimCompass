import type {
  CaseInput, InvestigationEvent, InvestigationResult
} from "./contracts";

const cases = new Map<string, CaseInput>();
const investigations = new Map<string, InvestigationResult>();
const events = new Map<string, InvestigationEvent[]>();

export const store = {
  saveCase(id: string, value: CaseInput) { cases.set(id, value); },
  getCase(id: string) { return cases.get(id); },
  saveInvestigation(value: InvestigationResult) { investigations.set(value.investigationId, value); },
  getInvestigation(id: string) { return investigations.get(id); },
  addEvent(event: InvestigationEvent) {
    const list = events.get(event.investigationId) ?? [];
    list.push(event);
    events.set(event.investigationId, list);
  },
  getEvents(id: string) { return events.get(id) ?? []; },
};
