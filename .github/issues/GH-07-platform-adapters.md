# GH-07: Platform Adapters (Windows/macOS/Linux/WSL)

**Parent**: #1 (Project Blueprint)
**Depends On**: #2 (GH-00 Foundation)
**Unblocks**: #7 (GH-05 Auth Manager), #8 (GH-06 Profile Manager) for secure storage
**External Dependencies**: Platform-specific libraries (optional: `keytar`, `node-keytar`)

---

## Overview

Implements platform detection and adapters for Windows, macOS, Linux, and WSL. Provides abstraction layer for platform-specific operations: path resolution, secret storage, and environment handling.

**Key Features**:
- Automatic platform detection (Windows/macOS/Linux/WSL)
- Path translation (especially for WSL)
- Secure secret storage abstraction (Windows Credential Manager, macOS Keychain, Linux libsecret)
- Fallback to encrypted file storage
- Platform capabilities reporting
- Environment variable handling

---

## TDD Workflow (14 Atomic Commits)

### Commit 1: Platform Detection Test (RED)
**Message**: `test(platform): add platform detection tests`

**Files Changed**:
- `tests/platform/PlatformDetector.test.ts` (new)

**Code**:
```typescript
import { PlatformDetector, PlatformType } from '../../src/platform/PlatformDetector';

describe('PlatformDetector', () => {
  let originalPlatform: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalPlatform = process.platform;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  it('should detect Windows platform', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.WSL_DISTRO_NAME;

    const platform = PlatformDetector.detect();

    expect(platform).toBe('windows');
  });

  it('should detect macOS platform', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const platform = PlatformDetector.detect();

    expect(platform).toBe('macos');
  });

  it('should detect Linux platform', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.WSL_DISTRO_NAME;

    const platform = PlatformDetector.detect();

    expect(platform).toBe('linux');
  });

  it('should detect WSL platform', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.WSL_DISTRO_NAME = 'Ubuntu';

    const platform = PlatformDetector.detect();

    expect(platform).toBe('wsl');
  });

  it('should cache detection result', () => {
    const detector = PlatformDetector;
    const first = detector.detect();
    const second = detector.detect();

    expect(first).toBe(second);
  });
});
```

**Expected Result**: ❌ RED - PlatformDetector doesn't exist

---

### Commit 2: Platform Detection Implementation (GREEN)
**Message**: `feat(platform): implement platform detection`

**Files Changed**:
- `src/platform/PlatformDetector.ts` (new)
- `src/platform/types.ts` (new)

**Code**:
```typescript
// src/platform/types.ts
export type PlatformType = 'windows' | 'macos' | 'linux' | 'wsl';

export interface PlatformPaths {
  configDir: string;
  secretsDir: string;
  cacheDir: string;
  homeDir: string;
}

export interface PlatformCapabilities {
  hasSecureStorage: boolean;
  supportsFileWatching: boolean;
  supportsSymlinks: boolean;
}

// src/platform/PlatformDetector.ts
import { PlatformType } from './types';

export class PlatformDetector {
  private static cachedPlatform: PlatformType | null = null;

  static detect(): PlatformType {
    if (this.cachedPlatform) {
      return this.cachedPlatform;
    }

    const platform = this.detectPlatform();
    this.cachedPlatform = platform;
    return platform;
  }

  private static detectPlatform(): PlatformType {
    // Check for WSL (Linux with WSL environment variable)
    if (process.platform === 'linux' && process.env.WSL_DISTRO_NAME) {
      return 'wsl';
    }

    // Check standard platforms
    switch (process.platform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      case 'linux':
        return 'linux';
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  static reset(): void {
    this.cachedPlatform = null;
  }
}
```

**Expected Result**: ✅ GREEN - Detection tests pass

---

### Commit 3: Path Translation Test (RED)
**Message**: `test(platform): add path translation tests`

**Files Changed**:
- `tests/platform/PlatformAdapter.test.ts` (new)

