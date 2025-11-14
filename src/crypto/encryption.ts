import { randomBytes, createCipheriv, createDecipheriv, pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

export async function encrypt(plaintext: string, passphrase: string): Promise<string> {
  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Derive key from passphrase
  const key = await pbkdf2Async(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  // Create cipher and encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine salt:iv:authTag:ciphertext and encode as base64
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

export async function decrypt(ciphertext: string, passphrase: string): Promise<string> {
  try {
    // Decode from base64
    const combined = Buffer.from(ciphertext, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from passphrase
    const key = await pbkdf2Async(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

    // Create decipher and decrypt
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Decryption failed';
    throw new Error(`Decryption failed: ${message}`);
  }
}
