# TDD Validation Todo - Bug Fixes Retrospective Testing

**Status**: Code-first implementation complete, now proving correctness via TDD
**Branch Strategy**: Feature branches per bug category, atomic commits per state transition
**Total Behaviors**: 10 critical bug fixes requiring validation

---

## 🎯 BRANCHING & PR STRATEGY

### Branch Hierarchy
```
main
├── claude/bug-fixes-01SMmEgKGfW1n5kGGeKQcJuP (current - all fixes)
    ├── test/bug-001-backup-stat-recursion
    ├── test/bug-002-healthcheck-access
    ├── test/bug-003-backup-path-validation
    ├── test/bug-004-redos-domain-validation
    ├── test/bug-005-profilemanager-update-validation
    ├── test/bug-006-statemanager-rollback-logging
    ├── test/bug-007-auditlogger-concurrent-append
    ├── test/bug-008-tokenrefresher-fingerprint
    └── test/bug-009-mutex-timeout-edge-case
```

### PR Strategy
- **Phase 1 PR**: Critical bugs 001-005 (P0) → merge to bug-fixes branch
- **Phase 2 PR**: High priority bugs 006-009 (P1) → merge to bug-fixes branch
- **Phase 3 PR**: bug-fixes → main (after all validation complete)

### Commit Strategy
- **Atomic commits at each state transition**
- **Commit message format**: `test(bug-NNN): [STATE N] description`
- **Examples**:
  - `test(bug-001): [STATE 0] define functional contract for stat() recursion`
  - `test(bug-001): [STATE 2] implement RED tests for stat() recursion`
  - `test(bug-001): [STATE 5] verify GREEN - all tests pass`

---

## 📋 BUG-001: BackupManager stat() Infinite Recursion

**GitHub Issue**: #TBD (create issue for behavior tracking)
**Test File**: `tests/backup/BackupManager.stat.test.ts`
**Branch**: `test/bug-001-backup-stat-recursion`

### ☐ STATE 0: Unspecified Behaviour → Functional Contract

- [ ] **Create GitHub issue** for BUG-001 behavioral contract
  - Title: "Behavior: BackupManager must not cause infinite recursion"
  - Body template:
    ```markdown
    ## Functional Contract

    ### Permitted Behavior (IB Partitions)
    1. `getFileStat()` successfully retrieves file size for valid paths
    2. Method returns `{ sizeBytes: number }` for existing files
    3. Method can be called multiple times without side effects

    ### Forbidden Behavior (OOB Partitions)
    1. MUST NOT cause infinite recursion
    2. MUST NOT shadow imported `stat` function
    3. MUST NOT crash with stack overflow
    4. MUST NOT fail for non-existent files (should throw appropriate error)

    ## Input Domain Partitions

    ### IB Partitions
    - IB-1: Valid absolute path to existing file
    - IB-2: Valid absolute path to empty file (0 bytes)
    - IB-3: Valid absolute path to large file (>1GB)

    ### OOB Partitions
    - OOB-1: Non-existent file path
    - OOB-2: Directory path (not a file)
    - OOB-3: Symlink to file
    - OOB-4: Permission denied path
    ```

- [ ] **Test Type Evaluation** (add labels to issue):

  **SCOPE:**
  - [x] Required: Unit (isolated BackupManager method)
  - [ ] NA: Integration (no external deps for this method)
  - [ ] NA: E2E

  **COMPLEXITY:**
  - [x] Required: Simple (single method validation)
  - [ ] NA: Complex

  **ENVIRONMENT:**
  - [x] Required: Isolated (mocked fs)
  - [x] Required: Real (actual filesystem)
  - [ ] NA: Multi-platform (behavior identical)

  **DETERMINISM:**
  - [x] Required: Deterministic (must always pass/fail consistently)
  - [ ] NA: Non-deterministic

  **TECHNIQUE:**
  - [x] Required: Functional (input/output verification)
  - [x] Required: Regression (prevent re-introduction)
  - [ ] Deferred: Mutation (overkill for this fix)

  **SECURITY:**
  - [ ] NA: Security (no security implications)

  **RESOURCE:**
  - [ ] Deferred: Performance (not a perf-critical path)
  - [ ] NA: Load
  - [x] Required: Resource leak (stack overflow prevention)

  **COVERAGE:**
  - [x] Required: Statement (100% of getFileStat)
  - [x] Required: Branch (error paths)
  - [ ] NA: Path (single code path)

  **DATA:**
  - [x] Required: Boundary (0 bytes, large files)
  - [ ] NA: Combinatorial

