/* eslint-disable @typescript-eslint/no-explicit-any */
import { TokenData } from './TokenData';
import { RefreshConfig, OAuthTokenResponse } from './types';
import { DEFAULT_RETRY_POLICY, shouldRetry, sleep, RetryPolicy } from './retryPolicy';

export class TokenRefresher {
  private retryPolicy: RetryPolicy;

  constructor(private config: RefreshConfig, retryPolicy?: Partial<RetryPolicy>) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
  }

  async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
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
          throw new Error(`Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`);
        }

        // Check if we should retry
        if (!shouldRetry(statusCode, attempt, this.retryPolicy)) {
          break;
        }

        // Wait before retry
        const delayMs = this.retryPolicy.getDelayMs(attempt);
        await sleep(delayMs);
      }
    }

    throw new Error(`Token refresh failed after ${attempt} attempts: ${lastError.message}`);
  }

  private generateFingerprint(): string {
    // Simple fingerprint for now
    return `${process.platform}-${process.version}`;
  }
}
