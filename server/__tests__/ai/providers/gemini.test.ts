process.env['GEMINI_API_KEY'] = 'test-gemini-key';

import type { FinancialContext, AIMessage } from '../../../../shared/types/ai';

// ── Mock @google/generative-ai ─────────────────────────────────────────────

const mockGenerateContentStream = jest.fn();

jest.mock('@google/generative-ai', () => {
  const HarmCategory = {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  };
  const HarmBlockThreshold = {
    BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
  };
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContentStream: mockGenerateContentStream,
      }),
    })),
    HarmCategory,
    HarmBlockThreshold,
  };
});

import { GeminiProvider } from '../../../ai/providers/gemini';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStreamResponse(chunks: string[]) {
  async function* gen() {
    for (const chunk of chunks) {
      yield { text: () => chunk };
    }
  }
  return { stream: gen() };
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
  { role: 'user', content: 'What should I do?', createdAt: '2026-01-01T00:00:00Z' },
  { role: 'assistant', content: 'Focus on high-APR debts.', createdAt: '2026-01-01T00:00:01Z' },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GeminiProvider', () => {
  beforeEach(() => mockGenerateContentStream.mockReset());

  it('has providerName "gemini"', () => {
    const provider = new GeminiProvider('test-key');
    expect(provider.providerName).toBe('gemini');
  });

  it('throws if no API key provided', () => {
    expect(() => new GeminiProvider('')).toThrow(/GEMINI_API_KEY/i);
  });

  it('uses model gemini-2.0-flash-001 (pinned)', async () => {
    const { GoogleGenerativeAI } = jest.requireMock('@google/generative-ai') as any;
    mockGenerateContentStream.mockResolvedValue(makeStreamResponse(['Hello']));
    const provider = new GeminiProvider('test-key');
    const tokens: string[] = [];
    for await (const t of provider.streamAnalysis(CTX, 'test', [])) {
      tokens.push(t);
    }
    const getModelCall = GoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.calls[0];
    expect(getModelCall?.[0]).toMatchObject({ model: 'gemini-2.0-flash-001' });
  });

  it('sets all 4 harm categories to BLOCK_ONLY_HIGH', async () => {
    const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = jest.requireMock('@google/generative-ai') as any;
    mockGenerateContentStream.mockResolvedValue(makeStreamResponse(['ok']));
    const provider = new GeminiProvider('test-key');
    for await (const _ of provider.streamAnalysis(CTX, 'test', [])) { /* drain */ }
    const getModelCall = GoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.calls[0];
    const safetySettings = getModelCall?.[0]?.safetySettings as Array<{ category: string; threshold: string }>;
    expect(safetySettings).toHaveLength(4);
    for (const setting of safetySettings) {
      expect(setting.threshold).toBe(HarmBlockThreshold.BLOCK_ONLY_HIGH);
    }
    const categories = safetySettings.map(s => s.category);
    expect(categories).toContain(HarmCategory.HARM_CATEGORY_HARASSMENT);
    expect(categories).toContain(HarmCategory.HARM_CATEGORY_HATE_SPEECH);
    expect(categories).toContain(HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT);
    expect(categories).toContain(HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT);
  });

  it('streams tokens from the Gemini response', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStreamResponse(['You should', ' pay off', ' Visa first.']));
    const provider = new GeminiProvider('test-key');
    const tokens: string[] = [];
    for await (const t of provider.streamAnalysis(CTX, 'What should I do?', HISTORY)) {
      tokens.push(t);
    }
    expect(tokens.join('')).toBe('You should pay off Visa first.');
  });

  it('includes history in the generateContentStream call', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStreamResponse(['ok']));
    const provider = new GeminiProvider('test-key');
    for await (const _ of provider.streamAnalysis(CTX, 'follow-up', HISTORY)) { /* drain */ }
    const callArgs = mockGenerateContentStream.mock.calls[0]?.[0] as any;
    // Should pass a contents array including history
    const contents = callArgs?.contents ?? callArgs;
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    // The prompt built must mention history context
    expect(JSON.stringify(mockGenerateContentStream.mock.calls[0])).toContain('What should I do?');
  });

  it('re-throws errors from the Gemini SDK', async () => {
    mockGenerateContentStream.mockRejectedValue(new Error('QUOTA_EXCEEDED'));
    const provider = new GeminiProvider('test-key');
    await expect(async () => {
      for await (const _ of provider.streamAnalysis(CTX, 'test', [])) { /* drain */ }
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });
});
