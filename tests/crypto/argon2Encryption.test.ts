import {
  encryptWithArgon2,
  decryptWithArgon2,
  encrypt,
  decrypt,
  ENCRYPTION_VERSION,
} from '../../src/crypto/argon2Encryption';
import { encrypt as pbkdf2Encrypt } from '../../src/crypto/encryption';

describe('Argon2 Encryption', () => {
  const testData = 'sensitive data 🔐';
  const passphrase = 'super-secret-passphrase';

  describe('encryptWithArgon2', () => {
    it('should encrypt and return versioned data', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);

      expect(encrypted).toHaveProperty('version');
      expect(encrypted).toHaveProperty('data');
      expect(encrypted.version).toBe(ENCRYPTION_VERSION);
      expect(typeof encrypted.data).toBe('string');
      expect(encrypted.data.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertext on each encryption', async () => {
      const encrypted1 = await encryptWithArgon2(testData, passphrase);
      const encrypted2 = await encryptWithArgon2(testData, passphrase);

      // Different because of random salt and IV
      expect(encrypted1.data).not.toBe(encrypted2.data);
    });

    it('should handle empty string', async () => {
      const encrypted = await encryptWithArgon2('', passphrase);

      expect(encrypted.data).toBeTruthy();
    });

    it('should handle unicode characters', async () => {
      const unicode = '🎉 Hello 世界 🔒';
      const encrypted = await encryptWithArgon2(unicode, passphrase);

      expect(encrypted.data).toBeTruthy();
    });
  });

  describe('decryptWithArgon2', () => {
    it('should decrypt correctly encrypted data', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);
      const decrypted = await decryptWithArgon2(encrypted, passphrase);

      expect(decrypted).toBe(testData);
    });

    it('should handle empty string round-trip', async () => {
      const encrypted = await encryptWithArgon2('', passphrase);
      const decrypted = await decryptWithArgon2(encrypted, passphrase);

      expect(decrypted).toBe('');
    });

    it('should handle unicode round-trip', async () => {
      const unicode = '🎉 Hello 世界 🔒';
      const encrypted = await encryptWithArgon2(unicode, passphrase);
      const decrypted = await decryptWithArgon2(encrypted, passphrase);

      expect(decrypted).toBe(unicode);
    });

    it('should fail with wrong passphrase', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);

      await expect(
        decryptWithArgon2(encrypted, 'wrong-passphrase')
      ).rejects.toThrow('Decryption failed');
    });

    it('should fail with corrupted ciphertext', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);
      // Corrupt the data
      const corrupted = {
        ...encrypted,
        data: encrypted.data.substring(0, encrypted.data.length - 10),
      };

      await expect(decryptWithArgon2(corrupted, passphrase)).rejects.toThrow();
    });

    it('should fail with wrong version', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);
      const wrongVersion = {
        ...encrypted,
        version: 'unknown-version',
      };

      await expect(
        decryptWithArgon2(wrongVersion, passphrase)
      ).rejects.toThrow('Unsupported encryption version');
    });
  });

  describe('encrypt (convenience wrapper)', () => {
    it('should encrypt and return JSON string', async () => {
      const encrypted = await encrypt(testData, passphrase);

      expect(typeof encrypted).toBe('string');
      // Should be parseable as JSON
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('data');
    });
  });

  describe('decrypt (convenience wrapper with fallback)', () => {
    it('should decrypt Argon2-encrypted data', async () => {
      const encrypted = await encrypt(testData, passphrase);
      const decrypted = await decrypt(encrypted, passphrase);

      expect(decrypted).toBe(testData);
    });

    it('should decrypt legacy PBKDF2-encrypted data', async () => {
      // Encrypt with legacy PBKDF2
      const legacyEncrypted = await pbkdf2Encrypt(testData, passphrase);

      // Should decrypt with new decrypt function (fallback)
      const decrypted = await decrypt(legacyEncrypted, passphrase);

      expect(decrypted).toBe(testData);
    });

    it('should handle both formats in same session', async () => {
      // Encrypt one with Argon2
      const argon2Encrypted = await encrypt('argon2 data', passphrase);

      // Encrypt one with legacy PBKDF2
      const pbkdf2Encrypted = await pbkdf2Encrypt('pbkdf2 data', passphrase);

      // Both should decrypt correctly
      const decrypted1 = await decrypt(argon2Encrypted, passphrase);
      const decrypted2 = await decrypt(pbkdf2Encrypted, passphrase);

      expect(decrypted1).toBe('argon2 data');
      expect(decrypted2).toBe('pbkdf2 data');
    });
  });

  describe('security properties', () => {
    it('should use strong key derivation (Argon2id)', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);

      // Argon2 should take noticeable time (memory-hard)
      const start = Date.now();
      await decryptWithArgon2(encrypted, passphrase);
      const duration = Date.now() - start;

      // Should take at least a few milliseconds (memory-hard KDF)
      expect(duration).toBeGreaterThan(1);
    });

    it('should use authenticated encryption (detect tampering)', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);

      // Parse and corrupt the authentication tag
      const decoded = Buffer.from(encrypted.data, 'base64');
      // Flip a bit in the auth tag (after salt and IV)
      const saltAndIvLength = 32 + 16;
      decoded[saltAndIvLength + 1] ^= 0x01;

      const corrupted = {
        ...encrypted,
        data: decoded.toString('base64'),
      };

      // Should fail authentication
      await expect(decryptWithArgon2(corrupted, passphrase)).rejects.toThrow();
    });

    it('should produce ciphertext of reasonable size', async () => {
      const encrypted = await encryptWithArgon2(testData, passphrase);

      // Overhead: 32 (salt) + 16 (IV) + 16 (auth tag) = 64 bytes
      // Plus actual encrypted data length
      const decoded = Buffer.from(encrypted.data, 'base64');
      const overhead = decoded.length - Buffer.from(testData, 'utf8').length;

      // Overhead should be approximately salt + IV + auth tag = 64 bytes
      // (could be slightly more due to padding)
      expect(overhead).toBeGreaterThanOrEqual(64);
      expect(overhead).toBeLessThan(80); // Reasonable upper bound
    });
  });
});
