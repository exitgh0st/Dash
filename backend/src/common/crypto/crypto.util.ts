import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Symmetric encryption for secrets stored at rest — specifically Reddit refresh
 * tokens on RedditAccount. Uses AES-256-GCM, which provides both confidentiality
 * and integrity (the auth tag detects tampering).
 *
 * The key comes from the ENCRYPTION_KEY env var and must be 32 bytes, provided
 * as base64 or hex. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Reason: 96-bit IV is the recommended nonce size for GCM.
const KEY_LENGTH = 32; // AES-256 requires a 32-byte key.

/**
 * Decode and validate the encryption key from the environment.
 * @throws Error if ENCRYPTION_KEY is missing or not exactly 32 bytes.
 */
function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set');
  }

  // Accept either base64 or hex; pick whichever decodes to 32 bytes.
  const asBase64 = Buffer.from(raw, 'base64');
  const asHex = Buffer.from(raw, 'hex');
  const key =
    asBase64.length === KEY_LENGTH
      ? asBase64
      : asHex.length === KEY_LENGTH
        ? asHex
        : null;

  if (!key) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)');
  }
  return key;
}

/**
 * Encrypt a plaintext string for storage.
 * @returns a self-contained token `iv:authTag:ciphertext`, all base64.
 */
export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  // The auth tag must be captured after final() and stored alongside the IV.
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a token produced by {@link encrypt}.
 * @throws Error if the payload is malformed or fails the integrity check.
 */
export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = loadKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  // Reason: setting the auth tag makes final() throw on tampered ciphertext.
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
