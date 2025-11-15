import { ProfileManager } from '../../src/profile/ProfileManager';
import { ProfileRecord } from '../../src/profile/ProfileTypes';
import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ProfileManager', () => {
  let tempDir: string;
  let profilesPath: string;
  let manager: ProfileManager;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(tmpdir(), `profile-test-${Date.now()}-${Math.random()}`);
    await mkdir(tempDir, { recursive: true });
    profilesPath = join(tempDir, 'profiles.json');
    manager = new ProfileManager(profilesPath);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a new profile', async () => {
      const config = {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      };

      const profile = await manager.create('work', config);

      expect(profile.id).toBe('work');
      expect(profile.auth0Domain).toBe('company.auth0.com');
      expect(profile.auth0ClientId).toBe('client123');
      expect(profile.tokenStorePath).toBe('/home/user/.claude/tokens');
      expect(profile.createdAt).toBeInstanceOf(Date);
      expect(profile.updatedAt).toBeInstanceOf(Date);
      expect(profile.lastUsedAt).toBeUndefined();
    });

    it('should create profile with encryption passphrase', async () => {
      const config = {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        encryptionPassphrase: 'secret123',
      };

      const profile = await manager.create('work', config);

      expect(profile.encryptionPassphrase).toBe('secret123');
    });

    it('should reject duplicate profile IDs', async () => {
      const config = {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      };

      await manager.create('work', config);

      await expect(manager.create('work', config)).rejects.toThrow(
        'Profile already exists'
      );
    });

    it('should persist profile to disk', async () => {
      const config = {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      };

      await manager.create('work', config);

      const fileContent = await readFile(profilesPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.profiles).toHaveProperty('work');
      expect(data.profiles.work.auth0Domain).toBe('company.auth0.com');
    });
  });

  describe('read', () => {
    it('should read an existing profile', async () => {
      const config = {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      };

      await manager.create('work', config);
      const profile = await manager.read('work');

      expect(profile).not.toBeNull();
      expect(profile?.id).toBe('work');
      expect(profile?.auth0Domain).toBe('company.auth0.com');
    });

    it('should return null for non-existent profile', async () => {
      const profile = await manager.read('nonexistent');
      expect(profile).toBeNull();
    });

    it('should handle missing profiles file', async () => {
      const emptyManager = new ProfileManager(
        join(tempDir, 'nonexistent.json')
      );
      const profile = await emptyManager.read('work');
      expect(profile).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all profiles', async () => {
      await manager.create('work', {
        auth0Domain: 'work.auth0.com',
        auth0ClientId: 'work123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await manager.create('personal', {
        auth0Domain: 'personal.auth0.com',
        auth0ClientId: 'personal456',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const profiles = await manager.list();

      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.id)).toEqual(
        expect.arrayContaining(['work', 'personal'])
      );
    });

    it('should return empty array when no profiles exist', async () => {
      const profiles = await manager.list();
      expect(profiles).toEqual([]);
    });

    it('should sort profiles by ID alphabetically', async () => {
      await manager.create('zebra', {
        auth0Domain: 'z.auth0.com',
        auth0ClientId: 'z123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await manager.create('alpha', {
        auth0Domain: 'a.auth0.com',
        auth0ClientId: 'a123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const profiles = await manager.list();

      expect(profiles[0].id).toBe('alpha');
      expect(profiles[1].id).toBe('zebra');
    });
  });

  describe('update', () => {
    it('should update profile configuration', async () => {
      await manager.create('work', {
        auth0Domain: 'old.auth0.com',
        auth0ClientId: 'old123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const updated = await manager.update('work', {
        auth0Domain: 'new.auth0.com',
      });

      expect(updated.auth0Domain).toBe('new.auth0.com');
      expect(updated.auth0ClientId).toBe('old123'); // Unchanged
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        updated.createdAt.getTime()
      );
    });

    it('should update encryption passphrase', async () => {
      await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const updated = await manager.update('work', {
        encryptionPassphrase: 'newsecret',
      });

      expect(updated.encryptionPassphrase).toBe('newsecret');
    });

    it('should throw error when updating non-existent profile', async () => {
      await expect(
        manager.update('nonexistent', { auth0Domain: 'new.auth0.com' })
      ).rejects.toThrow('Profile not found');
    });

    it('should preserve createdAt timestamp', async () => {
      const created = await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await manager.update('work', {
        auth0Domain: 'new.auth0.com',
      });

      expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
    });
  });

  describe('delete', () => {
    it('should delete an existing profile', async () => {
      await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await manager.delete('work');

      const profile = await manager.read('work');
      expect(profile).toBeNull();
    });

    it('should throw error when deleting non-existent profile', async () => {
      await expect(manager.delete('nonexistent')).rejects.toThrow(
        'Profile not found'
      );
    });

    it('should persist deletion to disk', async () => {
      await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await manager.delete('work');

      const fileContent = await readFile(profilesPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.profiles).not.toHaveProperty('work');
    });
  });

  describe('updateLastUsed', () => {
    it('should update lastUsedAt timestamp', async () => {
      const created = await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      expect(created.lastUsedAt).toBeUndefined();

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await manager.updateLastUsed('work');

      expect(updated.lastUsedAt).toBeInstanceOf(Date);
      expect(updated.lastUsedAt!.getTime()).toBeGreaterThan(
        created.createdAt.getTime()
      );
    });

    it('should throw error when updating non-existent profile', async () => {
      await expect(manager.updateLastUsed('nonexistent')).rejects.toThrow(
        'Profile not found'
      );
    });
  });

  describe('exists', () => {
    it('should return true for existing profile', async () => {
      await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const exists = await manager.exists('work');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent profile', async () => {
      const exists = await manager.exists('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle corrupted profiles file', async () => {
      // Write invalid JSON
      const fs = await import('fs/promises');
      await fs.writeFile(profilesPath, 'invalid json{{{', 'utf-8');

      const profiles = await manager.list();
      expect(profiles).toEqual([]);
    });

    it('should recover from corrupted file on write', async () => {
      // Write invalid JSON
      const fs = await import('fs/promises');
      await fs.writeFile(profilesPath, 'invalid json{{{', 'utf-8');

      // Should successfully create new profile
      await manager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const profiles = await manager.list();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe('work');
    });
  });
});
