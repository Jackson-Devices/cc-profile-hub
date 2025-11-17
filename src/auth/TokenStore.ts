import { readFile } from 'fs/promises';
import { join } from 'path';
import { TokenData, TokenDataSchema } from './TokenData';
import { TokenError } from '../errors/TokenError';
import { ITokenStore } from './ITokenStore';
import { atomicWrite } from '../utils/atomicWrite';

export class TokenStore implements ITokenStore {
  constructor(private readonly storePath: string) {}

  async read(profileId: string): Promise<TokenData | null> {
    const filePath = join(this.storePath, `${profileId}.token.json`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);

      // Validate with Zod schema (don't use validateTokenData to avoid expiry check)
      const validated = TokenDataSchema.parse(parsed);
      return validated;
    } catch {
      // Return null for any error (file not found, invalid JSON, validation failure)
      return null;
    }
  }

  async write(profileId: string, tokenData: TokenData): Promise<void> {
    const filePath = join(this.storePath, `${profileId}.token.json`);
    const content = JSON.stringify(tokenData, null, 2);

    try {
      // SECURITY: Set mode to 0600 (owner read/write only) to prevent unauthorized access
      // atomicWrite will verify permissions after write
      await atomicWrite(filePath, content, { mode: 0o600 });
    } catch (error) {
      // Convert generic permission errors to TokenError
      if (error instanceof Error && error.message.includes('permissions verification failed')) {
        throw new TokenError(error.message, { profileId, filePath });
      }
      throw error;
    }
  }
}
