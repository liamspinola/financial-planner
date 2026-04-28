/**
 * Build a context snapshot string from the SQLite db (legacy — not used in Phase 2+).
 * Phase 2 replaces this with buildUserContextSnapshot() in the advisor route.
 */
export function buildContextSnapshot(db: unknown): string | null;

/**
 * Build the full prompt string for an advisor conversation.
 * conv must have: { use_context: boolean; context_snapshot: string | null; summary: string | null }
 * messages is the list of prior messages with { role, content }.
 */
export function buildAdvisorPrompt(
  conv: { use_context: boolean; context_snapshot: string | null; summary: string | null },
  messages: Array<{ role: string; content: string }>,
): string;
