'use strict';

const SYSTEM_PROMPT =
  'You are a friendly, experienced UK financial adviser. ' +
  'Give clear, specific, actionable advice. ' +
  'Keep responses conversational — short paragraphs, bullet points where helpful. ' +
  'Never give generic disclaimers. The user\'s financial data is real and current. ' +
  'Always respond in British English.';

/**
 * Build a formatted plain-text snapshot of the user's current financial state.
 * Returns null if no debts are entered yet.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string|null}
 */
function buildContextSnapshot(db) {
  const debts    = db.prepare('SELECT * FROM debts').all();
  const tranches = db.prepare('SELECT * FROM tranches').all();
  const income   = db.prepare('SELECT * FROM income_sources').all();
  const expenses = db.prepare('SELECT * FROM expenses').all();

  if (debts.length === 0) return null;

  const totalIncome    = income.reduce((s, i) => s + i.monthly_equivalent, 0);
  const totalExpenses  = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMinimums  = debts.reduce((s, d) => s + (d.minimum_payment || 0), 0);
  const surplus        = totalIncome - totalExpenses - totalMinimums;
  const totalDebt      = tranches.reduce((s, t) => s + t.balance, 0);

  const debtLines = debts.map(d => {
    const dt     = tranches.filter(t => t.debt_id === d.id);
    const bal    = dt.reduce((s, t) => s + t.balance, 0);
    const maxApr = dt.length > 0 ? Math.max(...dt.map(t => t.apr)) * 100 : 0;
    const min    = d.minimum_payment || 0;
    return `  · ${d.name} — £${bal.toFixed(0)} @ ${maxApr.toFixed(1)}% APR (min £${min.toFixed(0)}/mo)`;
  }).join('\n');

  let planLine = '';
  const cached = db.prepare('SELECT calc_result FROM plan_cache WHERE id = 1').get();
  if (cached) {
    try {
      const p = JSON.parse(cached.calc_result);
      planLine = `\n- Current plan: ${p.recommendation?.strategy ?? 'avalanche'}, ` +
                 `debt-free ${p.debtFreeDate}, £${(p.totalInterest ?? 0).toFixed(0)} total interest`;
    } catch { /* malformed cache — skip plan line */ }
  }

  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    `FINANCIAL SNAPSHOT (as of ${date}):\n` +
    `- Monthly take-home: £${totalIncome.toFixed(0)}\n` +
    `- Monthly surplus after bills and minimums: £${surplus.toFixed(0)}\n` +
    `- Total debt: £${totalDebt.toFixed(0)} across ${debts.length} account${debts.length !== 1 ? 's' : ''}\n` +
    debtLines +
    planLine
  );
}

/**
 * Build the full prompt string to send to the Claude CLI for a chat reply.
 *
 * @param {Object}   conversation
 * @param {number}   conversation.use_context        - 1 | 0
 * @param {string}   conversation.context_snapshot   - pre-built snapshot text or null
 * @param {string}   conversation.summary            - rolling older-message summary or null
 * @param {Array}    messages                        - last ≤6 message rows ordered by sequence ASC
 * @returns {string}
 */
function buildAdvisorPrompt(conversation, messages) {
  const parts = [SYSTEM_PROMPT];

  if (conversation.use_context && conversation.context_snapshot) {
    parts.push(conversation.context_snapshot);
  }

  if (conversation.summary) {
    parts.push(`Earlier in this conversation: ${conversation.summary}`);
  }

  if (messages.length > 0) {
    const history = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(history);
  }

  parts.push('Respond as the adviser:');
  return parts.join('\n\n');
}

module.exports = { buildContextSnapshot, buildAdvisorPrompt };
