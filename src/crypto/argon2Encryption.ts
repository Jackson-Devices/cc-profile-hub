import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

/**
 * Argon2id parameters (OWASP recommended values for 2024)
 * - Memory: 64 MB (65536 KiB)
 * - Iterations: 3
 * - Parallelism: 4 threads
 * - Variant: Argon2id (hybrid of Argon2i and Argon2d)
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3, // 3 iterations
  parallelism: 4, // 4 parallel threads
  hashLength: KEY_LENGTH,
};

/**
 * Version identifier for encryption format.
 * Allows graceful migration between encryption methods.
 */
export const ENCRYPTION_VERSION = 'argon2-v1';

/**
 * Encrypted data format with version identifier.
 */
export interface EncryptedData {
  version: string;
  data: string;
}

/**
 * Derive encryption key from passphrase using Argon2id.
 * Much more secure than PBKDF2 against GPU/ASIC attacks.
 *
 * @param passphrase - User passphrase
 * @param salt - Random salt (32 bytes)
 * @returns Derived key (32 bytes)
 */
async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const hash = await argon2.hash(passphrase, {
    ...ARGON2_OPTIONS,
    salt,
    raw: true, // Return raw hash instead of encoded string
  });

  return Buffer.from(hash);
}

/**
 * Encrypt plaintext using Argon2id key derivation and AES-256-GCM.
 *
 * Provides:
 * - Strong key derivation (Argon2id)
 * - Authenticated encryption (AES-256-GCM)
 * - Unique salt and IV per encryption
 * - Format versioning for migration
 *
 * @param plaintext - Data to encrypt
 * @param passphrase - User passphrase
 * @returns Encrypted data with version identifier
 */
export async function encryptWithArgon2(
  plaintext: string,
  passphrase: string
): Promise<EncryptedData> {
  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Derive key from passphrase using Argon2id
  const key = await deriveKey(passphrase, salt);

  // Create cipher and encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine salt:iv:authTag:ciphertext and encode as base64
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  return {
    version: ENCRYPTION_VERSION,
    data: combined.toString('base64'),
  };
}

/**
 * Decrypt ciphertext encrypted with Argon2id.
 *
 * @param encrypted - Encrypted data with version
 * @param passphrase - User passphrase
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or wrong passphrase
 */
export async function decryptWithArgon2(
  encrypted: EncryptedData,
  passphrase: string
): Promise<string> {
  try {
    if (encrypted.version !== ENCRYPTION_VERSION) {
      throw new Error(`Unsupported encryption version: ${encrypted.version}`);
    }

    // Decode from base64
    const combined = Buffer.from(encrypted.data, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from passphrase using Argon2id
    const key = await deriveKey(passphrase, salt);

    // Create decipher and decrypt
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Decryption failed';
    throw new Error(`Decryption failed: ${message}`);
  }
}

/**
 * Encrypt plaintext using Argon2id (convenience wrapper).
 * Returns base64-encoded string instead of structured format.
 *
 * @param plaintext - Data to encrypt
 * @param passphrase - User passphrase
 * @returns Base64-encoded encrypted data
 */
export async function encrypt(plaintext: string, passphrase: string): Promise<string> {
  const encrypted = await encryptWithArgon2(plaintext, passphrase);
  // Serialize version and data for backwards compatibility
  return JSON.stringify(encrypted);
}

/**
 * Decrypt ciphertext (convenience wrapper).
 * Handles both new Argon2 format and legacy PBKDF2 format.
 *
 * @param ciphertext - Encrypted data (JSON or base64)
 * @param passphrase - User passphrase
 * @returns Decrypted plaintext
 */
export async function decrypt(ciphertext: string, passphrase: string): Promise<string> {
  try {
    // Try to parse as JSON (new Argon2 format)
    const encrypted: EncryptedData = JSON.parse(ciphertext);
    return await decryptWithArgon2(encrypted, passphrase);
  } catch {
    // Fall back to legacy PBKDF2 decryption
    const legacyDecrypt = await import('./encryption');
    return await legacyDecrypt.decrypt(ciphertext, passphrase);
  }
}
