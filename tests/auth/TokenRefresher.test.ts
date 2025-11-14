import { TokenRefresher } from '../../src/auth/TokenRefresher';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

describe('TokenRefresher Success', () => {
  let refresher: TokenRefresher;
  let mockHttp: MockAdapter;

  beforeEach(() => {
    const httpClient = axios.create();
    mockHttp = new MockAdapter(httpClient);
    refresher = new TokenRefresher({
      httpClient,
      tokenUrl: 'https://api.anthropic.com/oauth/token',
      clientId: 'test-client-id',
    });
  });

  afterEach(() => {
    mockHttp.reset();
  });

  it('should refresh token successfully', async () => {
    const refreshToken = 'refresh-token-123';
    const now = Date.now();

    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(200, {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    const result = await refresher.refresh(refreshToken, ['user:inference']);

    expect(result).toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      tokenType: 'Bearer',
      scopes: ['user:inference'],
    });
    expect(result.expiresAt).toBeGreaterThan(now);
    expect(result.expiresAt).toBeLessThan(now + 3700000);
  });

  it('should include client credentials in request', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply((config) => {
      const data = JSON.parse(config.data);
      expect(data).toMatchObject({
        grant_type: 'refresh_token',
        refresh_token: 'test-refresh',
        client_id: 'test-client-id',
      });
      return [200, { access_token: 'new', refresh_token: 'new', expires_in: 3600, token_type: 'Bearer', scope: 'user:inference' }];
    });

    await refresher.refresh('test-refresh', ['user:inference']);
  });
});