- [ ] **Commit**: `test(bug-001): [STATE 0] define functional contract and test-type evaluation`

### ☐ STATE 1: Test Design Pending

- [ ] **Design test cases** (document in issue):

  ```typescript
  // IB-1: Valid file path
  TEST: "getFileStat returns size for valid file"
  - Partition: IB-1
  - Types: Unit, Isolated, Deterministic, Functional, Statement, Branch
  - Permits: Successful size retrieval
  - Forbids: Recursion, throwing errors for valid files
  - Out of scope: File content validation

  // IB-2: Empty file
  TEST: "getFileStat returns 0 for empty file"
  - Partition: IB-2
  - Types: Unit, Isolated, Deterministic, Functional, Boundary
  - Permits: 0 byte size reporting
  - Forbids: Errors on empty files

  // IB-3: Large file (if relevant)
  TEST: "getFileStat handles large files"
  - Partition: IB-3
  - Types: Unit, Real environment, Deterministic, Boundary
  - Permits: Large number handling
  - Forbids: Integer overflow

  // OOB-1: Non-existent file
  TEST: "getFileStat throws for non-existent file"
  - Partition: OOB-1
  - Types: Unit, Isolated, Deterministic, Functional, Branch
  - Permits: Error throwing
  - Forbids: Hanging, recursion, wrong error type

  // REGRESSION: Recursion prevention
  TEST: "getFileStat does not cause stack overflow"
  - Partition: Regression fence
  - Types: Unit, Real, Deterministic, Regression, Resource leak
  - Permits: Method completion
  - Forbids: Infinite recursion, stack overflow
  - Out of scope: Other BackupManager methods
  ```

- [ ] **Verify coverage**: All 3 IB partitions + 1 critical OOB + 1 regression test = 5 tests minimum

- [ ] **Update issue** with test designs

- [ ] **Commit**: `test(bug-001): [STATE 1] design 5 test cases covering all partitions`

### ☐ STATE 2: Test Implementation Pending

- [ ] **Create branch**: `git checkout -b test/bug-001-backup-stat-recursion`

- [ ] **Create test file**: `tests/backup/BackupManager.stat.test.ts`

- [ ] **Implement tests** (must fail against current code):
  ```typescript
  describe('BackupManager.getFileStat()', () => {
    describe('[IB-1] Valid file path', () => {
      it('returns size for valid file', async () => {
        // Test implementation
      });
    });

    describe('[IB-2] Empty file boundary', () => {
      it('returns 0 for empty file', async () => {
        // Test implementation
      });
    });

    describe('[IB-3] Large file boundary', () => {
      it('handles files >1GB', async () => {
        // Test implementation - may mock
      });
    });

    describe('[OOB-1] Non-existent file', () => {
      it('throws appropriate error', async () => {
        // Test implementation
      });
    });

    describe('[REGRESSION] Stack overflow prevention', () => {
      it('does not recurse infinitely', async () => {
        // Test implementation - call 100+ times
      });
    });
  });
  ```

- [ ] **Tag tests** with types in describe blocks

- [ ] **Commit**: `test(bug-001): [STATE 2] implement 5 test cases (RED expected)`

### ☐ STATE 3: Test the Tests (Self-Validation)

- [ ] **Validate test suite quality**:
  - [ ] Identify bug test WOULD catch: Method named `stat()` causing recursion ✓
  - [ ] Identify bug test MIGHT NOT catch: Memory leaks from other methods
  - [ ] Confirm regression test would fail against old code
  - [ ] Confirm IB tests would pass against correct implementation

- [ ] **If gaps found**: Add tests, return to STATE 2

