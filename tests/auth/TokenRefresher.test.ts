import { TokenRefresher } from '../../src/auth/TokenRefresher';
import { MetricsCollector } from '../../src/auth/MetricsCollector';
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

  it('should include client_secret when provided', async () => {
    const httpClient = axios.create();
    const mockHttp = new MockAdapter(httpClient);

    const refresherWithSecret = new TokenRefresher({
      httpClient,
      tokenUrl: 'https://api.anthropic.com/oauth/token',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });

    mockHttp.onPost().reply((config) => {
      const data = JSON.parse(config.data);
      expect(data.client_secret).toBe('test-secret');
      return [
        200,
        {
          access_token: 'test',
          refresh_token: 'test',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user:inference',
        },
      ];
    });

    await refresherWithSecret.refresh('test-refresh', ['user:inference']);
    mockHttp.reset();
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
        retryPolicy: {
          // Use shorter delays for faster tests
          getDelayMs: (): number => 10,
        },
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

  it('should handle 401 error without error field (fallback)', async () => {
    mockHttp.onPost().reply(401, {});

    await expect(refresher.refresh('test-refresh', ['user:inference'])).rejects.toThrow(/invalid_grant/);
  });

  it('should skip jitter when disabled', async () => {
    const httpClient = axios.create();
    const noJitterRefresher = new TokenRefresher(
      {
        httpClient,
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client-id',
      },
      {
        retryPolicy: {
          applyJitter: false,
          getDelayMs: (): number => 100,
          maxAttempts: 3,
        },
      }
    );

    const mockHttp = new MockAdapter(httpClient);

    let attempts = 0;
    mockHttp.onPost().reply(() => {
      attempts++;
      if (attempts < 3) {
        return [429, {}];
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

    const result = await noJitterRefresher.refresh('test-refresh', ['user:inference']);
    expect(result.accessToken).toBe('success');
    expect(attempts).toBe(3);

    mockHttp.reset();
  });

  it('should fail after max retries', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(429, {
      error: 'rate_limit_exceeded',
    });

    await expect(refresher.refresh('test-refresh', ['user:inference'])).rejects.toThrow(/failed after \d+ attempts/i);
  });
});

describe('TokenRefresher Metrics Integration', () => {
  let refresher: TokenRefresher;
  let mockHttp: MockAdapter;
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    const httpClient = axios.create();
    mockHttp = new MockAdapter(httpClient);
    metricsCollector = new MetricsCollector();

    refresher = new TokenRefresher(
      {
        httpClient,
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client-id',
      },
      {
        retryPolicy: {
          getDelayMs: (): number => 10,
        },
        metricsCollector,
      }
    );
  });

  afterEach(() => {
    mockHttp.reset();
  });

  it('should record successful refresh metrics', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(200, {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    await refresher.refresh('test-refresh', ['user:inference'], 'test-profile');

    const metrics = metricsCollector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      success: true,
      profileId: 'test-profile',
      retryCount: 0,
    });
    expect(metrics[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should record failed refresh metrics on 401 error', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(401, {
      error: 'invalid_grant',
    });

    await expect(refresher.refresh('expired-refresh', ['user:inference'], 'test-profile')).rejects.toThrow();

    const metrics = metricsCollector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      success: false,
      profileId: 'test-profile',
      retryCount: 0,
      error: 'invalid_grant',
    });
  });

  it('should record retry count in metrics', async () => {
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

    await refresher.refresh('test-refresh', ['user:inference'], 'test-profile');

    const metrics = metricsCollector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].retryCount).toBe(2);
    expect(metrics[0].success).toBe(true);
  });

  it('should record metrics on max retries failure', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(500, {
      error: 'internal_error',
    });

    await expect(refresher.refresh('test-refresh', ['user:inference'], 'test-profile')).rejects.toThrow();

    const metrics = metricsCollector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      success: false,
      profileId: 'test-profile',
    });
    expect(metrics[0].retryCount).toBeGreaterThan(0);
  });

  it('should work without metrics collector (optional)', async () => {
    const httpClient = axios.create();
    const noMetricsHttp = new MockAdapter(httpClient);
    const noMetricsRefresher = new TokenRefresher({
      httpClient,
      tokenUrl: 'https://api.anthropic.com/oauth/token',
      clientId: 'test-client-id',
    });

    noMetricsHttp.onPost('https://api.anthropic.com/oauth/token').reply(200, {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    // Should not throw without metrics collector
    const result = await noMetricsRefresher.refresh('test-refresh', ['user:inference']);
    expect(result.accessToken).toBe('new-access-token');

    noMetricsHttp.reset();
  });
});
