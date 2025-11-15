import { HealthCheck } from '../../src/health/HealthCheck';
import { ProfileManager } from '../../src/profile/ProfileManager';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

describe('HealthCheck', () => {
  let tempDir: string;
  let profilesPath: string;
  let tokenStorePath: string;
  let healthCheck: HealthCheck;

  beforeEach(async () => {
    tempDir = `/tmp/health-check-test-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });

    profilesPath = join(tempDir, 'profiles.json');
    tokenStorePath = join(tempDir, 'tokens');
    await mkdir(tokenStorePath, { recursive: true });

    healthCheck = new HealthCheck({
      profilesPath,
      tokenStorePath,
      version: '1.0.0-test',
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('checkHealth', () => {
    it('should return healthy status when all components are healthy', async () => {
      const health = await healthCheck.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeLessThanOrEqual(Date.now());
      expect(health.version).toBe('1.0.0-test');
      expect(health.uptimeMs).toBeGreaterThan(0);
    });

    it('should include all component checks', async () => {
      const health = await healthCheck.checkHealth();

      expect(health.checks).toHaveProperty('profiles');
      expect(health.checks).toHaveProperty('tokenStore');
      expect(health.checks).toHaveProperty('fileSystem');
    });

    it('should provide response times for each check', async () => {
      const health = await healthCheck.checkHealth();

      expect(health.checks.profiles.responseTimeMs).toBeGreaterThan(0);
      expect(health.checks.tokenStore.responseTimeMs).toBeGreaterThan(0);
      expect(health.checks.fileSystem.responseTimeMs).toBeGreaterThan(0);
    });

    it('should include profile count in metadata', async () => {
      // Create some profiles
      const manager = new ProfileManager(profilesPath);
      await manager.create('profile1', {
        auth0Domain: 'domain1.auth0.com',
        auth0ClientId: 'client1',
        tokenStorePath: '/home/user/tokens',
      });
      await manager.create('profile2', {
        auth0Domain: 'domain2.auth0.com',
        auth0ClientId: 'client2',
        tokenStorePath: '/home/user/tokens',
      });

      const health = await healthCheck.checkHealth();

      expect(health.checks.profiles.status).toBe('healthy');
      expect(health.checks.profiles.metadata?.profileCount).toBe(2);
    });

    it('should return unhealthy status when profiles are inaccessible', async () => {
      // Delete the temp directory to make it inaccessible
      await rm(tempDir, { recursive: true, force: true });

      const health = await healthCheck.checkHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.profiles.status).toBe('unhealthy');
      expect(health.checks.profiles.message).toContain('Failed to access profiles');
    });
  });

  describe('checkLiveness', () => {
    it('should return true if process is running', async () => {
      const isAlive = await healthCheck.checkLiveness();

      expect(isAlive).toBe(true);
    });
  });

  describe('checkReadiness', () => {
    it('should return true when all components are healthy', async () => {
      const isReady = await healthCheck.checkReadiness();

      expect(isReady).toBe(true);
    });

    it('should return false when any component is unhealthy', async () => {
      // Make system unhealthy by removing directories
      await rm(tempDir, { recursive: true, force: true });

      const isReady = await healthCheck.checkReadiness();

      expect(isReady).toBe(false);
    });
  });

  describe('uptime tracking', () => {
    it('should track uptime from construction', async () => {
      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      const health = await healthCheck.checkHealth();

      expect(health.uptimeMs).toBeGreaterThanOrEqual(50);
    });
  });
});
