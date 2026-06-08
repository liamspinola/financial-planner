process.env['GEMINI_API_KEY'] = 'test-gemini-key';

jest.mock('../../routes/ai-keys', () => ({
  getDecryptedUserKey: jest.fn(),
}));

jest.mock('../../ai/providers/gemini', () => ({
  GeminiProvider: jest.fn().mockImplementation((key: string) => ({
    providerName: 'gemini',
    _key: key,
    streamAnalysis: jest.fn(),
  })),
}));

jest.mock('../../ai/providers/anthropic', () => ({
  AnthropicProvider: jest.fn().mockImplementation((key: string) => ({
    providerName: 'anthropic',
    _key: key,
    streamAnalysis: jest.fn(),
  })),
}));

import { getProvider } from '../../ai/router';
import { getDecryptedUserKey } from '../../routes/ai-keys';
import { GeminiProvider } from '../../ai/providers/gemini';
import { AnthropicProvider } from '../../ai/providers/anthropic';

const mockGetDecryptedUserKey = getDecryptedUserKey as jest.Mock;
const MockGeminiProvider = GeminiProvider as jest.Mock;
const MockAnthropicProvider = AnthropicProvider as jest.Mock;

describe('getProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  it('returns GeminiProvider when user has no BYOK key', async () => {
    mockGetDecryptedUserKey.mockResolvedValue(null);
    const provider = await getProvider('uid-1');
    expect(provider.providerName).toBe('gemini');
    expect(MockGeminiProvider).toHaveBeenCalledWith('test-gemini-key');
    expect(MockAnthropicProvider).not.toHaveBeenCalled();
  });

  it('returns AnthropicProvider when user has a BYOK key', async () => {
    mockGetDecryptedUserKey.mockResolvedValue('sk-ant-user-key');
    const provider = await getProvider('uid-2');
    expect(provider.providerName).toBe('anthropic');
    expect(MockAnthropicProvider).toHaveBeenCalledWith('sk-ant-user-key');
    expect(MockGeminiProvider).not.toHaveBeenCalled();
  });

  it('calls getDecryptedUserKey with the userId', async () => {
    mockGetDecryptedUserKey.mockResolvedValue(null);
    await getProvider('uid-specific');
    expect(mockGetDecryptedUserKey).toHaveBeenCalledWith('uid-specific');
  });

  it('throws if GEMINI_API_KEY is missing and user has no BYOK key', async () => {
    delete process.env['GEMINI_API_KEY'];
    mockGetDecryptedUserKey.mockResolvedValue(null);
    await expect(getProvider('uid-1')).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('does NOT throw if GEMINI_API_KEY is missing but user has BYOK key', async () => {
    delete process.env['GEMINI_API_KEY'];
    mockGetDecryptedUserKey.mockResolvedValue('sk-ant-user-key');
    const provider = await getProvider('uid-2');
    expect(provider.providerName).toBe('anthropic');
  });
});
