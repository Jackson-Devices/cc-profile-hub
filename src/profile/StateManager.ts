import { readFile } from 'fs/promises';
import { WrapperState, WrapperStateSchema } from './ProfileTypes';
import { ProfileManager } from './ProfileManager';
import { atomicWrite } from '../utils/atomicWrite';

/**
 * Manages wrapper state (current active profile) with atomic operations.
 * Works in conjunction with ProfileManager to track profile usage.
 */
export class StateManager {
  constructor(
    private readonly statePath: string,
    private readonly profileManager: ProfileManager
  ) {}

  /**
   * Get the current active profile ID.
   * @returns The profile ID, or null if no profile is active
   */
  async getCurrentProfile(): Promise<string | null> {
    const state = await this.loadState();
    return state.currentProfileId;
  }

  /**
   * Get the complete wrapper state.
   */
  async getState(): Promise<WrapperState> {
    return await this.loadState();
  }

  /**
   * Switch to a different profile atomically.
   * Updates both state and the profile's lastUsedAt timestamp.
   * @throws {ValidationError} if profile doesn't exist
   */
  async switchTo(profileId: string): Promise<WrapperState> {
    // Verify profile exists (will throw if not)
    const exists = await this.profileManager.exists(profileId);
    if (!exists) {
      // Let ProfileManager's updateLastUsed throw the proper error
      await this.profileManager.updateLastUsed(profileId);
    }

    // Update profile's lastUsedAt
    await this.profileManager.updateLastUsed(profileId);

    // Update state
    const newState: WrapperState = {
      currentProfileId: profileId,
      lastSwitchedAt: new Date(),
    };

    await this.saveState(newState);

    return newState;
  }

  /**
   * Clear the current profile (set to null).
   */
  async clearProfile(): Promise<void> {
    const newState: WrapperState = {
      currentProfileId: null,
    };

    await this.saveState(newState);
  }

  /**
   * Load state from disk.
   * Returns default state if file doesn't exist or is corrupted.
   */
  private async loadState(): Promise<WrapperState> {
    try {
      const content = await readFile(this.statePath, 'utf-8');
      const data: unknown = JSON.parse(content);

      // Validate with Zod schema
      return WrapperStateSchema.parse(data);
    } catch {
      // File doesn't exist or is corrupted, return default state
      return {
        currentProfileId: null,
      };
    }
  }

  /**
   * Save state to disk using atomic write.
   */
  private async saveState(state: WrapperState): Promise<void> {
    const content = JSON.stringify(state, null, 2);
    await atomicWrite(this.statePath, content);
  }
}
