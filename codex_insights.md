# Codex Insights

## Context & Goals
- Project: Claude CLI transparent wrapper with auto-refresh, multi-profile, cross-platform support.
- Objective: close remaining spec gaps so agents can pick up isolated issues with minimal shared context.
- Method: spec-first + strict TDD, dependency-aware branching, atomic commits mapped to GitHub issues.

## Gaps Addressed
1. Core component contracts absent in `claude wrapper spec.md:31` → added explicit APIs, inputs/outputs, invariants.
2. Token refresh flow in `claude wrapper spec.md:95` lacked failure, concurrency, observability guidance → now specified.
3. TDD roadmap in `claude-wrapper-tdd-plan.md:19` was linear and missing branch/issue mapping → introduced dependency map + branch plan.
4. No blueprint for GitHub issues/branches/tests → provided per-issue atomic TDD instructions and exit criteria.

## System Specification Addendum
### Component Contracts
| Component | Key APIs | Consumes | Produces | Notes |
|-----------|----------|----------|----------|-------|
| ProcessInterceptor (`src/interceptor.ts`) | `run(argv: string[]): Promise<number>` | CLI args, env, PlatformAdapter | Exit code, forwarded stdio | Emits lifecycle events `beforeSpawn`/`afterSpawn`/`error` for telemetry. |
| AuthManager (`src/auth/manager.ts`) | `ensureValidToken()`, `invalidate(reason)`, `withToken(fn)` | TokenStore, TokenRefresher, ProfileManager | `TokenContext` | Serializes refresh via mutex; broadcasts `auth:change`. |
| TokenRefresher (`src/auth/refresher.ts`) | `refresh(refreshToken, scopes)` | HttpClient, Config | `TokenData` | Must implement jittered exponential backoff (≤4 attempts) + metrics. |
| TokenStore (`src/auth/store.ts`) | `read(profileId)`, `write(profileId, TokenData)` | PlatformAdapter, CryptoProvider | Persisted secrets | Uses OS secure store when available; otherwise AES-GCM per profile. |
| ProfileManager (`src/profiles/manager.ts`) | `list()`, `activate(id)`, `upsert(record)` | TokenStore, Config | `ProfileContext` | Guarantees atomic switch via temp file + rename + audit entry. |
| PlatformAdapter (`src/platform/*.ts`) | `detect()`, `getPaths()`, `secureStore()` | OS APIs | Platform capabilities | Windows Credential Vault, macOS Keychain, Linux libsecret, WSL bridge logic. |
| CLI Interface (`src/cli/interface.ts`) | Command handlers | AuthManager, ProfileManager, Config | CLI UX | All commands support `--json` output for automation. |
| Config (`src/config/config.ts`) | `load()`, `merge(overrides)` | YAML/ENV | Immutable config snapshot | Validated via Zod; emits `config:reload` on file watch. |
| Logger/Telemetry (`src/utils/logger.ts`, `src/telemetry/metrics.ts`) | `child(context)`, `record(metric)` | Config | Structured logs/metrics | Inserts `sessionId` from ProcessInterceptor for correlation. |

### Data & Storage
```typescript
type TokenData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;       // epoch ms
  grantedAt: number;
  scopes: string[];
  tokenType: 'Bearer';
  deviceFingerprint: string;
};

type ProfileRecord = {
  id: string;
  nickname: string;
  email: string;
  lastUsed: number;
  storageBackend: 'os-store' | 'file';
  metadata: Record<string, string>;
};

type WrapperState = {
  schema: 'cc-wrapper-state@1';
  activeProfile: string;
  profiles: Record<string, ProfileRecord>;
  auditLog: Array<{ timestamp: number; event: string; profile: string; details?: Record<string, unknown> }>;
};
```
- State lives at `${PlatformAdapter.paths.configDir}/state.json` (atomic temp-write + rename).
- Secrets stored as `claude-wrapper/<profileId>` entries in OS store; fallback path `${PlatformAdapter.paths.secretsDir}/<profileId>.enc` encrypted with AES-GCM using a master key derived from OS keyring or user passphrase fallback.

### Behavioral Guarantees
- Wrapper overhead <100 ms per command; stdout/stderr unchanged unless debug enabled.
- Tokens never logged; logger redacts `accessToken`/`refreshToken` fields automatically.
- Refresh success ≥99.9%; exponential backoff with jitter (1s, 2s, 4s, 8s) then disable profile + prompt user.
- Background refresh tick every 60 s and skips if `expiresAt - now >= threshold`.
- Metrics emitted: `token_refresh_latency_ms`, `token_refresh_failures_total`, `profile_switch_latency_ms`, `wrapper_process_duration_ms` tagged with `platform`, `profileId`, `command`.
- Audit log rotates at 1 MB preserving newest entries; writes are fsync'd.

### Operational Flows
1. **Command execution**: Interceptor → load config → resolve active profile → `ensureValidToken()` (mutex + threshold) → append audit entry → spawn `claude-original` with env `CLAUDE_OAUTH_TOKEN` → forward signals/exit code.
2. **Background refresh**: Scheduler tick → check expiry → call TokenRefresher with jitter delay → on success write token atomically + emit `auth:refresh`; on repeated failure disable profile and surface CLI hint.
3. **Profile switch**: CLI validates profile + secrets, flushes caches, updates `wrapperState.activeProfile`, emits `profile:activated`, appends audit event.
4. **Platform detection**: Adapter caches OS traits (paths, env vars, secret-store availability); WSL adapter bridges via `wslpath` and leverages Windows Credential Manager when available.

