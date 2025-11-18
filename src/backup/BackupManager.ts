import { readFile, writeFile, mkdir, readdir, stat, lstat } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { createHash } from 'crypto';
import { Logger } from '../utils/Logger';
import { atomicWrite } from '../utils/atomicWrite';
import { validatePath } from '../utils/InputValidator';

/**
 * Metadata about a backup.
 */
export interface BackupMetadata {
  /**
   * Backup filename.
   */
  filename: string;

  /**
   * Full path to backup file.
   */
  path: string;

  /**
   * Timestamp when backup was created.
   */
  timestamp: number;

  /**
   * Size of backup file in bytes.
   */
  sizeBytes: number;

  /**
   * SHA-256 checksum of backup content.
   */
  checksum: string;

  /**
   * Version of backup format.
   */
  version: string;
}

/**
 * Contents of a backup file.
 */
export interface BackupData {
  /**
   * Backup format version.
   */
  version: string;

  /**
   * Timestamp when backup was created.
   */
  timestamp: number;

  /**
   * Profiles data (profiles.json content).
   */
  profiles?: string;

  /**
   * Audit log data.
   */
  auditLog?: string;

  /**
   * SHA-256 checksum for integrity validation.
   */
  checksum: string;
}

/**
 * Options for BackupManager.
 */
export interface BackupManagerOptions {
  /**
   * Directory to store backups.
   */
  backupDir: string;

  /**
   * Path to profiles file.
   */
  profilesPath: string;

  /**
   * Path to audit log file (optional).
   */
  auditLogPath?: string;

  /**
   * Logger instance.
   */
  logger?: Logger;
}

/**
 * Manages backup and restore of profile data.
 * Provides disaster recovery capabilities with integrity validation.
 */
export class BackupManager {
  private backupDir: string;
  private profilesPath: string;
  private auditLogPath?: string;
  private logger: Logger;
  private readonly BACKUP_VERSION = '1.0.0';

  constructor(options: BackupManagerOptions) {
    // Validate all paths to prevent path traversal attacks
    validatePath(options.backupDir);
    validatePath(options.profilesPath);
    if (options.auditLogPath) {
      validatePath(options.auditLogPath);
    }

    this.backupDir = options.backupDir;
    this.profilesPath = options.profilesPath;
    this.auditLogPath = options.auditLogPath;
    this.logger = options.logger || new Logger({ level: "info" });
  }

