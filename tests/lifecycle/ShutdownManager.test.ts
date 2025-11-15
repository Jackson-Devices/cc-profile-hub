import { ShutdownManager } from '../../src/lifecycle/ShutdownManager';

describe('ShutdownManager', () => {
  let manager: ShutdownManager;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    manager = new ShutdownManager();
    // Mock process.exit to prevent test runner from exiting
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    manager.clear();
    mockExit.mockRestore();
  });

  describe('register', () => {
    it('should register a resource for cleanup', () => {
      const resource = {
        name: 'test-resource',
        cleanup: jest.fn(),
      };

      manager.register(resource);

      // Verify resource is registered by triggering shutdown
      manager.shutdown('TEST');

      expect(resource.cleanup).toHaveBeenCalled();
    });

    it('should allow registering multiple resources', () => {
      const resource1 = { name: 'resource1', cleanup: jest.fn() };
      const resource2 = { name: 'resource2', cleanup: jest.fn() };

      manager.register(resource1);
      manager.register(resource2);

      manager.shutdown('TEST');

      expect(resource1.cleanup).toHaveBeenCalled();
      expect(resource2.cleanup).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources in LIFO order', async () => {
      const order: string[] = [];

      manager.register({
        name: 'first',
        cleanup: () => {
          order.push('first');
        },
      });

      manager.register({
        name: 'second',
        cleanup: () => {
          order.push('second');
        },
      });

      manager.register({
        name: 'third',
        cleanup: () => {
          order.push('third');
        },
      });

      await manager.shutdown('TEST');

      // LIFO: last registered (third) cleaned first
      expect(order).toEqual(['third', 'second', 'first']);
    });

    it('should handle async cleanup functions', async () => {
      const cleanupCalled = jest.fn();

      manager.register({
        name: 'async-resource',
        cleanup: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          cleanupCalled();
        },
      });

      await manager.shutdown('TEST');

      expect(cleanupCalled).toHaveBeenCalled();
    });

    it('should continue cleanup even if one resource fails', async () => {
      const resource1 = { name: 'failing', cleanup: jest.fn().mockRejectedValue(new Error('Cleanup failed')) };
      const resource2 = { name: 'working', cleanup: jest.fn() };

      manager.register(resource1);
      manager.register(resource2);

      await manager.shutdown('TEST');

      // Both should be attempted despite first failing
      expect(resource1.cleanup).toHaveBeenCalled();
      expect(resource2.cleanup).toHaveBeenCalled();
    });

    it('should timeout slow cleanup operations', async () => {
      const slowCleanup = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
      });

      manager.register({
        name: 'slow-resource',
        cleanup: slowCleanup,
        timeoutMs: 100, // 100ms timeout
      });

      const start = Date.now();
      await manager.shutdown('TEST');
      const elapsed = Date.now() - start;

      // Should complete quickly due to timeout
      expect(elapsed).toBeLessThan(1000);
      expect(slowCleanup).toHaveBeenCalled();
    });

    it('should exit with code 0 by default', async () => {
      await manager.shutdown('SIGTERM');

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should exit with custom code', async () => {
      await manager.shutdown('ERROR', 1);

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should ignore duplicate shutdown calls', async () => {
      const cleanup = jest.fn();
      manager.register({ name: 'test', cleanup });

      // Start first shutdown (don't await)
      const shutdown1 = manager.shutdown('SIGTERM');

      // Try second shutdown
      await manager.shutdown('SIGINT');

      await shutdown1;

      // Cleanup should only be called once
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all registered resources', () => {
      const resource = { name: 'test', cleanup: jest.fn() };
      manager.register(resource);

      manager.clear();
      manager.shutdown('TEST');

      expect(resource.cleanup).not.toHaveBeenCalled();
    });

    it('should reset shutdown in progress flag', async () => {
      const cleanup = jest.fn();
      manager.register({ name: 'test', cleanup });

      await manager.shutdown('TEST');
      manager.clear();

      // Should be able to shutdown again after clear
      await manager.shutdown('TEST');

      expect(mockExit).toHaveBeenCalledTimes(2);
    });
  });
});
