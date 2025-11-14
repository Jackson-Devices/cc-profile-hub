import { ValidationError } from '../../src/errors/ValidationError';
import { BaseError } from '../../src/errors/BaseError';

describe('ValidationError', () => {
  it('should create error with message', () => {
    const error = new ValidationError('Invalid input');

    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
  });

  it('should create error with context', () => {
    const context = { field: 'email', value: 'invalid-email', constraint: 'format' };
    const error = new ValidationError('Invalid email format', context);

    expect(error.message).toBe('Invalid email format');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.context).toEqual(context);
  });

  it('should extend BaseError', () => {
    const error = new ValidationError('Test');

    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should serialize to JSON correctly', () => {
    const context = { schema: 'TokenData', errors: ['missing field: accessToken'] };
    const error = new ValidationError('Schema validation failed', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'ValidationError',
      code: 'VALIDATION_ERROR',
      message: 'Schema validation failed',
      context,
      stack: error.stack,
    });
  });

  it('should be catchable as ValidationError', () => {
    expect(() => {
      throw new ValidationError('Validation test');
    }).toThrow(ValidationError);
  });
});
