import { TokenData } from './TokenData';

/**
 * Interface for token storage implementations.
 * Provides abstraction for different storage backends (plain file, encrypted, etc.).
 */
export interface ITokenStore {
  /**
   * Read token data for a profile.
   * @param profileId - The profile identifier
   * @returns Token data if found and valid, null otherwise
   */
  read(profileId: string): Promise<TokenData | null>;

  /**
   * Write token data for a profile.
   * @param profileId - The profile identifier
   * @param tokenData - The token data to store
   */
  write(profileId: string, tokenData: TokenData): Promise<void>;
}
