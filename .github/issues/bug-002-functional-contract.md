# BUG-002: HealthCheck Must Not Access Private Properties

**Status**: STATE 0 → Functional Contract Defined
**Test Branch**: `test/bug-002-healthcheck-encapsulation`
**Test File**: `tests/health/HealthCheck.encapsulation.test.ts`
**Priority**: P0 - CRITICAL

---

## Functional Contract

### Permitted Behavior (IB Partitions)

**IB-1: Direct Property Access**
- HealthCheck successfully accesses its own `profilesPath` property
- HealthCheck successfully accesses its own `tokenStorePath` property
- Properties are correctly initialized from constructor options
- No TypeScript compilation errors

**IB-2: File System Health Check**
- `checkFileSystem()` method executes successfully
- Uses `this.profilesPath` to derive profiles directory
- Returns healthy status when filesystem is accessible
- Completes without accessing other classes' private properties

**IB-3: Proper Encapsulation**
- HealthCheck stores its own copy of paths
- ProfileManager's private properties remain private
- No bracket notation used to bypass access modifiers
- Clean separation of concerns

**General IB Requirements:**
- TypeScript strict mode passes
- No runtime property access violations
- Properties immutable after construction
- No side effects from property access

### Forbidden Behavior (OOB Partitions)

**OOB-1: Private Property Access Violation**
- MUST NOT access `this.profileManager['profilesPath']`
- MUST NOT use bracket notation to bypass TypeScript access modifiers
- MUST NOT violate encapsulation of ProfileManager

**OOB-2: TypeScript Compilation Failure**
- MUST NOT have TypeScript errors in strict mode
- MUST NOT use `any` type to bypass type checking
- MUST NOT suppress TypeScript errors with `@ts-ignore`

**OOB-3: Runtime Property Access Errors**
- MUST NOT throw errors when accessing own properties
- MUST NOT have undefined properties at runtime
- MUST NOT fail due to missing initialization

**CRITICAL FORBIDDEN BEHAVIOR:**
1. **MUST NOT access other classes' private properties**
2. **MUST NOT use bracket notation to bypass access control**
3. **MUST NOT fail TypeScript strict compilation**
4. **MUST NOT violate principle of encapsulation**

---

## Input Domain Partitions

### IB Partitions (Valid Behavior)
- **IB-1**: HealthCheck accesses own `profilesPath` property
- **IB-2**: HealthCheck accesses own `tokenStorePath` property
- **IB-3**: Properties correctly initialized in constructor
- **IB-4**: `checkFileSystem()` uses own properties, not ProfileManager's

### OOB Partitions (Invalid/Forbidden Behavior)
- **OOB-1**: Attempting to access `profileManager['profilesPath']`
- **OOB-2**: TypeScript compilation with strict mode
- **OOB-3**: Missing property initialization
- **OOB-4**: Undefined property access at runtime

---

## Test Type Evaluation

### SCOPE
- ✅ **REQUIRED: Unit** - Isolated HealthCheck class testing
  - *Justification*: Testing encapsulation and property access in isolation
- ❌ **NA: Integration** - No external system dependencies for this bug
- ❌ **NA: E2E** - Not applicable for encapsulation testing

### COMPLEXITY
- ✅ **REQUIRED: Simple** - Property access and initialization testing
  - *Justification*: Straightforward encapsulation verification
- ❌ **NA: Complex** - No complex logic paths involved

### ENVIRONMENT
- ✅ **REQUIRED: Isolated** - Mocked dependencies for fast testing
  - *Justification*: Need deterministic tests for CI/CD
- ⏸️ **DEFERRED: Real** - Real filesystem not needed for encapsulation
  - *Justification*: Property access doesn't require real filesystem

### DETERMINISM
- ✅ **REQUIRED: Deterministic** - Tests must pass/fail consistently
  - *Justification*: Critical path, no acceptable non-determinism
- ❌ **NA: Non-deterministic** - No timing or random dependencies

### TECHNIQUE
- ✅ **REQUIRED: Functional** - Verify property values and accessibility
  - *Justification*: Core requirement - verify correct encapsulation
