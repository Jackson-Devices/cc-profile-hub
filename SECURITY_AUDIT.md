# Security & Robustness Assessment

## 🔴 CRITICAL ISSUES

### 1. **Mutex Deadlock Risk** (CRITICAL)
**File:** `src/utils/Mutex.ts:33`
```typescript
return new Promise<Release>((resolve) => {
  this.queue.push({ resolve });
});
```
**Issue:** Promise NEVER rejects. If lock is never released, waiters hang forever.
**Impact:** Deadlock, memory leak (unbounded queue growth)
**Attack:** Create profile, never complete operation -> DoS

### 2. **Path Traversal Vulnerability** (CRITICAL)
**File:** `src/profile/ProfileManager.ts:42-43`
```typescript
id: profileId,  // NO VALIDATION!
tokenStorePath: config.tokenStorePath,  // NO VALIDATION!
```
**Issue:** No sanitization of profileId or paths
**Attack:**
```typescript
await manager.create('../../../etc/passwd', {
  tokenStorePath: '/etc/shadow',
  // ...
});
```
**Impact:** Write files anywhere on filesystem, read sensitive files

### 3. **Race Condition in ProfileManager** (HIGH)
**File:** `src/profile/ProfileManager.ts:33-53`
```typescript
const storage = await this.loadStorage();  // Process A reads
// Process B reads here
if (storage.profiles[profileId]) { ... }   // Both see no conflict
storage.profiles[profileId] = profile;     // Both write
await this.saveStorage(storage);           // Last write wins, data lost
```
**Issue:** TOCTOU (Time-of-check-time-of-use) vulnerability
**Impact:** Profile data corruption, duplicate profiles

### 4. **AuditLogger Race Condition** (HIGH)
**File:** `src/profile/AuditLogger.ts:88-97`
```typescript
await appendFile(this.auditPath, line, 'utf-8');
await this.checkRotation();  // NOT ATOMIC!
```
**Issue:** Two processes can both trigger rotation simultaneously
**Impact:** File corruption, lost audit logs (COMPLIANCE ISSUE!)

### 5. **Resource Exhaustion** (HIGH)
**Files:** Multiple
- ProfileManager: No limit on number of profiles
- AuditLogger: No limit on queue size before rotation
- Mutex: Unbounded queue growth
**Attack:** Create 1 million profiles -> OOM
**Impact:** DoS via memory exhaustion

## 🟡 MEDIUM ISSUES

### 6. **No Input Validation**
```typescript
// profileId could be: "", ".", "..", "CON", "NUL" (Windows reserved)
// auth0Domain could be: "javascript:alert(1)" (XSS if logged to web UI)
// tokenStorePath could be: "/dev/null", "\\\\network\\share"
```

### 7. **Sensitive Data in Error Messages**
**File:** `src/profile/ProfileManager.ts:36`
```typescript
throw new ValidationError(`Profile with ID "${profileId}" already exists`, {
  profileId,  // Could leak sensitive profile names in logs
});
```

### 8. **No Rate Limiting**
- Can spam profile creation/deletion
- Can spam audit log writes
- No backpressure mechanism

### 9. **Incomplete Cleanup on Errors**
**File:** `src/profile/StateManager.ts:47-53`
```typescript
await this.profileManager.updateLastUsed(profileId);  // Could fail
// ...
await this.saveState(newState);  // State saved but profile not updated
```
**Impact:** Inconsistent state

### 10. **Log Rotation Data Loss Window**
**File:** `src/profile/AuditLogger.ts:179-199`
- Between file renames, logs could be lost if process crashes
- No fsync() to ensure data on disk
- No lock file to prevent concurrent rotation

## 🟢 LOW ISSUES

### 11. **atomicWrite Not Truly Atomic on All Platforms**
- `rename()` is atomic on POSIX but not guaranteed on Windows network drives
- No directory fsync after rename
- Crash between write and rename leaves .tmp files

### 12. **Metrics Unbounded Growth**
**File:** `src/auth/MetricsCollector.ts`
- Default maxMetrics = 10000, but never enforced if continuous writes
- No time-based expiration

### 13. **Logger Request ID Collision**
- Using 16 bytes of randomness = good
- But no collision detection
- Birthday paradox: ~50% collision after 2^64 requests

## 🧪 MISSING TESTS

Your tests didn't cover:
1. ❌ Concurrent operations (race conditions)
2. ❌ Filesystem errors (ENOSPC, EROFS, EMFILE)
3. ❌ Malicious inputs (path traversal, injection)
4. ❌ Resource exhaustion (1M profiles, 10GB logs)
5. ❌ Process crashes mid-operation
6. ❌ Multiple processes accessing same files
7. ❌ Mutex deadlock scenarios
8. ❌ Partial failures (updateLastUsed succeeds, saveState fails)

## 💥 PROOF OF CONCEPT ATTACKS

### Attack 1: Deadlock DoS
```typescript
const mutex = new Mutex();
const release = await mutex.acquire();
// Never call release() -> All subsequent operations hang forever
```

### Attack 2: Path Traversal
```typescript
await profileManager.create('../../.ssh/authorized_keys', {
  auth0Domain: 'evil.com',
  auth0ClientId: 'ssh-rsa AAAAB3...',  // Attacker's public key
  tokenStorePath: '/tmp',
});
```

### Attack 3: Audit Log Corruption
```bash
# Run simultaneously from 10 terminals:
for i in {1..1000}; do
  curl -X POST /api/profile/switch/work &
done
# Result: Corrupted audit.log due to concurrent rotation
```

### Attack 4: Resource Exhaustion
```typescript
for (let i = 0; i < 1000000; i++) {
  await profileManager.create(`profile-${i}`, config);
}
// Result: OOM, application crash
```

## ✅ RECOMMENDATIONS

1. **Add Mutex timeout**: Default 30s, configurable
2. **Validate ALL inputs**: Whitelist alphanumeric + hyphen for profileId
3. **Add ProfileManager mutex**: Wrap all operations
4. **Use file locking** for audit rotation: `flock()` or lock files
5. **Add resource limits**: Max 1000 profiles, max 100MB audit log
6. **Sanitize error messages**: Remove PII from ValidationError context
7. **Add fsync()** after critical writes
8. **Add rate limiting**: Token bucket algorithm
9. **Add integration tests** for concurrency
10. **Add fuzz testing** for input validation

## SEVERITY SUMMARY

- 🔴 **Critical:** 4 issues (Deadlock, Path Traversal, Race Conditions x2)
- 🟡 **Medium:** 6 issues
- 🟢 **Low:** 3 issues

**Current Code Quality: C-  (NOT production ready)**

The 97% test coverage gave false confidence. You tested happy paths, not failure modes or security issues.
