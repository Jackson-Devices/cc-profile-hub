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
    throw new ValidationError('Profile ID cannot be empty', {
      profileId,
    });
  }

  // Check length
  if (profileId.length > 64) {
    throw new ValidationError('Profile ID cannot exceed 64 characters', {
      profileId,
      length: profileId.length,
    });
  }

  // Check for path traversal sequences
  if (profileId.includes('..') || profileId.includes('./') || profileId === '.') {
    throw new ValidationError('Profile ID cannot contain path traversal sequences', {
      profileId,
    });
  }

  // Check for absolute paths
  if (profileId.startsWith('/') || profileId.startsWith('\\')) {
    throw new ValidationError('Profile ID cannot be an absolute path', {
      profileId,
    });
  }

  // Check for Windows paths (contains : or starts with \\)
  if (profileId.includes(':') || profileId.startsWith('\\\\')) {
    throw new ValidationError('Profile ID cannot contain Windows path separators', {
      profileId,
    });
  }

  // Check for Windows reserved names (case-insensitive)
  const upperProfileId = profileId.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(upperProfileId)) {
    throw new ValidationError('Profile ID cannot be a Windows reserved name', {
      profileId,
      reservedName: upperProfileId,
    });
  }

  // Check allowed characters: alphanumeric, hyphen, underscore
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(profileId)) {
    throw new ValidationError(
      'Profile ID can only contain alphanumeric characters, hyphens, and underscores',
      {
        profileId,
        invalidChars: profileId.match(/[^a-zA-Z0-9_-]/g),
      }
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
 *
 * @throws {ValidationError} if validation fails
 */
export function validatePath(path: string): void {
  // Check empty
  if (!path || path.trim().length === 0) {
    throw new ValidationError('Path cannot be empty', { path });
  }

  // Check for Windows absolute paths (C:\ etc) or Unix absolute paths (/)
  const isWindowsAbsolute = /^[a-zA-Z]:\\/.test(path);
  const isUnixAbsolute = path.startsWith('/');

  if (!isWindowsAbsolute && !isUnixAbsolute) {
    throw new ValidationError('Path must be absolute', {
      path,
    });
  }

  // Check for UNC paths
  if (path.startsWith('\\\\')) {
    throw new ValidationError('UNC network paths are not allowed', {
      path,
    });
  }

  // Normalize and check for path traversal
  const normalized = normalize(path);
  const resolved = resolve(path);

  // After normalization, check if we ended up in a parent directory
  if (normalized.includes('..')) {
    throw new ValidationError('Path contains traversal sequences', {
      path,
      normalized,
    });
  }

  // Check against dangerous paths (check both original and resolved)
  for (const dangerousPath of DANGEROUS_PATHS) {
    // Check resolved path
    if (resolved.startsWith(dangerousPath) ||
        resolved.toLowerCase().startsWith(dangerousPath.toLowerCase())) {
      throw new ValidationError('Path is in a protected system directory', {
        path,
        dangerousPath,
      });
    }

    // Also check original path (for Windows paths on Linux)
    if (path.startsWith(dangerousPath) ||
        path.toLowerCase().startsWith(dangerousPath.toLowerCase())) {
      throw new ValidationError('Path is in a protected system directory', {
        path,
        dangerousPath,
      });
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
    throw new ValidationError('Auth0 domain cannot be empty', { domain });
  }

  // Check for XSS attempts
  if (domain.includes('<') || domain.includes('>') || domain.includes('javascript:')) {
    throw new ValidationError('Auth0 domain contains invalid characters', {
      domain,
    });
  }

  // Basic domain validation (alphanumeric, dots, hyphens)
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;
  if (!domainPattern.test(domain)) {
    throw new ValidationError('Auth0 domain format is invalid', {
      domain,
    });
  }

  if (domain.length > 255) {
    throw new ValidationError('Auth0 domain is too long', {
      domain,
      length: domain.length,
    });
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
    throw new ValidationError('Auth0 client ID cannot be empty', { clientId });
  }

  // Auth0 client IDs are typically alphanumeric with some special chars
  const clientIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!clientIdPattern.test(clientId)) {
    throw new ValidationError('Auth0 client ID contains invalid characters', {
      clientId,
    });
  }

  if (clientId.length > 128) {
    throw new ValidationError('Auth0 client ID is too long', {
      clientId,
      length: clientId.length,
    });
  }
}
