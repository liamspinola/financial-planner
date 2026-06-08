import type { AIProvider } from '../../../shared/types/ai';
import { GeminiProvider } from './providers/gemini';
import { AnthropicProvider } from './providers/anthropic';
import { getDecryptedUserKey } from '../routes/ai-keys';

/**
 * Selects the correct AI provider for a given user.
 *
 * Decision logic:
 *   1. Check whether the user has a BYOK Anthropic key stored.
 *   2. If yes  → return AnthropicProvider initialised with that key.
 *   3. If no   → return GeminiProvider initialised with GEMINI_API_KEY.
 *   4. If no BYOK and GEMINI_API_KEY is missing → throw (never silently fall back).
 */
export async function getProvider(userId: string): Promise<AIProvider> {
  const byokKey = await getDecryptedUserKey(userId);

  if (byokKey) {
    return new AnthropicProvider(byokKey);
  }

  const geminiKey = process.env['GEMINI_API_KEY'];
  if (!geminiKey) {
    throw new Error(
      'GEMINI_API_KEY environment variable is required when the user has no BYOK key stored',
    );
  }

  return new GeminiProvider(geminiKey);
}
