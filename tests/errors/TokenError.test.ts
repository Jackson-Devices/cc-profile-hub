import { TokenError } from '../../src/errors/TokenError';
import { BaseError } from '../../src/errors/BaseError';

describe('TokenError', () => {
  it('should create error with message', () => {
    const error = new TokenError('Token refresh failed');

    expect(error.message).toBe('Token refresh failed');
    expect(error.code).toBe('TOKEN_ERROR');
    expect(error.name).toBe('TokenError');
  });

  it('should create error with context', () => {
    const context = { profileId: 'default', reason: 'expired_refresh_token' };
    const error = new TokenError('Refresh token expired', context);

    expect(error.message).toBe('Refresh token expired');
    expect(error.code).toBe('TOKEN_ERROR');
    expect(error.context).toEqual(context);
  });

  it('should extend BaseError', () => {
    const error = new TokenError('Test');

    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(TokenError);
  });

  it('should serialize to JSON correctly', () => {
    const context = { tokenType: 'refresh', expiresAt: 1234567890 };
    const error = new TokenError('Token validation failed', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'TokenError',
      code: 'TOKEN_ERROR',
      message: 'Token validation failed',
      context,
      stack: error.stack,
    });
  });

  it('should be catchable as TokenError', () => {
    expect(() => {
      throw new TokenError('Token test');
    }).toThrow(TokenError);
  });
});