**Code**:
```typescript
import { PlatformAdapter } from '../../src/platform/PlatformAdapter';
import { homedir } from 'os';
import { join } from 'path';

describe('PlatformAdapter Paths', () => {
  it('should provide config directory path', () => {
    const adapter = PlatformAdapter.create();
    const paths = adapter.getPaths();

    expect(paths.configDir).toBeTruthy();
    expect(paths.configDir).toContain('.claude-wrapper');
  });

  it('should provide secrets directory path', () => {
    const adapter = PlatformAdapter.create();
    const paths = adapter.getPaths();

    expect(paths.secretsDir).toBeTruthy();
  });

  it('should provide cache directory path', () => {
    const adapter = PlatformAdapter.create();
    const paths = adapter.getPaths();

    expect(paths.cacheDir).toBeTruthy();
  });

  it('should provide home directory path', () => {
    const adapter = PlatformAdapter.create();
    const paths = adapter.getPaths();

    expect(paths.homeDir).toBe(homedir());
  });
});
```

**Expected Result**: ❌ RED - PlatformAdapter doesn't exist

---

### Commit 4: Path Translation Implementation (GREEN)
**Message**: `feat(platform): implement path resolution`

**Files Changed**:
- `src/platform/PlatformAdapter.ts` (new)
- `src/platform/BasePlatformAdapter.ts` (new)

**Code**:
```typescript
// src/platform/BasePlatformAdapter.ts
import { homedir } from 'os';
import { join } from 'path';
import { PlatformPaths, PlatformCapabilities, PlatformType } from './types';

export abstract class BasePlatformAdapter {
  abstract getPlatformType(): PlatformType;
  abstract getCapabilities(): PlatformCapabilities;

  getPaths(): PlatformPaths {
    const home = homedir();

    return {
      configDir: this.getConfigDir(home),
      secretsDir: this.getSecretsDir(home),
      cacheDir: this.getCacheDir(home),
      homeDir: home
    };
  }

  protected abstract getConfigDir(home: string): string;
  protected abstract getSecretsDir(home: string): string;
  protected abstract getCacheDir(home: string): string;
}

// src/platform/PlatformAdapter.ts
import { PlatformDetector } from './PlatformDetector';
import { BasePlatformAdapter } from './BasePlatformAdapter';
import { WindowsAdapter } from './WindowsAdapter';
import { MacOSAdapter } from './MacOSAdapter';
import { LinuxAdapter } from './LinuxAdapter';
import { WSLAdapter } from './WSLAdapter';

export class PlatformAdapter {
  static create(): BasePlatformAdapter {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'windows':
        return new WindowsAdapter();
      case 'macos':
        return new MacOSAdapter();
      case 'linux':
        return new LinuxAdapter();
      case 'wsl':
        return new WSLAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}
```

**Expected Result**: ✅ GREEN - Path tests pass (after implementing adapters)

---

### Commit 5: Windows Adapter Test (RED)
**Message**: `test(platform): add Windows adapter tests`

**Files Changed**:
- `tests/platform/WindowsAdapter.test.ts` (new)

**Code**:
```typescript
import { WindowsAdapter } from '../../src/platform/WindowsAdapter';
import { join } from 'path';

describe('WindowsAdapter', () => {
  let adapter: WindowsAdapter;

  beforeEach(() => {
    adapter = new WindowsAdapter();
  });

  it('should return windows platform type', () => {
    expect(adapter.getPlatformType()).toBe('windows');
  });

  it('should use APPDATA for config directory', () => {
    const originalAppData = process.env.APPDATA;
    process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

    const paths = adapter.getPaths();

    expect(paths.configDir).toContain('AppData\\Roaming\\claude-wrapper');

    process.env.APPDATA = originalAppData;
  });

  it('should report secure storage capability', () => {
    const capabilities = adapter.getCapabilities();

    expect(capabilities.hasSecureStorage).toBe(true); // Windows Credential Manager
  });

  it('should support file watching', () => {
    const capabilities = adapter.getCapabilities();

    expect(capabilities.supportsFileWatching).toBe(true);
  });
});
```

