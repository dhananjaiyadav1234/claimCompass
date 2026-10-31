import { randomUUID } from "node:crypto";
import type { EvidenceFinding } from "../contracts";

export function finding(input: Omit<EvidenceFinding, "id" | "retrievedAt">): EvidenceFinding {
  return {
    ...input,
    id: randomUUID(),
    retrievedAt: new Date().toISOString(),
  };
}

export function asError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown agent error";
  return {
    code: message.includes("not configured") ? "TINYFISH_NOT_CONFIGURED" : "AGENT_EXECUTION_FAILED",
    message,
  };
}
