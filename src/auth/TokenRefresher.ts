import { TokenData } from './TokenData';
import { RefreshConfig, OAuthTokenResponse } from './types';

export class TokenRefresher {
  constructor(private config: RefreshConfig) {}

  async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
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
  }

  private generateFingerprint(): string {
    // Simple fingerprint for now
    return `${process.platform}-${process.version}`;
  }
}
