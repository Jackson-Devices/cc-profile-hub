import { HttpClient } from '../http/HttpClient';

export interface RefreshConfig {
  httpClient: HttpClient;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}
