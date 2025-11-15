import { readFile } from 'fs/promises';
import * as lockfile from 'proper-lockfile';
import { ProfileRecord, ProfileRecordSchema, ProfileConfig } from './ProfileTypes';
import { atomicWrite } from '../utils/atomicWrite';
import { ValidationError } from '../errors/ValidationError';
import {
  validateProfileId,
  validatePath,
  validateAuth0Domain,
  validateAuth0ClientId,
} from '../utils/InputValidator';
import { RateLimiter } from '../utils/RateLimiter';

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
 * All operations are protected by file-based locking to prevent race conditions.
 */
const MAX_PROFILES = 1000;

export class ProfileManager {
  private readonly lockPath: string;
  private readonly rateLimiter: RateLimiter;

  constructor(private readonly profilesPath: string) {
    this.lockPath = `${profilesPath}.lock`;

    // Rate limit: 20 operations per second with burst capacity of 50
    this.rateLimiter = new RateLimiter({
      maxTokens: 50,
      refillRate: 20,
      refillInterval: 1000,
    });
  }

  /**
   * Ensure profiles file exists before locking.
   * Safe to call concurrently - errors are ignored if file is created by another process.
   */
  private async ensureProfilesFile(): Promise<void> {
    try {
      await readFile(this.profilesPath);
    } catch {
      // File doesn't exist, create empty profiles file
      try {
        await atomicWrite(this.profilesPath, JSON.stringify({ profiles: {} }));
      } catch {
        // Ignore errors - another process may have created the file concurrently
        // Verify file now exists
        await readFile(this.profilesPath);
      }
    }
  }

  /**
   * Execute an operation with file locking to prevent concurrent access.
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    // Ensure file exists before acquiring lock
    await this.ensureProfilesFile();

    const release = await lockfile.lock(this.profilesPath, {
      retries: {
        retries: 50,
        minTimeout: 100,
        maxTimeout: 2000,
      },
      stale: 30000, // Consider lock stale after 30 seconds
    });

    try {
      return await operation();
    } finally {
      await release();
    }
  }

  /**
   * Create a new profile.
   * @throws {ValidationError} if profile with same ID already exists or max profiles limit reached
   * @throws {RateLimitError} if rate limit exceeded
   */
  async create(
    profileId: string,
    config: ProfileConfig
  ): Promise<ProfileRecord> {
    // Rate limiting check
    await this.rateLimiter.consume(1);

    // Validate all inputs before proceeding
    validateProfileId(profileId);
    validateAuth0Domain(config.auth0Domain);
    validateAuth0ClientId(config.auth0ClientId);
    validatePath(config.tokenStorePath);

    return this.withLock(async () => {
      const storage = await this.loadStorage();

      if (storage.profiles[profileId]) {
        throw new ValidationError('Profile already exists');
      }

      // Enforce max profiles limit
      const profileCount = Object.keys(storage.profiles).length;
      if (profileCount >= MAX_PROFILES) {
        throw new ValidationError(
          `Cannot create profile: maximum of ${MAX_PROFILES} profiles reached`,
          {
            currentCount: profileCount,
            maxProfiles: MAX_PROFILES,
          }
        );
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
    });
  }

  /**
   * Read a profile by ID.
   * @returns The profile record, or null if not found
   */
  async read(profileId: string): Promise<ProfileRecord | null> {
    return this.withLock(async () => {
      const storage = await this.loadStorage();
      return storage.profiles[profileId] || null;
    });
  }

  /**
   * List all profiles, sorted alphabetically by ID.
   */
  async list(): Promise<ProfileRecord[]> {
    return this.withLock(async () => {
      const storage = await this.loadStorage();
      const profiles = Object.values(storage.profiles);
      return profiles.sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  /**
   * Update a profile's configuration.
   * @throws {ValidationError} if profile not found
   * @throws {RateLimitError} if rate limit exceeded
   */
  async update(
    profileId: string,
    updates: ProfileUpdate
  ): Promise<ProfileRecord> {
    // Rate limiting check
    await this.rateLimiter.consume(1);

    return this.withLock(async () => {
      const storage = await this.loadStorage();
      const existing = storage.profiles[profileId];

      if (!existing) {
        throw new ValidationError('Profile not found');
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
    });
  }

  /**
   * Delete a profile.
   * @throws {ValidationError} if profile not found
   * @throws {RateLimitError} if rate limit exceeded
   */
  async delete(profileId: string): Promise<void> {
    // Rate limiting check
    await this.rateLimiter.consume(1);

    return this.withLock(async () => {
      const storage = await this.loadStorage();

      if (!storage.profiles[profileId]) {
        throw new ValidationError('Profile not found');
      }

      delete storage.profiles[profileId];
      await this.saveStorage(storage);
    });
  }

  /**
   * Update the lastUsedAt timestamp for a profile.
   * @throws {ValidationError} if profile not found
   */
  async updateLastUsed(profileId: string): Promise<ProfileRecord> {
    return this.withLock(async () => {
      const storage = await this.loadStorage();
      const existing = storage.profiles[profileId];

      if (!existing) {
        throw new ValidationError('Profile not found');
      }

      const updated: ProfileRecord = {
        ...existing,
        lastUsedAt: new Date(),
      };

      storage.profiles[profileId] = updated;
      await this.saveStorage(storage);

      return updated;
    });
  }

  /**
   * Check if a profile exists.
   */
  async exists(profileId: string): Promise<boolean> {
    return this.withLock(async () => {
      const storage = await this.loadStorage();
      return profileId in storage.profiles;
    });
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
