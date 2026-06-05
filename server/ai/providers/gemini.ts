import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import type { AIProvider, AIProviderName, FinancialContext, AIMessage } from '../../../shared/types/ai';

const MODEL_ID = 'gemini-2.0-flash-001';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export class GeminiProvider implements AIProvider {
  readonly providerName: AIProviderName = 'gemini';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is required to construct GeminiProvider');
    this.apiKey = apiKey;
  }

  async *streamAnalysis(
    context: FinancialContext,
    userMessage: string,
    history: AIMessage[],
  ): AsyncIterable<string> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      safetySettings: SAFETY_SETTINGS,
    });

    const systemPreamble = buildSystemPreamble(context);

    const contents = [
      { role: 'user' as const, parts: [{ text: systemPreamble }] },
      { role: 'model' as const, parts: [{ text: 'Understood. I am ready to provide personalised UK financial advice based on the context above.' }] },
      ...history.map(m => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: m.content }],
      })),
      { role: 'user' as const, parts: [{ text: userMessage }] },
    ];

    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}

function buildSystemPreamble(context: FinancialContext): string {
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
