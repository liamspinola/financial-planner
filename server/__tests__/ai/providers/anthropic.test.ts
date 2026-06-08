import type { FinancialContext, AIMessage } from '../../../../shared/types/ai';

// ── Mock @anthropic-ai/sdk ─────────────────────────────────────────────────

const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { stream: mockStream },
  })),
}));

import { AnthropicProvider } from '../../../ai/providers/anthropic';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAnthropicStream(chunks: string[]) {
  async function* eventGen() {
    for (const chunk of chunks) {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } };
    }
    yield { type: 'message_stop' };
  }
  return {
    [Symbol.asyncIterator]: eventGen,
  };
}

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
  { role: 'user', content: 'Help me', createdAt: '2026-01-01T00:00:00Z' },
  { role: 'assistant', content: 'Sure', createdAt: '2026-01-01T00:00:01Z' },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  beforeEach(() => mockStream.mockReset());

  it('has providerName "anthropic"', () => {
    const provider = new AnthropicProvider('sk-ant-test-key');
    expect(provider.providerName).toBe('anthropic');
  });

  it('throws if no API key provided', () => {
    expect(() => new AnthropicProvider('')).toThrow(/api key/i);
  });

  it('uses model claude-sonnet-4-6 (pinned)', async () => {
    mockStream.mockReturnValue(makeAnthropicStream(['Hello']));
    const provider = new AnthropicProvider('sk-ant-test');
    for await (const _ of provider.streamAnalysis(CTX, 'test', [])) { /* drain */ }
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('streams text_delta tokens', async () => {
    mockStream.mockReturnValue(makeAnthropicStream(['Pay off ', 'Visa first.']));
    const provider = new AnthropicProvider('sk-ant-test');
    const tokens: string[] = [];
    for await (const t of provider.streamAnalysis(CTX, 'What now?', HISTORY)) {
      tokens.push(t);
    }
    expect(tokens.join('')).toBe('Pay off Visa first.');
  });

  it('skips non-text_delta events', async () => {
    async function* mixedEvents() {
      yield { type: 'message_start', message: {} };
      yield { type: 'content_block_start', index: 0 };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
      yield { type: 'content_block_stop', index: 0 };
      yield { type: 'message_stop' };
    }
    mockStream.mockReturnValue({ [Symbol.asyncIterator]: mixedEvents });
    const provider = new AnthropicProvider('sk-ant-test');
    const tokens: string[] = [];
    for await (const t of provider.streamAnalysis(CTX, 'test', [])) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['Hello']);
  });

  it('passes history messages to the API', async () => {
    mockStream.mockReturnValue(makeAnthropicStream(['ok']));
    const provider = new AnthropicProvider('sk-ant-test');
    for await (const _ of provider.streamAnalysis(CTX, 'follow-up', HISTORY)) { /* drain */ }
    const callMessages = mockStream.mock.calls[0]?.[0]?.messages as any[];
    // History contains 'Help me' and 'Sure'
    const allContent = callMessages.map((m: any) => m.content).join(' ');
    expect(allContent).toContain('Help me');
    expect(allContent).toContain('Sure');
  });

  it('re-throws SDK errors', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('authentication_error');
    });
    const provider = new AnthropicProvider('sk-ant-test');
    await expect(async () => {
      for await (const _ of provider.streamAnalysis(CTX, 'test', [])) { /* drain */ }
    }).rejects.toThrow('authentication_error');
  });
});
