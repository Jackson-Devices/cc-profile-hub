/**
 * Circuit Breaker pattern implementation for resilient service calls.
 *
 * Prevents cascading failures by temporarily blocking requests to failing services,
 * allowing them time to recover.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, fail-fast without attempting request
 * - HALF_OPEN: Testing if service has recovered
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening circuit.
   * Default: 5
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before trying again (transition to HALF_OPEN).
   * Default: 60000 (1 minute)
   */
  resetTimeout: number;

  /**
   * Timeout for individual requests in milliseconds.
   * Default: 30000 (30 seconds)
   */
  requestTimeout: number;

  /**
   * Number of successful requests in HALF_OPEN before closing circuit.
   * Default: 2
   */
  successThreshold?: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker for protecting against cascading failures.
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeout: 60000,
 *   requestTimeout: 30000
 * });
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await callExternalService();
 *   });
 * } catch (error) {
 *   if (error instanceof CircuitBreakerError) {
 *     console.log('Circuit is open, service unavailable');
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private readonly successThreshold: number;

  constructor(private config: CircuitBreakerConfig) {
    this.successThreshold = config.successThreshold ?? 2;
  }

  /**
   * Execute an operation with circuit breaker protection.
   *
   * @param operation - The async operation to execute
   * @returns Result of the operation
   * @throws {CircuitBreakerError} if circuit is open
   * @throws Original error if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      const timeSinceLastFailure = now - (this.lastFailureTime || 0);

      if (timeSinceLastFailure >= this.config.resetTimeout) {
        // Transition to HALF_OPEN to test if service recovered
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        // Still in cooldown period
        const retryAfterMs = this.config.resetTimeout - timeSinceLastFailure;
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN. Service temporarily unavailable. Retry after ${Math.ceil(retryAfterMs / 1000)}s`,
          CircuitState.OPEN,
          retryAfterMs
        );
      }
    }

    // Execute the operation with timeout
    try {
      const result = await this.executeWithTimeout(operation);

      // Success - update state
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure - update state
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with timeout protection.
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
      ),
    ]);
  }

  /**
   * Handle successful operation.
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // After enough successes, close the circuit
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed operation.
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during test - reopen circuit immediately
      this.state = CircuitState.OPEN;
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Too many failures - open circuit
      this.state = CircuitState.OPEN;
    }
  }

  /**
   * Get current circuit breaker state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get success count (only meaningful in HALF_OPEN state).
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   * Use with caution - primarily for testing or manual intervention.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }

  /**
   * Manually open the circuit (for testing or emergency cutoff).
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
  }
}
