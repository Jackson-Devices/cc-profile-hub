import { ValidationError } from '../errors/ValidationError';
import { resolve, isAbsolute, normalize } from 'path';

/**
 * Windows reserved device names that cannot be used as filenames.
 */
const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

/**
 * Dangerous system paths that should never be used as token storage.
 */
const DANGEROUS_PATHS = [
  '/etc',
  '/etc/passwd',
  '/etc/shadow',
  '/root',
  '/dev',
  '/proc',
  '/sys',
  'C:\\Windows',
  'C:\\Windows\\System32',
  'C:\\Program Files',
];

/**
 * Validate a profile ID for security.
 * Profile IDs must be:
 * - Alphanumeric, hyphens, and underscores only
 * - 1-64 characters
 * - No path traversal sequences
 * - Not Windows reserved names
 *
 * @throws {ValidationError} if validation fails
 */
export function validateProfileId(profileId: string): void {
  // Check empty
  if (!profileId || profileId.trim().length === 0) {
    throw new ValidationError('Profile ID cannot be empty');
  }

  // Check length
  if (profileId.length > 64) {
    throw new ValidationError('Profile ID cannot exceed 64 characters', {
      length: profileId.length,
    });
  }

  // Check for path traversal sequences
  if (profileId.includes('..') || profileId.includes('./') || profileId === '.') {
    throw new ValidationError('Profile ID cannot contain path traversal sequences');
  }

  // Check for absolute paths
  if (profileId.startsWith('/') || profileId.startsWith('\\')) {
    throw new ValidationError('Profile ID cannot be an absolute path');
  }

  // Check for Windows paths (contains : or starts with \\)
  if (profileId.includes(':') || profileId.startsWith('\\\\')) {
    throw new ValidationError('Profile ID cannot contain Windows path separators');
  }

  // Check for Windows reserved names (case-insensitive)
  const upperProfileId = profileId.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(upperProfileId)) {
    throw new ValidationError('Profile ID cannot be a Windows reserved name');
  }

  // Check allowed characters: alphanumeric, hyphen, underscore
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(profileId)) {
    throw new ValidationError(
      'Profile ID can only contain alphanumeric characters, hyphens, and underscores'
    );
  }
}

/**
 * Validate a file path for security.
 * Paths must be:
 * - Absolute paths only
 * - Not contain path traversal after normalization
 * - Not be dangerous system paths
 * - Not be UNC paths (\\network\share)
 * - Not contain null bytes
 *
 * @throws {ValidationError} if validation fails
 */
export function validatePath(path: string): void {
  // Check empty
  if (!path || path.trim().length === 0) {
    throw new ValidationError('Path cannot be empty');
  }

  // SECURITY: Check for null byte injection (bypasses OS-level path checks)
  if (path.includes('\0') || path.includes('\x00')) {
    throw new ValidationError('Path contains null bytes (security violation)');
  }

  // Check for Windows absolute paths (C:\ etc) or Unix absolute paths (/)
  const isWindowsAbsolute = /^[a-zA-Z]:\\/.test(path);
  const isUnixAbsolute = path.startsWith('/');

  if (!isWindowsAbsolute && !isUnixAbsolute) {
    throw new ValidationError('Path must be absolute');
  }

  // Check for UNC paths
  if (path.startsWith('\\\\')) {
    throw new ValidationError('UNC network paths are not allowed');
  }

  // Normalize and check for path traversal
  const normalized = normalize(path);
  const resolved = resolve(path);

  // After normalization, check if we ended up in a parent directory
  if (normalized.includes('..')) {
    throw new ValidationError('Path contains traversal sequences');
  }

  // Check against dangerous paths (check both original and resolved)
  for (const dangerousPath of DANGEROUS_PATHS) {
    // Check resolved path
    if (resolved.startsWith(dangerousPath) ||
        resolved.toLowerCase().startsWith(dangerousPath.toLowerCase())) {
      throw new ValidationError('Path is in a protected system directory');
    }

    // Also check original path (for Windows paths on Linux)
    if (path.startsWith(dangerousPath) ||
        path.toLowerCase().startsWith(dangerousPath.toLowerCase())) {
      throw new ValidationError('Path is in a protected system directory');
    }
  }
}

