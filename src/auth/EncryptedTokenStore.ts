import { TokenStore } from './TokenStore';
import { TokenData, TokenDataSchema } from './TokenData';
import { encrypt, decrypt } from '../crypto/encryption';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ITokenStore } from './ITokenStore';
import { atomicWrite } from '../utils/atomicWrite';

export class EncryptedTokenStore implements ITokenStore {
  private store: TokenStore;
  private storePath: string;

  constructor(
    storePath: string,
    private readonly passphrase?: string
  ) {
    this.store = new TokenStore(storePath);
    this.storePath = storePath;
  }

  async read(profileId: string): Promise<TokenData | null> {
    // If no passphrase, use plain storage
    if (!this.passphrase) {
      return await this.store.read(profileId);
    }

    // Read raw file for encrypted storage
    const filePath = join(this.storePath, `${profileId}.token.json`);
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);

      // Check if data is encrypted format
      if (typeof parsed === 'object' && parsed !== null && 'encrypted' in parsed) {
        const encryptedData = (parsed as { encrypted: string }).encrypted;
        const decrypted = await decrypt(encryptedData, this.passphrase);
        const tokenData: unknown = JSON.parse(decrypted);
        return TokenDataSchema.parse(tokenData);
      }

      // Not encrypted format, try to parse as TokenData
      return TokenDataSchema.parse(parsed);
    } catch {
      // File not found, decryption failed, or validation failed
      return null;
    }
  }

  async write(profileId: string, tokenData: TokenData): Promise<void> {
    // If no passphrase, use plain storage
    if (!this.passphrase) {
      await this.store.write(profileId, tokenData);
      return;
    }

    // Encrypt the token data and write directly
    const plaintext = JSON.stringify(tokenData);
    const encrypted = await encrypt(plaintext, this.passphrase);

    const filePath = join(this.storePath, `${profileId}.token.json`);
    const content = JSON.stringify({ encrypted }, null, 2);

    // Atomic write: write to temp file, then rename
    await atomicWrite(filePath, content);
  }
}