## Dependency Map
| Layer | Modules | Depends On | Provides |
|-------|---------|------------|----------|
| L0 Platform | PlatformAdapter, CryptoProvider | OS APIs | Paths, secure storage, entropy |
| L1 Config/Logging | Config, Logger, Telemetry | L0 | Runtime settings + diagnostics |
| L2 State/Profiles | TokenStore, ProfileManager | L0, L1 | Profile selection + persisted tokens |
| L3 Auth | TokenRefresher, AuthManager | L1, L2 | Valid tokens, refresh orchestration |
| L4 Interceptor | ProcessInterceptor, EnvBuilder | L1–L3 | Transparent command execution |
| L5 CLI | CLI Interface | L1–L4 | User commands |
| L6 Tests | Integration/E2E harness | All | Validation |

Dependency edges:
```
GH-00 → GH-01 → GH-02 → GH-03 → GH-04 → GH-05 → GH-06
                        ↘——————————————→ GH-08
GH-07 (platform adapters) influences GH-04/05/06 for OS-specific behavior
```

## Issue / Branch / Commit Mapping
| Issue | Feature Slice | Branch Name | Depends On |
|-------|---------------|-------------|------------|
| GH-00 | Tooling bootstrap & CI | `chore/00-bootstrap` | — |
| GH-01 | Process interceptor shell | `feat/01-interceptor` | GH-00 |
| GH-02 | Config loader + logging | `feat/02-config-logging` | GH-00 |
| GH-03 | Token store + crypto layer | `feat/03-token-store` | GH-02 |
| GH-04 | Token refresher + retry policy | `feat/04-token-refresher` | GH-03 |
| GH-05 | Auth manager + scheduler | `feat/05-auth-manager` | GH-01, GH-04 |
| GH-06 | Profile manager + CLI commands | `feat/06-profile-cli` | GH-02, GH-03 |
| GH-07 | Platform adapters (win/mac/linux/wsl) | `feat/07-platform` | GH-00 |
| GH-08 | Integration/e2e harness & docs | `feat/08-integration` | GH-01..GH-07 |

### Per-Issue TDD Blueprints
- **GH-00 (`chore/00-bootstrap`)**
  - Commits: (1) `chore: scaffold npm+ts+jest`; (2) `chore: add lint/test scripts and CI matrix`.
  - Tests: placeholder Jest spec to keep pipeline green; GitHub Actions matrix (linux/windows) running `npm run lint && npm test`.
- **GH-01 (`feat/01-interceptor`)**
  - Commits: (1) `test(wrapper): arg passthrough/stdio/signal forwarding`; (2) `feat(wrapper): implement ProcessInterceptor w/ lifecycle events`.
  - Tests: mock `cross-spawn` to assert env injection, exit code preservation, signal propagation.
- **GH-02 (`feat/02-config-logging`)**
  - Commits: (1) config schema tests (YAML + env overrides); (2) config loader implementation; (3) structured logger + telemetry stub with token redaction.
  - Tests: ensure invalid configs throw typed errors; logger hides secrets at INFO.
- **GH-03 (`feat/03-token-store`)**
  - Commits: (1) store read/write tests (OS + encrypted file fallback); (2) implementation; (3) corruption recovery tests.
  - Tests: fake PlatformAdapter, deterministic temp dirs, verify AES-GCM nonce uniqueness and fsync.
- **GH-04 (`feat/04-token-refresher`)**
  - Commits: (1) retry/backoff tests w/ fake timers + mocked axios; (2) refresher implementation w/ metrics instrumentation.
  - Tests: cover HTTP 200, 401, 429, 500; ensure jitter window ±20%.
- **GH-05 (`feat/05-auth-manager`)**
  - Commits: (1) mutex + background scheduler tests; (2) ensureValidToken implementation; (3) integration tests with TokenStore/Refresher + audit hooks.
  - Tests: concurrency (parallel ensureValidToken) refreshes once; background tick stops on `dispose()`.
- **GH-06 (`feat/06-profile-cli`)**
  - Commits: (1) profile CRUD/audit tests; (2) ProfileManager + CLI commands (list/add/switch/status); (3) CLI snapshot tests for human and `--json` output.
  - Tests: verify atomic switch, audit log rotation, CLI exit codes.
- **GH-07 (`feat/07-platform`)**
  - Commits: (1) detection/path translation tests for win/mac/linux/wsl; (2) adapter implementations; (3) fallback warning tests.
  - Tests: simulate platforms via env flags, stub secret store APIs, ensure WSL path bridging.
- **GH-08 (`feat/08-integration`)**
  - Commits: (1) integration harness wrapping fake `claude-original`; (2) multi-profile e2e covering background refresh; (3) docs/diagram refresh.
  - Tests: spawn fixture binary verifying env tokens; run on CI matrix (ubuntu, windows, macOS).

## Test Strategy
- Unit coverage ≥90% enforced via `npm run test:coverage`.
- Integration tests (`tests/integration`) added after GH-05 to cover wrapper/auth interplay.
- E2E tests (`tests/e2e`) from GH-08 validating user workflows (command exec, profile switch, forced refresh).
- Non-functional: load test (100 sequential commands <100 ms overhead) + security test (log redaction) as part of GH-05/GH-08 exit criteria.

## Operational Guardrails
- Config validation failure exits with code 78 and actionable error message.
- Platform adapter surfaces degraded-mode warning when no secure store is available.
- Token refresh failures emit telemetry + CLI hint; after repeated failures profile auto-disables until user re-authenticates.
- Background tasks cancel on process signals to prevent orphan timers.

## Next Actions
1. Create GitHub issues GH-00 … GH-08 and paste relevant spec snippets.
2. Pre-create branches listed above; enforce `branch → issue` mapping in PR templates.
3. Assign agents respecting dependencies (GH-02 + GH-07 parallel after GH-00; GH-06 waits for GH-03).
4. Keep CI (from GH-00) green across linux/mac/windows; block merges on failing coverage/tests.
