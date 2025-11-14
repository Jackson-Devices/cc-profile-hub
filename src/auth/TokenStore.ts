import { readFile, writeFile, rename } from 'fs/promises';
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
    } catch {
      // Return null for any error (file not found, invalid JSON, validation failure)
      return null;
    }
  }

  async write(profileId: string, tokenData: TokenData): Promise<void> {
    const filePath = join(this.storePath, `${profileId}.token.json`);
    const tempPath = join(this.storePath, `${profileId}.token.json.tmp`);

    // Atomic write: write to temp file, then rename
    const content = JSON.stringify(tokenData, null, 2);
    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, filePath);
  }
}
