import { Mutex } from '../../src/utils/Mutex';

describe('Mutex', () => {
  let mutex: Mutex;

  beforeEach(() => {
    mutex = new Mutex();
  });

  describe('acquire and release', () => {
    it('should allow single acquisition', async () => {
      const release = await mutex.acquire();
      expect(release).toBeInstanceOf(Function);

      release();
    });

    it('should execute critical section exclusively', async () => {
      const results: number[] = [];

      const task1 = mutex.runExclusive(async () => {
        results.push(1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(2);
      });

      const task2 = mutex.runExclusive(async () => {
        results.push(3);
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(4);
      });

      await Promise.all([task1, task2]);

      // Tasks should run sequentially, not interleaved
      expect(results).toEqual([1, 2, 3, 4]);
    });

    it('should queue multiple acquisitions', async () => {
      const order: string[] = [];

      const release1 = await mutex.acquire();
      order.push('acquired-1');

      const promise2 = mutex.acquire().then((release) => {
        order.push('acquired-2');
        return release;
      });

      const promise3 = mutex.acquire().then((release) => {
        order.push('acquired-3');
        return release;
      });

      // Give promises time to queue
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(order).toEqual(['acquired-1']);

      release1();
      const release2 = await promise2;
      expect(order).toEqual(['acquired-1', 'acquired-2']);

      release2();
      const release3 = await promise3;
      expect(order).toEqual(['acquired-1', 'acquired-2', 'acquired-3']);

      release3();
    });

    it('should return value from runExclusive', async () => {
      const result = await mutex.runExclusive(async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should propagate errors from runExclusive', async () => {
      await expect(
        mutex.runExclusive(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should release lock even if critical section throws', async () => {
      await expect(
        mutex.runExclusive(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow();

      // Should be able to acquire again
      const result = await mutex.runExclusive(async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });
  });

  describe('isLocked', () => {
    it('should return false when not locked', () => {
      expect(mutex.isLocked()).toBe(false);
    });

    it('should return true when locked', async () => {
      const release = await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);
      release();
    });

    it('should return false after release', async () => {
      const release = await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      release();
      expect(mutex.isLocked()).toBe(false);
    });

    it('should handle multiple acquires correctly', async () => {
      const release1 = await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      const promise2 = mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      release1();
      const release2 = await promise2;
      expect(mutex.isLocked()).toBe(true);

      release2();
      expect(mutex.isLocked()).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('should handle many concurrent acquisitions', async () => {
      const results: number[] = [];
      const tasks: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        const task = mutex.runExclusive(async () => {
          const start = results.length;
          results.push(i);
          await new Promise((resolve) => setTimeout(resolve, 1));
          // Verify no interleaving happened
          expect(results.length).toBe(start + 1);
        });
        tasks.push(task);
      }

      await Promise.all(tasks);
      expect(results).toHaveLength(10);
    });

    it('should maintain FIFO order', async () => {
      const order: number[] = [];

      // Acquire lock first
      const release = await mutex.acquire();

      // Queue multiple requests
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        const promise = mutex.runExclusive(async () => {
          order.push(i);
        });
        promises.push(promise);
      }

      // Release lock to let queue process
      release();

      await Promise.all(promises);

      expect(order).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('edge cases', () => {
    it('should handle calling release multiple times safely', async () => {
      const release = await mutex.acquire();

      release();
      release(); // Should be idempotent

      expect(mutex.isLocked()).toBe(false);
    });

    it('should handle synchronous runExclusive', async () => {
      const result = await mutex.runExclusive(() => {
        return 'sync-result';
      });

      expect(result).toBe('sync-result');
    });
  });
});
