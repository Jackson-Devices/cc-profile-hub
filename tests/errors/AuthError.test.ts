import { AuthError } from '../../src/errors/AuthError';
import { BaseError } from '../../src/errors/BaseError';

describe('AuthError', () => {
  it('should create error with message', () => {
    const error = new AuthError('Authentication failed');

    expect(error.message).toBe('Authentication failed');
    expect(error.code).toBe('AUTH_ERROR');
    expect(error.name).toBe('AuthError');
  });

  it('should create error with context', () => {
    const context = { userId: '123', reason: 'invalid_credentials' };
    const error = new AuthError('Invalid username or password', context);

    expect(error.message).toBe('Invalid username or password');
    expect(error.code).toBe('AUTH_ERROR');
    expect(error.context).toEqual(context);
  });

  it('should extend BaseError', () => {
    const error = new AuthError('Test');

    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(AuthError);
  });

  it('should serialize to JSON correctly', () => {
    const context = { endpoint: '/oauth/token', statusCode: 401 };
    const error = new AuthError('Unauthorized', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'AuthError',
      code: 'AUTH_ERROR',
      message: 'Unauthorized',
      context,
      stack: error.stack,
    });
  });

  it('should be catchable as AuthError', () => {
    expect(() => {
      throw new AuthError('Auth test');
    }).toThrow(AuthError);
  });
});
