# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Core Features
- Custom error hierarchy with `BaseError`, `ConfigError`, `TokenError`, `AuthError`, `NetworkError`, and `ValidationError`
- Profile management system with CRUD operations
  - `ProfileManager` for creating, reading, updating, and deleting profiles
  - `StateManager` for atomic profile switching
  - Audit logging with automatic log rotation
  - Profile types and validation with Zod schemas
- Concurrency control with `Mutex` class for exclusive async operations
- Request ID tracking in Logger for distributed tracing
- Process timeout support in `ClaudeWrapper` (default 30min, configurable)

#### Interfaces & Abstractions
- `ITokenStore` interface extracted from `TokenStore` implementation
- `ILogger` interface extracted from `Logger` implementation
- Atomic file write utility (`atomicWrite`) for safe file operations

#### Security
- File permissions enforcement (0600) on token files
- Permission verification after token file writes
- Token data redaction in logs

#### Testing & Quality
- Comprehensive test coverage (97%+ statements, 91%+ branches)
- Test-Driven Development (TDD) approach throughout
- 252+ unit tests across all modules

#### Metrics & Observability
- `MetricsCollector` for tracking token refresh operations
- Support for refresh token rotation
- Latency, failure, and retry tracking
- Custom metrics tags

### Changed
- `TokenStore` and `EncryptedTokenStore` now use atomic writes
- `Logger` child method returns `ILogger` interface
- Error handling now uses custom error classes instead of generic `Error`

### Fixed
- ConfigLoader branch coverage for non-ENOENT errors
- ClaudeWrapper error handling edge cases
- TokenRefresher retry logic for various HTTP status codes

### Security
- MIT License added to project

## [0.1.0] - Initial Development

### Added
- Basic project structure
- Core authentication and token management
- Configuration loading with environment overrides
- AES-256-GCM encryption for token storage
- OAuth 2.0 token refresh with retry logic
- Pino-based structured logging
- Claude binary wrapper with lifecycle events

[Unreleased]: https://github.com/Jackson-Devices/cc-profile-hub/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Jackson-Devices/cc-profile-hub/releases/tag/v0.1.0