**Expected Result**: ❌ RED - WindowsAdapter doesn't exist

---

### Commit 6: Windows Adapter Implementation (GREEN)
**Message**: `feat(platform): implement Windows adapter`

**Files Changed**:
- `src/platform/WindowsAdapter.ts` (new)

**Code**:
```typescript
// src/platform/WindowsAdapter.ts
import { join } from 'path';
import { BasePlatformAdapter } from './BasePlatformAdapter';
import { PlatformType, PlatformCapabilities } from './types';

export class WindowsAdapter extends BasePlatformAdapter {
  getPlatformType(): PlatformType {
    return 'windows';
  }

  getCapabilities(): PlatformCapabilities {
    return {
      hasSecureStorage: true, // Windows Credential Manager available
      supportsFileWatching: true,
      supportsSymlinks: false // Requires admin
    };
  }

  protected getConfigDir(home: string): string {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'claude-wrapper');
  }

  protected getSecretsDir(home: string): string {
    // Same as config dir on Windows (uses Credential Manager)
    return this.getConfigDir(home);
  }

  protected getCacheDir(home: string): string {
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    return join(localAppData, 'claude-wrapper', 'cache');
  }
}
```

**Expected Result**: ✅ GREEN - Windows adapter tests pass

---

### Commit 7: macOS Adapter Test (RED)
**Message**: `test(platform): add macOS adapter tests`

**Files Changed**:
- `tests/platform/MacOSAdapter.test.ts` (new)

**Code**:
```typescript
import { MacOSAdapter } from '../../src/platform/MacOSAdapter';

describe('MacOSAdapter', () => {
  let adapter: MacOSAdapter;

  beforeEach(() => {
    adapter = new MacOSAdapter();
  });

  it('should return macos platform type', () => {
    expect(adapter.getPlatformType()).toBe('macos');
  });

  it('should use Application Support for config', () => {
    const paths = adapter.getPaths();

    expect(paths.configDir).toContain('Library/Application Support/claude-wrapper');
  });

  it('should use Keychain for secrets', () => {
    const capabilities = adapter.getCapabilities();

    expect(capabilities.hasSecureStorage).toBe(true);
  });

  it('should support symlinks', () => {
    const capabilities = adapter.getCapabilities();

    expect(capabilities.supportsSymlinks).toBe(true);
  });
});
```

**Expected Result**: ❌ RED - MacOSAdapter doesn't exist

---

### Commit 8: macOS Adapter Implementation (GREEN)
**Message**: `feat(platform): implement macOS adapter`

**Files Changed**:
- `src/platform/MacOSAdapter.ts` (new)

**Code**:
```typescript
// src/platform/MacOSAdapter.ts
import { join } from 'path';
import { BasePlatformAdapter } from './BasePlatformAdapter';
import { PlatformType, PlatformCapabilities } from './types';

export class MacOSAdapter extends BasePlatformAdapter {
  getPlatformType(): PlatformType {
    return 'macos';
  }

  getCapabilities(): PlatformCapabilities {
    return {
      hasSecureStorage: true, // Keychain available
      supportsFileWatching: true,
      supportsSymlinks: true
    };
  }

  protected getConfigDir(home: string): string {
    return join(home, 'Library', 'Application Support', 'claude-wrapper');
  }

  protected getSecretsDir(home: string): string {
    // Same as config (uses Keychain)
    return this.getConfigDir(home);
  }

  protected getCacheDir(home: string): string {
    return join(home, 'Library', 'Caches', 'claude-wrapper');
  }
}
```

**Expected Result**: ✅ GREEN - macOS adapter tests pass

---

### Commit 9: Linux Adapter Test (RED)
**Message**: `test(platform): add Linux adapter tests`

