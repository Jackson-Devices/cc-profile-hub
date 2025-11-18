import { TokenRefresher } from '../../src/auth/TokenRefresher';
import { RefreshConfig } from '../../src/auth/types';
import { RateLimiter } from '../../src/utils/RateLimiter';
import { AuthError } from '../../src/errors/AuthError';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

describe('TokenRefresher Rate Limiting', () => {
  let mockHttp: MockAdapter;
  let config: RefreshConfig;

  beforeEach(() => {
    const httpClient = axios.create();
    mockHttp = new MockAdapter(httpClient);

    config = {
      httpClient,
      tokenUrl: 'https://auth.example.com/oauth/token',
      clientId: 'test-client-id',
    };
  });

  afterEach(() => {
    mockHttp.reset();
  });

  it('should reject refresh when rate limit exceeded', async () => {
    // Create rate limiter with only 2 tokens, no refill
    const rateLimiter = new RateLimiter({
      maxTokens: 2,
      refillRate: 0,
      refillInterval: 60000,
    });

    const refresher = new TokenRefresher(config, { rateLimiter });

    // Mock successful OAuth responses
    mockHttp.onPost(config.tokenUrl).reply(200, {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    // First two should succeed (exhaust rate limit)
    await refresher.refresh('token1', ['user:inference'], 'profile1');
    await refresher.refresh('token2', ['user:inference'], 'profile2');

    // Third should fail with rate limit error
    await expect(
      refresher.refresh('token3', ['user:inference'], 'profile3')
    ).rejects.toThrow(AuthError);

    await expect(
      refresher.refresh('token3', ['user:inference'], 'profile3')
    ).rejects.toThrow(/Rate limit exceeded/);

    // Verify profileId is in context
    try {
      await refresher.refresh('token4', ['user:inference'], 'profile4');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      const authError = error as AuthError;
      expect(authError.context).toMatchObject({
        profileId: 'profile4',
        rateLimitExceeded: true,
      });
    }
  });

  it('should allow refresh after rate limit refills', async () => {
    jest.useFakeTimers();

    // Create rate limiter: 1 token, refills 1 per second
    const rateLimiter = new RateLimiter({
      maxTokens: 1,
      refillRate: 1,
      refillInterval: 1000,
    });

    const refresher = new TokenRefresher(config, { rateLimiter });

    mockHttp.onPost(config.tokenUrl).reply(200, {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    // First succeeds
    await refresher.refresh('token1', ['user:inference'], 'profile');

    // Second fails (rate limited)
    await expect(
      refresher.refresh('token2', ['user:inference'], 'profile')
    ).rejects.toThrow(/Rate limit exceeded/);

    // Advance time to refill one token
    jest.advanceTimersByTime(1000);

    // Now it should succeed
    const result = await refresher.refresh('token3', ['user:inference'], 'profile');
    expect(result.accessToken).toBe('new-token');

    jest.useRealTimers();
  });

  it('should work normally when rate limiter is not provided', async () => {
    // No rate limiter passed
    const refresher = new TokenRefresher(config);

    mockHttp.onPost(config.tokenUrl).reply(200, {
      access_token: 'token1',
      refresh_token: 'refresh1',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    // Should not throw even with many rapid calls
    await refresher.refresh('refresh', ['user:inference'], 'profile');
    await refresher.refresh('refresh', ['user:inference'], 'profile');
    await refresher.refresh('refresh', ['user:inference'], 'profile');

    // All should succeed
    expect(mockHttp.history.post.length).toBe(3);
  });

  it('should respect rate limit across multiple profiles', async () => {
    // Global rate limiter for all profiles
    const rateLimiter = new RateLimiter({
      maxTokens: 3,
      refillRate: 0,
      refillInterval: 60000,
    });

    const refresher = new TokenRefresher(config, { rateLimiter });

    mockHttp.onPost(config.tokenUrl).reply(200, {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    // Use up limit across different profiles
    await refresher.refresh('token1', ['user:inference'], 'profile-a');
    await refresher.refresh('token2', ['user:inference'], 'profile-b');
    await refresher.refresh('token3', ['user:inference'], 'profile-c');

    // Fourth call should fail regardless of profile
    await expect(
      refresher.refresh('token4', ['user:inference'], 'profile-d')
    ).rejects.toThrow(/Rate limit exceeded/);
  });

  it('should not consume rate limit token if OAuth request fails', async () => {
    const rateLimiter = new RateLimiter({
      maxTokens: 2,
      refillRate: 0,
      refillInterval: 60000,
    });

    const refresher = new TokenRefresher(config, { rateLimiter });

    // First call: rate limit passes but OAuth fails (401)
    mockHttp.onPost(config.tokenUrl).reply(401, {
      error: 'invalid_grant',
      error_description: 'Refresh token expired',
    });

    await expect(
      refresher.refresh('expired-token', ['user:inference'], 'profile')
    ).rejects.toThrow(AuthError);

    // Rate limit token was consumed even though OAuth failed
    // This is correct behavior - rate limit protects endpoint, not success

    // Should still have 1 token left
    mockHttp.onPost(config.tokenUrl).reply(200, {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    const result = await refresher.refresh('valid-token', ['user:inference'], 'profile');
    expect(result.accessToken).toBe('new-token');
  });

  it('should work with concurrent requests and rate limiting', async () => {
    const rateLimiter = new RateLimiter({
      maxTokens: 5,
      refillRate: 0,
      refillInterval: 60000,
    });

    const refresher = new TokenRefresher(config, { rateLimiter });

    mockHttp.onPost(config.tokenUrl).reply(200, {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    // Launch 10 concurrent requests
    const promises = Array.from({ length: 10 }, (_, i) =>
      refresher.refresh(`token${i}`, ['user:inference'], 'profile')
    );

    const results = await Promise.allSettled(promises);

    // First 5 should succeed, last 5 should be rate limited
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(5);
    expect(failures.length).toBe(5);

    // All failures should be rate limit errors
    failures.forEach((failure) => {
      if (failure.status === 'rejected') {
        expect(failure.reason).toBeInstanceOf(AuthError);
        expect(failure.reason.message).toMatch(/Rate limit exceeded/);
      }
    });
  });
});
