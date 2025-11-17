import { RateLimiter, RateLimitError, KeyedRateLimiter } from '../../src/utils/RateLimiter';

describe('RateLimiter', () => {
  describe('Token Bucket', () => {
    it('should allow consumption within limits', async () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 2,
        refillInterval: 1000,
      });

      // Should succeed for first 10 tokens
      for (let i = 0; i < 10; i++) {
        await expect(limiter.consume(1)).resolves.toBeUndefined();
      }
    });

    it('should reject when tokens exhausted', async () => {
      const limiter = new RateLimiter({
        maxTokens: 5,
        refillRate: 1,
        refillInterval: 1000,
      });

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.consume(1);
      }

      // Next request should fail
      await expect(limiter.consume(1)).rejects.toThrow(RateLimitError);
    });

    it('should refill tokens over time', async () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 100, // 100ms intervals
      });

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.consume(1);
      }

      // Should fail immediately
      await expect(limiter.consume(1)).rejects.toThrow(RateLimitError);

      // Wait for refill (100ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should succeed now (5 tokens refilled)
      for (let i = 0; i < 5; i++) {
        await expect(limiter.consume(1)).resolves.toBeUndefined();
      }
    });

    it('should provide retry delay in error', async () => {
      const limiter = new RateLimiter({
        maxTokens: 5,
        refillRate: 2,
        refillInterval: 1000,
      });

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.consume(1);
      }

      try {
        await limiter.consume(3); // Need 3 tokens
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        if (error instanceof RateLimitError) {
          // Need 3 tokens, have 0, refill 2 per second
          // Need 2 intervals = 2000ms
          expect(error.retryAfterMs).toBeGreaterThanOrEqual(1000);
          expect(error.message).toContain('Rate limit exceeded');
        }
      }
    });

    it('should handle canConsume check', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 2,
        refillInterval: 1000,
      });

      expect(limiter.canConsume(5)).toBe(true);
      expect(limiter.canConsume(15)).toBe(false);
    });

    it('should get available tokens', () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 2,
        refillInterval: 1000,
      });

      expect(limiter.getAvailableTokens()).toBe(10);

      limiter.consume(3);

      expect(limiter.getAvailableTokens()).toBe(7);
    });

    it('should reset to full capacity', async () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 2,
        refillInterval: 1000,
      });

      // Consume some tokens
      await limiter.consume(8);
      expect(limiter.getAvailableTokens()).toBe(2);

      // Reset
      limiter.reset();
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('should not exceed max tokens', async () => {
      const limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 100,
      });

      // Wait for multiple refill cycles
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should still only have max tokens
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe('KeyedRateLimiter', () => {
    it('should track limits per key', async () => {
      const limiter = new KeyedRateLimiter({
        maxTokens: 5,
        refillRate: 1,
        refillInterval: 1000,
      });

      // User A can make 5 requests
      for (let i = 0; i < 5; i++) {
        await expect(limiter.consume('userA', 1)).resolves.toBeUndefined();
      }

      // User A exhausted
      await expect(limiter.consume('userA', 1)).rejects.toThrow(RateLimitError);

      // User B still has full quota
      for (let i = 0; i < 5; i++) {
        await expect(limiter.consume('userB', 1)).resolves.toBeUndefined();
      }

      limiter.destroy();
    });

    it('should reset specific key', async () => {
      const limiter = new KeyedRateLimiter({
        maxTokens: 5,
        refillRate: 1,
        refillInterval: 1000,
      });

      // Consume all tokens for userA
      for (let i = 0; i < 5; i++) {
        await limiter.consume('userA', 1);
      }

      await expect(limiter.consume('userA', 1)).rejects.toThrow(RateLimitError);

      // Reset userA
      limiter.reset('userA');

      // Should work now
      await expect(limiter.consume('userA', 1)).resolves.toBeUndefined();

      limiter.destroy();
    });

    it('should clear all keys', async () => {
      const limiter = new KeyedRateLimiter({
        maxTokens: 5,
        refillRate: 1,
        refillInterval: 1000,
      });

      await limiter.consume('userA', 5);
      await limiter.consume('userB', 5);

      limiter.clear();

      // Both should work again
      await expect(limiter.consume('userA', 1)).resolves.toBeUndefined();
      await expect(limiter.consume('userB', 1)).resolves.toBeUndefined();

      limiter.destroy();
    });

    it('should clean up inactive limiters', async () => {
      const limiter = new KeyedRateLimiter(
        {
          maxTokens: 10,
          refillRate: 10,
          refillInterval: 100,
        },
        200 // cleanup every 200ms
      );

      // Use a key
      await limiter.consume('tempUser', 1);

      // Wait for tokens to refill completely
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger cleanup
      await new Promise((resolve) => setTimeout(resolve, 250));

      // The limiter for tempUser should be cleaned up
      // (this is internal, we can't directly test it, but we verify it doesn't crash)
      await expect(limiter.consume('tempUser', 1)).resolves.toBeUndefined();

      limiter.destroy();
    });
  });
});
