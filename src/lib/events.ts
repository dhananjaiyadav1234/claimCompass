import type { AgentName, InvestigationEvent } from "./contracts";
import { store } from "./store";

export function publishEvent(
  investigationId: string,
  type: InvestigationEvent["type"],
  message: string,
  agent?: AgentName,
  data?: Record<string, unknown>,
): InvestigationEvent {
  return store.addEvent({
    investigationId,
    timestamp: new Date().toISOString(),
    type,
    message,
    ...(agent ? { agent } : {}),
    ...(data ? { data } : {}),
  });
}