- [ ] **Update issue** with validation notes

- [ ] **Commit**: `test(bug-001): [STATE 3] validate test suite adequacy`

### ☐ STATE 4: RED (Failure Expected)

- [ ] **Run tests**: `npm test -- BackupManager.stat.test.ts`

- [ ] **Verify failures**:
  - [ ] Tests fail for correct reasons (testing getFileStat behavior)
  - [ ] No false negatives (tests don't pass incorrectly)
  - [ ] Error messages are clear and diagnostic

- [ ] **If tests pass here**: BUG IN TESTS → return to STATE 3

- [ ] **Document failure output** in issue

- [ ] **Commit**: `test(bug-001): [STATE 4] confirm RED - tests fail as expected`

### ☐ STATE 5: GREEN Implementation

- [ ] **Verify implementation** (already done - just confirm):
  - [ ] Method renamed from `stat()` to `getFileStat()`
  - [ ] No behavior changes needed

- [ ] **Run tests**: `npm test -- BackupManager.stat.test.ts`

- [ ] **Confirm GREEN**: All 5 tests pass

- [ ] **If any test fails**: Fix code (should not happen - already fixed)

- [ ] **Commit**: `test(bug-001): [STATE 5] verify GREEN - all tests pass`

### ☐ STATE 6: REFACTOR Gate

- [ ] **Review code** for refactor opportunities:
  - [ ] Is error handling optimal?
  - [ ] Are types explicit?
  - [ ] Is JSDoc complete?

- [ ] **If refactored**: Re-run tests, ensure still GREEN

- [ ] **Commit** (if changes): `test(bug-001): [STATE 6] refactor with tests still GREEN`

### ☐ STATE 7: Completion Check

- [ ] **Final verification**:
  - [x] All required test types represented (Unit, Functional, Regression, etc.)
  - [x] All partitions tested (3 IB, 1+ OOB)
  - [x] All justifications documented in issue
  - [x] No unexplained behavioral surface

- [ ] **Update issue**: Add final summary, close issue

- [ ] **Commit**: `test(bug-001): [STATE 7] complete - close behavioral contract`

- [ ] **Push branch**: `git push -u origin test/bug-001-backup-stat-recursion`

---

## 📋 BUG-002: HealthCheck Private Property Access

**GitHub Issue**: #TBD
**Test File**: `tests/health/HealthCheck.filesystem.test.ts`
**Branch**: `test/bug-002-healthcheck-access`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-002

- [ ] **Define contract**:
  ```markdown
  ## Permitted Behavior (IB)
  1. HealthCheck can access profilesPath without bracket notation
  2. FileSystem check validates directory writability
  3. Proper encapsulation (no private property access)

  ## Forbidden Behavior (OOB)
  1. MUST NOT access ProfileManager private properties
  2. MUST NOT use bracket notation for private access
  3. MUST NOT break TypeScript strict mode
  4. MUST NOT violate encapsulation
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (HealthCheck.checkFileSystem)
  - [x] Integration (with real filesystem)
  - [x] Deterministic
  - [x] Functional
  - [ ] NA: Security
  - [x] Statement coverage
  - [x] Regression (prevent bracket notation)

- [ ] **Commit**: `test(bug-002): [STATE 0] define functional contract`

### ☐ STATE 1: Test Design

- [ ] **Design tests**:
  ```
  IB-1: checkFileSystem returns healthy for writable directory
  IB-2: checkFileSystem uses this.profilesPath (not bracket access)
  OOB-1: checkFileSystem returns unhealthy for non-writable directory
  OOB-2: checkFileSystem returns unhealthy for non-existent directory
  REGRESSION: No bracket notation in implementation
  ```

- [ ] **Commit**: `test(bug-002): [STATE 1] design 5 test cases`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-002-healthcheck-access`
- [ ] **Implement tests** → commit
- [ ] **Validate suite** → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** → commit
- [ ] **Refactor check** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-003: Backup Path Validation & Symlink Protection

**GitHub Issue**: #TBD
**Test File**: `tests/backup/BackupManager.security.test.ts`
**Branch**: `test/bug-003-backup-path-validation`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-003

- [ ] **Define contract** (SECURITY CRITICAL):
  ```markdown
  ## Permitted Behavior (IB)
  1. Accept absolute paths within allowed directories
  2. Validate paths in constructor
  3. Reject symlinks before file operations
  4. Restore only to validated paths

  ## Forbidden Behavior (OOB)
  1. MUST NOT allow path traversal (../)
  2. MUST NOT accept relative paths
  3. MUST NOT follow symlinks
  4. MUST NOT write to system directories
  5. MUST NOT accept non-validated restore paths
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (constructor, checkSymlink)
  - [x] Integration (restore flow)
  - [x] **SECURITY** (path traversal, symlink attacks)
  - [x] Deterministic
  - [x] Functional + Regression
  - [x] Boundary (edge cases)
  - [x] Statement + Branch coverage

- [ ] **Commit**: `test(bug-003): [STATE 0] define SECURITY contract`

### ☐ STATE 1: Test Design

- [ ] **Design security tests**:
  ```
  IB-1: Constructor accepts valid absolute paths
  IB-2: restore() validates destination before writing
  IB-3: checkSymlink() allows regular files

  OOB-SECURITY-1: Constructor rejects path traversal (../../etc/passwd)
  OOB-SECURITY-2: Constructor rejects relative paths (./backup)
  OOB-SECURITY-3: Constructor rejects system directories (/etc, /sys, C:\Windows)
  OOB-SECURITY-4: checkSymlink() rejects symlinks
  OOB-SECURITY-5: restore() rejects symlinked backup files
  OOB-SECURITY-6: restore() rejects symlinked destination paths

  REGRESSION-1: Path traversal exploit blocked
  REGRESSION-2: Symlink attack blocked
  ```

- [ ] **Minimum 11 tests** covering all attack vectors

- [ ] **Commit**: `test(bug-003): [STATE 1] design 11 security tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-003-backup-path-validation`
- [ ] **Implement security tests** → commit
- [ ] **Validate suite** (critical: prove exploits are blocked) → commit
- [ ] **Run RED** (tests should fail against vulnerable code) → commit
- [ ] **Verify GREEN** (tests pass with fixes) → commit
- [ ] **Security review** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-004: ReDoS in Domain Validation

**GitHub Issue**: #TBD
**Test File**: `tests/utils/InputValidator.redos.test.ts`
**Branch**: `test/bug-004-redos-domain-validation`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-004

- [ ] **Define contract** (SECURITY - DoS):
  ```markdown
  ## Permitted Behavior (IB)
  1. Validate domain in O(n) time complexity
  2. Accept valid domain formats (alphanumeric, dots, hyphens)
  3. Reject domains over 255 chars BEFORE regex
  4. Return quickly for both valid and invalid inputs

  ## Forbidden Behavior (OOB)
  1. MUST NOT hang on pathological regex inputs
  2. MUST NOT allow catastrophic backtracking
  3. MUST NOT accept domains >255 chars
  4. MUST NOT allow XSS patterns
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (validateAuth0Domain)
  - [x] **SECURITY** (DoS prevention)
  - [x] **PERFORMANCE** (time-bounded validation)
  - [x] Deterministic
  - [x] Boundary (length limits, regex edge cases)
  - [x] Regression (prevent ReDoS)

- [ ] **Commit**: `test(bug-004): [STATE 0] define DoS prevention contract`

### ☐ STATE 1: Test Design

- [ ] **Design performance tests**:
  ```
  IB-1: Valid domain accepted quickly (<10ms)
  IB-2: Domain with hyphens accepted
  IB-3: Domain with dots accepted

  OOB-SECURITY-1: ReDoS pattern rejected quickly (<50ms)
  OOB-SECURITY-2: Very long domain rejected before regex
  OOB-SECURITY-3: XSS pattern rejected (<script>)
  OOB-BOUNDARY-1: 255-char domain at limit
  OOB-BOUNDARY-2: 256-char domain rejected

  PERFORMANCE-1: ReDoS attack pattern 'a' + '.-' * 30 + '!' completes <50ms
  PERFORMANCE-2: Length check happens before regex (profile execution)

  REGRESSION-1: Old regex pattern would hang (prove fix)
  ```

- [ ] **Commit**: `test(bug-004): [STATE 1] design 11 performance/security tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-004-redos-domain-validation`
- [ ] **Implement timing tests** → commit
- [ ] **Validate suite** (prove old code would hang) → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** (all <50ms) → commit
- [ ] **Performance benchmark** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-005: ProfileManager.update() Validation Bypass

**GitHub Issue**: #TBD
**Test File**: `tests/profile/ProfileManager.update.security.test.ts`
**Branch**: `test/bug-005-profilemanager-update-validation`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-005

- [ ] **Define contract** (SECURITY):
  ```markdown
  ## Permitted Behavior (IB)
  1. update() validates all fields before applying
  2. Validation matches create() requirements
  3. Partial updates only apply validated fields

  ## Forbidden Behavior (OOB)
  1. MUST NOT bypass auth0Domain validation
  2. MUST NOT bypass auth0ClientId validation
  3. MUST NOT bypass tokenStorePath validation
  4. MUST NOT allow XSS via update
  5. MUST NOT allow path traversal via update
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (update method)
  - [x] Integration (with validators)
  - [x] **SECURITY** (validation bypass prevention)
  - [x] Functional
  - [x] Regression
  - [x] Branch coverage (all validation paths)

- [ ] **Commit**: `test(bug-005): [STATE 0] define validation bypass prevention contract`

### ☐ STATE 1: Test Design

- [ ] **Design validation tests**:
  ```
  IB-1: update() with valid auth0Domain succeeds
  IB-2: update() with valid auth0ClientId succeeds
  IB-3: update() with valid tokenStorePath succeeds
  IB-4: update() with partial fields validates only provided

  OOB-SECURITY-1: update() rejects XSS in auth0Domain
  OOB-SECURITY-2: update() rejects path traversal in tokenStorePath
  OOB-SECURITY-3: update() rejects invalid auth0ClientId
  OOB-SECURITY-4: update() rejects domain >255 chars

  REGRESSION-1: Validation parity with create()
  REGRESSION-2: Bypass exploit blocked
  ```

- [ ] **Commit**: `test(bug-005): [STATE 1] design 10 validation tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-005-profilemanager-update-validation`
- [ ] **Implement validation tests** → commit
- [ ] **Validate suite** → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** → commit
- [ ] **Security review** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-006: StateManager Rollback Logging

**GitHub Issue**: #TBD
**Test File**: `tests/profile/StateManager.rollback.test.ts`
**Branch**: `test/bug-006-statemanager-rollback-logging`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-006

- [ ] **Define contract**:
  ```markdown
  ## Permitted Behavior (IB)
  1. Successful rollback logs at WARN level
  2. Failed rollback logs at ERROR level with full context
  3. Logger integration works correctly
  4. Rollback attempts are always audited

  ## Forbidden Behavior (OOB)
  1. MUST NOT silently ignore rollback failures
  2. MUST NOT lose error context
  3. MUST NOT fail to log CRITICAL events
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (switchTo with mocked logger)
  - [x] Integration (with real Logger)
  - [x] Deterministic
  - [x] Functional
  - [x] Regression (ensure logging happens)

- [ ] **Commit**: `test(bug-006): [STATE 0] define rollback logging contract`

### ☐ STATE 1: Test Design

- [ ] **Design logging tests**:
  ```
  IB-1: Successful rollback logs WARN with context
  IB-2: Failed rollback logs ERROR with full context
  IB-3: Logger receives correct log level
  IB-4: Log includes attemptedProfile, error details

  OOB-1: No logging MUST throw error

  REGRESSION-1: Silent failure prevented
  REGRESSION-2: Log format is parseable
  ```

- [ ] **Commit**: `test(bug-006): [STATE 1] design 6 logging tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-006-statemanager-rollback-logging`
- [ ] **Implement logging tests with spies** → commit
- [ ] **Validate suite** → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-007: AuditLogger Concurrent Append Race

**GitHub Issue**: #TBD
**Test File**: `tests/profile/AuditLogger.concurrency.test.ts`
**Branch**: `test/bug-007-auditlogger-concurrent-append`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-007

- [ ] **Define contract** (SECURITY - Data Integrity):
  ```markdown
  ## Permitted Behavior (IB)
  1. Concurrent log() calls do not corrupt audit file
  2. File locking prevents interleaved writes
  3. Log injection attacks blocked (sanitize profileId)
  4. All entries remain parseable as JSON

  ## Forbidden Behavior (OOB)
  1. MUST NOT allow concurrent append corruption
  2. MUST NOT allow log injection via newlines
  3. MUST NOT lose audit entries under load
  4. MUST NOT create unparseable log lines
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (log method with locking)
  - [x] Integration (multi-process simulation)
  - [x] **CONCURRENCY** (race condition testing)
  - [x] **SECURITY** (log injection)
  - [x] Non-deterministic (needs retry logic)
  - [x] Load (stress testing)
  - [x] Resource (file handle management)

- [ ] **Commit**: `test(bug-007): [STATE 0] define concurrent append contract`

### ☐ STATE 1: Test Design

- [ ] **Design concurrency tests**:
  ```
  IB-1: Sequential log() calls succeed
  IB-2: 100 concurrent log() calls via Promise.all succeed
  IB-3: All log entries are parseable JSON
  IB-4: Log count matches expected (no lost entries)

  OOB-SECURITY-1: Log injection blocked (profileId with \n)
  OOB-SECURITY-2: Sanitized profileId has newlines replaced
  OOB-CONCURRENCY-1: Interleaved writes do not occur

  LOAD-1: 1000 concurrent log() calls (stress test)

  REGRESSION-1: Corruption prevented (parse all entries)
  REGRESSION-2: File locking functional
  ```

- [ ] **Commit**: `test(bug-007): [STATE 1] design 10 concurrency tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-007-auditlogger-concurrent-append`
- [ ] **Implement concurrency tests** → commit
- [ ] **Validate suite** (run 10x to catch race) → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** (all entries intact) → commit
- [ ] **Stress test** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-008: TokenRefresher Device Fingerprint

**GitHub Issue**: #TBD
**Test File**: `tests/auth/TokenRefresher.fingerprint.test.ts`
**Branch**: `test/bug-008-tokenrefresher-fingerprint`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-008

- [ ] **Define contract** (SECURITY):
  ```markdown
  ## Permitted Behavior (IB)
  1. Fingerprint includes platform, arch, hostname, network, user, version
  2. Fingerprint is hashed for privacy
  3. Fingerprint is consistent for same machine
  4. Fingerprint length is 16 chars + platform prefix

  ## Forbidden Behavior (OOB)
  1. MUST NOT have massive collisions (>1% collision rate)
  2. MUST NOT be easily guessable
  3. MUST NOT expose sensitive data directly
  4. MUST NOT vary for same machine between calls
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (generateFingerprint)
  - [x] **SECURITY** (collision resistance)
  - [x] Deterministic (same machine = same fingerprint)
  - [x] Functional
  - [x] Data (hash validation)

- [ ] **Commit**: `test(bug-008): [STATE 0] define fingerprint contract`

### ☐ STATE 1: Test Design

- [ ] **Design fingerprint tests**:
  ```
  IB-1: Fingerprint format is 'platform-hash'
  IB-2: Hash is 16 hex characters
  IB-3: Multiple calls return same fingerprint
  IB-4: Fingerprint includes all required components

  OOB-SECURITY-1: Collision test (1000 variations)
  OOB-SECURITY-2: No direct PII in output

  REGRESSION-1: Old weak fingerprint blocked
  REGRESSION-2: Uniqueness improved (statistical test)
  ```

- [ ] **Commit**: `test(bug-008): [STATE 1] design 8 fingerprint tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-008-tokenrefresher-fingerprint`
- [ ] **Implement fingerprint tests** → commit
- [ ] **Validate suite** → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 📋 BUG-009: Mutex Timeout Edge Case

**GitHub Issue**: #TBD
**Test File**: `tests/utils/Mutex.timeout.edge.test.ts`
**Branch**: `test/bug-009-mutex-timeout-edge-case`

### ☐ STATE 0: Functional Contract

- [ ] **Create GitHub issue** for BUG-009

- [ ] **Define contract**:
  ```markdown
  ## Permitted Behavior (IB)
  1. Timeout fires correctly for slow operations
  2. Release after timeout is idempotent (no-op)
  3. Next waiter gets lock if current times out
  4. timedOut flag prevents double-resolution

  ## Forbidden Behavior (OOB)
  1. MUST NOT resolve and reject same promise
  2. MUST NOT pass lock to timed-out waiter
  3. MUST NOT cause undefined behavior on race
  ```

- [ ] **Test type evaluation**:
  - [x] Unit (acquire with timeout)
  - [x] Integration (timing-dependent)
  - [x] Non-deterministic (race condition)
  - [x] Functional
  - [x] Edge case (boundary timing)
  - [x] Regression

- [ ] **Commit**: `test(bug-009): [STATE 0] define timeout race contract`

### ☐ STATE 1: Test Design

- [ ] **Design timing tests**:
  ```
  IB-1: Timeout fires after timeoutMs
  IB-2: timedOut flag set when timeout fires
  IB-3: Next waiter gets lock after timeout

  OOB-EDGE-1: Release at T=99ms, timeout at T=100ms (race)
  OOB-EDGE-2: Timed out waiter not resolved when lock freed

  REGRESSION-1: No double-resolution (spy on resolve/reject)
  REGRESSION-2: Queue processes correctly after timeout
  ```

- [ ] **Commit**: `test(bug-009): [STATE 1] design 7 timing tests`

### ☐ STATE 2-7: Implementation → Completion

- [ ] **Branch**: `git checkout -b test/bug-009-mutex-timeout-edge-case`
- [ ] **Implement timing tests with fake timers** → commit
- [ ] **Validate suite** → commit
- [ ] **Run RED** → commit
- [ ] **Verify GREEN** → commit
- [ ] **Complete** → close issue → commit
- [ ] **Push branch**

---

## 🔄 INTEGRATION & MERGE WORKFLOW

### Phase 1: P0 Critical Bugs (001-005)

- [ ] **All P0 test branches** complete (STATE 7 reached)

- [ ] **Create integration branch**: `git checkout -b test/p0-integration`

- [ ] **Merge all P0 test branches**:
  ```bash
  git merge test/bug-001-backup-stat-recursion
  git merge test/bug-002-healthcheck-access
  git merge test/bug-003-backup-path-validation
  git merge test/bug-004-redos-domain-validation
  git merge test/bug-005-profilemanager-update-validation
  ```

- [ ] **Run full P0 test suite**: `npm test -- tests/{backup,health,utils,profile}`

- [ ] **Verify all tests GREEN**: 50+ tests covering all P0 bugs

- [ ] **Commit**: `test(p0): integrate all critical bug validation tests`

- [ ] **Create PR**: `test/p0-integration` → `claude/bug-fixes-01SMmEgKGfW1n5kGGeKQcJuP`
  - Title: "test: P0 Critical Bug Validation Suite"
  - Body: Link all 5 issues, summarize coverage
  - Require: All CI checks pass

- [ ] **Merge PR** after review

### Phase 2: P1 High Priority Bugs (006-009)

- [ ] **All P1 test branches** complete (STATE 7 reached)

- [ ] **Create integration branch**: `git checkout -b test/p1-integration`

- [ ] **Merge all P1 test branches**:
  ```bash
  git merge test/bug-006-statemanager-rollback-logging
  git merge test/bug-007-auditlogger-concurrent-append
  git merge test/bug-008-tokenrefresher-fingerprint
  git merge test/bug-009-mutex-timeout-edge-case
  ```

- [ ] **Run full P1 test suite**: `npm test -- tests/{profile,auth,utils}`

- [ ] **Verify all tests GREEN**: 30+ tests covering all P1 bugs

- [ ] **Commit**: `test(p1): integrate all high-priority bug validation tests`

- [ ] **Create PR**: `test/p1-integration` → `claude/bug-fixes-01SMmEgKGfW1n5kGGeKQcJuP`
  - Title: "test: P1 High Priority Bug Validation Suite"
  - Body: Link all 4 issues, summarize coverage

- [ ] **Merge PR** after review

### Phase 3: Final Integration

- [ ] **All test branches** merged to bug-fixes branch

- [ ] **Run FULL test suite**: `npm test`

- [ ] **Coverage report**: `npm run test:coverage`
  - Target: >95% statement coverage
  - Target: >90% branch coverage
  - Target: 100% of bug fix code covered

- [ ] **Update documentation**:
  - [ ] Update BUG_FIXES_APPLIED.md with test results
  - [ ] Update SECURITY_AUDIT.md with validation proof
  - [ ] Create TEST_COVERAGE_REPORT.md

- [ ] **Commit**: `docs: add complete test validation report`

- [ ] **Create final PR**: `claude/bug-fixes-01SMmEgKGfW1n5kGGeKQcJuP` → `main`
  - Title: "fix: All P0/P1 bugs with comprehensive test validation"
  - Body:
    - Link all 9 behavior issues
    - Include coverage report
    - List all 80+ tests
    - Security validation proof
  - Require: All CI checks, all tests GREEN, coverage >95%

- [ ] **Merge to main** after review

---

## 📊 METRICS & TRACKING

### Test Count Targets
- **Minimum**: 80 tests (8-10 per bug)
- **Target**: 100+ tests (with edge cases)

### Coverage Targets
- **Statement**: >95%
- **Branch**: >90%
- **Function**: >95%
- **Line**: >95%

### Commit Count Expected
- ~7 commits per bug (one per state transition)
- Total: ~70 atomic commits
- Plus integration commits: ~75 total

### Timeline Estimate
- **Per bug STATE 0-7**: 2-3 hours
- **Total for 9 bugs**: 18-27 hours
- **Integration & documentation**: 3-4 hours
- **TOTAL**: 21-31 hours of focused TDD work

### Daily Breakdown (recommended)
- **Day 1**: Bugs 001-002 (P0 critical)
- **Day 2**: Bugs 003-004 (P0 security)
- **Day 3**: Bug 005 + P0 integration
- **Day 4**: Bugs 006-007 (P1)
- **Day 5**: Bugs 008-009 + P1 integration
- **Day 6**: Final integration, documentation, main PR

---

## ✅ COMPLETION CRITERIA

### For Each Bug
- [x] GitHub issue created with full contract
- [x] Test-type evaluation documented with justifications
- [x] All partitions (IB + OOB) tested
- [x] Test suite validated (STATE 3)
- [x] RED confirmed (tests fail against bad code)
- [x] GREEN confirmed (tests pass against fix)
- [x] Refactor check passed
- [x] Issue closed with summary
- [x] Branch pushed

### For Overall Project
- [ ] All 9 bugs validated through TDD
- [ ] 80+ tests implemented and passing
- [ ] >95% coverage achieved
- [ ] All security bugs proven fixed
- [ ] All regression tests in place
- [ ] Documentation complete
- [ ] Final PR merged to main
- [ ] Production deployment ready

---

## 🚀 GETTING STARTED

**Start here:**

1. Create GitHub issue #1 for BUG-001
2. Follow STATE 0-7 checklist exactly
3. Make atomic commits at each state
4. Push test branch when complete
5. Move to BUG-002
6. Repeat until all 9 bugs validated

**Critical rules:**
- ✅ Never skip a state
- ✅ Always commit at state transitions
- ✅ Always validate tests before implementation
- ✅ Always run RED before GREEN
- ✅ Always document in issues

This is **proving correctness**, not just adding tests.

---

*This TODO represents ~75 atomic commits across ~9 test branches, culminating in comprehensive proof that all 10 bug fixes are correct, secure, and production-ready.*
