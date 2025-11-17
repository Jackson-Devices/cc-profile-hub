import { BaseError } from './BaseError';

/**
 * Error thrown when token operations fail (read, write, refresh, etc.).
 */
export class TokenError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TOKEN_ERROR', context);
  }
}
