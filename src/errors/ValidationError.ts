import { BaseError } from './BaseError';

/**
 * Error thrown when data validation fails.
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
  }
}
