// Set a valid 64-char hex test key before importing the module
process.env['BYOK_ENCRYPTION_KEY'] = 'a'.repeat(64);

import { encryptKey, decryptKey } from '../../lib/encryption';

describe('encryptKey / decryptKey', () => {
  it('roundtrip: decryptKey(encryptKey(x)) === x', () => {
    const plaintext = 'sk-ant-api03-abc123';
    const { encryptedKey, iv } = encryptKey(plaintext);
    expect(decryptKey(encryptedKey, iv)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'sk-ant-api03-same-key';
    const r1 = encryptKey(plaintext);
    const r2 = encryptKey(plaintext);
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.encryptedKey).not.toBe(r2.encryptedKey);
  });

  it('produces a different IV each call', () => {
    const ivs = Array.from({ length: 5 }, () => encryptKey('test').iv);
    const unique = new Set(ivs);
    expect(unique.size).toBe(5);
  });

  it('throws on decryption with wrong key', () => {
    const { encryptedKey, iv } = encryptKey('secret');
    // Temporarily swap key
    const originalKey = process.env['BYOK_ENCRYPTION_KEY'];
    process.env['BYOK_ENCRYPTION_KEY'] = 'b'.repeat(64);
    expect(() => decryptKey(encryptedKey, iv)).toThrow();
    process.env['BYOK_ENCRYPTION_KEY'] = originalKey;
  });

  it('throws if BYOK_ENCRYPTION_KEY is missing', () => {
    const originalKey = process.env['BYOK_ENCRYPTION_KEY'];
    delete process.env['BYOK_ENCRYPTION_KEY'];
    expect(() => encryptKey('test')).toThrow(/BYOK_ENCRYPTION_KEY/);
    process.env['BYOK_ENCRYPTION_KEY'] = originalKey;
  });

  it('throws if BYOK_ENCRYPTION_KEY is wrong length', () => {
    process.env['BYOK_ENCRYPTION_KEY'] = 'tooshort';
    expect(() => encryptKey('test')).toThrow(/64-char hex/);
    process.env['BYOK_ENCRYPTION_KEY'] = 'a'.repeat(64);
  });

  it('throws if BYOK_ENCRYPTION_KEY contains non-hex characters', () => {
    const originalKey = process.env['BYOK_ENCRYPTION_KEY'];
    process.env['BYOK_ENCRYPTION_KEY'] = 'z'.repeat(64); // valid length, invalid hex
    expect(() => encryptKey('test')).toThrow(/64-char hex/);
    process.env['BYOK_ENCRYPTION_KEY'] = originalKey;
  });
});
