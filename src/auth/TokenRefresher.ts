/* eslint-disable @typescript-eslint/no-explicit-any */
import { TokenData } from './TokenData';
import { RefreshConfig, OAuthTokenResponse } from './types';
import { DEFAULT_RETRY_POLICY, shouldRetry, sleep, RetryPolicy, applyJitter } from './retryPolicy';
import { MetricsCollector } from './MetricsCollector';
import { AuthError } from '../errors/AuthError';
import { NetworkError } from '../errors/NetworkError';
import { RateLimiter } from '../utils/RateLimiter';

export interface TokenRefresherOptions {
  retryPolicy?: Partial<RetryPolicy>;
  metricsCollector?: MetricsCollector;
  rateLimiter?: RateLimiter;
}

/**
 * Handles OAuth 2.0 token refresh with retry logic and metrics collection.
 *
 * Features:
 * - Exponential backoff with configurable jitter for transient failures
 * - Automatic retry on 429 (rate limit) and 5xx server errors
 * - Token rotation support (handles new refresh_token from server)
 * - Optional metrics collection for monitoring and debugging
 * - Profile-based tracking for multi-profile scenarios
 * - Optional rate limiting to prevent OAuth endpoint abuse
 *
 * Token Rotation:
 * OAuth 2.0 servers may rotate refresh tokens for security. This class
 * automatically handles rotation by returning the new refresh_token from
 * the server response. Callers should always use the returned refreshToken
 * for subsequent requests, not the original token.
 *
 * @example
 * ```typescript
 * const refresher = new TokenRefresher({
 *   httpClient: axios.create(),
 *   tokenUrl: 'https://api.example.com/oauth/token',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-secret', // optional
 * }, {
 *   retryPolicy: { maxAttempts: 3 },
 *   metricsCollector: new MetricsCollector(),
 * });
 *
 * const tokenData = await refresher.refresh(currentRefreshToken, scopes, profileId);
 * // Always use tokenData.refreshToken for next refresh, not currentRefreshToken
 * ```
 */
export class TokenRefresher {
  private retryPolicy: RetryPolicy;
  private metricsCollector?: MetricsCollector;
  private rateLimiter?: RateLimiter;

  constructor(private config: RefreshConfig, options?: TokenRefresherOptions) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options?.retryPolicy };
    this.metricsCollector = options?.metricsCollector;
    this.rateLimiter = options?.rateLimiter;
  }

  async refresh(refreshToken: string, scopes: string[], profileId: string = 'default'): Promise<TokenData> {
    // Check and consume rate limit token before attempting refresh
    if (this.rateLimiter) {
      try {
        await this.rateLimiter.consume(1);
      } catch (error) {
        // Rate limit exceeded
        throw new AuthError(
          'Rate limit exceeded for token refresh. Please wait before retrying.',
          { profileId, rateLimitExceeded: true }
        );
      }
    }

    const startTime = Date.now();
    let attempt = 0;
    let lastError: any;

    while (attempt < this.retryPolicy.maxAttempts) {
      attempt++;

      try {
        const response = await this.config.httpClient.post<OAuthTokenResponse>(
          this.config.tokenUrl,
          {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.config.clientId,
            ...(this.config.clientSecret && { client_secret: this.config.clientSecret }),
          }
        );

        const data = response.data;
        const now = Date.now();

        // Record successful refresh metrics
        if (this.metricsCollector) {
          this.metricsCollector.recordRefresh({
            timestamp: now,
            success: true,
            latencyMs: now - startTime,
            profileId,
            retryCount: attempt - 1,
          });
        }

        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: now + data.expires_in * 1000,
          grantedAt: now,
          scopes: data.scope.split(' '),
          tokenType: data.token_type as 'Bearer',
          deviceFingerprint: this.generateFingerprint(),
        };
      } catch (error: any) {
        lastError = error;

        const statusCode = error.response?.status;

        // Don't retry on 401 (invalid grant)
        if (statusCode === 401) {
          // Record failed refresh metrics
          if (this.metricsCollector) {
            this.metricsCollector.recordRefresh({
              timestamp: Date.now(),
              success: false,
              latencyMs: Date.now() - startTime,
              profileId,
              retryCount: attempt - 1,
              error: error.response?.data?.error || 'invalid_grant',
            });
          }
          throw new AuthError(
            `Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`,
            { profileId, statusCode, errorType: error.response?.data?.error || 'invalid_grant' }
          );
        }

        // Check if we should retry
        if (!shouldRetry(statusCode, attempt, this.retryPolicy)) {
          break;
        }

        // Apply jitter to delay
        let delayMs = this.retryPolicy.getDelayMs(attempt);
        if (this.retryPolicy.applyJitter) {
          delayMs = applyJitter(delayMs);
        }

        await sleep(delayMs);
      }
    }

    // Record failed refresh metrics after max retries
    if (this.metricsCollector) {
      this.metricsCollector.recordRefresh({
        timestamp: Date.now(),
        success: false,
        latencyMs: Date.now() - startTime,
        profileId,
        retryCount: attempt - 1,
        error: lastError.message || 'max_retries_exceeded',
      });
    }

    throw new NetworkError(
      `Token refresh failed after ${attempt} attempts: ${lastError.message}`,
      { profileId, attempts: attempt, lastError: lastError.message }
    );
  }

  private generateFingerprint(): string {
    // Simple fingerprint for now
    return `${process.platform}-${process.version}`;
  }
}
