/**
 * TinyFish adapter boundary.
 *
 * Implement this file against the exact TinyFish SDK/API version in your repo.
 * Do not guess endpoint paths, request fields, or SDK method names.
 *
 * Suggested responsibilities:
 * - create/start a browser task using a natural-language goal
 * - wait/poll/stream until completion
 * - return the actual browser result and relevant page/source URLs
 * - normalize provider errors
 *
 * Keep provider-specific code here so agent logic remains testable.
 */

export class TinyFishNotConfiguredError extends Error {
  constructor() {
    super("TinyFish adapter is not configured. Implement src/lib/tinyfish/client.ts using the installed TinyFish SDK/API.");
    this.name = "TinyFishNotConfiguredError";
  }
}

export async function runTinyFishGoal(_goal: string): Promise<unknown> {
  if (!process.env.TINYFISH_API_KEY) {
    throw new TinyFishNotConfiguredError();
  }
  // TODO: Replace with the real TinyFish SDK/API call.
  throw new TinyFishNotConfiguredError();
}
