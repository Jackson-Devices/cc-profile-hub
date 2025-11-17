/**
 * Release function to unlock the mutex.
 */
type Release = () => void;

/**
 * Queue entry for pending acquisitions.
 */
interface QueueEntry {
  resolve: (release: Release) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Configuration options for Mutex.
 */
export interface MutexOptions {
  /** Timeout in milliseconds for acquire(). Default: 30000 (30s). Set to 0 to disable. */
  timeoutMs?: number;
  /** Maximum number of waiters in queue. Default: 1000. */
  maxQueueSize?: number;
}

/**
 * Error thrown when mutex acquisition times out.
 */
export class MutexTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Mutex acquisition timed out after ${timeoutMs}ms`);
    this.name = 'MutexTimeoutError';
  }
}

/**
 * Error thrown when mutex queue is full.
 */
export class MutexQueueFullError extends Error {
  constructor(maxSize: number) {
    super(`Mutex queue is full (maximum of ${maxSize} waiters)`);
    this.name = 'MutexQueueFullError';
  }
}

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_QUEUE_SIZE = 1000;

/**
 * Mutual exclusion lock for coordinating async operations.
 * Ensures only one critical section executes at a time.
 *
 * Features:
 * - Configurable timeout to prevent deadlocks
 * - Queue size limit to prevent memory exhaustion
 * - FIFO fairness guarantee
 */
export class Mutex {
  private locked = false;
  private queue: QueueEntry[] = [];
  private readonly timeoutMs: number;
  private readonly maxQueueSize: number;

  constructor(options: MutexOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  }

  /**
   * Acquire the mutex lock.
   * Returns a release function that must be called to unlock.
   * If the mutex is already locked, waits in queue until available or timeout.
   *
   * @throws {MutexTimeoutError} if acquisition times out
   * @throws {MutexQueueFullError} if queue is full
   */
  async acquire(): Promise<Release> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }

    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      throw new MutexQueueFullError(this.maxQueueSize);
    }

    // Mutex is locked, queue this request with timeout
    return new Promise<Release>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      // Set up timeout if enabled
      if (this.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          // Remove this entry from queue
          const index = this.queue.findIndex((entry) => entry.timeoutId === timeoutId);
          if (index !== -1) {
            this.queue.splice(index, 1);
          }
          reject(new MutexTimeoutError(this.timeoutMs));
        }, this.timeoutMs);
      }

      this.queue.push({ resolve, reject, timeoutId });
    });
  }

  /**
   * Execute a function exclusively while holding the mutex lock.
   * Automatically acquires and releases the lock.
   * Returns the value returned by the function.
   *
   * @throws {MutexTimeoutError} if acquisition times out
   * @throws {MutexQueueFullError} if queue is full
   */
  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Check if the mutex is currently locked.
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get the current queue size.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Create a release function for the current lock holder.
   */
  private createRelease(): Release {
    let released = false;

    return () => {
      if (released) {
        // Idempotent: calling release multiple times is safe
        return;
      }

      released = true;

      // Process next in queue, if any
      const next = this.queue.shift();
      if (next) {
        // Clear timeout for this waiter
        if (next.timeoutId) {
          clearTimeout(next.timeoutId);
        }
        // Pass lock to next waiter
        next.resolve(this.createRelease());
      } else {
        // No one waiting, unlock
        this.locked = false;
      }
    };
  }
}
