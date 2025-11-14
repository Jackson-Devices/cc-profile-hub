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
});
