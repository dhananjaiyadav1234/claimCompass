import { randomUUID } from "node:crypto";
import type { AgentName, InvestigationEvent } from "./contracts";
import { store } from "./store";

export function publishEvent(
  investigationId: string,
  type: InvestigationEvent["type"],
  message: string,
  agent?: AgentName,
  data?: Record<string, unknown>,
) {
  const event: InvestigationEvent = {
    id: randomUUID(),
    investigationId,
    timestamp: new Date().toISOString(),
    type,
    message,
    ...(agent ? { agent } : {}),
    ...(data ? { data } : {}),
  };
  store.addEvent(event);
  return event;
}
