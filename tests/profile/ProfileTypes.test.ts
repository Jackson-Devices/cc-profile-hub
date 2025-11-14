import {
  ProfileRecord,
  ProfileRecordSchema,
  WrapperState,
  WrapperStateSchema,
  ProfileConfig,
} from '../../src/profile/ProfileTypes';

describe('ProfileTypes', () => {
  describe('ProfileRecord', () => {
    it('should validate a complete profile record', () => {
      const record: ProfileRecord = {
        id: 'work',
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        encryptionPassphrase: 'secret123',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        lastUsedAt: new Date('2025-01-03T00:00:00Z'),
      };

      const result = ProfileRecordSchema.parse(record);
      expect(result).toEqual(record);
    });

    it('should validate a profile record without optional fields', () => {
      const record: ProfileRecord = {
        id: 'personal',
        auth0Domain: 'personal.auth0.com',
        auth0ClientId: 'client456',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      };

      const result = ProfileRecordSchema.parse(record);
      expect(result).toEqual(record);
      expect(result.encryptionPassphrase).toBeUndefined();
      expect(result.lastUsedAt).toBeUndefined();
    });

    it('should reject invalid profile IDs', () => {
      const record = {
        id: '', // Empty ID
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => ProfileRecordSchema.parse(record)).toThrow();
    });

    it('should reject invalid dates', () => {
      const record = {
        id: 'work',
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: 'not-a-date',
        updatedAt: new Date(),
      };

      expect(() => ProfileRecordSchema.parse(record)).toThrow();
    });

    it('should convert string dates to Date objects', () => {
      const record = {
        id: 'work',
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
        lastUsedAt: '2025-01-03T00:00:00Z',
      };

      const result = ProfileRecordSchema.parse(record);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  describe('WrapperState', () => {
    it('should validate wrapper state with active profile', () => {
      const state: WrapperState = {
        currentProfileId: 'work',
        lastSwitchedAt: new Date('2025-01-01T12:00:00Z'),
      };

      const result = WrapperStateSchema.parse(state);
      expect(result).toEqual(state);
    });

    it('should validate wrapper state with no active profile', () => {
      const state: WrapperState = {
        currentProfileId: null,
      };

      const result = WrapperStateSchema.parse(state);
      expect(result).toEqual(state);
      expect(result.currentProfileId).toBeNull();
      expect(result.lastSwitchedAt).toBeUndefined();
    });

    it('should reject invalid profile ID', () => {
      const state = {
        currentProfileId: '',
      };

      expect(() => WrapperStateSchema.parse(state)).toThrow();
    });

    it('should convert string dates to Date objects', () => {
      const state = {
        currentProfileId: 'work',
        lastSwitchedAt: '2025-01-01T12:00:00Z',
      };

      const result = WrapperStateSchema.parse(state);
      expect(result.lastSwitchedAt).toBeInstanceOf(Date);
    });
  });

  describe('ProfileConfig', () => {
    it('should extract config from profile record', () => {
      const record: ProfileRecord = {
        id: 'work',
        auth0Domain: 'company.auth0.com',
        auth0ClientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        encryptionPassphrase: 'secret123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const config: ProfileConfig = {
        auth0Domain: record.auth0Domain,
        auth0ClientId: record.auth0ClientId,
        tokenStorePath: record.tokenStorePath,
        encryptionPassphrase: record.encryptionPassphrase,
      };

      expect(config.auth0Domain).toBe('company.auth0.com');
      expect(config.auth0ClientId).toBe('client123');
      expect(config.tokenStorePath).toBe('/home/user/.claude/tokens');
      expect(config.encryptionPassphrase).toBe('secret123');
    });

    it('should handle missing optional fields', () => {
      const record: ProfileRecord = {
        id: 'personal',
        auth0Domain: 'personal.auth0.com',
        auth0ClientId: 'client456',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const config: ProfileConfig = {
        auth0Domain: record.auth0Domain,
        auth0ClientId: record.auth0ClientId,
        tokenStorePath: record.tokenStorePath,
      };

      expect(config.encryptionPassphrase).toBeUndefined();
    });
  });
});
