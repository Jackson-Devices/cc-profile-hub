import { encrypt, decrypt } from '../../src/crypto/encryption';

describe('AES-GCM Encryption', () => {
  const passphrase = 'test-passphrase-123';
  const plaintext = 'sensitive data to encrypt';

  it('should encrypt and decrypt data successfully', async () => {
    const encrypted = await encrypt(plaintext, passphrase);
    const decrypted = await decrypt(encrypted, passphrase);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same input', async () => {
    const encrypted1 = await encrypt(plaintext, passphrase);
    const encrypted2 = await encrypt(plaintext, passphrase);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should fail decryption with wrong passphrase', async () => {
    const encrypted = await encrypt(plaintext, passphrase);

    await expect(decrypt(encrypted, 'wrong-passphrase')).rejects.toThrow();
  });

  it('should fail decryption with corrupted ciphertext', async () => {
    const encrypted = await encrypt(plaintext, passphrase);
    const corrupted = encrypted.slice(0, -10) + '0000000000';

    await expect(decrypt(corrupted, passphrase)).rejects.toThrow();
  });

  it('should handle empty plaintext', async () => {
    const encrypted = await encrypt('', passphrase);
    const decrypted = await decrypt(encrypted, passphrase);

    expect(decrypted).toBe('');
  });

  it('should handle unicode characters', async () => {
    const unicode = '🔒 Secure 数据 données';
    const encrypted = await encrypt(unicode, passphrase);
    const decrypted = await decrypt(encrypted, passphrase);

    expect(decrypted).toBe(unicode);
  });
});
