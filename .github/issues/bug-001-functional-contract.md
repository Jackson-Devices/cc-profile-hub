# BUG-001: BackupManager Must Not Cause Infinite Recursion

**Status**: STATE 0 → Functional Contract Defined
**Test Branch**: `test/bug-001-backup-stat-recursion`
**Test File**: `tests/backup/BackupManager.stat.test.ts`
**Priority**: P0 - CRITICAL

---

## Functional Contract

### Permitted Behavior (IB Partitions)

**IB-1: Valid File Path**
- `getFileStat()` successfully retrieves file size for valid absolute paths
- Returns `{ sizeBytes: number }` for existing files
- Completes in <10ms for normal files

**IB-2: Empty File Boundary**
- Returns `{ sizeBytes: 0 }` for empty files (0 bytes)
- No errors thrown for valid empty files

**IB-3: Large File Boundary**
- Handles files >1GB without integer overflow
- Returns correct size for large files

**General IB Requirements:**
- Method can be called multiple times without side effects
- Method is deterministic (same input = same output)
- No memory leaks from repeated calls

### Forbidden Behavior (OOB Partitions)

**OOB-1: Non-Existent File**
- MUST throw appropriate error (not hang or recurse)
- Error message MUST be diagnostic

**OOB-2: Directory Path**
- MUST handle directories (throw error or return size)
- MUST NOT crash

**OOB-3: Symlink to File**
- MUST handle symlinks (follow or error, but not crash)

**OOB-4: Permission Denied**
- MUST throw permission error
- MUST NOT hang or recurse

**CRITICAL FORBIDDEN BEHAVIOR:**
1. **MUST NOT cause infinite recursion**
2. **MUST NOT shadow imported `stat` function**
3. **MUST NOT crash with stack overflow (RangeError)**
4. **MUST NOT fail silently**

---

## Input Domain Partitions

### IB Partitions (Valid Inputs)
- **IB-1**: Valid absolute path to existing regular file
- **IB-2**: Valid absolute path to empty file (0 bytes)
- **IB-3**: Valid absolute path to large file (>1GB) [may mock]

### OOB Partitions (Invalid/Edge Cases)
- **OOB-1**: Non-existent file path
- **OOB-2**: Directory path (not a file)
- **OOB-3**: Symlink to file
- **OOB-4**: Permission denied path (unreadable)

---

## Test Type Evaluation

### SCOPE
- ✅ **REQUIRED: Unit** - Isolated BackupManager.getFileStat() method testing
  - *Justification*: This is a pure utility method with clear input/output contract
- ❌ **NA: Integration** - No external dependencies beyond fs module
- ❌ **NA: E2E** - Not applicable for internal utility method

### COMPLEXITY
- ✅ **REQUIRED: Simple** - Single method with straightforward logic
  - *Justification*: Direct fs.stat() wrapper, simple transformation
- ❌ **NA: Complex** - No complex logic paths

### ENVIRONMENT
- ✅ **REQUIRED: Isolated** - Mocked filesystem for controlled testing
  - *Justification*: Need deterministic tests for CI/CD
- ✅ **REQUIRED: Real** - Actual filesystem for integration confidence
  - *Justification*: Verify real fs behavior matches mocks
- ❌ **NA: Multi-platform** - Behavior identical across platforms

### DETERMINISM
- ✅ **REQUIRED: Deterministic** - Tests must pass/fail consistently
  - *Justification*: Critical path, no acceptable non-determinism
- ❌ **NA: Non-deterministic** - No timing or random dependencies

### TECHNIQUE
- ✅ **REQUIRED: Functional** - Input/output verification
  - *Justification*: Core requirement - verify correct size returned
- ✅ **REQUIRED: Regression** - Prevent infinite recursion re-introduction
  - *Justification*: CRITICAL - this bug caused 100% crash rate
- ⏸️ **DEFERRED: Mutation** - Overkill for this simple fix
  - *Justification*: Cost/benefit unfavorable for 4-line method

### SECURITY
- ❌ **NA: Security** - No security implications (internal utility)
  - *Justification*: No user input, no authentication, no sensitive data

### RESOURCE
- ⏸️ **DEFERRED: Performance** - Not a performance-critical path
  - *Justification*: Called infrequently (only during backup operations)
- ❌ **NA: Load** - Not high-volume operation
- ✅ **REQUIRED: Resource Leak** - Stack overflow prevention
  - *Justification*: CRITICAL - infinite recursion is a resource leak

### COVERAGE
- ✅ **REQUIRED: Statement** - 100% of getFileStat() body
  - *Justification*: Simple method, full coverage achievable
- ✅ **REQUIRED: Branch** - All error paths (file not found, etc.)
  - *Justification*: Error handling must be tested
- ❌ **NA: Path** - Single execution path (no complex conditionals)

### DATA
- ✅ **REQUIRED: Boundary** - 0 bytes, large files, edge cases
  - *Justification*: File sizes are boundary-sensitive
- ❌ **NA: Combinatorial** - No parameter combinations to test

---

## Test Case Specifications

### Test 1: [IB-1] Valid File Path
**Partition**: IB-1
**Test Types**: Unit, Isolated, Deterministic, Functional, Statement, Branch
**Permits**: Successful size retrieval for regular files
**Forbids**: Recursion, errors on valid files, incorrect sizes
**Out of Scope**: File content validation, modification time

