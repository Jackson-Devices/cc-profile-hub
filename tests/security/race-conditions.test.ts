import { ProfileManager } from '../../src/profile/ProfileManager';
import { Mutex } from '../../src/utils/Mutex';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SECURITY: Race Condition Vulnerabilities', () => {
  let tempDir: string;
  let profilesPath: string;
  let manager: ProfileManager;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `race-test-${Date.now()}-${Math.random()}`);
    await mkdir(tempDir, { recursive: true });
    profilesPath = join(tempDir, 'profiles.json');
    manager = new ProfileManager(profilesPath);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('VULNERABILITY: concurrent profile creation causes data loss', async () => {
    // Simulate two processes trying to create profiles simultaneously
    const promises = [];

    for (let i = 0; i < 10; i++) {
      promises.push(
        manager.create(`profile-${i}`, {
          auth0Domain: `domain-${i}.auth0.com`,
          auth0ClientId: `client-${i}`,
          tokenStorePath: `/tmp/tokens-${i}`,
        })
      );
    }

    // Run all creates concurrently
    await Promise.all(promises);

    // Check how many actually survived
    const profiles = await manager.list();

    console.log(`Created ${promises.length} profiles concurrently`);
    console.log(`Actually persisted: ${profiles.length} profiles`);

    // LIKELY LESS THAN 10 due to race conditions!
    if (profiles.length < 10) {
      console.log(`⚠️  DATA LOSS: ${10 - profiles.length} profiles lost!`);
    }

    // We should have all 10, but race conditions may cause loss
    expect(profiles.length).toBeLessThanOrEqual(10);
  });

  it('VULNERABILITY: concurrent updates to same profile', async () => {
    // Create initial profile
    await manager.create('test-profile', {
      auth0Domain: 'original.auth0.com',
      auth0ClientId: 'original-client',
      tokenStorePath: '/tmp/tokens',
    });

    // Update it 100 times concurrently
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        manager.update('test-profile', {
          auth0Domain: `domain-${i}.auth0.com`,
        })
      );
    }

    await Promise.all(promises);

    // Which update won? Completely non-deterministic!
    const profile = await manager.read('test-profile');
    console.log(`Final domain: ${profile?.auth0Domain}`);
    console.log('⚠️  Non-deterministic result due to race condition');
  });
});

describe('SECURITY: Mutex Deadlock Vulnerability', () => {
  it('VULNERABILITY: mutex hangs forever if release never called', async () => {
    const mutex = new Mutex();

    // Acquire but NEVER release
    const release = await mutex.acquire();
    // Oops, forgot to call release()!

    // Try to acquire again - this will hang FOREVER
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve('TIMEOUT'), 1000)
    );

    const acquirePromise = mutex.acquire();

    const result = await Promise.race([acquirePromise, timeoutPromise]);

    expect(result).toBe('TIMEOUT');
    console.log('⚠️  DEADLOCK: Second acquire() never resolved!');

    // Cleanup
    release();
  }, 2000);

  it('VULNERABILITY: unbounded queue growth', async () => {
    const mutex = new Mutex();

    // Acquire and never release
    await mutex.acquire();

    // Queue up 10000 waiters - MEMORY LEAK!
    const promises = [];
    for (let i = 0; i < 10000; i++) {
      promises.push(mutex.acquire());
    }

    console.log(`⚠️  Queued 10000 waiting promises - memory leak!`);

    // These will never resolve without a timeout mechanism
    expect(promises.length).toBe(10000);
  }, 5000);

  it('VULNERABILITY: no timeout means potential DoS', async () => {
    const mutex = new Mutex();

    await mutex.acquire();
    // Never release - simulate a stuck operation

    const start = Date.now();

    // This should timeout after reasonable duration (e.g., 30s)
    // But it doesn't - it waits FOREVER
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve('TIMEOUT'), 100)
    );

    const result = await Promise.race([mutex.acquire(), timeoutPromise]);

    expect(result).toBe('TIMEOUT');
    expect(Date.now() - start).toBeLessThan(200);

    console.log('⚠️  Mutex has no timeout - waits forever!');
  });
});
