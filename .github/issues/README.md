# Claude Wrapper GitHub Issues - TDD Implementation Plan

This directory contains detailed GitHub issues for implementing the Claude CLI Wrapper project using strict Test-Driven Development (TDD) methodology.

## Issue Overview

| Issue | Title | Depends On | Unblocks | Estimated Hours | Complexity |
|-------|-------|------------|----------|-----------------|------------|
| **GH-00** | Foundation & CI | None | GH-01, GH-02, GH-07 | 3-4 | Low |
| **GH-01** | CLI Intercept Shell | GH-00 | GH-05 | 5-6 | Medium |
| **GH-02** | Config Loader + Logging | GH-00 | GH-03, GH-06 | 6-8 | Medium |
| **GH-03** | Token Store + Crypto | GH-00, GH-02 | GH-04, GH-06 | 8-10 | Medium-High |
| **GH-04** | Token Refresher + Retry | GH-00, GH-03 | GH-05 | 7-9 | Medium-High |
| **GH-05** | Auth Manager + Scheduler | GH-01, GH-04 | GH-08 | 8-10 | High |
| **GH-06** | Profile Manager + CLI | GH-02, GH-03 | GH-08 | 10-12 | Medium |
| **GH-07** | Platform Adapters | GH-00 | GH-05, GH-06 | 10-12 | Medium-High |
| **GH-08** | Integration/E2E + Docs | GH-01..GH-07 | None | 12-14 | High |
| **TOTAL** | | | | **69-85 hours** | |

## Dependency Graph

```
GH-00 (Foundation)
  ├─→ GH-01 (CLI Intercept) ────────────┐
  ├─→ GH-02 (Config/Logging) ──┐        │
  │     ├─→ GH-03 (TokenStore) ─┼───┐   │
  │     │     └─→ GH-04 (Refresher) │   │
  │     │           └─→ GH-05 (Auth)│←──┘
  │     └─→ GH-06 (Profiles) ──────┼───────┐
  └─→ GH-07 (Platform) ────────────┼───┐   │
                                   │   │   │
                          GH-08 (Integration)←┘
```

## Parallel Work Opportunities

After GH-00 is complete, these can run **in parallel**:

### Wave 1 (Parallel after GH-00)
- **GH-01**: CLI Intercept Shell
- **GH-02**: Config Loader + Logging
- **GH-07**: Platform Adapters

### Wave 2 (Parallel after GH-02 + GH-07)
- **GH-03**: Token Store + Crypto (needs GH-02, GH-07)

### Wave 3 (Parallel after GH-03)
- **GH-04**: Token Refresher (needs GH-03)
- **GH-06**: Profile Manager (needs GH-02, GH-03)

### Wave 4 (After GH-01 + GH-04)
- **GH-05**: Auth Manager (needs GH-01, GH-04)

### Wave 5 (Final Integration)
- **GH-08**: Integration/E2E + Docs (needs all previous)

## TDD Workflow per Issue

Each issue follows strict RED-GREEN-REFACTOR cycle:

1. **Commit N (odd)**: Write failing test (❌ RED)
2. **Commit N+1 (even)**: Implement to pass test (✅ GREEN)
3. **Repeat** for 8-14 commits per issue

### Commit Message Format

```
type(scope): description

- test: Add failing test for feature X
- feat: Implement feature X to pass test
- refactor: Optimize feature X (if needed)
```

## File Organization

```
.github/issues/
├── README.md                      # This file
├── GH-02-config-logging.md        # Config + Logger (10 commits)
├── GH-03-token-store.md           # TokenStore + Crypto (12 commits)
├── GH-04-token-refresher.md       # OAuth refresh + retry (10 commits)
├── GH-05-auth-manager.md          # AuthManager + scheduler (10 commits)
├── GH-06-profile-manager.md       # Profiles + CLI (12 commits)
├── GH-07-platform-adapters.md     # Platform detection (14 commits)
└── GH-08-integration-e2e.md       # Integration tests (10 commits)
```

## Usage Instructions

### For Project Leads

1. Create GitHub issues from each markdown file
2. Assign issues respecting dependency graph
3. Use labels: `tdd`, `component:<name>`, `priority:<level>`
4. Track progress using GitHub Projects board

### For Developers

1. Read issue markdown completely before starting
2. Create feature branch: `git checkout -b feat/XX-<name>`
3. Follow TDD commits exactly as specified
4. Run tests after each commit: `npm test`
5. Create PR when all commits complete
6. Reference issue in PR: "Implements GH-XX (closes #N)"

