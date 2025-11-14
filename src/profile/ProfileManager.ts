import { readFile } from 'fs/promises';
import { ProfileRecord, ProfileRecordSchema, ProfileConfig } from './ProfileTypes';
import { atomicWrite } from '../utils/atomicWrite';
import { ValidationError } from '../errors/ValidationError';

/**
 * Storage structure for profiles on disk.
 */
interface ProfilesStorage {
  profiles: Record<string, ProfileRecord>;
}

/**
 * Partial update to a profile configuration.
 */
export type ProfileUpdate = Partial<Omit<ProfileConfig, 'id'>>;

/**
 * Manages profile CRUD operations with persistent storage.
 * Profiles are stored in a JSON file with atomic writes.
 */
export class ProfileManager {
  constructor(private readonly profilesPath: string) {}

  /**
   * Create a new profile.
   * @throws {ValidationError} if profile with same ID already exists
   */
  async create(
    profileId: string,
    config: ProfileConfig
  ): Promise<ProfileRecord> {
    const storage = await this.loadStorage();

    if (storage.profiles[profileId]) {
      throw new ValidationError(`Profile with ID "${profileId}" already exists`, {
        profileId,
      });
    }

    const now = new Date();
    const profile: ProfileRecord = {
      id: profileId,
      auth0Domain: config.auth0Domain,
      auth0ClientId: config.auth0ClientId,
      tokenStorePath: config.tokenStorePath,
      encryptionPassphrase: config.encryptionPassphrase,
      createdAt: now,
      updatedAt: now,
    };

    storage.profiles[profileId] = profile;
    await this.saveStorage(storage);

    return profile;
  }

  /**
   * Read a profile by ID.
   * @returns The profile record, or null if not found
   */
  async read(profileId: string): Promise<ProfileRecord | null> {
    const storage = await this.loadStorage();
    return storage.profiles[profileId] || null;
  }

  /**
   * List all profiles, sorted alphabetically by ID.
   */
  async list(): Promise<ProfileRecord[]> {
    const storage = await this.loadStorage();
    const profiles = Object.values(storage.profiles);
    return profiles.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Update a profile's configuration.
   * @throws {ValidationError} if profile not found
   */
  async update(
    profileId: string,
    updates: ProfileUpdate
  ): Promise<ProfileRecord> {
    const storage = await this.loadStorage();
    const existing = storage.profiles[profileId];

    if (!existing) {
      throw new ValidationError(`Profile with ID "${profileId}" not found`, {
        profileId,
      });
    }

    const updated: ProfileRecord = {
      ...existing,
      ...updates,
      id: profileId, // ID cannot be changed
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: new Date(),
    };

    storage.profiles[profileId] = updated;
    await this.saveStorage(storage);

    return updated;
  }

  /**
   * Delete a profile.
   * @throws {ValidationError} if profile not found
   */
  async delete(profileId: string): Promise<void> {
    const storage = await this.loadStorage();

    if (!storage.profiles[profileId]) {
      throw new ValidationError(`Profile with ID "${profileId}" not found`, {
        profileId,
      });
    }

    delete storage.profiles[profileId];
    await this.saveStorage(storage);
  }

  /**
   * Update the lastUsedAt timestamp for a profile.
   * @throws {ValidationError} if profile not found
   */
  async updateLastUsed(profileId: string): Promise<ProfileRecord> {
    const storage = await this.loadStorage();
    const existing = storage.profiles[profileId];

    if (!existing) {
      throw new ValidationError(`Profile with ID "${profileId}" not found`, {
        profileId,
      });
    }

    const updated: ProfileRecord = {
      ...existing,
      lastUsedAt: new Date(),
    };

    storage.profiles[profileId] = updated;
    await this.saveStorage(storage);

    return updated;
  }

  /**
   * Check if a profile exists.
   */
  async exists(profileId: string): Promise<boolean> {
    const storage = await this.loadStorage();
    return profileId in storage.profiles;
  }

  /**
   * Load profiles from disk.
   * Returns empty storage if file doesn't exist or is corrupted.
   */
  private async loadStorage(): Promise<ProfilesStorage> {
    try {
      const content = await readFile(this.profilesPath, 'utf-8');
      const data: unknown = JSON.parse(content);

      // Validate structure
      if (
        typeof data === 'object' &&
        data !== null &&
        'profiles' in data &&
        typeof data.profiles === 'object' &&
        data.profiles !== null
      ) {
        // Validate each profile record
        const profiles: Record<string, ProfileRecord> = {};
        for (const [id, profile] of Object.entries(data.profiles)) {
          try {
            profiles[id] = ProfileRecordSchema.parse(profile);
          } catch {
            // Skip invalid profile records
            continue;
          }
        }

        return { profiles };
      }

      // Invalid structure, return empty
      return { profiles: {} };
    } catch (error) {
      // File doesn't exist or is corrupted, return empty storage
      return { profiles: {} };
    }
  }

  /**
   * Save profiles to disk using atomic write.
   */
  private async saveStorage(storage: ProfilesStorage): Promise<void> {
    const content = JSON.stringify(storage, null, 2);
    await atomicWrite(this.profilesPath, content);
  }
}
