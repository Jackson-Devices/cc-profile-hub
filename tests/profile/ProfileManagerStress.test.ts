import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { ProfileManager } from '../../src/profile/ProfileManager';

describe('ProfileManager - Stress Tests', () => {
  let tempDir: string;
  let profilesPath: string;

  beforeEach(async () => {
    tempDir = `/tmp/stress-test-${Date.now()}-${Math.random()}`;
    await mkdir(tempDir, { recursive: true });
    profilesPath = join(tempDir, 'profiles.json');
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should enforce max profiles limit of 1000', async () => {
    const manager = new ProfileManager(profilesPath);

    // Create exactly 1000 profiles (the limit)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(
        manager.create(`profile-${i}`, {
          auth0Domain: `domain-${i}.auth0.com`,
          auth0ClientId: `client-${i}`,
          tokenStorePath: '/home/user/tokens',
        }).then(() => {})
      );
    }

    await Promise.all(promises);

    // Verify we have exactly 1000 profiles
    const profiles = await manager.list();
    expect(profiles).toHaveLength(1000);

    // Try to create one more - should fail
    await expect(
      manager.create('profile-1001', {
        auth0Domain: 'domain-1001.auth0.com',
        auth0ClientId: 'client-1001',
        tokenStorePath: '/home/user/tokens',
      })
    ).rejects.toThrow('maximum of 1000 profiles reached');

    // Verify still only 1000 profiles
    const profilesAfter = await manager.list();
    expect(profilesAfter).toHaveLength(1000);
  }, 180000); // 3 minutes timeout for 1000 profiles

  it('should handle resource exhaustion gracefully with concurrent creates', async () => {
    const manager = new ProfileManager(profilesPath);

    // Try to create 1100 profiles concurrently (100 more than limit)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 1100; i++) {
      promises.push(
        manager.create(`profile-${i}`, {
          auth0Domain: `domain-${i}.auth0.com`,
          auth0ClientId: `client-${i}`,
          tokenStorePath: '/home/user/tokens',
        }).then(() => {}).catch(() => {
          // Expected to fail for some due to limit
        })
      );
    }

    await Promise.all(promises);

    // Should have exactly 1000 profiles (the max)
    const profiles = await manager.list();
    expect(profiles).toHaveLength(1000);

    // All 1000 profiles should be valid
    for (const profile of profiles) {
      expect(profile.id).toMatch(/^profile-\d+$/);
      expect(profile.auth0Domain).toMatch(/^domain-\d+\.auth0\.com$/);
      expect(profile.createdAt).toBeInstanceOf(Date);
    }
  }, 180000); // 3 minutes timeout

  it('should maintain data integrity under extreme concurrent load', async () => {
    const manager = new ProfileManager(profilesPath);

    // Create 500 profiles with heavy concurrent operations
    const createPromises: Promise<void>[] = [];
    for (let i = 0; i < 500; i++) {
      createPromises.push(
        manager.create(`profile-${i}`, {
          auth0Domain: `domain-${i}.auth0.com`,
          auth0ClientId: `client-${i}`,
          tokenStorePath: '/home/user/tokens',
        }).then(() => {})
      );
    }

    await Promise.all(createPromises);

    // Now hammer it with mixed operations
    const mixedPromises: Promise<void>[] = [];
    for (let i = 0; i < 1000; i++) {
      // Read operations
      mixedPromises.push(
        manager.read(`profile-${i % 500}`).then(() => {})
      );

      // Update operations
      if (i % 3 === 0) {
        mixedPromises.push(
          manager.update(`profile-${i % 500}`, {
            auth0Domain: `updated-${i}.auth0.com`,
          }).then(() => {}).catch(() => {}) // Ignore errors
        );
      }

      // List operations
      if (i % 10 === 0) {
        mixedPromises.push(
          manager.list().then(() => {})
        );
      }
    }

    await Promise.all(mixedPromises);

    // Verify all 500 profiles still exist and are valid
    const profiles = await manager.list();
    expect(profiles).toHaveLength(500);

    for (const profile of profiles) {
      expect(profile.id).toMatch(/^profile-\d+$/);
      expect(profile.auth0Domain).toBeTruthy();
      expect(profile.createdAt).toBeInstanceOf(Date);
      expect(profile.updatedAt).toBeInstanceOf(Date);
    }
  }, 180000); // 3 minutes timeout
});
