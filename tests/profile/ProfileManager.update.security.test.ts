/**
 * BUG-005: ProfileManager.update() Validation Bypass - CRITICAL SECURITY
 *
 * VULNERABILITY: update() method does NOT validate encryptionPassphrase
 * This allows attackers to set weak or empty passphrases for credential encryption!
 *
 * Tests verify that ProfileManager.update():
 * 1. Validates encryptionPassphrase (minimum length, not empty)
 * 2. Validates ALL updatable fields (no bypass via spread operator)
 * 3. Validates profileId before processing
 * 4. Rejects weak/empty passphrases that compromise credential security
 *
 * Test Partitions:
 * - IB-1: Valid updates with all fields validated
 * - IB-2: Partial updates (only some fields)
 * - OOB-1: Empty/weak encryptionPassphrase (CRITICAL)
 * - OOB-2: Invalid auth0Domain/clientId/tokenStorePath
 * - OOB-3: Invalid profileId
 * - SECURITY: Attack vectors attempting to bypass validation
 * - REGRESSION: Ensure all update fields are validated
 */

import { ProfileManager } from '../../src/profile/ProfileManager';
import { ValidationError } from '../../src/errors/ValidationError';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

describe('ProfileManager.update() Validation Security', () => {
  const testDir = '/tmp/profile-update-security-test';
  const profilesPath = join(testDir, 'profiles.json');
  const tokenStorePath = join(testDir, 'tokens');
  let manager: ProfileManager;

  beforeAll(async () => {
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
    if (!existsSync(tokenStorePath)) {
      await mkdir(tokenStorePath, { recursive: true });
    }
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Reset profiles file before each test
    await writeFile(profilesPath, JSON.stringify({ profiles: {} }));
    manager = new ProfileManager(profilesPath, { disableRateLimit: true });

    // Create a test profile for update tests
    await manager.create('test-profile', {
      auth0Domain: 'original.auth0.com',
      auth0ClientId: 'original-client-id',
      tokenStorePath,
      encryptionPassphrase: 'original-strong-passphrase-12345',
    });
  });

  describe('[IB-1] Valid Updates with Full Validation', () => {
    it('accepts update with valid encryptionPassphrase', async () => {
      const updated = await manager.update('test-profile', {
        encryptionPassphrase: 'new-strong-passphrase-67890',
      });

      expect(updated.encryptionPassphrase).toBe('new-strong-passphrase-67890');
      expect(updated.updatedAt).toBeDefined();
    });

    it('accepts update with valid auth0Domain', async () => {
      const updated = await manager.update('test-profile', {
        auth0Domain: 'updated.auth0.com',
      });

      expect(updated.auth0Domain).toBe('updated.auth0.com');
    });

    it('accepts update with valid auth0ClientId', async () => {
      const updated = await manager.update('test-profile', {
        auth0ClientId: 'new-client-id-123',
      });

      expect(updated.auth0ClientId).toBe('new-client-id-123');
    });

    it('accepts update with valid tokenStorePath', async () => {
      const newTokenPath = join(testDir, 'new-tokens');
      await mkdir(newTokenPath, { recursive: true });

      const updated = await manager.update('test-profile', {
        tokenStorePath: newTokenPath,
      });

      expect(updated.tokenStorePath).toBe(newTokenPath);
    });

    it('accepts update with multiple valid fields', async () => {
      const updated = await manager.update('test-profile', {
        auth0Domain: 'multi.auth0.com',
        auth0ClientId: 'multi-client-123',
        encryptionPassphrase: 'multi-strong-passphrase-abc',
      });

      expect(updated.auth0Domain).toBe('multi.auth0.com');
      expect(updated.auth0ClientId).toBe('multi-client-123');
      expect(updated.encryptionPassphrase).toBe('multi-strong-passphrase-abc');
    });
  });

  describe('[IB-2] Partial Updates', () => {
    it('allows updating only one field without affecting others', async () => {
      const updated = await manager.update('test-profile', {
        auth0Domain: 'partial.auth0.com',
      });

      expect(updated.auth0Domain).toBe('partial.auth0.com');
      expect(updated.auth0ClientId).toBe('original-client-id');
      expect(updated.encryptionPassphrase).toBe('original-strong-passphrase-12345');
    });

    it('preserves createdAt timestamp', async () => {
      const original = await manager.read('test-profile');
      const updated = await manager.update('test-profile', {
        auth0Domain: 'preserve.auth0.com',
      });

      expect(updated.createdAt).toEqual(original!.createdAt);
    });

    it('updates updatedAt timestamp', async () => {
      const original = await manager.read('test-profile');

      // Wait 10ms to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await manager.update('test-profile', {
        auth0Domain: 'timestamp.auth0.com',
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(original!.updatedAt.getTime());
    });
  });

  describe('[OOB-1] CRITICAL: Empty/Weak Passphrase Rejection', () => {
    it('rejects empty encryptionPassphrase', async () => {
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects whitespace-only encryptionPassphrase', async () => {
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '   ',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects short encryptionPassphrase (< 8 chars)', async () => {
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '1234567',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects weak encryptionPassphrase (too simple)', async () => {
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '12345678', // Just numbers
        })
      ).rejects.toThrow(ValidationError);
    });

    it('error message mentions passphrase requirements', async () => {
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '',
        })
      ).rejects.toThrow(/passphrase|empty|length|weak/i);
    });
  });

  describe('[OOB-2] Invalid Field Validation', () => {
    it('rejects invalid auth0Domain (XSS attempt)', async () => {
      await expect(
        manager.update('test-profile', {
          auth0Domain: '<script>alert(1)</script>',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid auth0Domain (empty)', async () => {
      await expect(
        manager.update('test-profile', {
          auth0Domain: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid auth0ClientId (special chars)', async () => {
      await expect(
        manager.update('test-profile', {
          auth0ClientId: 'invalid@client!id',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid tokenStorePath (relative path)', async () => {
      await expect(
        manager.update('test-profile', {
          tokenStorePath: './relative/path',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid tokenStorePath (path traversal)', async () => {
      await expect(
        manager.update('test-profile', {
          tokenStorePath: '/tmp/../../etc/passwd',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('[OOB-3] Profile Not Found', () => {
    it('rejects update to non-existent profile', async () => {
      await expect(
        manager.update('does-not-exist', {
          auth0Domain: 'new.auth0.com',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('error message mentions profile not found', async () => {
      await expect(
        manager.update('missing-profile', {
          auth0Domain: 'new.auth0.com',
        })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('[SECURITY] Attack Vector Prevention', () => {
    it('prevents validation bypass via object spread (empty passphrase)', async () => {
      // Attacker tries to bypass validation by including encryptionPassphrase
      // in updates object without validation
      await expect(
        manager.update('test-profile', {
          auth0Domain: 'valid.auth0.com',
          encryptionPassphrase: '', // ATTACK: empty passphrase
        })
      ).rejects.toThrow(ValidationError);
    });

    it('prevents weak passphrase injection in multi-field update', async () => {
      await expect(
        manager.update('test-profile', {
          auth0Domain: 'valid.auth0.com',
          auth0ClientId: 'valid-client-id',
          encryptionPassphrase: '123', // ATTACK: weak passphrase
        })
      ).rejects.toThrow(ValidationError);
    });

    it('prevents XSS in auth0Domain during update', async () => {
      await expect(
        manager.update('test-profile', {
          auth0Domain: 'valid.auth0.com<script>alert(1)</script>',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('prevents path traversal in tokenStorePath during update', async () => {
      await expect(
        manager.update('test-profile', {
          tokenStorePath: '/var/log/../../../etc/shadow',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('prevents credential compromise via passphrase downgrade', async () => {
      // Original has strong passphrase, attacker tries to weaken it
      const original = await manager.read('test-profile');
      expect(original!.encryptionPassphrase).toBe('original-strong-passphrase-12345');

      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: 'weak',
        })
      ).rejects.toThrow(ValidationError);

      // Verify original passphrase unchanged after failed attack
      const stillOriginal = await manager.read('test-profile');
      expect(stillOriginal!.encryptionPassphrase).toBe('original-strong-passphrase-12345');
    });
  });

  describe('[REGRESSION] All Fields Validated', () => {
    it('validates encryptionPassphrase when provided', async () => {
      // This is the bug: encryptionPassphrase was NOT validated
      // Now it MUST be validated
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('validates auth0Domain when provided (existing behavior)', async () => {
      await expect(
        manager.update('test-profile', {
          auth0Domain: 'javascript:alert(1)',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('validates auth0ClientId when provided (existing behavior)', async () => {
      await expect(
        manager.update('test-profile', {
          auth0ClientId: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('validates tokenStorePath when provided (existing behavior)', async () => {
      await expect(
        manager.update('test-profile', {
          tokenStorePath: '../relative',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('validates ALL fields when updating multiple at once', async () => {
      await expect(
        manager.update('test-profile', {
          auth0Domain: 'valid.auth0.com',
          auth0ClientId: 'valid-client',
          tokenStorePath: '/valid/path',
          encryptionPassphrase: '', // INVALID - should fail entire update
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('[BOUNDARY] Edge Cases', () => {
    it('accepts minimum valid passphrase length (8 chars)', async () => {
      const updated = await manager.update('test-profile', {
        encryptionPassphrase: 'xyzabc99', // Mixed alphanumeric, not common
      });

      expect(updated.encryptionPassphrase).toBe('xyzabc99');
    });

    it('accepts long passphrase (256 chars)', async () => {
      const longPass = 'a'.repeat(256);
      const updated = await manager.update('test-profile', {
        encryptionPassphrase: longPass,
      });

      expect(updated.encryptionPassphrase).toBe(longPass);
    });

    it('rejects extremely long passphrase (>1024 chars)', async () => {
      const tooLong = 'a'.repeat(1025);

      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: tooLong,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('handles undefined encryptionPassphrase (no update)', async () => {
      const updated = await manager.update('test-profile', {
        auth0Domain: 'undefined-test.auth0.com',
        // encryptionPassphrase not provided
      });

      // Should keep original passphrase
      expect(updated.encryptionPassphrase).toBe('original-strong-passphrase-12345');
    });
  });

  describe('[CROSS-PARTITION] Complete Update Workflow', () => {
    it('performs complete profile update with all valid fields', async () => {
      const newTokenPath = join(testDir, 'complete-tokens');
      await mkdir(newTokenPath, { recursive: true });

      const updated = await manager.update('test-profile', {
        auth0Domain: 'complete.auth0.com',
        auth0ClientId: 'complete-client-abc123',
        tokenStorePath: newTokenPath,
        encryptionPassphrase: 'complete-strong-passphrase-xyz789',
      });

      expect(updated.id).toBe('test-profile');
      expect(updated.auth0Domain).toBe('complete.auth0.com');
      expect(updated.auth0ClientId).toBe('complete-client-abc123');
      expect(updated.tokenStorePath).toBe(newTokenPath);
      expect(updated.encryptionPassphrase).toBe('complete-strong-passphrase-xyz789');
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('validates then persists update (atomic operation)', async () => {
      // Invalid update should not modify storage
      await expect(
        manager.update('test-profile', {
          encryptionPassphrase: '', // INVALID
        })
      ).rejects.toThrow();

      // Verify profile unchanged
      const profile = await manager.read('test-profile');
      expect(profile!.encryptionPassphrase).toBe('original-strong-passphrase-12345');
    });
  });
});
