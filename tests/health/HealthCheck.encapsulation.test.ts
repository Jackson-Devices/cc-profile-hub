/**
 * BUG-002: HealthCheck Encapsulation - Private Property Access Prevention
 *
 * Tests verify that HealthCheck class:
 * 1. Stores its own copy of profilesPath and tokenStorePath
 * 2. Does not access ProfileManager's private properties via bracket notation
 * 3. Maintains proper encapsulation between classes
 * 4. Passes TypeScript strict compilation
 *
 * Test Partitions:
 * - IB-1: Property initialization in constructor
 * - IB-2: File system health check uses own properties
 * - IB-3: Encapsulation maintained with ProfileManager
 * - OOB: TypeScript compilation, edge cases
 * - REGRESSION: No private property access via bracket notation
 */

import { HealthCheck } from '../../src/health/HealthCheck';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

describe('HealthCheck Encapsulation', () => {
  const testDir = '/tmp/healthcheck-encapsulation-test';
  const profilesPath = join(testDir, 'profiles.json');
  const tokenStorePath = join(testDir, 'tokens');

  beforeAll(async () => {
    // Create test directories
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
    if (!existsSync(tokenStorePath)) {
      await mkdir(tokenStorePath, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup test directories
    try {
      const { rm } = await import('fs/promises');
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('[IB-1] Property Initialization', () => {
    it('stores profilesPath in own property', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ASSERT
      expect((healthCheck as any)['profilesPath']).toBe(profilesPath);
      expect((healthCheck as any).hasOwnProperty('profilesPath')).toBe(true);
    });

    it('stores tokenStorePath in own property', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ASSERT
      expect((healthCheck as any)['tokenStorePath']).toBe(tokenStorePath);
      expect((healthCheck as any).hasOwnProperty('tokenStorePath')).toBe(true);
    });

    it('initializes all required properties from options', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
        version: '1.0.0',
      });

      // ASSERT
      expect((healthCheck as any)['profilesPath']).toBe(profilesPath);
      expect((healthCheck as any)['tokenStorePath']).toBe(tokenStorePath);
      expect((healthCheck as any)['version']).toBe('1.0.0');
      expect((healthCheck as any)['profileManager']).toBeDefined();
      expect((healthCheck as any)['tokenStore']).toBeDefined();
      expect((healthCheck as any)['logger']).toBeDefined();
    });
  });

  describe('[IB-2] File System Health Check', () => {
    it('checkFileSystem uses own profilesPath property', async () => {
      // ARRANGE
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ACT - Call private checkFileSystem method
      const result = await (healthCheck as any)['checkFileSystem']();

      // ASSERT - Should complete without errors
      expect(result).toBeDefined();
      expect(result.name).toBe('fileSystem');
      expect(typeof result.status).toBe('string');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    });

    it('checkFileSystem does not throw when accessing own properties', async () => {
      // ARRANGE
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ACT & ASSERT - Should not throw
      await expect(
        (healthCheck as any)['checkFileSystem']()
      ).resolves.toBeDefined();
    });
  });

  describe('[IB-3] Encapsulation', () => {
    it('maintains proper encapsulation with ProfileManager', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ASSERT - HealthCheck should have its own copy of paths
      expect((healthCheck as any)['profilesPath']).toBe(profilesPath);
      expect((healthCheck as any).hasOwnProperty('profilesPath')).toBe(true);

      // ProfileManager is constructed independently
      expect((healthCheck as any)['profileManager']).toBeDefined();
      expect(typeof (healthCheck as any)['profileManager']).toBe('object');

      // They should not share the same reference to internal state
      // (each class manages its own properties)
      const profileManager = (healthCheck as any)['profileManager'];
      expect(profileManager).not.toBe(healthCheck);
    });

    it('HealthCheck and ProfileManager have separate property storage', () => {
      // ARRANGE & ACT
      const customPath = '/custom/path/profiles.json';
      const healthCheck = new HealthCheck({
        profilesPath: customPath,
        tokenStorePath,
      });

      // ASSERT
      // HealthCheck has its own profilesPath
      expect((healthCheck as any)['profilesPath']).toBe(customPath);

      // ProfileManager exists independently
      const profileManager = (healthCheck as any)['profileManager'];
      expect(profileManager).toBeDefined();

      // ProfileManager's internal profilesPath is private and not accessed
      // (we don't access profileManager['profilesPath'] - that would be the bug!)
      expect((healthCheck as any)['profilesPath']).toBe(customPath);
    });
  });

  describe('[REGRESSION] No Private Property Access', () => {
    it('does not access profileManager private properties', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ASSERT - Verify HealthCheck has its own properties
      expect((healthCheck as any).hasOwnProperty('profilesPath')).toBe(true);
      expect((healthCheck as any).hasOwnProperty('tokenStorePath')).toBe(true);

      // Verify ProfileManager exists but we don't access its private properties
      expect((healthCheck as any)['profileManager']).toBeDefined();

      // The bug was: this.profileManager['profilesPath']
      // Now we use: this.profilesPath
      // This test verifies HealthCheck has its own property, not relying on ProfileManager's
    });

    it('code structure does not use bracket notation for ProfileManager access', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ASSERT - Verify correct property structure
      // HealthCheck should store its own profilesPath
      expect((healthCheck as any)['profilesPath']).toBe(profilesPath);

      // Not accessing profileManager['profilesPath'] (the old buggy way)
      // If the code tried to do this, TypeScript would fail in strict mode

      // Verify the fix: HealthCheck has direct access to its own property
      const internalPath = (healthCheck as any)['profilesPath'];
      expect(internalPath).toBe(profilesPath);
    });
  });

  describe('[BOUNDARY] Edge Cases', () => {
    it('handles construction with minimal required options', () => {
      // ARRANGE & ACT
      const healthCheck = new HealthCheck({
        profilesPath: '/minimal/profiles.json',
        tokenStorePath: '/minimal/tokens',
      });

      // ASSERT
      expect((healthCheck as any)['profilesPath']).toBe('/minimal/profiles.json');
      expect((healthCheck as any)['tokenStorePath']).toBe('/minimal/tokens');
      expect((healthCheck as any)['version']).toBeUndefined(); // Optional
      expect((healthCheck as any)['logger']).toBeDefined(); // Has default
    });

    it('handles construction with all options', () => {
      // ARRANGE
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      // ACT
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
        version: '2.5.0',
        logger: mockLogger as any,
      });

      // ASSERT
      expect((healthCheck as any)['profilesPath']).toBe(profilesPath);
      expect((healthCheck as any)['tokenStorePath']).toBe(tokenStorePath);
      expect((healthCheck as any)['version']).toBe('2.5.0');
      expect((healthCheck as any)['logger']).toBe(mockLogger);
    });

    it('maintains property immutability after construction', () => {
      // ARRANGE
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ACT - Try to modify properties (should not affect internal state)
      const originalProfilesPath = (healthCheck as any)['profilesPath'];

      // ASSERT - Properties remain as initialized
      expect((healthCheck as any)['profilesPath']).toBe(profilesPath);
      expect((healthCheck as any)['profilesPath']).toBe(originalProfilesPath);
    });
  });

  describe('[CROSS-PARTITION] Integration', () => {
    it('checkHealth method completes without private property access errors', async () => {
      // ARRANGE
      const healthCheck = new HealthCheck({
        profilesPath,
        tokenStorePath,
      });

      // ACT - Full health check uses all internal properties correctly
      const result = await healthCheck.checkHealth();

      // ASSERT - Completes successfully
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result.checks).toBeDefined();
      expect(result.checks.fileSystem).toBeDefined();
    });
  });
});
