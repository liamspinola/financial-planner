import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIProviderName, FinancialContext, AIMessage } from '../../../shared/types/ai';

const MODEL_ID = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

export class AnthropicProvider implements AIProvider {
  readonly providerName: AIProviderName = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('An Anthropic API key is required to construct AnthropicProvider');
    this.client = new Anthropic({ apiKey });
  }

  async *streamAnalysis(
    context: FinancialContext,
    userMessage: string,
    history: AIMessage[],
  ): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(context);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const stream = this.client.messages.stream({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        yield event.delta.text;
      }
    }
  }
}

function buildSystemPrompt(context: FinancialContext): string {
  const debtSummary = context.debts.map(d => {
    const trancheSummary = d.tranches.map(t => {
      const aprPct = (t.apr * 100).toFixed(1);
      const promo = t.promoEndDate ? ` (0% promo until ${t.promoEndDate})` : '';
      return `${t.label}: £${(t.balance / 100).toFixed(0)} @ ${aprPct}% APR${promo}`;
    }).join(', ');
    return `- ${d.name} (${d.debtType}): ${trancheSummary}`;
  }).join('\n');

  const windfallSummary = context.windfalls.length > 0
    ? context.windfalls.map(w => `- ${w.label}: £${(w.amount / 100).toFixed(0)} in month ${w.applyMonth}`).join('\n')
    : 'None scheduled';

  return `You are an experienced UK financial adviser. You are helping a user understand and act on their debt payoff plan.

FINANCIAL CONTEXT:
- Monthly take-home income: £${(context.monthlyIncomePence / 100).toFixed(0)}
- Monthly essential expenses: £${(context.monthlyExpensesPence / 100).toFixed(0)}
- Recommended strategy: ${context.strategy}
- Estimated debt-free date: ${context.debtFreeDateEstimate}
- Total interest under current plan: £${(context.totalInterestPence / 100).toFixed(0)}

DEBTS:
${debtSummary}

WINDFALLS:
${windfallSummary}

Respond clearly, encouragingly, and without jargon. Use British English. Keep answers concise unless the user asks for detail.`;
}