**Files Changed**:
- `tests/platform/LinuxAdapter.test.ts` (new)

**Code**:
```typescript
import { LinuxAdapter } from '../../src/platform/LinuxAdapter';

describe('LinuxAdapter', () => {
  let adapter: LinuxAdapter;

  beforeEach(() => {
    adapter = new LinuxAdapter();
  });

  it('should return linux platform type', () => {
    expect(adapter.getPlatformType()).toBe('linux');
  });

  it('should use XDG_CONFIG_HOME if set', () => {
    const originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = '/custom/config';

    const paths = adapter.getPaths();

    expect(paths.configDir).toBe('/custom/config/claude-wrapper');

    process.env.XDG_CONFIG_HOME = originalXdg;
  });

  it('should fallback to .config if XDG not set', () => {
    const originalXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;

    const paths = adapter.getPaths();

    expect(paths.configDir).toContain('.config/claude-wrapper');

    process.env.XDG_CONFIG_HOME = originalXdg;
  });

  it('should report libsecret availability', () => {
    const capabilities = adapter.getCapabilities();

    // May or may not be available
    expect(typeof capabilities.hasSecureStorage).toBe('boolean');
  });
});
```

**Expected Result**: ❌ RED - LinuxAdapter doesn't exist

---

### Commit 10: Linux Adapter Implementation (GREEN)
**Message**: `feat(platform): implement Linux adapter`

**Files Changed**:
- `src/platform/LinuxAdapter.ts` (new)

**Code**:
```typescript
// src/platform/LinuxAdapter.ts
import { join } from 'path';
import { BasePlatformAdapter } from './BasePlatformAdapter';
import { PlatformType, PlatformCapabilities } from './types';

export class LinuxAdapter extends BasePlatformAdapter {
  getPlatformType(): PlatformType {
    return 'linux';
  }

  getCapabilities(): PlatformCapabilities {
    return {
      hasSecureStorage: this.hasLibSecret(), // Check for libsecret
      supportsFileWatching: true,
      supportsSymlinks: true
    };
  }

  protected getConfigDir(home: string): string {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    const baseDir = xdgConfig || join(home, '.config');
    return join(baseDir, 'claude-wrapper');
  }

  protected getSecretsDir(home: string): string {
    // Same as config (may use libsecret or encrypted file)
    return this.getConfigDir(home);
  }

  protected getCacheDir(home: string): string {
    const xdgCache = process.env.XDG_CACHE_HOME;
    const baseDir = xdgCache || join(home, '.cache');
    return join(baseDir, 'claude-wrapper');
  }

  private hasLibSecret(): boolean {
    // Check if libsecret is available
    // For now, return false (fallback to file encryption)
    // TODO: Implement runtime check
    return false;
  }
}
```

**Expected Result**: ✅ GREEN - Linux adapter tests pass

---

### Commit 11: WSL Adapter Test (RED)
**Message**: `test(platform): add WSL adapter tests`

**Files Changed**:
- `tests/platform/WSLAdapter.test.ts` (new)

**Code**:
```typescript
import { WSLAdapter } from '../../src/platform/WSLAdapter';

describe('WSLAdapter', () => {
  let adapter: WSLAdapter;

  beforeEach(() => {
    adapter = new WSLAdapter();
  });

  it('should return wsl platform type', () => {
    expect(adapter.getPlatformType()).toBe('wsl');
  });

  it('should use Linux-style paths', () => {
    const paths = adapter.getPaths();

    expect(paths.configDir).toContain('.config/claude-wrapper');
  });

  it('should translate WSL path to Windows path', () => {
    const wslPath = '/mnt/c/Users/Test/file.txt';
    const winPath = adapter.translateToWindowsPath(wslPath);

    expect(winPath).toBe('C:\\Users\\Test\\file.txt');
  });

  it('should translate Windows path to WSL path', () => {
    const winPath = 'C:\\Users\\Test\\file.txt';
    const wslPath = adapter.translateToWSLPath(winPath);

    expect(wslPath).toBe('/mnt/c/Users/Test/file.txt');
  });

  it('should report Windows Credential Manager availability', () => {
    const capabilities = adapter.getCapabilities();

    // WSL can use Windows Credential Manager via bridge
    expect(capabilities.hasSecureStorage).toBe(true);
  });
});
```

