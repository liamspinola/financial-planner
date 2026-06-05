import { MockAIProvider } from '../../../ai/providers/mock';
import type { FinancialContext, AIMessage } from '../../../../shared/types/ai';

const CTX: FinancialContext = {
  debts: [{ id: 1, name: 'Visa', debtType: 'credit_card', tranches: [{ label: 'Main', balance: 150000, apr: 0.2149, promoEndDate: null, postPromoApr: null }] }],
  monthlyIncomePence: 300000,
  monthlyExpensesPence: 100000,
  strategy: 'avalanche',
  debtFreeDateEstimate: '2027-01',
  totalInterestPence: 50000,
  windfalls: [],
};

const HISTORY: AIMessage[] = [
  { role: 'user', content: 'Hello', createdAt: '2026-01-01T00:00:00Z' },
  { role: 'assistant', content: 'Hi there', createdAt: '2026-01-01T00:00:01Z' },
];

describe('MockAIProvider', () => {
  it('has providerName "gemini"', () => {
    const provider = new MockAIProvider();
    expect(provider.providerName).toBe('gemini');
  });

  it('yields tokens from the configured response', async () => {
    const provider = new MockAIProvider('Hello world');
    const tokens: string[] = [];
    for await (const token of provider.streamAnalysis(CTX, 'What should I do?', HISTORY)) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('Hello world');
  });

  it('yields tokens split word-by-word', async () => {
    const provider = new MockAIProvider('one two three');
    const tokens: string[] = [];
    for await (const token of provider.streamAnalysis(CTX, 'test', [])) {
      tokens.push(token);
    }
    // Each word is a separate token
    expect(tokens).toEqual(['one', ' ', 'two', ' ', 'three']);
  });

  it('defaults to a placeholder response when no text provided', async () => {
    const provider = new MockAIProvider();
    const tokens: string[] = [];
    for await (const token of provider.streamAnalysis(CTX, 'test', [])) {
      tokens.push(token);
    }
    expect(tokens.join('').length).toBeGreaterThan(0);
  });

  it('accepts custom providerName override', () => {
    const provider = new MockAIProvider('', 'anthropic');
    expect(provider.providerName).toBe('anthropic');
  });
});
