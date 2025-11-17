import { Logger } from '../utils/Logger';

/**
 * Resource that needs cleanup on shutdown.
 */
export interface ShutdownResource {
  /**
   * Name of the resource for logging.
   */
  name: string;

  /**
   * Cleanup function to call on shutdown.
   * Should be idempotent and handle errors gracefully.
   */
  cleanup: () => Promise<void> | void;

  /**
   * Timeout in milliseconds for cleanup operation.
   * Default: 5000ms
   */
  timeoutMs?: number;
}

/**
 * Manages graceful shutdown of the application.
 * Coordinates cleanup of resources with timeouts and error handling.
 */
export class ShutdownManager {
  private resources: ShutdownResource[] = [];
  private shutdownInProgress = false;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger({ level: "info" });
  }

  /**
   * Register a resource for cleanup on shutdown.
   * Resources are cleaned up in LIFO order (last registered, first cleaned).
   */
  register(resource: ShutdownResource): void {
    this.resources.push(resource);
    this.logger.debug(`Registered shutdown resource: ${resource.name}`);
  }

  /**
   * Start listening for shutdown signals.
   * Handles SIGTERM, SIGINT, uncaughtException, and unhandledRejection.
   */
  listen(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error });
      this.shutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection', { reason });
      this.shutdown('unhandledRejection', 1);
    });

    this.logger.info('Shutdown manager listening for signals');
  }

  /**
   * Perform graceful shutdown.
   * @param signal - Signal that triggered shutdown
   * @param exitCode - Exit code to use (default: 0)
   */
  async shutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (this.shutdownInProgress) {
      this.logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    this.shutdownInProgress = true;
    this.logger.info(`Received ${signal}, starting graceful shutdown`);

    const startTime = Date.now();

    // Cleanup resources in LIFO order
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i];
      const timeout = resource.timeoutMs || 5000;

      try {
        this.logger.debug(`Cleaning up resource: ${resource.name}`);

        await Promise.race([
          Promise.resolve(resource.cleanup()),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cleanup timeout')), timeout)
          ),
        ]);

        this.logger.debug(`Successfully cleaned up: ${resource.name}`);
      } catch (error) {
        this.logger.error(`Failed to cleanup ${resource.name}`, { error });
        // Continue with other resources
      }
    }

    const elapsed = Date.now() - startTime;
    this.logger.info(`Graceful shutdown completed in ${elapsed}ms`);

    // Give logger time to flush
    await new Promise((resolve) => setTimeout(resolve, 100));

    process.exit(exitCode);
  }

  /**
   * Remove all registered resources.
   * Useful for testing.
   */
  clear(): void {
    this.resources = [];
    this.shutdownInProgress = false;
  }
}

/**
 * Global singleton instance of ShutdownManager.
 * Use this for application-wide shutdown handling.
 */
export const shutdownManager = new ShutdownManager();