/**
 * Validate an Auth0 domain.
 * Domains must be:
 * - Valid domain format
 * - Not contain XSS sequences
 * - Not be empty
 *
 * @throws {ValidationError} if validation fails
 */
export function validateAuth0Domain(domain: string): void {
  if (!domain || domain.trim().length === 0) {
    throw new ValidationError('Auth0 domain cannot be empty');
  }

  // SECURITY: Check length BEFORE regex to prevent ReDoS
  if (domain.length > 255) {
    throw new ValidationError('Auth0 domain is too long', {
      length: domain.length,
    });
  }

  // Check for XSS attempts
  if (domain.includes('<') || domain.includes('>') || domain.includes('javascript:')) {
    throw new ValidationError('Auth0 domain contains invalid characters');
  }

  // Basic domain validation (alphanumeric, dots, hyphens)
  // SECURITY: Safer regex - limits middle section to prevent backtracking
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,253}[a-zA-Z0-9])?$/;
  if (!domainPattern.test(domain)) {
    throw new ValidationError('Auth0 domain format is invalid');
  }
}

/**
 * Validate an Auth0 client ID.
 * Client IDs must be:
 * - Alphanumeric and certain special characters only
 * - Not empty
 * - Reasonable length
 *
 * @throws {ValidationError} if validation fails
 */
export function validateAuth0ClientId(clientId: string): void {
  if (!clientId || clientId.trim().length === 0) {
    throw new ValidationError('Auth0 client ID cannot be empty');
  }

  // Auth0 client IDs are typically alphanumeric with some special chars
  const clientIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!clientIdPattern.test(clientId)) {
    throw new ValidationError('Auth0 client ID contains invalid characters');
  }

  if (clientId.length > 128) {
    throw new ValidationError('Auth0 client ID is too long', {
      length: clientId.length,
    });
  }
}

/**
 * Common weak passphrases that should never be used for encryption.
 * These are easily guessable and would enable brute-force attacks.
 */
const COMMON_WEAK_PASSPHRASES = [
  'password',
  'Password',
  'PASSWORD',
  'pass1234',
  'password1',
  'password123',
  'admin123',
  'letmein',
  'welcome',
  'qwerty',
  'qwerty123',
  '12345678',
  '123456789',
  'abcdefgh',
  'passphrase',
];

/**
 * Validate an encryption passphrase.
 * SECURITY CRITICAL: Protects encrypted credentials!
 * Passphrases must be:
 * - Minimum 8 characters
 * - Maximum 1024 characters
 * - Not empty or whitespace-only
 * - Not purely numeric (weak)
 * - Not a common weak passphrase
 *
 * @throws {ValidationError} if validation fails
 */
export function validateEncryptionPassphrase(passphrase: string | undefined): void {
  // Allow undefined (passphrase is optional)
  if (passphrase === undefined) {
    return;
  }

  // Reject empty or whitespace-only
  if (!passphrase || passphrase.trim().length === 0) {
    throw new ValidationError('Encryption passphrase cannot be empty');
  }

  // Enforce minimum length (8 chars)
  if (passphrase.length < 8) {
    throw new ValidationError('Encryption passphrase must be at least 8 characters', {
      length: passphrase.length,
      minimum: 8,
    });
  }

  // Enforce maximum length (1024 chars)
  if (passphrase.length > 1024) {
    throw new ValidationError('Encryption passphrase is too long', {
      length: passphrase.length,
      maximum: 1024,
    });
  }

  // Reject purely numeric passphrases (weak)
  if (/^\d+$/.test(passphrase)) {
    throw new ValidationError('Encryption passphrase cannot be purely numeric (too weak)');
  }

  // SECURITY: Reject common weak passphrases (dictionary attack prevention)
  if (COMMON_WEAK_PASSPHRASES.includes(passphrase)) {
    throw new ValidationError('Encryption passphrase is too common (easily guessable)');
  }
}
