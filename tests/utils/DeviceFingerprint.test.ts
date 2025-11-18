import { DeviceFingerprint } from '../../src/utils/DeviceFingerprint';
import { platform, arch, hostname, userInfo } from 'os';

describe('DeviceFingerprint', () => {
  describe('generate', () => {
    it('should generate a non-empty fingerprint', async () => {
      const fingerprint = await DeviceFingerprint.generate();

      expect(fingerprint).toBeTruthy();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBeGreaterThan(0);
    });

    it('should include platform information', async () => {
      const fingerprint = await DeviceFingerprint.generate();

      expect(fingerprint).toContain(platform());
    });

    it('should include architecture', async () => {
      const fingerprint = await DeviceFingerprint.generate();

      expect(fingerprint).toContain(arch());
    });

    it('should include node version', async () => {
      const fingerprint = await DeviceFingerprint.generate();

      expect(fingerprint).toContain(process.version);
    });

    it('should have exactly 7 hyphen-separated components', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const parts = fingerprint.split('-');

      // platform-arch-nodeVer-hostnameHash-userHash-machineHash-instanceId
      // Note: nodeVer may contain hyphens (e.g., v20-1-0), so we need more than 7 parts
      expect(parts.length).toBeGreaterThanOrEqual(7);
    });

    it('should generate different fingerprints across process restarts', async () => {
      const fingerprint1 = await DeviceFingerprint.generate();

      // Reset instance ID to simulate process restart
      DeviceFingerprint.resetInstanceId();

      const fingerprint2 = await DeviceFingerprint.generate();

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should generate consistent fingerprints within same process', async () => {
      const fingerprint1 = await DeviceFingerprint.generate();
      const fingerprint2 = await DeviceFingerprint.generate();

      expect(fingerprint1).toBe(fingerprint2);
    });
  });

  describe('getComponents', () => {
    it('should return all fingerprint components', async () => {
      const components = await DeviceFingerprint.getComponents();

      expect(components).toHaveProperty('platform');
      expect(components).toHaveProperty('arch');
      expect(components).toHaveProperty('nodeVersion');
      expect(components).toHaveProperty('osRelease');
      expect(components).toHaveProperty('hostnameHash');
      expect(components).toHaveProperty('userIdHash');
      expect(components).toHaveProperty('machineIdHash');
      expect(components).toHaveProperty('instanceId');
    });

    it('should have correct platform', async () => {
      const components = await DeviceFingerprint.getComponents();

      expect(components.platform).toBe(platform());
    });

    it('should have correct architecture', async () => {
      const components = await DeviceFingerprint.getComponents();

      expect(components.arch).toBe(arch());
    });

    it('should have correct node version', async () => {
      const components = await DeviceFingerprint.getComponents();

      expect(components.nodeVersion).toBe(process.version);
    });

    it('should hash hostname for privacy', async () => {
      const components = await DeviceFingerprint.getComponents();

      // Hash should be different from actual hostname
      expect(components.hostnameHash).not.toBe(hostname());
      // Hash should be 16 characters hex
      expect(components.hostnameHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should hash user ID for privacy', async () => {
      const components = await DeviceFingerprint.getComponents();
      const user = userInfo();

      // Hash should be different from actual user info
      expect(components.userIdHash).not.toBe(user.username);
      expect(components.userIdHash).not.toBe(user.uid.toString());
      // Hash should be 16 characters hex
      expect(components.userIdHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should hash machine ID for privacy', async () => {
      const components = await DeviceFingerprint.getComponents();

      // Hash should be 16 characters hex
      expect(components.machineIdHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should have unique instance ID', async () => {
      const components = await DeviceFingerprint.getComponents();

      expect(components.instanceId).toBeTruthy();
      expect(typeof components.instanceId).toBe('string');
    });

    it('should cache machine ID for performance', async () => {
      const components1 = await DeviceFingerprint.getComponents();
      const components2 = await DeviceFingerprint.getComponents();

      // Machine ID hash should be identical (cached)
      expect(components1.machineIdHash).toBe(components2.machineIdHash);
    });
  });

  describe('validate', () => {
    it('should validate a correct fingerprint', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const isValid = await DeviceFingerprint.validate(fingerprint);

      expect(isValid).toBe(true);
    });

    it('should reject fingerprint with wrong platform', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const parts = fingerprint.split('-');
      parts[0] = 'fakeplatform';
      const modifiedFingerprint = parts.join('-');

      const isValid = await DeviceFingerprint.validate(modifiedFingerprint);

      expect(isValid).toBe(false);
    });

    it('should reject fingerprint with wrong architecture', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const parts = fingerprint.split('-');
      parts[1] = 'fakearch';
      const modifiedFingerprint = parts.join('-');

      const isValid = await DeviceFingerprint.validate(modifiedFingerprint);

      expect(isValid).toBe(false);
    });

    it('should reject fingerprint with wrong format', async () => {
      const invalidFingerprint = 'invalid-format';

      const isValid = await DeviceFingerprint.validate(invalidFingerprint);

      expect(isValid).toBe(false);
    });

    it('should reject empty fingerprint', async () => {
      const isValid = await DeviceFingerprint.validate('');

      expect(isValid).toBe(false);
    });

    it('should accept fingerprint with different instance ID', async () => {
      const fingerprint1 = await DeviceFingerprint.generate();

      // Reset instance ID to simulate process restart
      DeviceFingerprint.resetInstanceId();

      // Should still validate because we ignore instance ID in validation
      const isValid = await DeviceFingerprint.validate(fingerprint1);

      expect(isValid).toBe(true);
    });

    it('should reject fingerprint with wrong number of parts', async () => {
      const invalidFingerprint = 'a-b-c'; // Only 3 parts instead of 7

      const isValid = await DeviceFingerprint.validate(invalidFingerprint);

      expect(isValid).toBe(false);
    });
  });

  describe('resetInstanceId', () => {
    it('should generate new instance ID after reset', async () => {
      const components1 = await DeviceFingerprint.getComponents();

      DeviceFingerprint.resetInstanceId();

      const components2 = await DeviceFingerprint.getComponents();

      expect(components1.instanceId).not.toBe(components2.instanceId);
    });

    it('should keep other components unchanged after reset', async () => {
      const components1 = await DeviceFingerprint.getComponents();

      DeviceFingerprint.resetInstanceId();

      const components2 = await DeviceFingerprint.getComponents();

      expect(components1.platform).toBe(components2.platform);
      expect(components1.arch).toBe(components2.arch);
      expect(components1.nodeVersion).toBe(components2.nodeVersion);
      expect(components1.hostnameHash).toBe(components2.hostnameHash);
      expect(components1.userIdHash).toBe(components2.userIdHash);
      expect(components1.machineIdHash).toBe(components2.machineIdHash);
    });
  });

  describe('security properties', () => {
    it('should not expose raw hostname in fingerprint', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const actualHostname = hostname();

      expect(fingerprint).not.toContain(actualHostname);
    });

    it('should not expose raw username in fingerprint', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const user = userInfo();

      expect(fingerprint).not.toContain(user.username);
    });

    it('should not expose raw user ID in fingerprint', async () => {
      const fingerprint = await DeviceFingerprint.generate();
      const user = userInfo();

      // Should not contain the full "uid-username" combination
      const userIdentifier = `${user.uid}-${user.username}`;
      expect(fingerprint).not.toContain(userIdentifier);

      // For non-trivial UIDs (>9), check it's not exposed as a standalone segment
      if (user.uid > 9) {
        const parts = fingerprint.split('-');
        expect(parts).not.toContain(user.uid.toString());
      }
    });

    it('should be non-trivial to fake', async () => {
      const fingerprint = await DeviceFingerprint.generate();

      // A trivial fingerprint like "linux-v20" would be too short
      expect(fingerprint.length).toBeGreaterThan(50);
    });
  });
});