## Branch Naming Convention

```
feat/02-config-logging
feat/03-token-store
feat/04-token-refresher
feat/05-auth-manager
feat/06-profile-cli
feat/07-platform
feat/08-integration
```

## Test Coverage Requirements

| Component | Minimum Coverage | Target Coverage |
|-----------|------------------|-----------------|
| Config | 95% | 98% |
| TokenStore | 95% | 98% |
| TokenRefresher | 95% | 97% |
| AuthManager | 95% | 97% |
| ProfileManager | 95% | 97% |
| PlatformAdapters | 90% | 95% |
| Integration | N/A | 100% workflows |
| **Overall** | **90%** | **95%** |

## Quality Gates

Each PR must pass:

- ✅ All unit tests (Jest)
- ✅ ESLint with zero warnings
- ✅ Prettier formatting
- ✅ TypeScript compilation
- ✅ Coverage threshold
- ✅ Manual code review
- ✅ CI/CD matrix (Linux, Windows, macOS)

## Issue Template Structure

Each issue includes:

1. **Header**: Dependencies, unblocks, external deps
2. **Overview**: What this component does
3. **TDD Workflow**: 8-14 atomic commits with code examples
4. **Acceptance Criteria**: 15-25 checkboxes
5. **Testing Strategy**: Unit/integration test cases
6. **Success Metrics**: Coverage %, pass rate
7. **Downstream Impact**: What gets unblocked
8. **Definition of Done**: Checklist
9. **Related Files**: Directory tree
10. **Branch Strategy**: Git commands
11. **Estimated Effort**: Hours, complexity, risk

## Key Features per Issue

### GH-02: Config Loader + Logging
- YAML config with Zod validation
- Environment variable overrides
- Structured logging with Pino
- Automatic token redaction

### GH-03: Token Store + Crypto Layer
- OS-native secret storage (Windows/macOS/Linux)
- AES-256-GCM encryption fallback
- Corruption recovery
- Atomic writes

### GH-04: Token Refresher + Retry Policy
- OAuth 2.0 refresh flow
- Exponential backoff with jitter
- Retry policy (429, 5xx)
- Metrics instrumentation

### GH-05: Auth Manager + Scheduler
- `ensureValidToken()` with mutex
- Background refresh (60s tick)
- Concurrent request deduplication
- Audit hooks

### GH-06: Profile Manager + CLI Commands
- CRUD profiles
- Atomic profile switching
- Audit log with rotation
- CLI: list/add/switch/status
- JSON output mode

### GH-07: Platform Adapters
- Windows (Credential Manager)
- macOS (Keychain)
- Linux (libsecret fallback)
- WSL (path translation + Windows bridge)

### GH-08: Integration/E2E + Docs
- Integration test harness
- Fixture Claude binary
- Multi-profile E2E tests
- Background refresh long-running tests
- Complete documentation

## Timeline Estimate

### Optimistic (3 developers in parallel)
- **Week 1**: GH-00, GH-01, GH-02, GH-07
- **Week 2**: GH-03, GH-04, GH-06
- **Week 3**: GH-05, GH-08
- **Total**: 3 weeks

### Realistic (2 developers)
- **Week 1-2**: GH-00, GH-01, GH-02, GH-07
- **Week 3-4**: GH-03, GH-04, GH-05, GH-06
- **Week 5**: GH-08
- **Total**: 5 weeks

### Conservative (1 developer)
- **Week 1-2**: GH-00, GH-01, GH-02
- **Week 3-4**: GH-03, GH-04, GH-07
- **Week 5-6**: GH-05, GH-06
- **Week 7**: GH-08
- **Total**: 7 weeks

## Success Criteria

Project is complete when:

- ✅ All 8 issues closed
- ✅ 90%+ test coverage
- ✅ All tests passing on Linux/Windows/macOS
- ✅ Documentation complete
- ✅ CI/CD pipeline green
- ✅ No critical bugs
- ✅ Performance benchmarks met (<100ms overhead)
- ✅ Security audit passed (token redaction verified)

## Support and Questions

For questions about:
- **TDD methodology**: See issue's "TDD Workflow" section
- **Dependencies**: Check dependency graph above
- **Testing**: See "Testing Strategy" in each issue
- **Architecture**: Read `docs/codex_insights.md`
- **Specifications**: Read `claude wrapper spec.md`

---

**Generated**: 2025-11-14
**Project**: Claude CLI Wrapper with Multi-Profile Support
**Methodology**: Test-Driven Development (TDD)
**Coverage Target**: 90%+
