import { BaseError } from './BaseError';

/**
 * Error thrown when authentication or authorization fails.
 */
export class AuthError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', context);
  }
}
