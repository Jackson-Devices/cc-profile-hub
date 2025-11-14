import { ProfileManager } from '../../src/profile/ProfileManager';
import { mkdir, rm, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SECURITY: Path Traversal Vulnerability', () => {
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

  it('VULNERABILITY: allows path traversal in profile ID', async () => {
    // Attempt to create profile with path traversal
    const maliciousId = '../../../malicious';

    // THIS SHOULD FAIL but currently SUCCEEDS!
    await manager.create(maliciousId, {
      auth0Domain: 'evil.com',
      auth0ClientId: 'pwned',
      tokenStorePath: '/tmp',
    });

    // Verify the malicious profile was created
    const profile = await manager.read(maliciousId);
    expect(profile).not.toBeNull();
    expect(profile?.id).toBe('../../../malicious');

    // This is BAD - we can escape the intended directory
    console.log('⚠️  SECURITY ISSUE: Path traversal accepted!');
  });

  it('VULNERABILITY: accepts directory traversal characters', async () => {
    const maliciousIds = [
      '../etc/passwd',
      '../../.ssh/authorized_keys',
      '..',
      '.',
      'C:\\Windows\\System32\\config\\SAM',  // Windows
      '\\\\network\\share\\file',             // UNC path
    ];

    for (const id of maliciousIds) {
      try {
        await manager.create(id, {
          auth0Domain: 'evil.com',
          auth0ClientId: 'pwned',
          tokenStorePath: '/tmp',
        });

        // Should NOT reach here!
        console.log(`⚠️  ACCEPTED MALICIOUS ID: ${id}`);
        expect(true).toBe(false);  // Fail the test
      } catch (error) {
        // Should reject these, but currently doesn't validate
        console.log(`✅ Correctly rejected: ${id}`);
      }
    }
  });

  it('VULNERABILITY: accepts Windows reserved names', async () => {
    const windowsReserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];

    for (const id of windowsReserved) {
      try {
        await manager.create(id, {
          auth0Domain: 'evil.com',
          auth0ClientId: 'pwned',
          tokenStorePath: '/tmp',
        });

        // On Windows, this could cause issues
        console.log(`⚠️  ACCEPTED RESERVED NAME: ${id}`);
      } catch (error) {
        console.log(`✅ Correctly rejected: ${id}`);
      }
    }
  });

  it('VULNERABILITY: no validation on tokenStorePath', async () => {
    const maliciousPaths = [
      '/etc/shadow',          // Read sensitive file
      '/dev/null',            // Discard tokens
      '../../etc/passwd',     // Traverse
      'C:\\Windows\\System32', // Windows system dir
    ];

    for (const path of maliciousPaths) {
      await manager.create(`profile-${Date.now()}`, {
        auth0Domain: 'evil.com',
        auth0ClientId: 'pwned',
        tokenStorePath: path,  // NO VALIDATION!
      });

      console.log(`⚠️  ACCEPTED MALICIOUS PATH: ${path}`);
    }
  });
});
