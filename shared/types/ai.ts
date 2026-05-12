/**
 * AI provider abstraction types.
 *
 * FinancialContext is the PII-exclusion contract: it MUST NOT contain
 * userId, email, or displayName. TypeScript enforces this at compile time.
 * The full implementation will include additional fields beyond this
 * illustrative subset (tranches, windfalls, expense events, etc.) —
 * all financial figures, none personally identifying.
 */

export type AIProviderName = 'gemini' | 'anthropic';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface FinancialContext {
  // ── NO userId, email, or displayName below this line ──
  /** All debts with their tranches. Monetary values in pence. */
  debts: Array<{
    id: number;
    name: string;
    debtType: string;
    tranches: Array<{
      label: string;
      /** Balance in pence */
      balance: number;
      /** APR as decimal ratio, e.g. 0.2149 */
      apr: number;
      promoEndDate: string | null;
      postPromoApr: number | null;
    }>;
  }>;
  /** Total monthly take-home income in pence */
  monthlyIncomePence: number;
  /** Total monthly essential expenses in pence */
  monthlyExpensesPence: number;
  /** Chosen payoff strategy */
  strategy: 'avalanche' | 'snowball';
  /** Estimated debt-free date as ISO string */
  debtFreeDateEstimate: string;
  /** Total interest to be paid under current plan, in pence */
  totalInterestPence: number;
  /** Windfalls scheduled */
  windfalls: Array<{
    label: string;
    /** Amount in pence */
    amount: number;
    applyMonth: number;
  }>;
}

/**
 * All AI providers implement this interface.
 * - GeminiProvider: uses Gemini 2.0 Flash (free, default)
 * - AnthropicProvider: uses claude-sonnet-4-6 (BYOK)
 * - MockAIProvider: deterministic, no network calls (tests only)
 */
export interface AIProvider {
  readonly providerName: AIProviderName;
  /**
   * Stream an AI analysis response token by token.
   * The async iterable yields string tokens as they arrive.
   */
  streamAnalysis(
    context: FinancialContext,
    userMessage: string,
    history: AIMessage[],
  ): AsyncIterable<string>;
}
