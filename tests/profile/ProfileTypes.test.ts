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
        name: 'Work Profile',
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client123',
        clientSecret: 'secret456',
        scopes: ['user:inference'],
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
      const record = {
        id: 'personal',
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client456',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      };

      const result = ProfileRecordSchema.parse(record);
      expect(result.id).toBe('personal');
      expect(result.tokenUrl).toBe('https://api.anthropic.com/v1/oauth/token');
      expect(result.clientId).toBe('client456');
      expect(result.scopes).toEqual(['user:inference']); // Default value
      expect(result.encryptionPassphrase).toBeUndefined();
      expect(result.lastUsedAt).toBeUndefined();
      expect(result.name).toBeUndefined();
      expect(result.clientSecret).toBeUndefined();
    });

    it('should reject invalid profile IDs', () => {
      const record = {
        id: '', // Empty ID
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => ProfileRecordSchema.parse(record)).toThrow();
    });

    it('should reject invalid dates', () => {
      const record = {
        id: 'work',
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client123',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: 'not-a-date',
        updatedAt: new Date(),
      };

      expect(() => ProfileRecordSchema.parse(record)).toThrow();
    });

    it('should convert string dates to Date objects', () => {
      const record = {
        id: 'work',
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client123',
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
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client123',
        clientSecret: 'secret456',
        scopes: ['user:inference'],
        tokenStorePath: '/home/user/.claude/tokens',
        encryptionPassphrase: 'secret123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const config: ProfileConfig = {
        tokenUrl: record.tokenUrl,
        clientId: record.clientId,
        clientSecret: record.clientSecret,
        scopes: record.scopes,
        tokenStorePath: record.tokenStorePath,
        encryptionPassphrase: record.encryptionPassphrase,
      };

      expect(config.tokenUrl).toBe('https://api.anthropic.com/v1/oauth/token');
      expect(config.clientId).toBe('client123');
      expect(config.clientSecret).toBe('secret456');
      expect(config.scopes).toEqual(['user:inference']);
      expect(config.tokenStorePath).toBe('/home/user/.claude/tokens');
      expect(config.encryptionPassphrase).toBe('secret123');
    });

    it('should handle missing optional fields', () => {
      const inputRecord = {
        id: 'personal',
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'client456',
        tokenStorePath: '/home/user/.claude/tokens',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Validate and parse - scopes should get default value
      const record = ProfileRecordSchema.parse(inputRecord);
      expect(record.scopes).toEqual(['user:inference']); // Default value applied
      expect(record.encryptionPassphrase).toBeUndefined();
      expect(record.clientSecret).toBeUndefined();
      expect(record.lastUsedAt).toBeUndefined();
      expect(record.name).toBeUndefined();
    });
  });
});
