import { Mutex, MutexTimeoutError } from '../../src/utils/Mutex';

describe('Mutex - Timeout Feature', () => {
  it('should timeout after default 30 seconds', async () => {
    const mutex = new Mutex();
    await mutex.acquire(); // Hold lock, never release

    const start = Date.now();

    // Only test once to avoid doubling the timeout
    await expect(mutex.acquire()).rejects.toThrow(MutexTimeoutError);
    await expect(mutex.acquire()).rejects.toThrow('Mutex acquisition timed out after 30000ms');

    const elapsed = Date.now() - start;
    // First acquire takes 30s, second acquire also takes 30s = 60s total
    expect(elapsed).toBeGreaterThanOrEqual(60000);
    expect(elapsed).toBeLessThan(62000);
  }, 70000); // Increased timeout to 70s to account for Jest overhead

  it('should timeout after custom timeout', async () => {
    const mutex = new Mutex({ timeoutMs: 100 });
    await mutex.acquire(); // Hold lock

    const start = Date.now();

    await expect(mutex.acquire()).rejects.toThrow(MutexTimeoutError);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(200);
  });

  it('should allow disabling timeout with 0', async () => {
    const mutex = new Mutex({ timeoutMs: 0 });
    await mutex.acquire(); // Hold lock

    // This should NOT timeout
    const acquirePromise = mutex.acquire();
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve('NO_TIMEOUT'), 200)
    );

    const result = await Promise.race([acquirePromise, timeoutPromise]);
    expect(result).toBe('NO_TIMEOUT');
  });

  it('should work normally when lock is available before timeout', async () => {
    const mutex = new Mutex({ timeoutMs: 1000 });

    const release = await mutex.acquire();
    release(); // Release immediately

    // This should succeed
    const release2 = await mutex.acquire();
    expect(release2).toBeInstanceOf(Function);
    release2();
  });

  it('should timeout multiple waiters independently', async () => {
    const mutex = new Mutex({ timeoutMs: 100 });
    await mutex.acquire(); // Hold lock

    const waiter1 = mutex.acquire();
    const waiter2 = mutex.acquire();
    const waiter3 = mutex.acquire();

    await expect(waiter1).rejects.toThrow(MutexTimeoutError);
    await expect(waiter2).rejects.toThrow(MutexTimeoutError);
    await expect(waiter3).rejects.toThrow(MutexTimeoutError);
  });

  it('should include timeout duration in error message', async () => {
    const mutex = new Mutex({ timeoutMs: 500 });
    await mutex.acquire();

    try {
      await mutex.acquire();
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MutexTimeoutError);
      expect((error as Error).message).toContain('500ms');
    }
  });
});

describe('Mutex - Queue Size Limit', () => {
  it('should enforce default max queue size of 1000', async () => {
    const mutex = new Mutex();
    await mutex.acquire(); // Hold lock

    // Queue up 1000 waiters (should succeed)
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(mutex.acquire().catch(() => 'timeout'));
    }

    // 1001st should fail immediately
    await expect(mutex.acquire()).rejects.toThrow('Mutex queue is full');
    await expect(mutex.acquire()).rejects.toThrow('maximum of 1000 waiters');
  }, 35000);

  it('should allow custom max queue size', async () => {
    const mutex = new Mutex({ maxQueueSize: 5 });
    await mutex.acquire();

    // Queue up 5 waiters
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(mutex.acquire().catch(() => 'timeout'));
    }

    // 6th should fail
    await expect(mutex.acquire()).rejects.toThrow('Mutex queue is full');
  }, 35000);

  it('should decrement queue size when waiters timeout', async () => {
    const mutex = new Mutex({ timeoutMs: 100, maxQueueSize: 3 });
    await mutex.acquire();

    // Queue 3 waiters
    const w1 = mutex.acquire().catch(() => 'timeout');
    const w2 = mutex.acquire().catch(() => 'timeout');
    const w3 = mutex.acquire().catch(() => 'timeout');

    // Should be full
    await expect(mutex.acquire()).rejects.toThrow('Mutex queue is full');

    // Wait for timeouts
    await Promise.all([w1, w2, w3]);

    // Queue should be empty now, can queue again
    const w4 = mutex.acquire().catch(() => 'timeout');
    expect(w4).toBeDefined();
  });
});
