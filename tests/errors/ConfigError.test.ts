import { ConfigError } from '../../src/errors/ConfigError';
import { BaseError } from '../../src/errors/BaseError';

describe('ConfigError', () => {
  it('should create error with message', () => {
    const error = new ConfigError('Invalid configuration');

    expect(error.message).toBe('Invalid configuration');
    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.name).toBe('ConfigError');
  });

  it('should create error with context', () => {
    const context = { configPath: '/path/to/config.yml', line: 42 };
    const error = new ConfigError('YAML parse error', context);

    expect(error.message).toBe('YAML parse error');
    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.context).toEqual(context);
  });

  it('should extend BaseError', () => {
    const error = new ConfigError('Test');

    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(ConfigError);
  });

  it('should serialize to JSON correctly', () => {
    const context = { field: 'clientId', reason: 'missing required field' };
    const error = new ConfigError('Validation failed', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'ConfigError',
      code: 'CONFIG_ERROR',
      message: 'Validation failed',
      context,
      stack: error.stack,
    });
  });

  it('should be catchable as ConfigError', () => {
    expect(() => {
      throw new ConfigError('Config test');
    }).toThrow(ConfigError);
  });
});
