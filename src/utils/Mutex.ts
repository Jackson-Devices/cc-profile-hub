/**
 * Release function to unlock the mutex.
 */
type Release = () => void;

/**
 * Queue entry for pending acquisitions.
 */
interface QueueEntry {
  resolve: (release: Release) => void;
}

/**
 * Mutual exclusion lock for coordinating async operations.
 * Ensures only one critical section executes at a time.
 */
export class Mutex {
  private locked = false;
  private queue: QueueEntry[] = [];

  /**
   * Acquire the mutex lock.
   * Returns a release function that must be called to unlock.
   * If the mutex is already locked, waits in queue until available.
   */
  async acquire(): Promise<Release> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }

    // Mutex is locked, queue this request
    return new Promise<Release>((resolve) => {
      this.queue.push({ resolve });
    });
  }

  /**
   * Execute a function exclusively while holding the mutex lock.
   * Automatically acquires and releases the lock.
   * Returns the value returned by the function.
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
        // Pass lock to next waiter
        next.resolve(this.createRelease());
      } else {
        // No one waiting, unlock
        this.locked = false;
      }
    };
  }
}