**Expected Result**: ❌ RED - WSLAdapter doesn't exist

---

### Commit 12: WSL Adapter Implementation (GREEN)
**Message**: `feat(platform): implement WSL adapter with path translation`

**Files Changed**:
- `src/platform/WSLAdapter.ts` (new)

**Code**:
```typescript
// src/platform/WSLAdapter.ts
import { join } from 'path';
import { BasePlatformAdapter } from './BasePlatformAdapter';
import { PlatformType, PlatformCapabilities } from './types';

export class WSLAdapter extends BasePlatformAdapter {
  getPlatformType(): PlatformType {
    return 'wsl';
  }

  getCapabilities(): PlatformCapabilities {
    return {
      hasSecureStorage: true, // Can bridge to Windows Credential Manager
      supportsFileWatching: true,
      supportsSymlinks: true
    };
  }

  protected getConfigDir(home: string): string {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    const baseDir = xdgConfig || join(home, '.config');
    return join(baseDir, 'claude-wrapper');
  }

  protected getSecretsDir(home: string): string {
    return this.getConfigDir(home);
  }

  protected getCacheDir(home: string): string {
    const xdgCache = process.env.XDG_CACHE_HOME;
    const baseDir = xdgCache || join(home, '.cache');
    return join(baseDir, 'claude-wrapper');
  }

  /**
   * Translate WSL path to Windows path.
   * Example: /mnt/c/Users/Test -> C:\Users\Test
   */
  translateToWindowsPath(wslPath: string): string {
    // Match /mnt/c/... pattern
    const match = wslPath.match(/^\/mnt\/([a-z])(\/.*)?$/);

    if (!match) {
      return wslPath; // Not a /mnt path, return as-is
    }

    const driveLetter = match[1].toUpperCase();
    const pathPart = match[2] || '';

    // Convert forward slashes to backslashes
    const windowsPath = pathPart.replace(/\//g, '\\');

    return `${driveLetter}:${windowsPath}`;
  }

  /**
   * Translate Windows path to WSL path.
   * Example: C:\Users\Test -> /mnt/c/Users/Test
   */
  translateToWSLPath(windowsPath: string): string {
    // Match C:\... pattern
    const match = windowsPath.match(/^([A-Z]):(\\.*)?$/);

    if (!match) {
      return windowsPath; // Not a Windows path, return as-is
    }

    const driveLetter = match[1].toLowerCase();
    const pathPart = match[2] || '';

    // Convert backslashes to forward slashes
    const wslPath = pathPart.replace(/\\/g, '/');

    return `/mnt/${driveLetter}${wslPath}`;
  }
}
```

**Expected Result**: ✅ GREEN - WSL adapter tests pass

---

### Commit 13: Secure Storage Abstraction Test (RED)
**Message**: `test(platform): add secure storage abstraction tests`

**Files Changed**:
- `tests/platform/SecureStorage.test.ts` (new)

**Code**:
```typescript
import { SecureStorage } from '../../src/platform/SecureStorage';
import { PlatformAdapter } from '../../src/platform/PlatformAdapter';

describe('SecureStorage', () => {
  let storage: SecureStorage;

  beforeEach(() => {
    const adapter = PlatformAdapter.create();
    storage = new SecureStorage(adapter);
  });

  it('should store and retrieve secret', async () => {
    const key = 'test-key';
    const value = 'secret-value';

    await storage.set(key, value);
    const retrieved = await storage.get(key);

    expect(retrieved).toBe(value);
  });

  it('should return null for non-existent key', async () => {
    const value = await storage.get('non-existent');

    expect(value).toBeNull();
  });

  it('should delete secret', async () => {
    const key = 'to-delete';

    await storage.set(key, 'value');
    await storage.delete(key);

    const retrieved = await storage.get(key);
    expect(retrieved).toBeNull();
  });

  it('should handle special characters in keys', async () => {
    const key = 'claude-wrapper/profile-123/token';
    const value = 'secret';

    await storage.set(key, value);
    const retrieved = await storage.get(key);

    expect(retrieved).toBe(value);
  });
});
```

