# BUG-003: BackupManager Must Validate Paths and Prevent Symlink Attacks

**Status**: STATE 0 → Functional Contract Defined
**Test Branch**: `test/bug-003-backup-path-validation`
**Test File**: `tests/backup/BackupManager.security.test.ts`
**Priority**: P0 - CRITICAL (Security)

---

## Functional Contract

### Permitted Behavior (IB Partitions)

**IB-1: Valid Path Initialization**
- BackupManager accepts absolute paths in constructor
- Paths are validated against path traversal attacks
- Valid paths like `/home/user/backups` succeed
- Constructor completes without throwing for valid paths

**IB-2: Symlink Detection and Rejection**
- `checkSymlink()` detects symbolic links
- Throws error when encountering symlinks
- Prevents symlink attacks where attacker redirects to sensitive files
- Works for both backup directory and profile paths

**IB-3: Path Traversal Prevention**
- Rejects paths with `..` sequences (e.g., `/backup/../../etc/passwd`)
- Rejects relative paths (e.g., `./backups`, `backups`)
- Rejects null bytes (e.g., `/backup\0/malicious`)
- Only accepts clean, absolute paths

### Forbidden Behavior (OOB Partitions)

**OOB-1: Path Traversal Attack Vectors**
- MUST reject `..` in paths
- MUST reject relative paths
- MUST reject null byte injection
- MUST throw ValidationError with descriptive message

**OOB-2: Symlink Attack Vectors**
- MUST detect when path is a symlink
- MUST throw error before operating on symlink
- MUST prevent attacker from redirecting backup to sensitive files
- MUST check symlinks for all critical paths

**OOB-3: Missing Validation**
- MUST NOT allow constructor to proceed without path validation
- MUST NOT skip symlink checks before file operations
- MUST NOT silently accept invalid paths

**CRITICAL FORBIDDEN BEHAVIOR:**
1. **MUST NOT allow path traversal attacks**
2. **MUST NOT operate on symlinks without validation**
3. **MUST NOT skip path validation in constructor**
4. **MUST NOT allow directory traversal outside intended boundaries**

---

## Input Domain Partitions

### IB Partitions (Valid Behavior)
- **IB-1**: Absolute path without traversal (e.g., `/home/user/backups`)
- **IB-2**: Symlink detection returns error for symlinks
- **IB-3**: Path validation accepts clean absolute paths

### OOB Partitions (Attack Vectors)
- **OOB-1**: Path with `..` sequences
- **OOB-2**: Relative paths
- **OOB-3**: Null byte injection
- **OOB-4**: Symlink to sensitive file
- **OOB-5**: Non-existent path (should be allowed, created later)

---

## Test Case Specifications

### Test 1: [IB-1] Constructor Validates Paths
```typescript
it('[IB-1] constructor validates all paths', () => {
  expect(() => {
    new BackupManager({
      backupDir: '/tmp/backups',
      profilesPath: '/tmp/profiles.json',
      auditLogPath: '/tmp/audit.log',
    });
  }).not.toThrow();
});
```

### Test 2: [OOB-1] Rejects Path Traversal
```typescript
it('[OOB-1] rejects path traversal in backupDir', () => {
  expect(() => {
    new BackupManager({
      backupDir: '/tmp/../../../etc/passwd',
      profilesPath: '/tmp/profiles.json',
    });
  }).toThrow(ValidationError);
});
```

### Test 3: [OOB-2] Rejects Relative Paths
```typescript
it('[OOB-2] rejects relative paths', () => {
  expect(() => {
    new BackupManager({
      backupDir: './backups',
      profilesPath: '/tmp/profiles.json',
    });
  }).toThrow(ValidationError);
});
```

### Test 4: [IB-2] Detects Symlinks
```typescript
it('[IB-2] checkSymlink detects symbolic links', async () => {
  // Create symlink
  await symlink('/etc/passwd', '/tmp/test-symlink');

  const manager = new BackupManager({
    backupDir: '/tmp/backups',
    profilesPath: '/tmp/profiles.json',
  });

  await expect(
    manager['checkSymlink']('/tmp/test-symlink')
  ).rejects.toThrow(/symlink/i);
});
```

### Test 5: [REGRESSION] Path Validation Called
```typescript
it('[REGRESSION] constructor calls validatePath for all paths', () => {
  // Spy on validatePath
  const validatePathSpy = jest.spyOn(require('../../src/utils/InputValidator'), 'validatePath');

  new BackupManager({
    backupDir: '/tmp/backups',
    profilesPath: '/tmp/profiles.json',
    auditLogPath: '/tmp/audit.log',
  });

  expect(validatePathSpy).toHaveBeenCalledWith('/tmp/backups');
  expect(validatePathSpy).toHaveBeenCalledWith('/tmp/profiles.json');
  expect(validatePathSpy).toHaveBeenCalledWith('/tmp/audit.log');
});
```

---

## STATE Transition Log

- **STATE 0**: 🔄 IN PROGRESS - Functional contract definition
- **STATE 1**: ⏳ Pending
- **STATE 2**: ⏳ Pending
- **STATE 3**: ⏳ Pending
- **STATE 4**: ⏳ Pending
- **STATE 5**: ⏳ Pending
- **STATE 6**: ⏳ Pending
- **STATE 7**: ⏳ Pending

---

**Next Action**: Complete STATE 0, proceed to implementation
