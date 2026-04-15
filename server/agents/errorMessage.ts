export const AGENT_ERROR_MESSAGE_MAX_LEN = 500;

export function toAgentErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.length <= AGENT_ERROR_MESSAGE_MAX_LEN) return raw;
  return raw.slice(0, AGENT_ERROR_MESSAGE_MAX_LEN);
}
