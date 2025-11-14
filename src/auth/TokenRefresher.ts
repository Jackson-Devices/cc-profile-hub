/* eslint-disable @typescript-eslint/no-explicit-any */
import { TokenData } from './TokenData';
import { RefreshConfig, OAuthTokenResponse } from './types';
import { DEFAULT_RETRY_POLICY, shouldRetry, sleep, RetryPolicy, applyJitter } from './retryPolicy';
import { MetricsCollector } from './MetricsCollector';

export interface TokenRefresherOptions {
  retryPolicy?: Partial<RetryPolicy>;
  metricsCollector?: MetricsCollector;
}

export class TokenRefresher {
  private retryPolicy: RetryPolicy;
  private metricsCollector?: MetricsCollector;

  constructor(private config: RefreshConfig, options?: TokenRefresherOptions) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options?.retryPolicy };
    this.metricsCollector = options?.metricsCollector;
  }

  async refresh(refreshToken: string, scopes: string[], profileId: string = 'default'): Promise<TokenData> {
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
          throw new Error(`Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`);
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

    throw new Error(`Token refresh failed after ${attempt} attempts: ${lastError.message}`);
  }

  private generateFingerprint(): string {
    // Simple fingerprint for now
    return `${process.platform}-${process.version}`;
  }
}
