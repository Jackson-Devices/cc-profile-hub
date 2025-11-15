/**
 * Token bucket rate limiter implementation.
 * Prevents abuse by limiting operations per time window.
 */

export interface RateLimiterConfig {
  /**
   * Maximum number of tokens in the bucket.
   */
  maxTokens: number;

  /**
   * Number of tokens to refill per refill interval.
   */
  refillRate: number;

  /**
   * Refill interval in milliseconds.
   * Default: 1000ms (1 second)
   */
  refillInterval?: number;
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
  }
}

/**
 * Token bucket rate limiter.
 *
 * Example:
 * ```typescript
 * const limiter = new RateLimiter({
 *   maxTokens: 10,      // 10 operations max
 *   refillRate: 2,      // Refill 2 tokens
 *   refillInterval: 1000 // Every 1 second
 * });
 *
 * await limiter.consume(1); // Consumes 1 token
 * ```
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.refillInterval = config.refillInterval ?? 1000;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    const intervalsElapsed = Math.floor(elapsedMs / this.refillInterval);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Consume tokens from the bucket.
   *
   * @param tokens - Number of tokens to consume (default: 1)
   * @throws {RateLimitError} if not enough tokens available
   */
  async consume(tokens: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    // Calculate retry delay
    const tokensNeeded = tokens - this.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate);
    const retryAfterMs = intervalsNeeded * this.refillInterval;

    throw new RateLimitError(retryAfterMs);
  }

  /**
   * Check if tokens are available without consuming.
   *
   * @param tokens - Number of tokens to check (default: 1)
   * @returns true if enough tokens available
   */
  canConsume(tokens: number = 1): boolean {
    this.refill();
    return this.tokens >= tokens;
  }

  /**
   * Get current number of available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset the rate limiter to full capacity.
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Per-key rate limiter that tracks limits for different keys (e.g., profileId, userId).
 */
export class KeyedRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();
  private readonly config: RateLimiterConfig;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimiterConfig, cleanupIntervalMs: number = 60000) {
    this.config = config;

    // Periodically clean up old limiters to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    // Allow Node to exit even if cleanup is pending
    this.cleanupInterval.unref();
  }

  /**
   * Consume tokens for a specific key.
   *
   * @param key - The identifier (e.g., profileId, userId)
   * @param tokens - Number of tokens to consume (default: 1)
   * @throws {RateLimitError} if rate limit exceeded for this key
   */
  async consume(key: string, tokens: number = 1): Promise<void> {
    let limiter = this.limiters.get(key);

    if (!limiter) {
      limiter = new RateLimiter(this.config);
      this.limiters.set(key, limiter);
    }

    await limiter.consume(tokens);
  }

  /**
   * Clean up limiters that are at full capacity (inactive).
   * Prevents memory leaks from accumulating limiters for one-time keys.
   */
  private cleanup(): void {
    for (const [key, limiter] of this.limiters.entries()) {
      if (limiter.getAvailableTokens() === this.config.maxTokens) {
        this.limiters.delete(key);
      }
    }
  }

  /**
   * Reset rate limit for a specific key.
   */
  reset(key: string): void {
    const limiter = this.limiters.get(key);
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * Clear all rate limiters.
   */
  clear(): void {
    this.limiters.clear();
  }

  /**
   * Stop the cleanup interval.
   * Call this when shutting down to prevent memory leaks.
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limiters.clear();
  }
}
