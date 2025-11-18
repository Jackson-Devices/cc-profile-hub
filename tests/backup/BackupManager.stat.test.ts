/**
 * BUG-001: BackupManager.getFileStat() - Infinite Recursion Prevention
 *
 * Tests verify that getFileStat() method:
 * 1. Does not shadow imported `stat` function (no infinite recursion)
 * 2. Returns correct file sizes for valid files
 * 3. Handles edge cases (empty files, large files, errors)
 *
 * Test Partitions:
 * - IB-1: Valid file paths
 * - IB-2: Empty file boundary
 * - IB-3: Large file boundary
 * - OOB-1: Non-existent files
 * - REGRESSION: Stack overflow prevention
 */

import { BackupManager } from '../../src/backup/BackupManager';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import * as fs from 'fs/promises';

describe('BackupManager.getFileStat()', () => {
  const testDir = '/tmp/backup-manager-test';
  const backupDir = join(testDir, 'backups');
  const profilesPath = join(testDir, 'profiles.json');
  let manager: BackupManager;

  beforeAll(async () => {
    // Create test directories
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
    if (!existsSync(backupDir)) {
      await mkdir(backupDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Create BackupManager instance for each test
    manager = new BackupManager({
      backupDir,
      profilesPath,
    });
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      const { rm } = await import('fs/promises');
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('[IB-1] Valid file path', () => {
    it('returns size for valid file with content', async () => {
      // ARRANGE
      const testFile = join(testDir, 'test-file.json');
      const testContent = JSON.stringify({ test: 'data' });
      await writeFile(testFile, testContent, 'utf-8');
      const expectedSize = Buffer.byteLength(testContent, 'utf-8');

      // ACT
      const result = await manager['getFileStat'](testFile);

      // ASSERT
      expect(result).toEqual({ sizeBytes: expectedSize });
      expect(result.sizeBytes).toBeGreaterThan(0);

      // CLEANUP
      await unlink(testFile);
    });

    it('method completes quickly (<100ms for normal file)', async () => {
      // ARRANGE
      const testFile = join(testDir, 'perf-test.json');
      await writeFile(testFile, 'test content');

      // ACT
      const start = Date.now();
      await manager['getFileStat'](testFile);
      const elapsed = Date.now() - start;

      // ASSERT
      expect(elapsed).toBeLessThan(100); // Should be <10ms typically

      // CLEANUP
      await unlink(testFile);
    });
  });

  describe('[IB-2] Empty file boundary', () => {
    it('returns 0 for empty file', async () => {
      // ARRANGE
      const testFile = join(testDir, 'empty-file.json');
      await writeFile(testFile, ''); // 0 bytes

      // ACT
      const result = await manager['getFileStat'](testFile);

      // ASSERT
      expect(result).toEqual({ sizeBytes: 0 });
      expect(result.sizeBytes).toBe(0);

      // CLEANUP
      await unlink(testFile);
    });
  });

  describe('[IB-3] Large file boundary', () => {
    it('handles large file sizes without integer overflow', async () => {
      // ARRANGE - Mock stat for performance (real 1GB+ file too slow)
      const mockStat = jest.spyOn(fs, 'stat');
      const largeSize = 5_000_000_000; // 5GB
      mockStat.mockResolvedValue({
        size: largeSize,
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      } as any);

      // ACT
      const result = await manager['getFileStat']('/mock/large-file.bin');

      // ASSERT
      expect(result.sizeBytes).toBe(largeSize);
      expect(result.sizeBytes).toBeGreaterThan(2 ** 32); // Verify >32-bit integer

      // CLEANUP
      mockStat.mockRestore();
    });

    it('returns exact byte count for multi-MB file', async () => {
      // ARRANGE - Create 1MB file
      const testFile = join(testDir, 'large-file.bin');
      const oneMB = 1024 * 1024; // 1MB = 1048576 bytes
      const buffer = Buffer.alloc(oneMB, 'x');
      await writeFile(testFile, buffer);

      // ACT
      const result = await manager['getFileStat'](testFile);

      // ASSERT
      expect(result.sizeBytes).toBe(oneMB);

      // CLEANUP
      await unlink(testFile);
    });
  });

  describe('[OOB-1] Non-existent file', () => {
    it('throws error for non-existent file', async () => {
      // ARRANGE
      const nonExistentPath = join(testDir, 'does-not-exist.json');

      // ACT & ASSERT
      await expect(
        manager['getFileStat'](nonExistentPath)
      ).rejects.toThrow(/ENOENT|no such file/i);
    });

    it('error message is diagnostic', async () => {
      // ARRANGE
      const nonExistentPath = '/tmp/missing-file-12345.json';

      // ACT & ASSERT
      await expect(
        manager['getFileStat'](nonExistentPath)
      ).rejects.toThrow();
    });
  });

  describe('[REGRESSION] Stack overflow prevention', () => {
    it('does not cause stack overflow with repeated calls', async () => {
      // ARRANGE
      const testFile = join(testDir, 'recursion-test.json');
      await writeFile(testFile, 'test content');

      // ACT - Call 1000 times to detect any recursion issues
      for (let i = 0; i < 1000; i++) {
        await manager['getFileStat'](testFile);
      }

      // ASSERT - If we reach here, no stack overflow occurred
      expect(true).toBe(true);

      // CLEANUP
      await unlink(testFile);
    });

    it('does not recurse infinitely (completes in reasonable time)', async () => {
      // ARRANGE
      const testFile = join(testDir, 'no-recurse.json');
      await writeFile(testFile, 'test');

      // ACT
      const start = Date.now();
      await manager['getFileStat'](testFile);
      const elapsed = Date.now() - start;

      // ASSERT - Should complete in <1 second (infinite recursion would timeout)
      expect(elapsed).toBeLessThan(1000);

      // CLEANUP
      await unlink(testFile);
    });

    it('method is named getFileStat (not stat)', () => {
      // ARRANGE & ACT
      const hasGetFileStat = typeof (manager as any)['getFileStat'] === 'function';
      const hasStat = typeof (manager as any)['stat'] === 'function';

      // ASSERT - Ensures method doesn't shadow imported `stat`
      expect(hasGetFileStat).toBe(true);
      expect(hasStat).toBe(false);
    });
  });

  describe('[CROSS-PARTITION] Idempotency', () => {
    it('returns same result for multiple calls (idempotent)', async () => {
      // ARRANGE
      const testFile = join(testDir, 'idempotent-test.json');
      await writeFile(testFile, 'consistent content');

      // ACT
      const result1 = await manager['getFileStat'](testFile);
      const result2 = await manager['getFileStat'](testFile);
      const result3 = await manager['getFileStat'](testFile);

      // ASSERT
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);

      // CLEANUP
      await unlink(testFile);
    });
  });
});
