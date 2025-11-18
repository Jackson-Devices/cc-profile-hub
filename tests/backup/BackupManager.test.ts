import { BackupManager } from '../../src/backup/BackupManager';
import { ProfileManager } from '../../src/profile/ProfileManager';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

describe('BackupManager', () => {
  let tempDir: string;
  let backupDir: string;
  let profilesPath: string;
  let auditLogPath: string;
  let backupManager: BackupManager;

  beforeEach(async () => {
    tempDir = `/tmp/backup-test-${Date.now()}`;
    backupDir = join(tempDir, 'backups');
    profilesPath = join(tempDir, 'profiles.json');
    auditLogPath = join(tempDir, 'audit.log');

    await mkdir(tempDir, { recursive: true });

    backupManager = new BackupManager({
      backupDir,
      profilesPath,
      auditLogPath,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('backup', () => {
    it('should create a backup file', async () => {
      // Create some profiles first
      const manager = new ProfileManager(profilesPath);
      await manager.create('test-profile', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      expect(backupPath).toContain('.backup.json');
      expect(backupPath).toContain(backupDir);
    });

    it('should include profiles in backup', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('profile1', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      // Verify backup contains profile data
      const { readFile } = await import('fs/promises');
      const backupContent = JSON.parse(await readFile(backupPath, 'utf-8'));

      expect(backupContent.profiles).toBeDefined();
      expect(backupContent.profiles).toContain('profile1');
    });

    it('should include audit log if present', async () => {
      await writeFile(auditLogPath, 'test audit log entry\n');

      const backupPath = await backupManager.backup();

      const { readFile } = await import('fs/promises');
      const backupContent = JSON.parse(await readFile(backupPath, 'utf-8'));

      expect(backupContent.auditLog).toContain('test audit log entry');
    });

    it('should calculate checksum', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      const { readFile } = await import('fs/promises');
      const backupContent = JSON.parse(await readFile(backupPath, 'utf-8'));

      expect(backupContent.checksum).toBeDefined();
      expect(backupContent.checksum).toHaveLength(64); // SHA-256 hex length
    });

    it('should use custom name if provided', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup('custom-name');

      expect(backupPath).toContain('custom-name');
    });
  });

  describe('restore', () => {
    it('should restore profiles from backup', async () => {
      // Create and backup profiles
      const manager1 = new ProfileManager(profilesPath);
      await manager1.create('original-profile', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      // Delete profiles
      await manager1.delete('original-profile');

      // Restore from backup
      await backupManager.restore(backupPath);

      // Verify profile is restored
      const manager2 = new ProfileManager(profilesPath);
      const profile = await manager2.read('original-profile');

      expect(profile).not.toBeNull();
      expect(profile?.tokenUrl).toBe('https://api.anthropic.com/v1/oauth/token');
    });

    it('should validate backup before restoring', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      // Corrupt the backup by modifying it
      const { readFile, writeFile } = await import('fs/promises');
      const backupContent = JSON.parse(await readFile(backupPath, 'utf-8'));
      backupContent.profiles = '{"corrupted": true}';
      // Don't update checksum - this makes it invalid
      await writeFile(backupPath, JSON.stringify(backupContent));

      // Restore should fail due to checksum mismatch
      await expect(backupManager.restore(backupPath)).rejects.toThrow('checksum mismatch');
    });

    it('should support validate-only mode', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      // Delete profile
      await manager.delete('test');

      // Validate without restoring
      await backupManager.restore(backupPath, { validateOnly: true });

      // Profile should still be deleted
      const profile = await manager.read('test');
      expect(profile).toBeNull();
    });
  });

  describe('validate', () => {
    it('should return true for valid backup', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      const isValid = await backupManager.validate(backupPath);

      expect(isValid).toBe(true);
    });

    it('should return false for corrupted backup', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      const backupPath = await backupManager.backup();

      // Corrupt the backup
      const { readFile, writeFile } = await import('fs/promises');
      const backupContent = JSON.parse(await readFile(backupPath, 'utf-8'));
      backupContent.profiles = '{"corrupted": true}';
      await writeFile(backupPath, JSON.stringify(backupContent));

      const isValid = await backupManager.validate(backupPath);

      expect(isValid).toBe(false);
    });
  });

  describe('listBackups', () => {
    it('should list all backup files', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      await backupManager.backup('backup1');
      await backupManager.backup('backup2');
      await backupManager.backup('backup3');

      const backups = await backupManager.listBackups();

      expect(backups).toHaveLength(3);
      expect(backups[0].filename).toContain('backup3'); // Newest first
      expect(backups[2].filename).toContain('backup1'); // Oldest last
    });

    it('should include metadata for each backup', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      await backupManager.backup();

      const backups = await backupManager.listBackups();

      expect(backups[0].filename).toBeDefined();
      expect(backups[0].path).toBeDefined();
      expect(backups[0].timestamp).toBeGreaterThan(0);
      expect(backups[0].sizeBytes).toBeGreaterThan(0);
      expect(backups[0].checksum).toHaveLength(64);
      expect(backups[0].version).toBe('1.0.0');
    });

    it('should return empty array if no backups exist', async () => {
      const backups = await backupManager.listBackups();

      expect(backups).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should delete old backups keeping specified count', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await backupManager.backup(`backup-${i}`);
        await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different timestamps
      }

      // Keep only 2 most recent
      const deleted = await backupManager.cleanup(2);

      expect(deleted).toBe(3);

      const remaining = await backupManager.listBackups();
      expect(remaining).toHaveLength(2);
    });

    it('should not delete backups if count is within limit', async () => {
      const manager = new ProfileManager(profilesPath);
      await manager.create('test', {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });

      await backupManager.backup();
      await backupManager.backup();

      const deleted = await backupManager.cleanup(5);

      expect(deleted).toBe(0);

      const remaining = await backupManager.listBackups();
      expect(remaining).toHaveLength(2);
    });
  });
});
