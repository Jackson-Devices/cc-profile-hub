import { BaseError } from './BaseError';

/**
 * Error thrown when configuration loading or validation fails.
 */
export class ConfigError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
  }
}