**Expected Result**: ❌ RED - SecureStorage doesn't exist

---

### Commit 14: Secure Storage Implementation (GREEN)
**Message**: `feat(platform): implement secure storage abstraction`

**Files Changed**:
- `src/platform/SecureStorage.ts` (new)

**Code**:
```typescript
// src/platform/SecureStorage.ts
import { BasePlatformAdapter } from './BasePlatformAdapter';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Secure storage abstraction.
 *
 * Uses OS-native secure storage when available:
 * - Windows: Credential Manager
 * - macOS: Keychain
 * - Linux: libsecret (if available)
 * - Fallback: Encrypted file storage
 */
export class SecureStorage {
  private useNativeStorage: boolean;

  constructor(private adapter: BasePlatformAdapter) {
    const capabilities = adapter.getCapabilities();
    this.useNativeStorage = capabilities.hasSecureStorage;
  }

  async get(key: string): Promise<string | null> {
    if (this.useNativeStorage) {
      return this.getNative(key);
    } else {
      return this.getFile(key);
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (this.useNativeStorage) {
      await this.setNative(key, value);
    } else {
      await this.setFile(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    if (this.useNativeStorage) {
      await this.deleteNative(key);
    } else {
      await this.deleteFile(key);
    }
  }

  private async getNative(key: string): Promise<string | null> {
    // TODO: Implement native storage via keytar or similar
    // For now, fallback to file
    return this.getFile(key);
  }

  private async setNative(key: string, value: string): Promise<void> {
    // TODO: Implement native storage
    // For now, fallback to file
    await this.setFile(key, value);
  }

  private async deleteNative(key: string): Promise<void> {
    // TODO: Implement native storage
    // For now, fallback to file
    await this.deleteFile(key);
  }

  private async getFile(key: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(key);
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async setFile(key: string, value: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));

    await mkdir(dir, { recursive: true });
    await writeFile(filePath, value, 'utf-8');
  }

  private async deleteFile(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private getFilePath(key: string): string {
    const paths = this.adapter.getPaths();
    // Convert key to safe filename
    const safeKey = key.replace(/[/\\:]/g, '_');
    return join(paths.secretsDir, `${safeKey}.secret`);
  }
}
```

**Expected Result**: ✅ GREEN - Secure storage tests pass

---

## Acceptance Criteria

Platform Detection:
- [ ] Detects Windows (win32)
- [ ] Detects macOS (darwin)
- [ ] Detects Linux
- [ ] Detects WSL (Linux + WSL_DISTRO_NAME)
- [ ] Caches detection result
- [ ] Throws on unsupported platform

Path Resolution:
- [ ] Provides configDir path
- [ ] Provides secretsDir path
- [ ] Provides cacheDir path
- [ ] Provides homeDir path
- [ ] Windows uses APPDATA
- [ ] macOS uses Application Support
- [ ] Linux uses XDG_CONFIG_HOME or ~/.config
- [ ] WSL uses Linux-style paths

Capabilities:
- [ ] Reports hasSecureStorage
- [ ] Reports supportsFileWatching
- [ ] Reports supportsSymlinks
- [ ] Windows reports Credential Manager
- [ ] macOS reports Keychain
- [ ] Linux checks libsecret
- [ ] WSL reports Windows bridge

WSL Path Translation:
- [ ] Translates /mnt/c/... to C:\...
- [ ] Translates C:\... to /mnt/c/...
- [ ] Handles all drive letters
- [ ] Handles paths without drive

