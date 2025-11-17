import { ProfileManager } from '../../src/profile/ProfileManager';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ValidationError } from '../../src/errors/ValidationError';

/**
 * Security tests verifying that path traversal vulnerabilities have been FIXED.
 * All malicious inputs should be REJECTED.
 */

describe('SECURITY FIX: Path Traversal Prevention', () => {
  let tempDir: string;
  let profilesPath: string;
  let manager: ProfileManager;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `security-test-${Date.now()}-${Math.random()}`);
    await mkdir(tempDir, { recursive: true });
    profilesPath = join(tempDir, 'profiles.json');
    manager = new ProfileManager(profilesPath);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('✅ FIX VERIFIED: rejects path traversal in profile ID', async () => {
    const maliciousId = '../../../malicious';

    // Should REJECT path traversal
    await expect(
      manager.create(maliciousId, {
        auth0Domain: 'evil.com',
        auth0ClientId: 'pwned',
        tokenStorePath: '/tmp',
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      manager.create(maliciousId, {
        auth0Domain: 'evil.com',
        auth0ClientId: 'pwned',
        tokenStorePath: '/tmp',
      })
    ).rejects.toThrow('Profile ID cannot contain path traversal sequences');

    console.log('✅ Correctly rejected: ../../../malicious');
  });

  it('✅ FIX VERIFIED: rejects directory traversal characters', async () => {
    const maliciousIds = [
      '../etc/passwd',
      '../../.ssh/authorized_keys',
      '..',
      '.',
      'C:\\Windows\\System32\\config\\SAM',  // Windows
      '\\\\network\\share\\file',             // UNC path
    ];

    for (const id of maliciousIds) {
      await expect(
        manager.create(id, {
          auth0Domain: 'evil.com',
          auth0ClientId: 'pwned',
          tokenStorePath: '/tmp',
        })
      ).rejects.toThrow(ValidationError);

      console.log(`✅ Correctly rejected: ${id}`);
    }
  });

  it('✅ FIX VERIFIED: rejects Windows reserved names', async () => {
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];

    for (const name of reservedNames) {
      await expect(
        manager.create(name, {
          auth0Domain: 'test.com',
          auth0ClientId: 'test',
          tokenStorePath: '/tmp',
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        manager.create(name, {
          auth0Domain: 'test.com',
          auth0ClientId: 'test',
          tokenStorePath: '/tmp',
        })
      ).rejects.toThrow('Profile ID cannot be a Windows reserved name');

      console.log(`✅ Correctly rejected: ${name}`);
    }
  });

  it('✅ FIX VERIFIED: validates tokenStorePath to prevent system directory access', async () => {
    const dangerousPaths = [
      '/etc/passwd',
      '/sys/kernel/config',
      'C:\\Windows\\System32',
    ];

    for (const path of dangerousPaths) {
      await expect(
        manager.create('valid-id', {
          auth0Domain: 'test.com',
          auth0ClientId: 'test',
          tokenStorePath: path,
        })
      ).rejects.toThrow(ValidationError);

      console.log(`✅ Correctly rejected dangerous path: ${path}`);
    }
  });

  it('✅ FIX VERIFIED: accepts only valid profile IDs', async () => {
    const validIds = ['user-profile', 'work_profile', 'profile123', 'a'];

    for (const id of validIds) {
      const profile = await manager.create(id, {
        auth0Domain: 'test.com',
        auth0ClientId: 'test-client',
        tokenStorePath: '/home/user/tokens',
      });

      expect(profile.id).toBe(id);
      console.log(`✅ Correctly accepted valid ID: ${id}`);
    }
  });
});
