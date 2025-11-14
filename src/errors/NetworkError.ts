import { BaseError } from './BaseError';

/**
 * Error thrown when network operations fail (HTTP requests, connectivity issues, etc.).
 */
export class NetworkError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', context);
  }
}