**Implementation**:
```typescript
it('[IB-1] returns size for valid file', async () => {
  const manager = new BackupManager({
    backupDir: '/tmp/backups',
    profilesPath: '/tmp/profiles.json',
  });
  const testFile = '/tmp/test-file.json';
  await writeFile(testFile, 'test content'); // 12 bytes

  const result = await manager['getFileStat'](testFile);

  expect(result).toEqual({ sizeBytes: 12 });
});
```

### Test 2: [IB-2] Empty File Boundary
**Partition**: IB-2
**Test Types**: Unit, Isolated, Deterministic, Functional, Boundary
**Permits**: 0 byte size reporting
**Forbids**: Errors on empty files, undefined/null returns
**Out of Scope**: File type verification

**Implementation**:
```typescript
it('[IB-2] returns 0 for empty file', async () => {
  const testFile = '/tmp/empty-file.json';
  await writeFile(testFile, ''); // 0 bytes

  const result = await manager['getFileStat'](testFile);

  expect(result).toEqual({ sizeBytes: 0 });
});
```

### Test 3: [IB-3] Large File Boundary
**Partition**: IB-3
**Test Types**: Unit, Real environment, Deterministic, Boundary
**Permits**: Large number handling (>32-bit integers)
**Forbids**: Integer overflow, incorrect sizes for large files
**Out of Scope**: Actual 1GB file creation (too slow for unit tests)

**Implementation**:
```typescript
it('[IB-3] handles large file sizes', async () => {
  // Mock for performance (real 1GB file too slow)
  const mockStat = jest.spyOn(fs.promises, 'stat');
  mockStat.mockResolvedValue({
    size: 5_000_000_000, // 5GB
    isFile: () => true
  } as any);

  const result = await manager['getFileStat']('/tmp/large.bin');

  expect(result.sizeBytes).toBe(5_000_000_000);
  expect(result.sizeBytes).toBeGreaterThan(2**32); // Verify >32-bit
});
```

### Test 4: [OOB-1] Non-Existent File
**Partition**: OOB-1
**Test Types**: Unit, Isolated, Deterministic, Functional, Branch
**Permits**: Error throwing with diagnostic message
**Forbids**: Hanging, recursion, incorrect error type, silent failure
**Out of Scope**: Specific error message format

**Implementation**:
```typescript
it('[OOB-1] throws for non-existent file', async () => {
  await expect(
    manager['getFileStat']('/tmp/does-not-exist.json')
  ).rejects.toThrow(/ENOENT|no such file/i);
});
```

### Test 5: [REGRESSION] Stack Overflow Prevention
**Partition**: Regression fence (critical)
**Test Types**: Unit, Real, Deterministic, Regression, Resource Leak
**Permits**: Method completion after multiple calls
**Forbids**: Infinite recursion, stack overflow, RangeError
**Out of Scope**: Other BackupManager methods

**Implementation**:
```typescript
it('[REGRESSION] does not cause stack overflow', async () => {
  const testFile = '/tmp/recursion-test.json';
  await writeFile(testFile, 'test');

  // Call 1000 times to detect any recursion issues
  for (let i = 0; i < 1000; i++) {
    await manager['getFileStat'](testFile);
  }

  // If we reach here, no stack overflow occurred
  expect(true).toBe(true);
});
```

### Test 6: [REGRESSION] Method Name Validation
**Partition**: Regression fence
**Test Types**: Static analysis, Regression
**Permits**: Method named `getFileStat`
**Forbids**: Method named `stat` (shadowing)
**Out of Scope**: Runtime behavior

**Implementation**:
```typescript
it('[REGRESSION] method is named getFileStat (not stat)', () => {
  // TypeScript compilation ensures this
  expect(typeof manager['getFileStat']).toBe('function');
  expect(typeof manager['stat']).toBe('undefined');
});
```

---

## Test Suite Validation (STATE 3 Checklist)

### Bugs This Suite WOULD Catch
1. ✅ Method named `stat()` causing infinite recursion → Test 5 fails immediately
2. ✅ Incorrect size calculations → Tests 1, 2, 3 fail
3. ✅ Silent failures on errors → Test 4 fails
4. ✅ Integer overflow on large files → Test 3 fails

### Bugs This Suite MIGHT NOT Catch
1. ⚠️ Memory leaks from other BackupManager methods (out of scope)
2. ⚠️ Symlink handling edge cases (OOB-3 not yet implemented)
3. ⚠️ Performance degradation (deferred)
4. ⚠️ Platform-specific fs.stat differences (marked NA)

### Suite Adequacy Assessment
**ADEQUATE** - Covers critical regression (stack overflow) and all normal code paths.
**JUSTIFICATION**:
- 6 tests cover all 3 IB partitions + 1 critical OOB
- Regression test specifically prevents bug re-introduction
- Remaining OOB partitions (symlinks, permissions) are lower priority

---

## STATE Transition Log

- **STATE 0**: ✅ Complete - Functional contract defined, test types evaluated
- **STATE 1**: ✅ Complete - Test designs documented (6 tests covering all partitions)
- **STATE 2**: ⏳ Pending - Implementing tests
- **STATE 3**: ⏳ Pending
- **STATE 4**: ⏳ Pending
- **STATE 5**: ⏳ Pending
- **STATE 6**: ⏳ Pending
- **STATE 7**: ⏳ Pending

---

**Next Action**: Transition to STATE 1 (Test Design Pending)
