import { appendFile, readFile, rename, stat, unlink } from 'fs/promises';
import { z } from 'zod';

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
   */
  async log(
    operation: AuditOperation,
    profileId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      profileId,
      ...(metadata && { metadata }),
    };

    // Append entry as JSON line
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.auditPath, line, 'utf-8');

    // Check if rotation is needed
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
   * Check if log rotation is needed and perform it.
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await stat(this.auditPath);

      if (stats.size >= this.maxSizeBytes) {
        await this.rotateLog();
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
   */
  private async rotateLog(): Promise<void> {
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
