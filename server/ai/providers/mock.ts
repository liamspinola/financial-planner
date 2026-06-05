import type { AIProvider, AIProviderName, FinancialContext, AIMessage } from '../../../shared/types/ai';

const DEFAULT_RESPONSE =
  'Based on your financial data, I recommend focusing on your highest-APR debt first. ' +
  'This avalanche strategy will minimise the total interest you pay over time.';

export class MockAIProvider implements AIProvider {
  readonly providerName: AIProviderName;
  private readonly responseText: string;

  constructor(responseText = DEFAULT_RESPONSE, providerName: AIProviderName = 'gemini') {
    this.responseText = responseText;
    this.providerName = providerName;
  }

  async *streamAnalysis(
    _context: FinancialContext,
    _userMessage: string,
    _history: AIMessage[],
  ): AsyncIterable<string> {
    const words = this.responseText.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield words[i]!;
      if (i < words.length - 1) yield ' ';
    }
  }
}