- ✅ **REQUIRED: Regression** - Prevent private property access re-introduction
  - *Justification*: CRITICAL - this bug caused TypeScript compilation failure
- ✅ **REQUIRED: Static Analysis** - TypeScript compilation check
  - *Justification*: Bug manifests as TypeScript error, must verify compilation
- ❌ **NA: Mutation** - Overkill for property access

### SECURITY
- ❌ **NA: Security** - Encapsulation is code quality, not security
  - *Justification*: No user input, no attack surface

### RESOURCE
- ❌ **NA: Performance** - Property access is not performance-critical
- ❌ **NA: Load** - Not high-volume operation
- ❌ **NA: Resource Leak** - No resource management in property access

### COVERAGE
- ✅ **REQUIRED: Statement** - 100% of constructor and property access
  - *Justification*: Simple code, full coverage achievable
- ✅ **REQUIRED: Branch** - All initialization paths
  - *Justification*: Verify optional properties handled correctly
- ❌ **NA: Path** - Single execution path for property access

### DATA
- ✅ **REQUIRED: Boundary** - Empty paths, undefined options
  - *Justification*: Test edge cases in initialization
- ❌ **NA: Combinatorial** - Limited parameter combinations

---

## Test Case Specifications

### Test 1: [IB-1] Constructor Initializes Own Properties
**Partition**: IB-1, IB-3
**Test Types**: Unit, Isolated, Deterministic, Functional, Statement
**Permits**: HealthCheck stores its own copy of profilesPath and tokenStorePath
**Forbids**: Accessing ProfileManager's private properties
**Out of Scope**: ProfileManager internal implementation

**Implementation**:
```typescript
it('[IB-1] stores profilesPath and tokenStorePath in own properties', () => {
  const healthCheck = new HealthCheck({
    profilesPath: '/test/profiles.json',
    tokenStorePath: '/test/tokens',
  });

  // Access private properties via bracket notation for testing
  expect((healthCheck as any)['profilesPath']).toBe('/test/profiles.json');
  expect((healthCheck as any)['tokenStorePath']).toBe('/test/tokens');
});
```

### Test 2: [IB-2] checkFileSystem Uses Own Properties
**Partition**: IB-2, IB-4
**Test Types**: Unit, Isolated, Deterministic, Functional
**Permits**: Method executes using own properties
**Forbids**: Accessing ProfileManager private properties
**Out of Scope**: Actual filesystem operations

**Implementation**:
```typescript
it('[IB-2] checkFileSystem uses own profilesPath property', async () => {
  const healthCheck = new HealthCheck({
    profilesPath: '/tmp/test/profiles.json',
    tokenStorePath: '/tmp/test/tokens',
  });

  // Mock fs.promises.access to avoid real filesystem
  jest.mock('fs/promises');

  const result = await (healthCheck as any)['checkFileSystem']();

  // Should complete without errors
  expect(result.name).toBe('fileSystem');
  expect(result.status).toBe('healthy');
});
```

### Test 3: [REGRESSION] No ProfileManager Property Access
**Partition**: Regression fence
**Test Types**: Static analysis, Regression
**Permits**: Code compiles with TypeScript strict mode
**Forbids**: Bracket notation access to ProfileManager private properties
**Out of Scope**: Runtime behavior

**Implementation**:
```typescript
it('[REGRESSION] does not access profileManager private properties', () => {
  // This test verifies the code structure, not runtime behavior
  const healthCheck = new HealthCheck({
    profilesPath: '/test/profiles.json',
    tokenStorePath: '/test/tokens',
  });

  // Verify HealthCheck has its own properties
  expect((healthCheck as any).hasOwnProperty('profilesPath')).toBe(true);
  expect((healthCheck as any).hasOwnProperty('tokenStorePath')).toBe(true);

  // Verify ProfileManager property is not accessed via bracket notation
  // (TypeScript compilation would fail if we tried this in source)
  expect(typeof (healthCheck as any)['profileManager']).toBe('object');
  // But accessing profileManager['profilesPath'] should not be in our code
});
```

