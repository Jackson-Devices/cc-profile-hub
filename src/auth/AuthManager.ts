import { TokenData } from './TokenData';
import { TokenRefresher } from './TokenRefresher';
import { ITokenStore } from './ITokenStore';
import { Mutex } from '../utils/Mutex';
import { Logger } from '../utils/Logger';
import { AuthError } from '../errors/AuthError';
import { isTokenExpired } from './TokenData';

export interface AuthManagerConfig {
  store: ITokenStore;
  refresher: TokenRefresher;
  profileId: string;
  /**
   * Refresh tokens this many seconds before expiry.
   * Default: 300 (5 minutes)
   */
  refreshThreshold?: number;
  /**
   * How often to check for token refresh in background (milliseconds).
   * Default: 60000 (1 minute)
   */
  backgroundCheckInterval?: number;
  logger?: Logger;
}

/**
 * Centralized authentication manager that coordinates token storage and refresh.
 *
 * Features:
 * - Mutex-protected token refresh (prevents concurrent duplicate refreshes)
 * - Background refresh scheduler (proactive token refresh)
 * - Request deduplication (multiple concurrent callers share same refresh)
 * - Configurable refresh threshold (default: 5 minutes before expiry)
 *
 * @example
 * ```typescript
 * const authManager = new AuthManager({
 *   store: new EncryptedTokenStore('/path/to/tokens', passphrase),
 *   refresher: new TokenRefresher(config),
 *   profileId: 'work',
 *   refreshThreshold: 300,
 * });
 *
 * // Ensure token is valid before making API call
 * const token = await authManager.ensureValidToken();
 *
 * // Start background refresh
 * authManager.startBackgroundRefresh();
 *
 * // Cleanup on shutdown
 * authManager.stopBackgroundRefresh();
 * ```
 */
export class AuthManager {
  private readonly store: ITokenStore;
  private readonly refresher: TokenRefresher;
  private readonly profileId: string;
  private readonly refreshThreshold: number;
  private readonly backgroundCheckInterval: number;
  private readonly logger: Logger;
  private readonly refreshMutex: Mutex;

  private backgroundInterval: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(config: AuthManagerConfig) {
    this.store = config.store;
    this.refresher = config.refresher;
    this.profileId = config.profileId;
    this.refreshThreshold = config.refreshThreshold ?? 300;
    this.backgroundCheckInterval = config.backgroundCheckInterval ?? 60000;
    this.logger = config.logger ?? new Logger({ level: 'info' });
    this.refreshMutex = new Mutex();
  }

  /**
   * Ensures a valid token is available, refreshing if necessary.
   *
   * This method is safe to call concurrently - the mutex ensures only one
   * refresh happens at a time, and all callers receive the same refreshed token.
   *
   * @returns Valid token data
   * @throws AuthError if no refresh token is available
   * @throws NetworkError if refresh fails after retries
   */
  async ensureValidToken(): Promise<TokenData> {
    // Fast path: check if token is still valid (no mutex needed)
    const existing = await this.store.read(this.profileId);
    if (existing && !isTokenExpired(existing, this.refreshThreshold)) {
      this.logger.trace('Token is valid, no refresh needed', {
        profileId: this.profileId,
        expiresAt: existing.expiresAt,
      });
      return existing;
    }

    // Slow path: need to refresh (acquire mutex)
    return this.refreshMutex.runExclusive(async () => {
      // Double-check inside mutex (another caller may have just refreshed)
      const current = await this.store.read(this.profileId);
      if (current && !isTokenExpired(current, this.refreshThreshold)) {
        this.logger.debug('Token was refreshed by another caller', {
          profileId: this.profileId,
        });
        return current;
      }

      // Actually need to refresh
      if (!current) {
        throw new AuthError('No refresh token available. Please authenticate first.', {
          profileId: this.profileId,
        });
      }

      this.logger.info('Refreshing token', {
        profileId: this.profileId,
        expiresAt: current.expiresAt,
        timeUntilExpiry: current.expiresAt - Date.now(),
      });

      this.isRefreshing = true;
      try {
        const newToken = await this.refresher.refresh(
          current.refreshToken,
          current.scopes,
          this.profileId
        );

        await this.store.write(this.profileId, newToken);

        this.logger.info('Token refreshed successfully', {
          profileId: this.profileId,
          newExpiresAt: newToken.expiresAt,
        });

        return newToken;
      } finally {
        this.isRefreshing = false;
      }
    });
  }

  /**
   * Start background token refresh scheduler.
   *
   * This will check for token expiry every minute (configurable) and
   * proactively refresh tokens before they expire.
   */
  startBackgroundRefresh(): void {
    if (this.backgroundInterval) {
      this.logger.warn('Background refresh already running', {
        profileId: this.profileId,
      });
      return;
    }

    this.logger.info('Starting background token refresh', {
      profileId: this.profileId,
      checkInterval: this.backgroundCheckInterval,
      refreshThreshold: this.refreshThreshold,
    });

    this.backgroundInterval = setInterval(async () => {
      try {
        await this.ensureValidToken();
      } catch (error) {
        this.logger.error('Background token refresh failed', {
          profileId: this.profileId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.backgroundCheckInterval);

    // Don't keep process alive if only background refresh is running
    this.backgroundInterval.unref();
  }

  /**
   * Stop background token refresh scheduler.
   */
  stopBackgroundRefresh(): void {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
      this.logger.info('Stopped background token refresh', {
        profileId: this.profileId,
      });
    }
  }

  /**
   * Check if a refresh is currently in progress.
   */
  isRefreshInProgress(): boolean {
    return this.isRefreshing;
  }

  /**
   * Get the current profile ID being managed.
   */
  getProfileId(): string {
    return this.profileId;
  }
}
