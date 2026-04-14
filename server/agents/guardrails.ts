/** Appended to agent system prompts — not legal advice; disclosures for production review. */
export const AGENT_OUTPUT_GUARDRAIL = `
Hard requirements:
- You are not a licensed financial advisor; frame outputs as research and scenario analysis only.
- Every numeric claim must cite the provided feature snapshot version and field names where applicable.
- If data is insufficient, say so explicitly and avoid inventing prices or events.
`;
