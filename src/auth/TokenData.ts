import { z } from 'zod';

export const TokenDataSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().positive(),
  grantedAt: z.number().positive(),
  scopes: z.array(z.string()),
  tokenType: z.literal('Bearer'),
  deviceFingerprint: z.string(),
});

export type TokenData = z.infer<typeof TokenDataSchema>;

export function validateTokenData(data: unknown): TokenData {
  const validated = TokenDataSchema.parse(data);

  // Additional business logic validation
  if (validated.expiresAt <= Date.now()) {
    throw new Error('Token data validation failed: token is expired');
  }

  if (validated.grantedAt > validated.expiresAt) {
    throw new Error('Token data validation failed: grantedAt after expiresAt');
  }

  return validated;
}

export function isTokenExpired(token: TokenData, bufferSeconds = 0): boolean {
  return token.expiresAt - bufferSeconds * 1000 <= Date.now();
}
