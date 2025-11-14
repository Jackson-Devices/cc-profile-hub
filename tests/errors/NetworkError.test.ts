import { NetworkError } from '../../src/errors/NetworkError';
import { BaseError } from '../../src/errors/BaseError';

describe('NetworkError', () => {
  it('should create error with message', () => {
    const error = new NetworkError('Connection timeout');

    expect(error.message).toBe('Connection timeout');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.name).toBe('NetworkError');
  });

  it('should create error with context', () => {
    const context = { url: 'https://api.example.com', timeout: 5000 };
    const error = new NetworkError('Request timeout', context);

    expect(error.message).toBe('Request timeout');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.context).toEqual(context);
  });

  it('should extend BaseError', () => {
    const error = new NetworkError('Test');

    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it('should serialize to JSON correctly', () => {
    const context = { statusCode: 503, retryAfter: 60 };
    const error = new NetworkError('Service unavailable', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'NetworkError',
      code: 'NETWORK_ERROR',
      message: 'Service unavailable',
      context,
      stack: error.stack,
    });
  });

  it('should be catchable as NetworkError', () => {
    expect(() => {
      throw new NetworkError('Network test');
    }).toThrow(NetworkError);
  });
});
