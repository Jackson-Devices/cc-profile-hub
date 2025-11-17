import { AuditLogger } from '../../src/profile/AuditLogger';
import { mkdir, rm, readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AuditLogger', () => {
  let tempDir: string;
  let auditPath: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(tmpdir(), `audit-test-${Date.now()}-${Math.random()}`);
    await mkdir(tempDir, { recursive: true });
    auditPath = join(tempDir, 'audit.log');
    logger = new AuditLogger(auditPath);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('log', () => {
    it('should log profile create operation', async () => {
      await logger.log('profile_created', 'work', { domain: 'company.auth0.com' });

      const content = await readFile(auditPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('profile_created');
      expect(entry.profileId).toBe('work');
      expect(entry.metadata).toEqual({ domain: 'company.auth0.com' });
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp)).toBeInstanceOf(Date);
    });

    it('should log profile update operation', async () => {
      await logger.log('profile_updated', 'work', {
        field: 'auth0Domain',
        oldValue: 'old.auth0.com',
        newValue: 'new.auth0.com',
      });

      const content = await readFile(auditPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('profile_updated');
      expect(entry.profileId).toBe('work');
      expect(entry.metadata.field).toBe('auth0Domain');
    });

    it('should log profile delete operation', async () => {
      await logger.log('profile_deleted', 'work');

      const content = await readFile(auditPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('profile_deleted');
      expect(entry.profileId).toBe('work');
      expect(entry.metadata).toBeUndefined();
    });

    it('should log profile switch operation', async () => {
      await logger.log('profile_switched', 'personal', {
        from: 'work',
        to: 'personal',
      });

      const content = await readFile(auditPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('profile_switched');
      expect(entry.profileId).toBe('personal');
      expect(entry.metadata.from).toBe('work');
      expect(entry.metadata.to).toBe('personal');
    });

    it('should append multiple log entries', async () => {
      await logger.log('profile_created', 'work');
      await logger.log('profile_created', 'personal');
      await logger.log('profile_switched', 'personal');

      const content = await readFile(auditPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0]).operation).toBe('profile_created');
      expect(JSON.parse(lines[1]).operation).toBe('profile_created');
      expect(JSON.parse(lines[2]).operation).toBe('profile_switched');
    });

    it('should use JSON Lines format (newline-delimited JSON)', async () => {
      await logger.log('profile_created', 'work');
      await logger.log('profile_created', 'personal');

      const content = await readFile(auditPath, 'utf-8');
      const lines = content.trim().split('\n');

      // Each line should be valid JSON
      expect(() => JSON.parse(lines[0])).not.toThrow();
      expect(() => JSON.parse(lines[1])).not.toThrow();
    });
  });

  describe('log rotation', () => {
    it('should rotate log when it exceeds max size', async () => {
      // Create logger with small max size (1KB)
      const smallLogger = new AuditLogger(auditPath, {
        maxSizeBytes: 1024,
        maxRotatedFiles: 3,
      });

      // Write enough entries to exceed 1KB
      const largeMetadata = { data: 'x'.repeat(200) };
      for (let i = 0; i < 10; i++) {
        await smallLogger.log('profile_created', `profile-${i}`, largeMetadata);
      }

      // Check that rotated file exists
      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const rotatedFiles = files.filter((f) => f.match(/audit\.log\.\d+$/));

      expect(rotatedFiles.length).toBeGreaterThan(0);
    });

    it('should keep only maxRotatedFiles', async () => {
      const smallLogger = new AuditLogger(auditPath, {
        maxSizeBytes: 500,
        maxRotatedFiles: 2,
      });

      // Write enough to trigger multiple rotations
      const largeMetadata = { data: 'x'.repeat(200) };
      for (let i = 0; i < 20; i++) {
        await smallLogger.log('profile_created', `profile-${i}`, largeMetadata);
      }

      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const rotatedFiles = files.filter((f) => f.match(/audit\.log\.\d+$/));

      // Should have at most maxRotatedFiles + current log
      expect(rotatedFiles.length).toBeLessThanOrEqual(2);
    });

    it('should preserve log entries in rotated files', async () => {
      const smallLogger = new AuditLogger(auditPath, {
        maxSizeBytes: 800,
        maxRotatedFiles: 3,
      });

      const largeMetadata = { data: 'x'.repeat(200) };
      for (let i = 0; i < 10; i++) {
        await smallLogger.log('profile_created', `profile-${i}`, largeMetadata);
      }

      // Read rotated file
      const rotatedPath = `${auditPath}.1`;
      const rotatedContent = await readFile(rotatedPath, 'utf-8');
      const rotatedLines = rotatedContent.trim().split('\n');

      // Should contain valid JSON entries
      expect(rotatedLines.length).toBeGreaterThan(0);
      expect(() => JSON.parse(rotatedLines[0])).not.toThrow();
    });

    it('should use default rotation settings when not specified', async () => {
      const defaultLogger = new AuditLogger(auditPath);

      // Should not throw
      await defaultLogger.log('profile_created', 'work');

      const content = await readFile(auditPath, 'utf-8');
      expect(content.trim()).toBeTruthy();
    });
  });

  describe('queryLogs', () => {
    beforeEach(async () => {
      // Populate with test data
      await logger.log('profile_created', 'work', { domain: 'work.auth0.com' });
      await logger.log('profile_switched', 'work');
      await logger.log('profile_created', 'personal', {
        domain: 'personal.auth0.com',
      });
      await logger.log('profile_updated', 'work', { field: 'domain' });
      await logger.log('profile_deleted', 'personal');
    });

    it('should query all logs', async () => {
      const logs = await logger.queryLogs();
      expect(logs).toHaveLength(5);
    });

    it('should filter by operation', async () => {
      const logs = await logger.queryLogs({ operation: 'profile_created' });
      expect(logs).toHaveLength(2);
      expect(logs.every((l) => l.operation === 'profile_created')).toBe(true);
    });

    it('should filter by profileId', async () => {
      const logs = await logger.queryLogs({ profileId: 'work' });
      expect(logs).toHaveLength(3);
      expect(logs.every((l) => l.profileId === 'work')).toBe(true);
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      const oneHourFromNow = new Date(now.getTime() + 3600000);

      const logs = await logger.queryLogs({
        startTime: oneMinuteAgo,
        endTime: oneHourFromNow,
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should limit results', async () => {
      const logs = await logger.queryLogs({ limit: 2 });
      expect(logs).toHaveLength(2);
    });

    it('should return logs in chronological order (oldest first)', async () => {
      const logs = await logger.queryLogs();

      for (let i = 1; i < logs.length; i++) {
        const prev = new Date(logs[i - 1].timestamp);
        const curr = new Date(logs[i].timestamp);
        expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }
    });

    it('should combine multiple filters', async () => {
      const logs = await logger.queryLogs({
        operation: 'profile_created',
        profileId: 'work',
        limit: 1,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].operation).toBe('profile_created');
      expect(logs[0].profileId).toBe('work');
    });
  });

  describe('error handling', () => {
    it('should create audit file if it does not exist', async () => {
      const newPath = join(tempDir, 'new-audit.log');
      const newLogger = new AuditLogger(newPath);

      await newLogger.log('profile_created', 'work');

      const stats = await stat(newPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should handle empty audit file', async () => {
      await writeFile(auditPath, '', 'utf-8');

      const logs = await logger.queryLogs();
      expect(logs).toHaveLength(0);
    });

    it('should skip corrupted log lines', async () => {
      await writeFile(
        auditPath,
        '{"operation":"profile_created","profileId":"work","timestamp":"2025-01-01T00:00:00Z"}\ninvalid json line\n{"operation":"profile_deleted","profileId":"work","timestamp":"2025-01-01T00:01:00Z"}\n',
        'utf-8'
      );

      const logs = await logger.queryLogs();
      expect(logs).toHaveLength(2); // Should skip the invalid line
    });
  });
});
