/**
 * Tests for server/lib/claude.ts
 *
 * callClaude() creates an Anthropic client per-call, so the mock constructor
 * is invoked fresh each time. We declare mockCreate at module scope so Jest
 * hoists the mock factory and the variable is accessible inside it.
 */

process.env['ANTHROPIC_API_KEY'] = 'test-key';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { callClaude } from '../../lib/claude';

describe('callClaude', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns text from first content block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'You should pay off the highest APR first.' }],
    });
    const result = await callClaude('Analyse my debts');
    expect(result).toBe('You should pay off the highest APR first.');
  });

  it('returns empty string when content array is empty', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    const result = await callClaude('Analyse my debts');
    expect(result).toBe('');
  });

  it('passes the prompt as user message with correct model', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    });
    await callClaude('my prompt');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'my prompt' }],
        model: 'claude-sonnet-4-6',
      }),
      expect.anything(),
    );
  });

  it('uses max_tokens of 1500', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await callClaude('test');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 1500 }),
      expect.anything(),
    );
  });

  it('re-throws SDK errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));
    await expect(callClaude('test')).rejects.toThrow('API rate limit exceeded');
  });
});
