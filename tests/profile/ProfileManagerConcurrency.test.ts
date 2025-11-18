import { ProfileManager } from '../../src/profile/ProfileManager';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ProfileManager - Concurrent Operations', () => {
  let tempDir: string;
  let profilesPath: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `concurrency-test-${Date.now()}-${Math.random()}`);
    await mkdir(tempDir, { recursive: true });
    profilesPath = join(tempDir, 'profiles.json');
  });

  afterEach(async () => {
    // Wait a bit for any pending operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Force remove including any lock files
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should handle 10 concurrent profile creations without data loss', async () => {
    const manager = new ProfileManager(profilesPath, { disableRateLimit: true });
    const promises: Promise<void>[] = [];

    // Create 10 profiles concurrently
    for (let i = 0; i < 10; i++) {
      promises.push(
        manager.create(`profile-${i}`, {
          tokenUrl: `https://domain-${i}.example.com/oauth/token`,
          clientId: `client-${i}`,
          tokenStorePath: '/home/user/tokens',
        }).then(() => {})
      );
    }

    await Promise.all(promises);

    // Verify all 10 profiles exist
    const profiles = await manager.list();
    expect(profiles).toHaveLength(10);

    // Verify each profile has correct data
    for (let i = 0; i < 10; i++) {
      const profile = await manager.read(`profile-${i}`);
      expect(profile).not.toBeNull();
      expect(profile?.tokenUrl).toBe(`https://domain-${i}.example.com/oauth/token`);
    }
  }, 30000);

  it('should handle concurrent updates to same profile', async () => {
    const manager = new ProfileManager(profilesPath, { disableRateLimit: true });

    // Create initial profile
    await manager.create('test', {
      tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
      clientId: 'test-client-id',
      tokenStorePath: '/home/user/tokens',
    });

    // Update 10 times concurrently with different values
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        manager.update('test', {
          tokenUrl: `https://domain-${i}.example.com/oauth/token`,
        }).then(() => {})
      );
    }

    await Promise.all(promises);

    // Verify profile still exists and has a valid tokenUrl (one of the concurrent updates won)
    const profile = await manager.read('test');
    expect(profile).not.toBeNull();
    expect(profile?.tokenUrl).toMatch(/^https:\/\/domain-\d+\.example\.com\/oauth\/token$/);
  }, 30000);

  it('should handle mixed concurrent creates, updates, and deletes', async () => {
    const manager = new ProfileManager(profilesPath, { disableRateLimit: true });

    // Pre-create some profiles
    for (let i = 0; i < 5; i++) {
      await manager.create(`existing-${i}`, {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        tokenStorePath: '/home/user/tokens',
      });
    }

    const promises: Promise<void>[] = [];

    // Mix of operations
    for (let i = 0; i < 10; i++) {
      // Creates
      promises.push(
        manager.create(`new-${i}`, {
          tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
          clientId: 'test-client-id',
          tokenStorePath: '/home/user/tokens',
        }).then(() => {})
      );

      // Updates (might fail if profile deleted)
      if (i < 5) {
        promises.push(
          manager.update(`existing-${i}`, {
            tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
          }).then(() => {}).catch(() => {}) // Ignore errors
        );
      }

      // Deletes (might fail if already deleted)
      if (i < 3) {
        promises.push(
          manager.delete(`existing-${i}`).catch(() => {})
        );
      }
    }

    await Promise.all(promises);

    // Verify data integrity - all profiles should be valid
    const profiles = await manager.list();
    for (const profile of profiles) {
      expect(profile.id).toBeTruthy();
      expect(profile.tokenUrl).toBeTruthy();
      expect(profile.createdAt).toBeInstanceOf(Date);
    }
  }, 30000);

  it('should not lose data under concurrent read/write load', async () => {
    const manager = new ProfileManager(profilesPath, { disableRateLimit: true });

    // Create initial profile
    await manager.create('counter', {
      tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
      clientId: 'test-client-id',
      tokenStorePath: '/home/user/tokens',
    });

    const promises: Promise<void>[] = [];

    // 5 concurrent readers
    for (let i = 0; i < 5; i++) {
      promises.push(
        manager.read('counter').then(() => {})
      );
    }

    // 5 concurrent writers
    for (let i = 0; i < 5; i++) {
      promises.push(
        manager.update('counter', {
          tokenUrl: `https://counter-${i}.example.com/oauth/token`,
        }).then(() => {})
      );
    }

    await Promise.all(promises);

    // Profile should still exist and be valid (with one of the concurrent updates)
    const profile = await manager.read('counter');
    expect(profile).not.toBeNull();
    expect(profile?.tokenUrl).toMatch(/^https:\/\/counter-\d+\.example\.com\/oauth\/token$/);
  }, 30000);
});
