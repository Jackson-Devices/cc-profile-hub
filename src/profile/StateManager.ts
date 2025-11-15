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
   * Uses a two-phase approach: save state first, then update profile.
   * If profile update fails, the state is left pointing to the new profile
   * (which is safe since the profile exists, just the timestamp wasn't updated).
   *
   * @throws {ValidationError} if profile doesn't exist
   */
  async switchTo(profileId: string): Promise<WrapperState> {
    // Verify profile exists first (will throw if not)
    const exists = await this.profileManager.exists(profileId);
    if (!exists) {
      // Let ProfileManager's updateLastUsed throw the proper error
      await this.profileManager.updateLastUsed(profileId);
    }

    // Save old state for potential rollback
    const oldState = await this.loadState();

    // Create new state
    const newState: WrapperState = {
      currentProfileId: profileId,
      lastSwitchedAt: new Date(),
    };

    try {
      // Phase 1: Save state first
      await this.saveState(newState);

      // Phase 2: Update profile's lastUsedAt
      // If this fails, state is still valid (points to existing profile)
      await this.profileManager.updateLastUsed(profileId);

      return newState;
    } catch (error) {
      // Rollback state on failure
      try {
        await this.saveState(oldState);
      } catch {
        // If rollback fails, log but don't throw (original error is more important)
        // In production, this should be logged
      }
      throw error;
    }
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
