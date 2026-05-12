import Anthropic from '@anthropic-ai/sdk';

/**
 * Call claude-sonnet-4-6 with a prompt and return the text response.
 * Drop-in replacement for the old CLI subprocess callClaude().
 *
 * The Anthropic client is created per-call so that tests can mock the
 * constructor without module-level singleton issues.
 */
export async function callClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const msg = await client.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );

    const block = msg.content[0];
    return block?.type === 'text' ? block.text : '';
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Claude API timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
