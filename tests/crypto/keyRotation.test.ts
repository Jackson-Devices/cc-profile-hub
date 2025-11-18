import {
  detectEncryptionVersion,
  isLegacyEncryption,
  rotatePBKDF2ToArgon2,
  autoRotate,
  batchRotate,
} from '../../src/crypto/keyRotation';
import { encrypt as pbkdf2Encrypt } from '../../src/crypto/encryption';
import { encryptWithArgon2, ENCRYPTION_VERSION } from '../../src/crypto/argon2Encryption';

describe('Key Rotation', () => {
  const testData = 'sensitive data';
  const passphrase = 'test-passphrase';

  describe('detectEncryptionVersion', () => {
    it('should detect Argon2 version', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);
      const ciphertext = JSON.stringify(encrypted);

      const version = detectEncryptionVersion(ciphertext);

      expect(version).toBe(ENCRYPTION_VERSION);
    });

    it('should detect legacy PBKDF2 format', async () => {
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      const version = detectEncryptionVersion(legacyEncrypted);

      expect(version).toBe('pbkdf2-legacy');
    });

    it('should handle malformed input', () => {
      const version = detectEncryptionVersion('not-valid-json');

      expect(version).toBe('pbkdf2-legacy');
    });
  });

  describe('isLegacyEncryption', () => {
    it('should return true for PBKDF2 encryption', async () => {
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      expect(isLegacyEncryption(legacyEncrypted)).toBe(true);
    });

    it('should return false for Argon2 encryption', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);
      const ciphertext = JSON.stringify(encrypted);

      expect(isLegacyEncryption(ciphertext)).toBe(false);
    });
  });

  describe('rotatePBKDF2ToArgon2', () => {
    it('should migrate from PBKDF2 to Argon2', async () => {
      // Encrypt with legacy PBKDF2
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      // Rotate to Argon2
      const result = await rotatePBKDF2ToArgon2(legacyEncrypted, passphrase);

      // Check migration status
      expect(result.status.migrated).toBe(true);
      expect(result.status.oldVersion).toBe('pbkdf2-legacy');
      expect(result.status.newVersion).toBe(ENCRYPTION_VERSION);

      // New encryption should be Argon2
      expect(isLegacyEncryption(result.encrypted)).toBe(false);
    });

    it('should preserve data during rotation', async () => {
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      const result = await rotatePBKDF2ToArgon2(legacyEncrypted, passphrase);

      // Decrypt new ciphertext
      const { decrypt } = await import('../../src/crypto/argon2Encryption');
      const decrypted = await decrypt(result.encrypted, passphrase);

      expect(decrypted).toBe(testData);
    });

    it('should fail with wrong passphrase', async () => {
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      await expect(
        rotatePBKDF2ToArgon2(legacyEncrypted, 'wrong-passphrase')
      ).rejects.toThrow();
    });
  });

  describe('autoRotate', () => {
    it('should rotate legacy encryption', async () => {
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      const result = await autoRotate(legacyEncrypted, passphrase);

      expect(result.status.migrated).toBe(true);
      expect(result.status.oldVersion).toBe('pbkdf2-legacy');
      expect(result.status.newVersion).toBe(ENCRYPTION_VERSION);
    });

    it('should skip rotation for current encryption', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);
      const ciphertext = JSON.stringify(encrypted);

      const result = await autoRotate(ciphertext, passphrase);

      expect(result.status.migrated).toBe(false);
      expect(result.encrypted).toBe(ciphertext);
    });

    it('should preserve data during auto-rotation', async () => {
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      const result = await autoRotate(legacyEncrypted, passphrase);

      const { decrypt } = await import('../../src/crypto/argon2Encryption');
      const decrypted = await decrypt(result.encrypted, passphrase);

      expect(decrypted).toBe(testData);
    });
  });

  describe('batchRotate', () => {
    it('should rotate multiple items', async () => {
      const items = new Map<string, string>();

      // Add legacy encrypted items
      items.set('item1', await pbkdf2Encrypt('data1', passphrase));
      items.set('item2', await pbkdf2Encrypt('data2', passphrase));
      items.set('item3', await pbkdf2Encrypt('data3', passphrase));

      const result = await batchRotate(items, passphrase);

      expect(result.stats.total).toBe(3);
      expect(result.stats.migrated).toBe(3);
      expect(result.stats.skipped).toBe(0);
      expect(result.stats.failed).toBe(0);

      // All items should be rotated
      expect(result.rotated.size).toBe(3);
      expect(result.results.size).toBe(3);
    });

    it('should skip already-migrated items', async () => {
      const items = new Map<string, string>();

      // Mix of legacy and new encryption
      items.set('legacy1', await pbkdf2Encrypt('data1', passphrase));
      const argon2Item = await encryptWithArgon2('data2', passphrase);
      items.set('new1', JSON.stringify(argon2Item));

      const result = await batchRotate(items, passphrase);

      expect(result.stats.total).toBe(2);
      expect(result.stats.migrated).toBe(1); // Only legacy item
      expect(result.stats.skipped).toBe(1); // Already migrated
      expect(result.stats.failed).toBe(0);
    });

    it('should preserve data for all items', async () => {
      const items = new Map<string, string>();
      const testData = new Map([
        ['item1', 'secret data 1'],
        ['item2', 'secret data 2'],
        ['item3', 'secret data 3'],
      ]);

      // Encrypt all items with legacy PBKDF2
      for (const [id, data] of testData.entries()) {
        items.set(id, await pbkdf2Encrypt(data, passphrase));
      }

      const result = await batchRotate(items, passphrase);

      // Decrypt all rotated items
      const { decrypt } = await import('../../src/crypto/argon2Encryption');
      for (const [id, expectedData] of testData.entries()) {
        const encrypted = result.rotated.get(id)!;
        const decrypted = await decrypt(encrypted, passphrase);
        expect(decrypted).toBe(expectedData);
      }
    });

    it('should handle empty batch', async () => {
      const items = new Map<string, string>();

      const result = await batchRotate(items, passphrase);

      expect(result.stats.total).toBe(0);
      expect(result.stats.migrated).toBe(0);
      expect(result.stats.skipped).toBe(0);
      expect(result.stats.failed).toBe(0);
    });

    it('should handle corrupted items gracefully', async () => {
      const items = new Map<string, string>();

      items.set('valid', await pbkdf2Encrypt('data1', passphrase));
      items.set('corrupted', 'not-valid-ciphertext');

      const result = await batchRotate(items, passphrase);

      expect(result.stats.total).toBe(2);
      expect(result.stats.migrated).toBe(1);
      expect(result.stats.failed).toBe(1);

      // Corrupted item should be preserved as-is
      expect(result.rotated.get('corrupted')).toBe('not-valid-ciphertext');
    });

    it('should provide detailed results per item', async () => {
      const items = new Map<string, string>();

      items.set('item1', await pbkdf2Encrypt('data1', passphrase));
      const argon2Item = await encryptWithArgon2('data2', passphrase);
      items.set('item2', JSON.stringify(argon2Item));

      const result = await batchRotate(items, passphrase);

      // Check individual results
      expect(result.results.get('item1')?.migrated).toBe(true);
      expect(result.results.get('item2')?.migrated).toBe(false);
    });
  });
});