  /**
   * Create a backup of profiles and audit logs.
   * @param name - Optional name for the backup file (defaults to timestamp)
   * @returns Path to the created backup file
   */
  async backup(name?: string): Promise<string> {
    this.logger.info('Creating backup');

    // Ensure backup directory exists
    await mkdir(this.backupDir, { recursive: true });

    // Read profiles data
    let profilesData: string | undefined;
    try {
      profilesData = await readFile(this.profilesPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      this.logger.warn('Profiles file not found, creating empty backup');
      profilesData = JSON.stringify({ profiles: {} });
    }

    // Read audit log data (optional)
    let auditLogData: string | undefined;
    if (this.auditLogPath) {
      try {
        auditLogData = await readFile(this.auditLogPath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        this.logger.debug('Audit log not found, skipping');
      }
    }

    // Create backup data
    const backupData: BackupData = {
      version: this.BACKUP_VERSION,
      timestamp: Date.now(),
      profiles: profilesData,
      auditLog: auditLogData,
      checksum: '', // Will be calculated below
    };

    // Calculate checksum (excluding checksum field)
    const dataForChecksum = JSON.stringify({
      ...backupData,
      checksum: undefined,
    });
    backupData.checksum = createHash('sha256').update(dataForChecksum).digest('hex');

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = name ? `${name}-${timestamp}.backup.json` : `backup-${timestamp}.json`;
    const backupPath = join(this.backupDir, filename);

    // Write backup file
    await atomicWrite(backupPath, JSON.stringify(backupData, null, 2));

    const stat = await this.getFileStat(backupPath);
    this.logger.info(`Backup created: ${backupPath} (${stat.sizeBytes} bytes)`);

    return backupPath;
  }

  /**
   * Restore from a backup file.
   * @param backupPath - Path to the backup file
   * @param options - Restore options
   */
  async restore(
    backupPath: string,
    options: { validateOnly?: boolean } = {}
  ): Promise<void> {
    this.logger.info(`Restoring from backup: ${backupPath}`);

    // SECURITY: Check for symlink attacks before reading
    await this.checkSymlink(backupPath);

    // Read and validate backup
    const backupData = await this.readBackup(backupPath);
    const isValid = await this.validateBackup(backupData);

    if (!isValid) {
      throw new Error('Backup validation failed: checksum mismatch');
    }

    if (options.validateOnly) {
      this.logger.info('Validation successful (validate-only mode)');
      return;
    }

    // SECURITY: Verify restore destinations before writing
    await this.checkSymlink(this.profilesPath);
    if (this.auditLogPath) {
      await this.checkSymlink(this.auditLogPath);
    }

    // Restore profiles
    if (backupData.profiles) {
      await atomicWrite(this.profilesPath, backupData.profiles);
      this.logger.info(`Restored profiles to: ${this.profilesPath}`);
    }

    // Restore audit log
    if (backupData.auditLog && this.auditLogPath) {
      await atomicWrite(this.auditLogPath, backupData.auditLog);
      this.logger.info(`Restored audit log to: ${this.auditLogPath}`);
    }

    this.logger.info('Restore completed successfully');
  }

  /**
   * Validate a backup file without restoring it.
   * @param backupPath - Path to the backup file
   * @returns true if backup is valid, false otherwise
   */
  async validate(backupPath: string): Promise<boolean> {
    try {
      const backupData = await this.readBackup(backupPath);
      return await this.validateBackup(backupData);
    } catch (error) {
      this.logger.error('Backup validation failed', { error });
      return false;
    }
  }

  /**
   * List all available backups.
   * @returns Array of backup metadata sorted by timestamp (newest first)
   */
  async listBackups(): Promise<BackupMetadata[]> {
    try {
      const files = await readdir(this.backupDir);
      const backupFiles = files.filter((f) => f.endsWith('.backup.json'));

      const metadata = await Promise.all(
        backupFiles.map((f) => this.getBackupMetadata(join(this.backupDir, f)))
      );

      // Sort by timestamp, newest first
      return metadata.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete old backups, keeping only the specified number of most recent backups.
   * @param keepCount - Number of backups to keep
   * @returns Number of backups deleted
   */
  async cleanup(keepCount: number): Promise<number> {
    const backups = await this.listBackups();

    if (backups.length <= keepCount) {
      this.logger.info(`No cleanup needed (${backups.length} backups, keeping ${keepCount})`);
      return 0;
    }

    // Delete oldest backups
    const toDelete = backups.slice(keepCount);
    const { unlink } = await import('fs/promises');

    for (const backup of toDelete) {
      await unlink(backup.path);
      this.logger.info(`Deleted old backup: ${backup.filename}`);
    }

    this.logger.info(`Cleaned up ${toDelete.length} old backups`);
    return toDelete.length;
  }

  /**
   * Read backup file and parse JSON.
   */
  private async readBackup(backupPath: string): Promise<BackupData> {
    const content = await readFile(backupPath, 'utf-8');
    return JSON.parse(content) as BackupData;
  }

  /**
   * Validate backup data integrity.
   */
  private async validateBackup(backupData: BackupData): Promise<boolean> {
    // Recalculate checksum
    const dataForChecksum = JSON.stringify({
      ...backupData,
      checksum: undefined,
    });
    const calculatedChecksum = createHash('sha256').update(dataForChecksum).digest('hex');

    return calculatedChecksum === backupData.checksum;
  }

  /**
   * Get metadata for a backup file.
   */
  private async getBackupMetadata(backupPath: string): Promise<BackupMetadata> {
    const backupData = await this.readBackup(backupPath);
    const fileStat = await this.getFileStat(backupPath);

    return {
      filename: basename(backupPath),
      path: backupPath,
      timestamp: backupData.timestamp,
      sizeBytes: fileStat.sizeBytes,
      checksum: backupData.checksum,
      version: backupData.version,
    };
  }

  /**
   * Check if a path is a symlink and throw error if it is.
   * Prevents symlink attacks where attacker creates symlink to sensitive file.
   */
  private async checkSymlink(path: string): Promise<void> {
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new Error(`Security: Refusing to operate on symlink: ${path}`);
      }
    } catch (error) {
      // File doesn't exist yet - that's OK for writes
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Get file stats.
   */
  private async getFileStat(path: string): Promise<{ sizeBytes: number }> {
    const stats = await stat(path);
    return { sizeBytes: stats.size };
  }
}
