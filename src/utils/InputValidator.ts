import { ValidationError } from '../errors/ValidationError';
import { resolve } from 'path';

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
 *
 * @throws {ValidationError} if validation fails
 */
export function validatePath(path: string): void {
  // Check empty
  if (!path || path.trim().length === 0) {
    throw new ValidationError('Path cannot be empty');
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

  // Check for path traversal BEFORE normalization
  // This catches cases like /home/../../etc/passwd
  if (path.includes('..')) {
    throw new ValidationError('Path contains traversal sequences');
  }

  // Resolve for additional checks
  const resolved = resolve(path);

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
 * Validate an OAuth token URL.
 * URLs must be:
 * - Valid HTTPS URL format
 * - Not contain XSS sequences
 * - Not be empty
 *
 * @throws {ValidationError} if validation fails
 */
export function validateTokenUrl(url: string): void {
  if (!url || url.trim().length === 0) {
    throw new ValidationError('Token URL cannot be empty');
  }

  // Check for XSS attempts
  if (url.includes('<') || url.includes('>') || url.includes('javascript:')) {
    throw new ValidationError('Token URL contains invalid characters');
  }

  // Must be HTTPS (except localhost for testing)
  if (!url.startsWith('https://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
    throw new ValidationError('Token URL must use HTTPS');
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    throw new ValidationError('Token URL format is invalid');
  }

  if (url.length > 2048) {
    throw new ValidationError('Token URL is too long', {
      length: url.length,
    });
  }
}

/**
 * Validate an OAuth client ID.
 * Client IDs must be:
 * - Alphanumeric and certain special characters only
 * - Not empty
 * - Reasonable length
 *
 * @throws {ValidationError} if validation fails
 */
export function validateClientId(clientId: string): void {
  if (!clientId || clientId.trim().length === 0) {
    throw new ValidationError('OAuth client ID cannot be empty');
  }

  // OAuth client IDs are typically alphanumeric with some special chars
  // Allow hyphens, underscores, and UUIDs (including curly braces)
  const clientIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!clientIdPattern.test(clientId)) {
    throw new ValidationError('OAuth client ID contains invalid characters');
  }

  if (clientId.length > 256) {
    throw new ValidationError('OAuth client ID is too long', {
      length: clientId.length,
    });
  }
}

/**
 * Validate an Auth0 domain (deprecated - use validateTokenUrl).
 * @deprecated Use validateTokenUrl instead
 * @throws {ValidationError} if validation fails
 */
export function validateAuth0Domain(domain: string): void {
  validateTokenUrl(`https://${domain}/oauth/token`);
}

/**
 * Validate an Auth0 client ID (deprecated - use validateClientId).
 * @deprecated Use validateClientId instead
 * @throws {ValidationError} if validation fails
 */
export function validateAuth0ClientId(clientId: string): void {
  validateClientId(clientId);
}
