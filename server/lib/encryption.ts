import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;

function getMasterKey(): Buffer {
  const keyHex = process.env['BYOK_ENCRYPTION_KEY'];
  if (!keyHex) throw new Error('BYOK_ENCRYPTION_KEY environment variable is required');
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('BYOK_ENCRYPTION_KEY must be 64-char hex (32 bytes)');
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plaintext API key with AES-256-GCM.
 * Returns hex-encoded ciphertext (includes GCM auth tag) and hex-encoded IV.
 */
export function encryptKey(plaintext: string): { encryptedKey: string; iv: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedKey: Buffer.concat([encrypted, tag]).toString('hex'),
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypts a hex-encoded ciphertext produced by encryptKey.
 * Throws if the key is wrong or the ciphertext has been tampered with.
 */
export function decryptKey(encryptedKey: string, iv: string): string {
  const key = getMasterKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const data = Buffer.from(encryptedKey, 'hex');
  if (data.length <= AUTH_TAG_BYTES) {
    throw new Error('Encrypted key data is too short to contain an auth tag');
  }
  const tag = data.subarray(data.length - AUTH_TAG_BYTES);
  const ciphertext = data.subarray(0, data.length - AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
