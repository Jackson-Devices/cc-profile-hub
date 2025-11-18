import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../../src/utils/CircuitBreaker';

describe('CircuitBreaker', () => {
  describe('CLOSED state', () => {
    it('should allow requests when circuit is CLOSED', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        requestTimeout: 5000,
      });

      const result = await breaker.execute(async () => 'success');

      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track failures without opening immediately', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        requestTimeout: 5000,
      });

      // First failure
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(1);

      // Second failure
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(2);
    });
  });

  describe('OPEN state', () => {
    it('should open circuit after threshold failures', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 10000,
        requestTimeout: 5000,
      });

      // Fail 3 times to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should fail fast when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 10000,
        requestTimeout: 5000,
      });

      // Open the circuit
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Next call should fail fast without executing
      await expect(breaker.execute(async () => 'should not execute')).rejects.toThrow(
        CircuitBreakerError
      );
    });

    it('should include retry time in error when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 5000,
        requestTimeout: 1000,
      });

      // Open circuit
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      // Try again immediately
      try {
        await breaker.execute(async () => 'test');
        fail('Should have thrown CircuitBreakerError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        const cbError = error as CircuitBreakerError;
        expect(cbError.state).toBe(CircuitState.OPEN);
        expect(cbError.retryAfterMs).toBeGreaterThan(0);
        expect(cbError.retryAfterMs).toBeLessThanOrEqual(5000);
      }
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      jest.useFakeTimers();

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        requestTimeout: 1000,
      });

      // Open the circuit
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      jest.advanceTimersByTime(5000);

      // Next call should transition to HALF_OPEN
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      jest.useRealTimers();
    });
  });

  describe('HALF_OPEN state', () => {
    it('should close circuit after successful requests in HALF_OPEN', async () => {
      jest.useFakeTimers();

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 1000,
        requestTimeout: 5000,
        successThreshold: 2,
      });

      // Open circuit
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait and test with 2 successes
      jest.advanceTimersByTime(1000);

      await breaker.execute(async () => 'success1');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(breaker.getSuccessCount()).toBe(1);

      await breaker.execute(async () => 'success2');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getSuccessCount()).toBe(0);

      jest.useRealTimers();
    });

    it('should reopen circuit if request fails in HALF_OPEN', async () => {
      jest.useFakeTimers();

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 1000,
        requestTimeout: 5000,
      });

      // Open circuit
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      // Wait for reset
      jest.advanceTimersByTime(1000);

      // First test succeeds
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second test fails - should reopen
      await expect(breaker.execute(async () => {
        throw new Error('fail again');
      })).rejects.toThrow('fail again');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      jest.useRealTimers();
    });
  });

  describe('request timeout', () => {
    it('should handle request timeout', async () => {
      jest.useFakeTimers();

      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 5000,
        requestTimeout: 1000,
      });

      const promise = breaker.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return 'too slow';
      });

      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('Request timeout');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      jest.useRealTimers();
    });

    it('should not timeout if operation completes in time', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 5000,
        requestTimeout: 1000,
      });

      const result = await breaker.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'fast enough';
      });

      expect(result).toBe('fast enough');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('manual controls', () => {
    it('should reset circuit breaker to CLOSED state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 10000,
        requestTimeout: 5000,
      });

      // Open circuit
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Manual reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);

      // Should work normally now
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should force circuit open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 10000,
        requestTimeout: 5000,
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.forceOpen();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      await expect(breaker.execute(async () => 'test')).rejects.toThrow(CircuitBreakerError);
    });
  });

  describe('edge cases', () => {
    it('should reset failure count on success', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        requestTimeout: 5000,
      });

      // Two failures
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(breaker.getFailureCount()).toBe(2);

      // One success - should reset count
      await breaker.execute(async () => 'success');

      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Can fail 2 more times before opening
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle synchronous operations', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        requestTimeout: 5000,
      });

      const result = await breaker.execute(async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should preserve error context from wrapped operation', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        requestTimeout: 5000,
      });

      class CustomError extends Error {
        constructor(
          message: string,
          public code: string
        ) {
          super(message);
        }
      }

      await expect(
        breaker.execute(async () => {
          throw new CustomError('custom fail', 'ERR_CUSTOM');
        })
      ).rejects.toThrow(CustomError);

      try {
        await breaker.execute(async () => {
          throw new CustomError('custom fail', 'ERR_CUSTOM');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError);
        expect((error as CustomError).code).toBe('ERR_CUSTOM');
      }
    });
  });
});
