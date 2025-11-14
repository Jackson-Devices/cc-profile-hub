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

describe('TokenRefresher Retry Logic', () => {
  let refresher: TokenRefresher;
  let mockHttp: MockAdapter;

  beforeEach(() => {
    const httpClient = axios.create();
    mockHttp = new MockAdapter(httpClient);
    refresher = new TokenRefresher(
      {
        httpClient,
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client-id',
      },
      {
        // Use shorter delays for faster tests
        getDelayMs: () => 10,
      }
    );
  });

  afterEach(() => {
    mockHttp.reset();
  });

  it('should retry on 429 rate limit', async () => {
    let attempts = 0;

    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(() => {
      attempts++;
      if (attempts < 3) {
        return [429, { error: 'rate_limit_exceeded' }];
      }
      return [
        200,
        {
          access_token: 'success-after-retry',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user:inference',
        },
      ];
    });

    const result = await refresher.refresh('test-refresh', ['user:inference']);

    expect(attempts).toBe(3);
    expect(result.accessToken).toBe('success-after-retry');
  });

  it('should retry on 5xx server errors', async () => {
    let attempts = 0;

    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(() => {
      attempts++;
      if (attempts < 2) {
        return [500, { error: 'internal_error' }];
      }
      return [
        200,
        {
          access_token: 'success',
          refresh_token: 'new',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user:inference',
        },
      ];
    });

    const result = await refresher.refresh('test-refresh', ['user:inference']);

    expect(attempts).toBe(2);
    expect(result.accessToken).toBe('success');
  });

  it('should NOT retry on 401 invalid grant', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(401, {
      error: 'invalid_grant',
      error_description: 'refresh token expired',
    });

    await expect(refresher.refresh('expired-refresh', ['user:inference'])).rejects.toThrow(/invalid_grant/);
  });

  it('should fail after max retries', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(429, {
      error: 'rate_limit_exceeded',
    });

    await expect(refresher.refresh('test-refresh', ['user:inference'])).rejects.toThrow(/failed after \d+ attempts/i);
  });
});
