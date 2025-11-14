# GH-06: Profile Manager + CLI Commands

**Parent**: #1 (Project Blueprint)
**Depends On**: #4 (GH-02 Config), #5 (GH-03 Token Store)
**Unblocks**: #10 (GH-08 Integration)
**External Dependencies**: `commander` (CLI parsing)

---

## Overview

Implements multi-profile management with CRUD operations, atomic profile switching, audit logging, and CLI commands. Provides both programmatic API and user-facing CLI interface.

**Key Features**:
- CRUD operations (list, add, update, delete profiles)
- Atomic profile switching with validation
- Audit log with rotation
- CLI commands: `claude-profiles list/add/switch/status`
- JSON output mode for automation
- Profile metadata (lastUsed, nickname, email)

---

## TDD Workflow (12 Atomic Commits)

### Commit 1: Profile CRUD Test (RED)
**Message**: `test(profiles): add profile CRUD tests`

**Files Changed**:
- `tests/profiles/ProfileManager.test.ts` (new)

**Code**:
```typescript
import { ProfileManager } from '../../src/profiles/ProfileManager';
import { ProfileRecord } from '../../src/profiles/types';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ProfileManager CRUD', () => {
  let profileManager: ProfileManager;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `profiles-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    profileManager = new ProfileManager(tempDir);
  });

  it('should create new profile', async () => {
    const profile: Omit<ProfileRecord, 'id' | 'lastUsed'> = {
      nickname: 'Work',
      email: 'work@example.com',
      storageBackend: 'os-store',
      metadata: {}
    };

    const created = await profileManager.create(profile);

    expect(created).toMatchObject({
      nickname: 'Work',
      email: 'work@example.com',
      id: expect.any(String),
      lastUsed: expect.any(Number)
    });
  });

  it('should list all profiles', async () => {
    await profileManager.create({
      nickname: 'Profile1',
      email: 'p1@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    await profileManager.create({
      nickname: 'Profile2',
      email: 'p2@example.com',
      storageBackend: 'file',
      metadata: {}
    });

    const profiles = await profileManager.list();

    expect(profiles).toHaveLength(2);
    expect(profiles[0].nickname).toBe('Profile1');
    expect(profiles[1].nickname).toBe('Profile2');
  });

  it('should get profile by id', async () => {
    const created = await profileManager.create({
      nickname: 'Test',
      email: 'test@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const fetched = await profileManager.get(created.id);

    expect(fetched).toEqual(created);
  });

  it('should return null for non-existent profile', async () => {
    const result = await profileManager.get('non-existent-id');

    expect(result).toBeNull();
  });

  it('should update profile', async () => {
    const profile = await profileManager.create({
      nickname: 'Old Name',
      email: 'old@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const updated = await profileManager.update(profile.id, {
      nickname: 'New Name',
      metadata: { updated: 'true' }
    });

    expect(updated.nickname).toBe('New Name');
    expect(updated.email).toBe('old@example.com'); // Unchanged
    expect(updated.metadata.updated).toBe('true');
  });

  it('should delete profile', async () => {
    const profile = await profileManager.create({
      nickname: 'ToDelete',
      email: 'delete@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    await profileManager.delete(profile.id);

    const result = await profileManager.get(profile.id);
    expect(result).toBeNull();
  });
});
```

**Expected Result**: ❌ RED - ProfileManager doesn't exist

---

### Commit 2: Profile CRUD Implementation (GREEN)
**Message**: `feat(profiles): implement ProfileManager CRUD`

**Files Changed**:
- `src/profiles/ProfileManager.ts` (new)
- `src/profiles/types.ts` (new)

**Code**:
```typescript
// src/profiles/types.ts
export interface ProfileRecord {
  id: string;
  nickname: string;
  email: string;
  lastUsed: number;
  storageBackend: 'os-store' | 'file';
  metadata: Record<string, string>;
}

export interface WrapperState {
  schema: 'cc-wrapper-state@1';
  activeProfile: string | null;
  profiles: Record<string, ProfileRecord>;
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  timestamp: number;
  event: string;
  profile: string;
  details?: Record<string, unknown>;
}

// src/profiles/ProfileManager.ts
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { ProfileRecord, WrapperState } from './types';

export class ProfileManager {
  private statePath: string;

  constructor(private configDir: string) {
    this.statePath = join(configDir, 'state.json');
  }

  async create(profile: Omit<ProfileRecord, 'id' | 'lastUsed'>): Promise<ProfileRecord> {
    const state = await this.loadState();

    const newProfile: ProfileRecord = {
      ...profile,
      id: this.generateId(),
      lastUsed: Date.now()
    };

    state.profiles[newProfile.id] = newProfile;

    await this.saveState(state);

    return newProfile;
  }

  async list(): Promise<ProfileRecord[]> {
    const state = await this.loadState();
    return Object.values(state.profiles);
  }

  async get(id: string): Promise<ProfileRecord | null> {
    const state = await this.loadState();
    return state.profiles[id] || null;
  }

  async update(id: string, updates: Partial<Omit<ProfileRecord, 'id'>>): Promise<ProfileRecord> {
    const state = await this.loadState();

    const profile = state.profiles[id];
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }

    const updated = { ...profile, ...updates };
    state.profiles[id] = updated;

    await this.saveState(state);

    return updated;
  }

  async delete(id: string): Promise<void> {
    const state = await this.loadState();

    if (!state.profiles[id]) {
      throw new Error(`Profile not found: ${id}`);
    }

    delete state.profiles[id];

    // Clear active if deleting active profile
    if (state.activeProfile === id) {
      state.activeProfile = null;
    }

    await this.saveState(state);
  }

  private async loadState(): Promise<WrapperState> {
    try {
      const content = await readFile(this.statePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return this.createEmptyState();
      }
      throw error;
    }
  }

  private async saveState(state: WrapperState): Promise<void> {
    await mkdir(this.configDir, { recursive: true });

    const tempPath = `${this.statePath}.tmp`;
    const content = JSON.stringify(state, null, 2);

    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, this.statePath);
  }

  private createEmptyState(): WrapperState {
    return {
      schema: 'cc-wrapper-state@1',
      activeProfile: null,
      profiles: {},
      auditLog: []
    };
  }

  private generateId(): string {
    return randomBytes(8).toString('hex');
  }
}
```

**Expected Result**: ✅ GREEN - CRUD tests pass

---

### Commit 3: Atomic Switch Test (RED)
**Message**: `test(profiles): add atomic profile switch tests`

**Files Changed**:
- `tests/profiles/ProfileManager.test.ts` (update)

**Code**:
```typescript
describe('ProfileManager Atomic Switch', () => {
  it('should switch active profile', async () => {
    const profile1 = await profileManager.create({
      nickname: 'Profile1',
      email: 'p1@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const profile2 = await profileManager.create({
      nickname: 'Profile2',
      email: 'p2@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    await profileManager.activate(profile1.id);

    let active = await profileManager.getActive();
    expect(active?.id).toBe(profile1.id);

    await profileManager.activate(profile2.id);

    active = await profileManager.getActive();
    expect(active?.id).toBe(profile2.id);
  });

  it('should update lastUsed on activation', async () => {
    const profile = await profileManager.create({
      nickname: 'Test',
      email: 'test@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const beforeActivation = profile.lastUsed;

    // Wait 10ms to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    await profileManager.activate(profile.id);

    const updated = await profileManager.get(profile.id);
    expect(updated!.lastUsed).toBeGreaterThan(beforeActivation);
  });

  it('should throw when activating non-existent profile', async () => {
    await expect(
      profileManager.activate('non-existent')
    ).rejects.toThrow(/not found/);
  });

  it('should return null when no active profile', async () => {
    const active = await profileManager.getActive();
    expect(active).toBeNull();
  });

  it('should validate profile has token before activation', async () => {
    const mockTokenStore = {
      read: jest.fn().mockResolvedValue(null) // No token
    };

    const managerWithValidation = new ProfileManager(tempDir, {
      tokenStore: mockTokenStore as any
    });

    const profile = await managerWithValidation.create({
      nickname: 'NoToken',
      email: 'no@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    await expect(
      managerWithValidation.activate(profile.id, { validateToken: true })
    ).rejects.toThrow(/no token/);
  });
});
```

**Expected Result**: ❌ RED - Activation methods don't exist

---

### Commit 4: Atomic Switch Implementation (GREEN)
**Message**: `feat(profiles): implement atomic profile switching`

**Files Changed**:
- `src/profiles/ProfileManager.ts` (update)

**Code**:
```typescript
import { TokenStore } from '../auth/TokenStore';

export interface ProfileManagerOptions {
  tokenStore?: TokenStore;
}

export class ProfileManager {
  private statePath: string;
  private options: ProfileManagerOptions;

  constructor(
    private configDir: string,
    options: ProfileManagerOptions = {}
  ) {
    this.statePath = join(configDir, 'state.json');
    this.options = options;
  }

  // ... (existing CRUD methods)

  async activate(
    profileId: string,
    options: { validateToken?: boolean } = {}
  ): Promise<void> {
    const state = await this.loadState();

    const profile = state.profiles[profileId];
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Optionally validate token exists
    if (options.validateToken && this.options.tokenStore) {
      const token = await this.options.tokenStore.read(profileId);
      if (!token) {
        throw new Error(`No token found for profile: ${profileId}`);
      }
    }

    // Update lastUsed
    profile.lastUsed = Date.now();

    // Set as active
    state.activeProfile = profileId;

    await this.saveState(state);
  }

  async getActive(): Promise<ProfileRecord | null> {
    const state = await this.loadState();

    if (!state.activeProfile) {
      return null;
    }

    return state.profiles[state.activeProfile] || null;
  }

  // ... (rest of implementation)
}
```

**Expected Result**: ✅ GREEN - Atomic switch tests pass

---

### Commit 5: Audit Log Test (RED)
**Message**: `test(profiles): add audit log tests`

**Files Changed**:
- `tests/profiles/ProfileManager.test.ts` (update)

**Code**:
```typescript
describe('ProfileManager Audit Log', () => {
  it('should append audit entry on profile creation', async () => {
    await profileManager.create({
      nickname: 'Audited',
      email: 'audit@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const auditLog = await profileManager.getAuditLog();

    expect(auditLog).toHaveLength(1);
    expect(auditLog[0]).toMatchObject({
      event: 'profile_created',
      timestamp: expect.any(Number)
    });
  });

  it('should append audit entry on activation', async () => {
    const profile = await profileManager.create({
      nickname: 'Test',
      email: 'test@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    await profileManager.activate(profile.id);

    const auditLog = await profileManager.getAuditLog();

    expect(auditLog.some(entry => entry.event === 'profile_activated')).toBe(true);
  });

  it('should rotate audit log when exceeding 1000 entries', async () => {
    // Pre-populate with 1000 entries
    for (let i = 0; i < 1000; i++) {
      await profileManager.appendAuditEntry({
        event: 'test_event',
        profile: 'test',
        timestamp: Date.now()
      });
    }

    // Add one more
    await profileManager.create({
      nickname: 'New',
      email: 'new@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const auditLog = await profileManager.getAuditLog();

    // Should still be 1000 (oldest entry removed)
    expect(auditLog.length).toBeLessThanOrEqual(1000);
  });

  it('should include profile details in audit entry', async () => {
    const profile = await profileManager.create({
      nickname: 'Detailed',
      email: 'detail@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    const auditLog = await profileManager.getAuditLog();

    expect(auditLog[0]).toMatchObject({
      event: 'profile_created',
      profile: profile.id,
      details: expect.objectContaining({
        nickname: 'Detailed',
        email: 'detail@example.com'
      })
    });
  });
});
```

**Expected Result**: ❌ RED - Audit methods don't exist

---

### Commit 6: Audit Log Implementation (GREEN)
**Message**: `feat(profiles): implement audit logging`

**Files Changed**:
- `src/profiles/ProfileManager.ts` (update)

**Code**:
```typescript
export class ProfileManager {
  private static readonly MAX_AUDIT_ENTRIES = 1000;

  // ... (existing code)

  async create(profile: Omit<ProfileRecord, 'id' | 'lastUsed'>): Promise<ProfileRecord> {
    const state = await this.loadState();

    const newProfile: ProfileRecord = {
      ...profile,
      id: this.generateId(),
      lastUsed: Date.now()
    };

    state.profiles[newProfile.id] = newProfile;

    // Append audit entry
    this.appendAuditEntryToState(state, {
      event: 'profile_created',
      profile: newProfile.id,
      timestamp: Date.now(),
      details: {
        nickname: newProfile.nickname,
        email: newProfile.email
      }
    });

    await this.saveState(state);

    return newProfile;
  }

  async activate(
    profileId: string,
    options: { validateToken?: boolean } = {}
  ): Promise<void> {
    const state = await this.loadState();

    const profile = state.profiles[profileId];
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    if (options.validateToken && this.options.tokenStore) {
      const token = await this.options.tokenStore.read(profileId);
      if (!token) {
        throw new Error(`No token found for profile: ${profileId}`);
      }
    }

    profile.lastUsed = Date.now();
    state.activeProfile = profileId;

    // Append audit entry
    this.appendAuditEntryToState(state, {
      event: 'profile_activated',
      profile: profileId,
      timestamp: Date.now(),
      details: {
        nickname: profile.nickname
      }
    });

    await this.saveState(state);
  }

  async getAuditLog(): Promise<AuditEntry[]> {
    const state = await this.loadState();
    return state.auditLog;
  }

  async appendAuditEntry(entry: AuditEntry): Promise<void> {
    const state = await this.loadState();
    this.appendAuditEntryToState(state, entry);
    await this.saveState(state);
  }

  private appendAuditEntryToState(state: WrapperState, entry: AuditEntry): void {
    state.auditLog.push(entry);

    // Rotate if exceeding max
    if (state.auditLog.length > ProfileManager.MAX_AUDIT_ENTRIES) {
      state.auditLog = state.auditLog.slice(-ProfileManager.MAX_AUDIT_ENTRIES);
    }
  }

  // ... (rest of implementation)
}
```

**Expected Result**: ✅ GREEN - Audit log tests pass

---

### Commit 7: CLI Command Test (RED)
**Message**: `test(cli): add profile CLI command tests`

**Files Changed**:
- `tests/cli/ProfileCLI.test.ts` (new)

**Code**:
```typescript
import { ProfileCLI } from '../../src/cli/ProfileCLI';
import { ProfileManager } from '../../src/profiles/ProfileManager';

describe('ProfileCLI', () => {
  let cli: ProfileCLI;
  let mockManager: jest.Mocked<ProfileManager>;
  let mockConsole: { log: jest.SpyInstance; error: jest.SpyInstance };

  beforeEach(() => {
    mockManager = {
      list: jest.fn(),
      create: jest.fn(),
      activate: jest.fn(),
      getActive: jest.fn()
    } as any;

    mockConsole = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation()
    };

    cli = new ProfileCLI(mockManager);
  });

  afterEach(() => {
    mockConsole.log.mockRestore();
    mockConsole.error.mockRestore();
  });

  it('should list profiles in human format', async () => {
    mockManager.list.mockResolvedValue([
      {
        id: 'id1',
        nickname: 'Work',
        email: 'work@example.com',
        lastUsed: Date.now(),
        storageBackend: 'os-store',
        metadata: {}
      },
      {
        id: 'id2',
        nickname: 'Personal',
        email: 'personal@example.com',
        lastUsed: Date.now() - 86400000,
        storageBackend: 'file',
        metadata: {}
      }
    ]);

    mockManager.getActive.mockResolvedValue({
      id: 'id1',
      nickname: 'Work',
      email: 'work@example.com',
      lastUsed: Date.now(),
      storageBackend: 'os-store',
      metadata: {}
    });

    await cli.list({ json: false });

    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('Work')
    );
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('(active)')
    );
  });

  it('should list profiles in JSON format', async () => {
    const profiles = [
      {
        id: 'id1',
        nickname: 'Work',
        email: 'work@example.com',
        lastUsed: Date.now(),
        storageBackend: 'os-store' as const,
        metadata: {}
      }
    ];

    mockManager.list.mockResolvedValue(profiles);
    mockManager.getActive.mockResolvedValue(profiles[0]);

    await cli.list({ json: true });

    expect(mockConsole.log).toHaveBeenCalledWith(
      JSON.stringify({ profiles, activeProfileId: 'id1' }, null, 2)
    );
  });

  it('should add new profile', async () => {
    mockManager.create.mockResolvedValue({
      id: 'new-id',
      nickname: 'NewProfile',
      email: 'new@example.com',
      lastUsed: Date.now(),
      storageBackend: 'os-store',
      metadata: {}
    });

    await cli.add({
      nickname: 'NewProfile',
      email: 'new@example.com',
      storageBackend: 'os-store'
    });

    expect(mockManager.create).toHaveBeenCalledWith({
      nickname: 'NewProfile',
      email: 'new@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });

    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('Profile created')
    );
  });

  it('should switch profile', async () => {
    await cli.switch('profile-id');

    expect(mockManager.activate).toHaveBeenCalledWith('profile-id', {
      validateToken: true
    });

    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('Switched to profile')
    );
  });

  it('should show status', async () => {
    mockManager.getActive.mockResolvedValue({
      id: 'active-id',
      nickname: 'ActiveProfile',
      email: 'active@example.com',
      lastUsed: Date.now(),
      storageBackend: 'os-store',
      metadata: {}
    });

    await cli.status();

    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('ActiveProfile')
    );
  });
});
```

**Expected Result**: ❌ RED - ProfileCLI doesn't exist

---

### Commit 8: CLI Command Implementation (GREEN)
**Message**: `feat(cli): implement profile CLI commands`

**Files Changed**:
- `src/cli/ProfileCLI.ts` (new)

**Code**:
```typescript
// src/cli/ProfileCLI.ts
import { ProfileManager } from '../profiles/ProfileManager';

export interface ListOptions {
  json: boolean;
}

export interface AddOptions {
  nickname: string;
  email: string;
  storageBackend: 'os-store' | 'file';
}

export class ProfileCLI {
  constructor(private manager: ProfileManager) {}

  async list(options: ListOptions): Promise<void> {
    const profiles = await this.manager.list();
    const active = await this.manager.getActive();

    if (options.json) {
      console.log(JSON.stringify({
        profiles,
        activeProfileId: active?.id || null
      }, null, 2));
    } else {
      if (profiles.length === 0) {
        console.log('No profiles configured.');
        return;
      }

      console.log('Profiles:');
      profiles.forEach(profile => {
        const isActive = active?.id === profile.id;
        const marker = isActive ? '* ' : '  ';
        const activeLabel = isActive ? ' (active)' : '';
        console.log(
          `${marker}${profile.nickname}${activeLabel}\n` +
          `  Email: ${profile.email}\n` +
          `  ID: ${profile.id}\n` +
          `  Storage: ${profile.storageBackend}`
        );
      });
    }
  }

  async add(options: AddOptions): Promise<void> {
    const profile = await this.manager.create({
      nickname: options.nickname,
      email: options.email,
      storageBackend: options.storageBackend,
      metadata: {}
    });

    console.log(`Profile created: ${profile.nickname} (${profile.id})`);
  }

  async switch(profileId: string): Promise<void> {
    await this.manager.activate(profileId, { validateToken: true });
    console.log(`Switched to profile: ${profileId}`);
  }

  async status(): Promise<void> {
    const active = await this.manager.getActive();

    if (!active) {
      console.log('No active profile.');
      return;
    }

    console.log('Active Profile:');
    console.log(`  Nickname: ${active.nickname}`);
    console.log(`  Email: ${active.email}`);
    console.log(`  ID: ${active.id}`);
    console.log(`  Storage: ${active.storageBackend}`);
    console.log(`  Last Used: ${new Date(active.lastUsed).toISOString()}`);
  }
}
```

**Expected Result**: ✅ GREEN - CLI tests pass

---

### Commit 9: JSON Output Test (RED)
**Message**: `test(cli): add JSON output validation tests`

**Files Changed**:
- `tests/cli/ProfileCLI.test.ts` (update)

**Code**:
```typescript
describe('ProfileCLI JSON Output', () => {
  it('should output valid JSON for list command', async () => {
    const profiles = [
      {
        id: 'id1',
        nickname: 'Work',
        email: 'work@example.com',
        lastUsed: Date.now(),
        storageBackend: 'os-store' as const,
        metadata: {}
      }
    ];

    mockManager.list.mockResolvedValue(profiles);
    mockManager.getActive.mockResolvedValue(null);

    await cli.list({ json: true });

    const output = mockConsole.log.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      profiles,
      activeProfileId: null
    });
  });

  it('should output valid JSON for status command', async () => {
    const active = {
      id: 'active-id',
      nickname: 'Active',
      email: 'active@example.com',
      lastUsed: Date.now(),
      storageBackend: 'os-store' as const,
      metadata: { key: 'value' }
    };

    mockManager.getActive.mockResolvedValue(active);

    await cli.status({ json: true });

    const output = mockConsole.log.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({ activeProfile: active });
  });

  it('should handle empty profiles in JSON mode', async () => {
    mockManager.list.mockResolvedValue([]);
    mockManager.getActive.mockResolvedValue(null);

    await cli.list({ json: true });

    const output = mockConsole.log.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      profiles: [],
      activeProfileId: null
    });
  });
});
```

**Expected Result**: ❌ RED - JSON output not implemented for all commands

---

### Commit 10: JSON Output Implementation (GREEN)
**Message**: `feat(cli): add JSON output for all commands`

**Files Changed**:
- `src/cli/ProfileCLI.ts` (update)

**Code**:
```typescript
export interface StatusOptions {
  json?: boolean;
}

export class ProfileCLI {
  constructor(private manager: ProfileManager) {}

  async list(options: ListOptions): Promise<void> {
    const profiles = await this.manager.list();
    const active = await this.manager.getActive();

    if (options.json) {
      console.log(JSON.stringify({
        profiles,
        activeProfileId: active?.id || null
      }, null, 2));
    } else {
      // ... (existing human-readable output)
    }
  }

  async status(options: StatusOptions = {}): Promise<void> {
    const active = await this.manager.getActive();

    if (options.json) {
      console.log(JSON.stringify({
        activeProfile: active || null
      }, null, 2));
      return;
    }

    if (!active) {
      console.log('No active profile.');
      return;
    }

    // ... (existing human-readable output)
  }

  // ... (rest of implementation)
}
```

**Expected Result**: ✅ GREEN - JSON output tests pass

---

### Commit 11: Commander Integration Test (RED)
**Message**: `test(cli): add commander integration tests`

**Files Changed**:
- `tests/cli/ProfileCommands.test.ts` (new)

**Code**:
```typescript
import { Command } from 'commander';
import { setupProfileCommands } from '../../src/cli/ProfileCommands';
import { ProfileManager } from '../../src/profiles/ProfileManager';

describe('Profile Commands Integration', () => {
  let program: Command;
  let mockManager: jest.Mocked<ProfileManager>;

  beforeEach(() => {
    program = new Command();
    mockManager = {
      list: jest.fn(),
      create: jest.fn(),
      activate: jest.fn(),
      getActive: jest.fn()
    } as any;

    setupProfileCommands(program, mockManager);
  });

  it('should parse list command', async () => {
    mockManager.list.mockResolvedValue([]);
    mockManager.getActive.mockResolvedValue(null);

    await program.parseAsync(['node', 'test', 'list']);

    expect(mockManager.list).toHaveBeenCalled();
  });

  it('should parse add command with options', async () => {
    mockManager.create.mockResolvedValue({
      id: 'new-id',
      nickname: 'Test',
      email: 'test@example.com',
      lastUsed: Date.now(),
      storageBackend: 'os-store',
      metadata: {}
    });

    await program.parseAsync([
      'node', 'test', 'add',
      '--nickname', 'Test',
      '--email', 'test@example.com',
      '--storage', 'os-store'
    ]);

    expect(mockManager.create).toHaveBeenCalledWith({
      nickname: 'Test',
      email: 'test@example.com',
      storageBackend: 'os-store',
      metadata: {}
    });
  });

  it('should parse switch command with profile ID', async () => {
    await program.parseAsync(['node', 'test', 'switch', 'profile-123']);

    expect(mockManager.activate).toHaveBeenCalledWith('profile-123', {
      validateToken: true
    });
  });
});
```

**Expected Result**: ❌ RED - setupProfileCommands doesn't exist

---

### Commit 12: Commander Integration Implementation (GREEN)
**Message**: `feat(cli): integrate profile commands with commander`

**Files Changed**:
- `src/cli/ProfileCommands.ts` (new)

**Code**:
```typescript
// src/cli/ProfileCommands.ts
import { Command } from 'commander';
import { ProfileManager } from '../profiles/ProfileManager';
import { ProfileCLI } from './ProfileCLI';

export function setupProfileCommands(program: Command, manager: ProfileManager): void {
  const cli = new ProfileCLI(manager);

  const profileCmd = program
    .command('profile')
    .description('Manage Claude profiles');

  profileCmd
    .command('list')
    .description('List all profiles')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await cli.list({ json: options.json || false });
    });

  profileCmd
    .command('add')
    .description('Add new profile')
    .requiredOption('--nickname <nickname>', 'Profile nickname')
    .requiredOption('--email <email>', 'Profile email')
    .option('--storage <backend>', 'Storage backend (os-store|file)', 'os-store')
    .action(async (options) => {
      await cli.add({
        nickname: options.nickname,
        email: options.email,
        storageBackend: options.storage as 'os-store' | 'file'
      });
    });

  profileCmd
    .command('switch <profileId>')
    .description('Switch to a different profile')
    .action(async (profileId) => {
      await cli.switch(profileId);
    });

  profileCmd
    .command('status')
    .description('Show active profile')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await cli.status({ json: options.json || false });
    });
}
```

**Expected Result**: ✅ GREEN - Commander integration tests pass

---

## Acceptance Criteria

Profile CRUD:
- [ ] Create profile with nickname, email, storageBackend
- [ ] List all profiles
- [ ] Get profile by ID
- [ ] Update profile fields
- [ ] Delete profile
- [ ] Generate unique IDs
- [ ] Update lastUsed timestamp

Profile Switching:
- [ ] Activate profile by ID
- [ ] Update lastUsed on activation
- [ ] Get active profile
- [ ] Return null when no active profile
- [ ] Validate token exists (optional)
- [ ] Throw on non-existent profile

Audit Log:
- [ ] Append entry on profile creation
- [ ] Append entry on activation
- [ ] Append entry on deletion
- [ ] Rotate when exceeding 1000 entries
- [ ] Include timestamp in entries
- [ ] Include profile ID in entries
- [ ] Include event details

CLI Commands:
- [ ] `profile list` (human-readable)
- [ ] `profile list --json`
- [ ] `profile add --nickname --email --storage`
- [ ] `profile switch <id>`
- [ ] `profile status`
- [ ] `profile status --json`

JSON Output:
- [ ] Valid JSON structure
- [ ] Includes all profile fields
- [ ] Includes activeProfileId
- [ ] Handles empty profiles
- [ ] Handles null active profile

State Persistence:
- [ ] Atomic writes (temp + rename)
- [ ] Creates directory if missing
- [ ] Handles corrupted state gracefully
- [ ] Schema version in state

---

## Testing Strategy

### Unit Tests
```typescript
// CRUD Operations
- Create profile
- List profiles
- Get profile by ID
- Update profile
- Delete profile
- Non-existent profile

// Activation
- Activate profile
- Update lastUsed
- Validate token
- Get active profile
- Clear active on delete

// Audit Log
- Append on create
- Append on activate
- Rotation (1000+ entries)
- Entry format

// CLI
- List (human + JSON)
- Add profile
- Switch profile
- Status (human + JSON)
- Error handling

// Commander
- Command parsing
- Option parsing
- Required options
- Help text
```

### Integration Tests
```typescript
// Full Workflow
- Add → Activate → List → Status
- Multiple profiles
- Switch between profiles
- Delete active profile

// JSON Automation
- Parse JSON output
- Use in scripts
```

---

## Success Metrics

- **Test Coverage**: ≥95%
- **Test Pass Rate**: 100%
- **CLI UX**: Clear, consistent output
- **JSON Validity**: 100% parseable

---

## Downstream Impact

**Unblocks**:
- GH-08: Integration tests use ProfileManager
- CLI users can manage profiles

**Provides**:
- `ProfileManager` class
- `ProfileCLI` class
- Commander integration
- Audit logging

---

## Definition of Done

Development:
- [ ] All 12 commits completed following TDD
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Code reviewed and approved

Documentation:
- [ ] JSDoc on public APIs
- [ ] CLI help text
- [ ] README section on profiles

Testing:
- [ ] 95%+ code coverage
- [ ] All CLI commands tested
- [ ] JSON output validated

UX:
- [ ] Clear error messages
- [ ] Consistent output format
- [ ] JSON mode works

---

## Related Files

```
src/
├── profiles/
│   ├── ProfileManager.ts    # CRUD + activation
│   └── types.ts             # ProfileRecord, WrapperState
└── cli/
    ├── ProfileCLI.ts        # CLI interface
    └── ProfileCommands.ts   # Commander integration

tests/
├── profiles/
│   └── ProfileManager.test.ts  # CRUD + audit tests
└── cli/
    ├── ProfileCLI.test.ts      # CLI tests
    └── ProfileCommands.test.ts # Commander tests
```

---

## Branch Strategy

```bash
git checkout main
git pull origin main
git checkout -b feat/06-profile-cli

# Work through 12 TDD commits
git push -u origin feat/06-profile-cli
gh pr create --title "feat: profile manager and CLI" \
  --body "Implements GH-06: Profile Manager (closes #8)"
```

---

## Estimated Effort

**Time**: 10-12 hours
**Complexity**: Medium
**Risk**: Low

**Breakdown**:
- CRUD operations: 2.5 hours
- Activation logic: 1.5 hours
- Audit logging: 2 hours
- CLI commands: 2.5 hours
- JSON output: 1.5 hours
- Commander integration: 1.5 hours
- Integration tests: 1 hour

**Dependencies**: GH-02 (Config), GH-03 (TokenStore)