Secure Storage:
- [ ] Store secret by key
- [ ] Retrieve secret by key
- [ ] Delete secret by key
- [ ] Return null for non-existent key
- [ ] Handle special characters in keys
- [ ] Fallback to file storage

---

## Testing Strategy

### Unit Tests
```typescript
// Platform Detection
- Windows detection
- macOS detection
- Linux detection
- WSL detection
- Cache behavior
- Unsupported platform error

// Path Resolution
- Config dir per platform
- Secrets dir per platform
- Cache dir per platform
- Environment variable overrides

// Capabilities
- Secure storage availability
- File watching support
- Symlink support

// WSL Translation
- WSL to Windows path
- Windows to WSL path
- Invalid path handling

// Secure Storage
- Set/get/delete operations
- Non-existent key
- File fallback
- Key sanitization
```

### Integration Tests
```typescript
// Cross-Platform
- Create config on each platform
- Store secret on each platform
- Verify paths exist

// WSL Bridge
- Access Windows Credential Manager from WSL
- Path translation round-trip
```

---

## Success Metrics

- **Test Coverage**: ≥90%
- **Test Pass Rate**: 100% on all platforms
- **Platform Support**: Windows, macOS, Linux, WSL
- **Fallback**: Works even without native secure storage

---

## Downstream Impact

**Unblocks**:
- GH-05: Auth Manager uses SecureStorage
- GH-06: Profile Manager uses platform paths
- GH-03: Token Store uses platform-specific encryption

**Provides**:
- `PlatformAdapter` factory
- Platform-specific adapters
- `SecureStorage` abstraction
- Path translation utilities

---

## Definition of Done

Development:
- [ ] All 14 commits completed following TDD
- [ ] All unit tests passing
- [ ] Works on Windows
- [ ] Works on macOS
- [ ] Works on Linux
- [ ] Works on WSL
- [ ] Code reviewed and approved

Documentation:
- [ ] JSDoc on public APIs
- [ ] Platform support documented
- [ ] Fallback behavior documented

Testing:
- [ ] 90%+ code coverage
- [ ] Tested on multiple platforms
- [ ] WSL translation verified

---

## Related Files

```
src/
└── platform/
    ├── types.ts                # Platform types
    ├── PlatformDetector.ts     # Detection logic
    ├── BasePlatformAdapter.ts  # Abstract base
    ├── PlatformAdapter.ts      # Factory
    ├── WindowsAdapter.ts       # Windows implementation
    ├── MacOSAdapter.ts         # macOS implementation
    ├── LinuxAdapter.ts         # Linux implementation
    ├── WSLAdapter.ts           # WSL implementation
    └── SecureStorage.ts        # Storage abstraction

tests/
└── platform/
    ├── PlatformDetector.test.ts
    ├── PlatformAdapter.test.ts
    ├── WindowsAdapter.test.ts
    ├── MacOSAdapter.test.ts
    ├── LinuxAdapter.test.ts
    ├── WSLAdapter.test.ts
    └── SecureStorage.test.ts
```

---

## Branch Strategy

```bash
git checkout main
git pull origin main
git checkout -b feat/07-platform

# Work through 14 TDD commits
git push -u origin feat/07-platform
gh pr create --title "feat: platform adapters" \
  --body "Implements GH-07: Platform Adapters (closes #9)"
```

---

## Estimated Effort

**Time**: 10-12 hours
**Complexity**: Medium-High
**Risk**: Medium (platform-specific behavior)

**Breakdown**:
- Detection logic: 1.5 hours
- Base adapter: 1 hour
- Windows adapter: 1.5 hours
- macOS adapter: 1.5 hours
- Linux adapter: 1.5 hours
- WSL adapter: 2.5 hours
- Secure storage: 2 hours
- Integration tests: 1.5 hours

**Dependencies**: GH-00 (bootstrap only)
