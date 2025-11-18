import { appendFile, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { z } from 'zod';
import * as lockfile from 'proper-lockfile';

/**
 * Supported audit operations.
 */
export type AuditOperation =
  | 'profile_created'
  | 'profile_updated'
  | 'profile_deleted'
  | 'profile_switched';

/**
 * Schema for audit log entry.
 */
export const AuditEntrySchema = z.object({
  timestamp: z.string().datetime(),
  operation: z.enum([
    'profile_created',
    'profile_updated',
    'profile_deleted',
    'profile_switched',
  ]),
  profileId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Audit log entry.
 */
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/**
 * Configuration for audit logger.
 */
export interface AuditLoggerConfig {
  maxSizeBytes?: number; // Default: 10MB
  maxRotatedFiles?: number; // Default: 5
}

/**
 * Query filter for audit logs.
 */
export interface AuditQueryFilter {
  operation?: AuditOperation;
  profileId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_ROTATED_FILES = 5;

/**
 * Audit logger with automatic log rotation.
 * Uses JSON Lines format (newline-delimited JSON) for easy parsing.
 */
export class AuditLogger {
  private readonly maxSizeBytes: number;
  private readonly maxRotatedFiles: number;

  constructor(
    private readonly auditPath: string,
    config: AuditLoggerConfig = {}
  ) {
    this.maxSizeBytes = config.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.maxRotatedFiles = config.maxRotatedFiles ?? DEFAULT_MAX_ROTATED_FILES;
  }

  /**
   * Log an audit entry.
   * Automatically rotates the log if it exceeds max size.
   * SECURITY: Uses file locking to prevent concurrent append corruption.
   */
  async log(
    operation: AuditOperation,
    profileId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // SECURITY: Sanitize profileId to prevent log injection attacks
    const sanitizedProfileId = profileId.replace(/[\n\r\t]/g, '_');

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      profileId: sanitizedProfileId,
      ...(metadata && { metadata }),
    };

    // Append entry as JSON line with file locking
    await this.withLogLock(async () => {
      const line = JSON.stringify(entry) + '\n';
      await appendFile(this.auditPath, line, 'utf-8');
    });

    // Check if rotation is needed (already has its own locking)
    await this.checkRotation();
  }

  /**
   * Query audit logs with optional filters.
   * Returns logs in chronological order (oldest first).
   */
  async queryLogs(filter: AuditQueryFilter = {}): Promise<AuditEntry[]> {
    try {
      const content = await readFile(this.auditPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);

      let entries: AuditEntry[] = [];

      // Parse each line, skip corrupted ones
      for (const line of lines) {
        try {
          const entry = AuditEntrySchema.parse(JSON.parse(line));
          entries.push(entry);
        } catch {
          // Skip invalid entries
          continue;
        }
      }

      // Apply filters
      if (filter.operation) {
        entries = entries.filter((e) => e.operation === filter.operation);
      }

      if (filter.profileId) {
        entries = entries.filter((e) => e.profileId === filter.profileId);
      }

      if (filter.startTime) {
        const startMs = filter.startTime.getTime();
        entries = entries.filter(
          (e) => new Date(e.timestamp).getTime() >= startMs
        );
      }

      if (filter.endTime) {
        const endMs = filter.endTime.getTime();
        entries = entries.filter(
          (e) => new Date(e.timestamp).getTime() <= endMs
        );
      }

      // Apply limit
      if (filter.limit && filter.limit > 0) {
        entries = entries.slice(0, filter.limit);
      }

      return entries;
    } catch (error) {
      // File doesn't exist or is empty
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Ensure audit file exists for locking.
   */
  private async ensureAuditFile(): Promise<void> {
    try {
      await stat(this.auditPath);
    } catch {
      // File doesn't exist, create empty file
      try {
        await writeFile(this.auditPath, '', 'utf-8');
      } catch {
        // Another process may have created it, verify it exists
        await stat(this.auditPath);
      }
    }
  }

  /**
   * Execute log operation with file locking to prevent concurrent append corruption.
   * Uses shorter retry timeouts than rotation since logging is more frequent.
   */
  private async withLogLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureAuditFile();

    const release = await lockfile.lock(this.auditPath, {
      retries: {
        retries: 10,
        minTimeout: 50,
        maxTimeout: 500,
      },
      stale: 5000, // Shorter stale timeout for log operations
    });

    try {
      return await operation();
    } finally {
      await release();
    }
  }

  /**
   * Execute rotation with file locking to prevent concurrent rotation.
   */
  private async withRotationLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureAuditFile();

    const release = await lockfile.lock(this.auditPath, {
      retries: {
        retries: 20,
        minTimeout: 100,
        maxTimeout: 1000,
      },
      stale: 30000,
    });

    try {
      return await operation();
    } finally {
      await release();
    }
  }

  /**
   * Check if log rotation is needed and perform it.
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await stat(this.auditPath);

      if (stats.size >= this.maxSizeBytes) {
        await this.withRotationLock(() => this.rotateLog());
      }
    } catch (error) {
      // File doesn't exist yet, no rotation needed
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Rotate the log file.
   * Renames current log to .1, .1 to .2, etc.
   * Deletes oldest rotated file if exceeding maxRotatedFiles.
   * MUST be called within withRotationLock().
   */
  private async rotateLog(): Promise<void> {
    // Re-check if rotation is still needed (another process may have rotated while we waited for lock)
    try {
      const stats = await stat(this.auditPath);
      if (stats.size < this.maxSizeBytes) {
        return; // No longer needs rotation
      }
    } catch {
      return; // File doesn't exist, nothing to rotate
    }

    // Delete oldest rotated file if we're at the limit
    const oldestPath = `${this.auditPath}.${this.maxRotatedFiles}`;
    try {
      await unlink(oldestPath);
    } catch {
      // File doesn't exist, that's ok
    }

    // Shift existing rotated files
    for (let i = this.maxRotatedFiles - 1; i >= 1; i--) {
      const fromPath = `${this.auditPath}.${i}`;
      const toPath = `${this.auditPath}.${i + 1}`;

      try {
        await rename(fromPath, toPath);
      } catch {
        // File doesn't exist, continue
      }
    }

    // Rotate current log to .1
    const rotatedPath = `${this.auditPath}.1`;
    try {
      await rename(this.auditPath, rotatedPath);
    } catch {
      // File doesn't exist, nothing to rotate
    }
  }
}
