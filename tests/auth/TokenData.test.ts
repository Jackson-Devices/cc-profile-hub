import { TokenData, validateTokenData } from '../../src/auth/TokenData';

describe('TokenData Validation', () => {
  it('should validate valid token data', () => {
    const data: TokenData = {
      accessToken: 'sk-ant-test123',
      refreshToken: 'refresh-test123',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(() => validateTokenData(data)).not.toThrow();
  });

  it('should reject expired token timestamps', () => {
    const data = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000, // expired
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(() => validateTokenData(data)).toThrow(/expired/);
  });

  it('should reject missing required fields', () => {
    const data = {
      accessToken: 'test',
    };

    expect(() => validateTokenData(data)).toThrow(/refreshToken/);
  });

  it('should validate token is not expired', () => {
    const data: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(data.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should reject grantedAt after expiresAt', () => {
    const now = Date.now();
    const data = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: now + 1000,
      grantedAt: now + 2000, // granted after expiration
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(() => validateTokenData(data)).toThrow(/grantedAt after expiresAt/);
  });

  it('should reject invalid token type', () => {
    const data = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'InvalidType',
      deviceFingerprint: 'device-123',
    };

    expect(() => validateTokenData(data)).toThrow();
  });

  it('should reject empty access token', () => {
    const data = {
      accessToken: '',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(() => validateTokenData(data)).toThrow();
  });

  it('should reject negative timestamps', () => {
    const data = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: -1000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(() => validateTokenData(data)).toThrow();
  });
});

describe('isTokenExpired', () => {
  it('should return false for non-expired token', () => {
    const { isTokenExpired } = require('../../src/auth/TokenData');
    const token: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(isTokenExpired(token)).toBe(false);
  });

  it('should return true for expired token', () => {
    const { isTokenExpired } = require('../../src/auth/TokenData');
    const token: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000,
      grantedAt: Date.now() - 3600000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(isTokenExpired(token)).toBe(true);
  });

  it('should respect buffer seconds', () => {
    const { isTokenExpired } = require('../../src/auth/TokenData');
    const token: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000, // expires in 100 seconds
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    // Without buffer, not expired
    expect(isTokenExpired(token, 0)).toBe(false);

    // With buffer of 200 seconds, considered expired
    expect(isTokenExpired(token, 200)).toBe(true);
  });

  it('should handle exact expiration time', () => {
    const { isTokenExpired } = require('../../src/auth/TokenData');
    const now = Date.now();
    const token: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: now,
      grantedAt: now - 3600000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    expect(isTokenExpired(token)).toBe(true);
  });
});