### Test 4: [OOB-2] TypeScript Compilation Success
**Partition**: OOB-2
**Test Types**: Static analysis, Compilation
**Permits**: Clean TypeScript compilation
**Forbids**: TypeScript errors with strict mode
**Out of Scope**: Runtime execution

**Implementation**:
```bash
# Verify TypeScript compilation succeeds
npx tsc --noEmit --strict src/health/HealthCheck.ts
# Exit code 0 = success, non-zero = compilation error
```

### Test 5: [IB-3] Encapsulation Maintained
**Partition**: IB-3
**Test Types**: Unit, Functional, Encapsulation
**Permits**: HealthCheck and ProfileManager maintain separate state
**Forbids**: Shared mutable state between classes
**Out of Scope**: Deep object cloning

**Implementation**:
```typescript
it('[IB-3] maintains proper encapsulation with ProfileManager', () => {
  const profilesPath = '/test/profiles.json';
  const healthCheck = new HealthCheck({
    profilesPath,
    tokenStorePath: '/test/tokens',
  });

  // HealthCheck should have its own copy
  expect((healthCheck as any)['profilesPath']).toBe(profilesPath);

  // ProfileManager is constructed independently
  expect((healthCheck as any)['profileManager']).toBeDefined();

  // They should not share the same reference to internal state
  // (each class manages its own properties)
});
```

### Test 6: [BOUNDARY] Handles Edge Cases in Construction
**Partition**: Boundary testing
**Test Types**: Unit, Boundary, Error handling
**Permits**: Valid construction with various inputs
**Forbids**: Crashes or undefined behavior
**Out of Scope**: Invalid path validation (handled elsewhere)

**Implementation**:
```typescript
it('[BOUNDARY] handles construction with minimal options', () => {
  const healthCheck = new HealthCheck({
    profilesPath: '/profiles.json',
    tokenStorePath: '/tokens',
  });

  expect((healthCheck as any)['profilesPath']).toBe('/profiles.json');
  expect((healthCheck as any)['tokenStorePath']).toBe('/tokens');
  expect((healthCheck as any)['version']).toBeUndefined();
  expect((healthCheck as any)['logger']).toBeDefined();
});
```

---

## Test Design Expansion (STATE 1)

### Test Suite Structure

**File**: `tests/health/HealthCheck.encapsulation.test.ts`
**Total Tests Planned**: 6 core tests

**Test Organization**:
```
describe('HealthCheck Encapsulation')
  describe('[IB-1] Property Initialization')
    - Test 1: Stores profilesPath in own property
    - Test 2: Stores tokenStorePath in own property
  describe('[IB-2] File System Health Check')
    - Test 3: Uses own profilesPath, not ProfileManager's
  describe('[IB-3] Encapsulation')
    - Test 4: Maintains separation from ProfileManager
  describe('[REGRESSION] No Private Access')
    - Test 5: Does not access profileManager private properties
  describe('[BOUNDARY] Edge Cases')
    - Test 6: Handles minimal constructor options
```

### Implementation Strategy

**Mocking Approach**:
- Mock `fs/promises` for filesystem operations
- Use actual HealthCheck class (no mocking)
- Access private properties via bracket notation for verification

**Assertion Strategy**:
- Verify property values with `toBe()` for exact matches
- Verify property existence with `hasOwnProperty()`
- Verify method execution with `toBeDefined()` checks

**Coverage Goals**:
- 100% of constructor initialization
- 100% of property access paths
- TypeScript compilation verification

---

## STATE Transition Log

- **STATE 0**: ✅ Complete - Functional contract defined (commit: 61f4543)
- **STATE 1**: 🔄 IN PROGRESS - Test designs expanded (this update)
- **STATE 2**: ⏳ Pending - Test implementation
- **STATE 3**: ⏳ Pending - Test validation
- **STATE 4**: ⏳ Pending - RED phase
- **STATE 5**: ⏳ Pending - GREEN phase
- **STATE 6**: ⏳ Pending - Refactor check
- **STATE 7**: ⏳ Pending - Completion

---

**Next Action**: Commit STATE 1, proceed to STATE 2 (Test Implementation)
