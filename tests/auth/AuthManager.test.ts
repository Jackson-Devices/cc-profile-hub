import { AuthManager } from '../../src/auth/AuthManager';
import { TokenStore } from '../../src/auth/TokenStore';
import { TokenRefresher } from '../../src/auth/TokenRefresher';
import { TokenData } from '../../src/auth/TokenData';
import { ITokenStore } from '../../src/auth/ITokenStore';
import { AuthError } from '../../src/errors/AuthError';

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockStore: jest.Mocked<ITokenStore>;
  let mockRefresher: jest.Mocked<TokenRefresher>;

  const validToken: TokenData = {
    accessToken: 'valid-access-token',
    refreshToken: 'valid-refresh-token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    grantedAt: Date.now(),
    scopes: ['user:inference'],
    tokenType: 'Bearer',
    deviceFingerprint: 'test-device',
  };

  const expiredToken: TokenData = {
    accessToken: 'expired-access-token',
    refreshToken: 'expired-refresh-token',
    expiresAt: Date.now() - 1000, // 1 second ago
    grantedAt: Date.now() - 3600000,
    scopes: ['user:inference'],
    tokenType: 'Bearer',
    deviceFingerprint: 'test-device',
  };

  const soonToExpireToken: TokenData = {
    accessToken: 'soon-expire-token',
    refreshToken: 'soon-expire-refresh',
    expiresAt: Date.now() + 60000, // 1 minute from now (less than 5 min threshold)
    grantedAt: Date.now() - 3540000,
    scopes: ['user:inference'],
    tokenType: 'Bearer',
    deviceFingerprint: 'test-device',
  };

  const newToken: TokenData = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    expiresAt: Date.now() + 7200000, // 2 hours from now
    grantedAt: Date.now(),
    scopes: ['user:inference'],
    tokenType: 'Bearer',
    deviceFingerprint: 'test-device',
  };

  beforeEach(() => {
    mockStore = {
      read: jest.fn(),
      write: jest.fn(),
    };

    mockRefresher = {
      refresh: jest.fn(),
    } as unknown as jest.Mocked<TokenRefresher>;

    authManager = new AuthManager({
      store: mockStore,
      refresher: mockRefresher,
      profileId: 'test-profile',
      refreshThreshold: 300, // 5 minutes
    });
  });

  afterEach(() => {
    authManager.stopBackgroundRefresh();
  });

  describe('ensureValidToken', () => {
    it('should return existing token if still valid', async () => {
      mockStore.read.mockResolvedValue(validToken);

      const result = await authManager.ensureValidToken();

      expect(result).toEqual(validToken);
      expect(mockStore.read).toHaveBeenCalledWith('test-profile');
      expect(mockRefresher.refresh).not.toHaveBeenCalled();
    });

    it('should refresh token if expired', async () => {
      // First call: fast path check (outside mutex)
      // Second call: double-check inside mutex
      mockStore.read
        .mockResolvedValueOnce(expiredToken)
        .mockResolvedValueOnce(expiredToken);
      mockRefresher.refresh.mockResolvedValue(newToken);

      const result = await authManager.ensureValidToken();

      expect(result).toEqual(newToken);
      expect(mockRefresher.refresh).toHaveBeenCalledWith(
        'expired-refresh-token',
        ['user:inference'],
        'test-profile'
      );
      expect(mockStore.write).toHaveBeenCalledWith('test-profile', newToken);
    });

    it('should refresh token if expiring within threshold', async () => {
      // First call: fast path check (outside mutex)
      // Second call: double-check inside mutex
      mockStore.read
        .mockResolvedValueOnce(soonToExpireToken)
        .mockResolvedValueOnce(soonToExpireToken);
      mockRefresher.refresh.mockResolvedValue(newToken);

      const result = await authManager.ensureValidToken();

      expect(result).toEqual(newToken);
      expect(mockRefresher.refresh).toHaveBeenCalled();
      expect(mockStore.write).toHaveBeenCalledWith('test-profile', newToken);
    });

    it('should throw AuthError if no token exists', async () => {
      mockStore.read.mockResolvedValue(null);

      await expect(authManager.ensureValidToken()).rejects.toThrow(AuthError);
      await expect(authManager.ensureValidToken()).rejects.toThrow(
        /No refresh token available/
      );
    });

    it('should serialize concurrent refresh calls (mutex)', async () => {
      // Simulate a real token store that updates on write
      let currentToken: TokenData | null = expiredToken;

      mockStore.read.mockImplementation(async () => currentToken);
      mockStore.write.mockImplementation(async (_profileId, token) => {
        currentToken = token;
      });

      mockRefresher.refresh.mockImplementation(async () => {
        // Simulate slow refresh
        await new Promise((resolve) => setTimeout(resolve, 50));
        return newToken;
      });

      // Call 10 times concurrently
      const promises = Array(10)
        .fill(null)
        .map(() => authManager.ensureValidToken());

      const results = await Promise.all(promises);

      // All should get the same token
      results.forEach((result) => {
        expect(result.accessToken).toBe('new-access-token');
      });

      // Refresh should be called exactly once (mutex prevents duplicates)
      expect(mockRefresher.refresh).toHaveBeenCalledTimes(1);
    });

    it('should double-check token validity inside mutex', async () => {
      // Simulate a real token store that updates on write
      let currentToken: TokenData | null = expiredToken;

      mockStore.read.mockImplementation(async () => currentToken);
      mockStore.write.mockImplementation(async (_profileId, token) => {
        currentToken = token;
      });

      mockRefresher.refresh.mockResolvedValue(newToken);

      // First caller sees expired, second sees refreshed
      const [result1, result2] = await Promise.all([
        authManager.ensureValidToken(),
        authManager.ensureValidToken(),
      ]);

      expect(result1).toEqual(newToken);
      expect(result2).toEqual(newToken);

      // Only one refresh should happen
      expect(mockRefresher.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('background refresh', () => {
    it('should start background refresh scheduler', async () => {
      jest.useFakeTimers();

      mockStore.read.mockResolvedValue(validToken);

      authManager.startBackgroundRefresh();

      // Fast-forward 1 minute
      jest.advanceTimersByTime(60000);

      await Promise.resolve(); // Let async operations complete

      expect(mockStore.read).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not start duplicate background refresh', () => {
      authManager.startBackgroundRefresh();
      authManager.startBackgroundRefresh();

      // Should only create one interval
      expect(authManager['backgroundInterval']).toBeTruthy();
    });

    it('should stop background refresh', () => {
      jest.useFakeTimers();

      authManager.startBackgroundRefresh();
      authManager.stopBackgroundRefresh();

      expect(authManager['backgroundInterval']).toBeNull();

      jest.useRealTimers();
    });

    it('should handle errors in background refresh gracefully', async () => {
      jest.useFakeTimers();

      mockStore.read.mockRejectedValue(new Error('Storage error'));

      authManager.startBackgroundRefresh();

      // Fast-forward 1 minute
      jest.advanceTimersByTime(60000);

      await Promise.resolve();

      // Should not throw, just log error
      expect(authManager['backgroundInterval']).toBeTruthy();

      jest.useRealTimers();
    });
  });

  describe('status methods', () => {
    it('should report refresh in progress', async () => {
      mockStore.read.mockResolvedValue(expiredToken);
      mockRefresher.refresh.mockImplementation(async () => {
        // Simulate slow refresh
        await new Promise((resolve) => setTimeout(resolve, 100));
        return newToken;
      });

      const refreshPromise = authManager.ensureValidToken();

      // Check immediately
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(authManager.isRefreshInProgress()).toBe(true);

      await refreshPromise;

      expect(authManager.isRefreshInProgress()).toBe(false);
    });

    it('should return current profile ID', () => {
      expect(authManager.getProfileId()).toBe('test-profile');
    });
  });
});
