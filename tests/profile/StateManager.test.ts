import { StateManager } from '../../src/profile/StateManager';
import { ProfileManager } from '../../src/profile/ProfileManager';
import { WrapperState } from '../../src/profile/ProfileTypes';
import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('StateManager', () => {
  let tempDir: string;
  let statePath: string;
  let profilesPath: string;
  let stateManager: StateManager;
  let profileManager: ProfileManager;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(tmpdir(), `state-test-${Date.now()}-${Math.random()}`);
    await mkdir(tempDir, { recursive: true });
    statePath = join(tempDir, 'state.json');
    profilesPath = join(tempDir, 'profiles.json');

    profileManager = new ProfileManager(profilesPath);
    stateManager = new StateManager(statePath, profileManager);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getCurrentProfile', () => {
    it('should return null when no profile is active', async () => {
      const current = await stateManager.getCurrentProfile();
      expect(current).toBeNull();
    });

    it('should return current active profile ID', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');

      const current = await stateManager.getCurrentProfile();
      expect(current).toBe('work');
    });

    it('should handle missing state file', async () => {
      const newStateManager = new StateManager(
        join(tempDir, 'nonexistent.json'),
        profileManager
      );

      const current = await newStateManager.getCurrentProfile();
      expect(current).toBeNull();
    });
  });

  describe('getState', () => {
    it('should return complete state', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');

      const state = await stateManager.getState();
      expect(state.currentProfileId).toBe('work');
      expect(state.lastSwitchedAt).toBeInstanceOf(Date);
    });

    it('should return null state when no profile active', async () => {
      const state = await stateManager.getState();
      expect(state.currentProfileId).toBeNull();
      expect(state.lastSwitchedAt).toBeUndefined();
    });
  });

  describe('switchTo', () => {
    it('should switch to a valid profile', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const state = await stateManager.switchTo('work');

      expect(state.currentProfileId).toBe('work');
      expect(state.lastSwitchedAt).toBeInstanceOf(Date);
    });

    it('should persist state to disk', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');

      const fileContent = await readFile(statePath, 'utf-8');
      const data: WrapperState = JSON.parse(fileContent);
      expect(data.currentProfileId).toBe('work');
    });

    it('should update lastUsedAt in profile', async () => {
      const created = await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      expect(created.lastUsedAt).toBeUndefined();

      await new Promise((resolve) => setTimeout(resolve, 10));
      await stateManager.switchTo('work');

      const profile = await profileManager.read('work');
      expect(profile?.lastUsedAt).toBeInstanceOf(Date);
      expect(profile!.lastUsedAt!.getTime()).toBeGreaterThan(
        created.createdAt.getTime()
      );
    });

    it('should throw error when switching to non-existent profile', async () => {
      await expect(stateManager.switchTo('nonexistent')).rejects.toThrow(
        'Profile with ID "nonexistent" not found'
      );
    });

    it('should allow switching between profiles', async () => {
      await profileManager.create('work', {
        auth0Domain: 'work.auth0.com',
        auth0ClientId: 'work123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await profileManager.create('personal', {
        auth0Domain: 'personal.auth0.com',
        auth0ClientId: 'personal456',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');
      let current = await stateManager.getCurrentProfile();
      expect(current).toBe('work');

      await stateManager.switchTo('personal');
      current = await stateManager.getCurrentProfile();
      expect(current).toBe('personal');
    });

    it('should update lastSwitchedAt on each switch', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      const state1 = await stateManager.switchTo('work');
      const time1 = state1.lastSwitchedAt!.getTime();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const state2 = await stateManager.switchTo('work');
      const time2 = state2.lastSwitchedAt!.getTime();

      expect(time2).toBeGreaterThan(time1);
    });
  });

  describe('clearProfile', () => {
    it('should clear current profile', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');
      expect(await stateManager.getCurrentProfile()).toBe('work');

      await stateManager.clearProfile();
      expect(await stateManager.getCurrentProfile()).toBeNull();
    });

    it('should persist cleared state to disk', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');
      await stateManager.clearProfile();

      const fileContent = await readFile(statePath, 'utf-8');
      const data: WrapperState = JSON.parse(fileContent);
      expect(data.currentProfileId).toBeNull();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await stateManager.clearProfile();
      await stateManager.clearProfile();

      const current = await stateManager.getCurrentProfile();
      expect(current).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle corrupted state file', async () => {
      // Write invalid JSON
      const fs = await import('fs/promises');
      await fs.writeFile(statePath, 'invalid json{{{', 'utf-8');

      const current = await stateManager.getCurrentProfile();
      expect(current).toBeNull();
    });

    it('should recover from corrupted file on write', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      // Write invalid JSON
      const fs = await import('fs/promises');
      await fs.writeFile(statePath, 'invalid json{{{', 'utf-8');

      // Should successfully switch profile
      await stateManager.switchTo('work');

      const current = await stateManager.getCurrentProfile();
      expect(current).toBe('work');
    });
  });

  describe('atomic operations', () => {
    it('should use atomic write for state persistence', async () => {
      await profileManager.create('work', {
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
      });

      await stateManager.switchTo('work');

      // Verify no temp file left behind
      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });
  });
});
