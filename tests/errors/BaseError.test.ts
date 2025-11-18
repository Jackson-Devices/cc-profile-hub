import { BaseError } from '../../src/errors/BaseError';

describe('BaseError', () => {
  it('should create error with message and code', () => {
    const error = new BaseError('Test error', 'TEST_ERROR');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('BaseError');
    expect(error.context).toBeUndefined();
  });

  it('should create error with context', () => {
    const context = { userId: '123', action: 'login' };
    const error = new BaseError('Authentication failed', 'AUTH_ERROR', context);

    expect(error.message).toBe('Authentication failed');
    expect(error.code).toBe('AUTH_ERROR');
    expect(error.context).toEqual(context);
  });

  it('should capture stack trace', () => {
    const error = new BaseError('Stack test', 'STACK_ERROR');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('BaseError');
  });

  it('should be instanceof Error', () => {
    const error = new BaseError('Test', 'TEST');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BaseError);
  });

  it('should serialize to JSON correctly', () => {
    const context = { requestId: 'abc-123', path: '/api/test' };
    const error = new BaseError('Serialization test', 'SERIALIZE_ERROR', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'BaseError',
      code: 'SERIALIZE_ERROR',
      message: 'Serialization test',
      context,
      stack: error.stack,
    });
  });

  it('should serialize to JSON without context', () => {
    const error = new BaseError('No context', 'NO_CONTEXT_ERROR');

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'BaseError',
      code: 'NO_CONTEXT_ERROR',
      message: 'No context',
      context: undefined,
      stack: error.stack,
    });
  });

  it('should maintain prototype chain', () => {
    const error = new BaseError('Prototype test', 'PROTO_ERROR');

    expect(Object.getPrototypeOf(error)).toBe(BaseError.prototype);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(Error.prototype);
  });

  it('should be catchable as Error', () => {
    expect(() => {
      throw new BaseError('Catch test', 'CATCH_ERROR');
    }).toThrow(Error);
  });

  it('should be catchable as BaseError', () => {
    expect(() => {
      throw new BaseError('Catch test', 'CATCH_ERROR');
    }).toThrow(BaseError);
  });

  it('should preserve error message in stack trace', () => {
    const error = new BaseError('Stack message test', 'STACK_MSG_ERROR');

    expect(error.stack).toContain('Stack message test');
  });

  it('should work when Error.captureStackTrace is not available', () => {
    // Temporarily remove Error.captureStackTrace (simulates non-V8 engines)
    const originalCaptureStackTrace = Error.captureStackTrace;
    // @ts-expect-error - Intentionally deleting for test
    delete Error.captureStackTrace;

    try {
      const error = new BaseError('No capture test', 'NO_CAPTURE_ERROR');

      expect(error.message).toBe('No capture test');
      expect(error.code).toBe('NO_CAPTURE_ERROR');
      expect(error.name).toBe('BaseError');
      // Stack should still exist (set by Error constructor)
      expect(error.stack).toBeDefined();
    } finally {
      // Restore
      Error.captureStackTrace = originalCaptureStackTrace;
    }
  });
});
