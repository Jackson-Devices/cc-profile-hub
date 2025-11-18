import { encrypt as pbkdf2Encrypt, decrypt as pbkdf2Decrypt } from './encryption';
import {
  encryptWithArgon2,
  decryptWithArgon2,
  EncryptedData,
  ENCRYPTION_VERSION,
} from './argon2Encryption';

/**
 * Migration status for key rotation.
 */
export interface MigrationStatus {
  migrated: boolean;
  oldVersion: string;
  newVersion: string;
  timestamp: number;
}

/**
 * Detect encryption version from ciphertext.
 *
 * @param ciphertext - Encrypted data
 * @returns Version identifier
 */
export function detectEncryptionVersion(ciphertext: string): string {
  try {
    const parsed: EncryptedData = JSON.parse(ciphertext);
    if (parsed.version && parsed.data) {
      return parsed.version;
    }
  } catch {
    // Not JSON, must be legacy PBKDF2 format
  }

  return 'pbkdf2-legacy';
}

/**
 * Check if ciphertext uses legacy encryption.
 *
 * @param ciphertext - Encrypted data
 * @returns true if using legacy PBKDF2, false if using Argon2
 */
export function isLegacyEncryption(ciphertext: string): boolean {
  const version = detectEncryptionVersion(ciphertext);
  return version === 'pbkdf2-legacy';
}

/**
 * Rotate encryption key from PBKDF2 to Argon2.
 * Decrypts with old method and re-encrypts with new method.
 *
 * @param ciphertext - Legacy encrypted data
 * @param passphrase - User passphrase
 * @returns New Argon2-encrypted data
 */
export async function rotatePBKDF2ToArgon2(
  ciphertext: string,
  passphrase: string
): Promise<{ encrypted: string; status: MigrationStatus }> {
  // Decrypt using legacy PBKDF2
  const plaintext = await pbkdf2Decrypt(ciphertext, passphrase);

  // Re-encrypt using Argon2id
  const encrypted = await encryptWithArgon2(plaintext, passphrase);

  return {
    encrypted: JSON.stringify(encrypted),
    status: {
      migrated: true,
      oldVersion: 'pbkdf2-legacy',
      newVersion: ENCRYPTION_VERSION,
      timestamp: Date.now(),
    },
  };
}

/**
 * Automatically rotate encryption if using legacy format.
 * No-op if already using latest encryption.
 *
 * @param ciphertext - Encrypted data (any version)
 * @param passphrase - User passphrase
 * @returns Encrypted data with latest encryption and migration status
 */
export async function autoRotate(
  ciphertext: string,
  passphrase: string
): Promise<{ encrypted: string; status: MigrationStatus }> {
  const version = detectEncryptionVersion(ciphertext);

  if (version === ENCRYPTION_VERSION) {
    // Already using latest encryption
    return {
      encrypted: ciphertext,
      status: {
        migrated: false,
        oldVersion: version,
        newVersion: version,
        timestamp: Date.now(),
      },
    };
  }

  if (version === 'pbkdf2-legacy') {
    return await rotatePBKDF2ToArgon2(ciphertext, passphrase);
  }

  // Unknown version - cannot rotate
  throw new Error(`Unknown encryption version: ${version}`);
}

/**
 * Batch rotate multiple encrypted values.
 * Useful for migrating entire token stores or profile databases.
 *
 * @param items - Map of item IDs to encrypted data
 * @param passphrase - User passphrase
 * @returns Map of item IDs to new encrypted data and migration results
 */
export async function batchRotate(
  items: Map<string, string>,
  passphrase: string
): Promise<{
  rotated: Map<string, string>;
  results: Map<string, MigrationStatus>;
  stats: {
    total: number;
    migrated: number;
    skipped: number;
    failed: number;
  };
}> {
  const rotated = new Map<string, string>();
  const results = new Map<string, MigrationStatus>();
  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const [id, ciphertext] of items.entries()) {
    try {
      const result = await autoRotate(ciphertext, passphrase);
      rotated.set(id, result.encrypted);
      results.set(id, result.status);

      if (result.status.migrated) {
        migratedCount++;
      } else {
        skippedCount++;
      }
    } catch (error) {
      // Keep original ciphertext on error
      rotated.set(id, ciphertext);
      results.set(id, {
        migrated: false,
        oldVersion: 'unknown',
        newVersion: 'unknown',
        timestamp: Date.now(),
      });
      failedCount++;
    }
  }

  return {
    rotated,
    results,
    stats: {
      total: items.size,
      migrated: migratedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
  };
}
