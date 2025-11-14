import { readFile } from 'fs/promises';
import { join } from 'path';
import { TokenData, TokenDataSchema } from './TokenData';

export class TokenStore {
  constructor(private readonly storePath: string) {}

  async read(profileId: string): Promise<TokenData | null> {
    const filePath = join(this.storePath, `${profileId}.token.json`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);

      // Validate with Zod schema (don't use validateTokenData to avoid expiry check)
      const validated = TokenDataSchema.parse(parsed);
      return validated;
    } catch (error: unknown) {
      // Return null for any error (file not found, invalid JSON, validation failure)
      return null;
    }
  }
}
