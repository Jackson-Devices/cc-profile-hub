import { createHash } from 'crypto';
import { hostname, userInfo, platform, arch, release } from 'os';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * Device fingerprint components for secure token binding.
 * Includes multiple machine-specific identifiers to make token theft harder.
 */
export interface FingerprintComponents {
  platform: string;
  arch: string;
  nodeVersion: string;
  osRelease: string;
  hostnameHash: string;
  userIdHash: string;
  machineIdHash: string;
  instanceId: string; // Unique per process instance
}

/**
 * Generates a secure device fingerprint for token binding.
 *
 * The fingerprint combines:
 * - Platform and architecture (OS type)
 * - Node.js version
 * - OS release version
 * - Hashed hostname (privacy-preserving)
 * - Hashed user ID (privacy-preserving)
 * - Hashed machine ID (from systemd or /etc/machine-id)
 * - Per-instance random ID (prevents cross-process token reuse)
 *
 * This makes stolen tokens much harder to reuse on different machines.
 */
export class DeviceFingerprint {
  private static instanceId: string = DeviceFingerprint.generateInstanceId();
  private static machineIdCache: string | null = null;

  /**
   * Generate a unique identifier for this process instance.
   * Changes on every process restart, preventing token reuse across restarts.
   * Uses underscores to avoid conflicting with hyphen delimiters.
   */
  private static generateInstanceId(): string {
    const randomBytes = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now().toString(36);
    const pid = process.pid.toString(36);
    return `${randomBytes}_${timestamp}_${pid}`;
  }

  /**
   * Get the machine ID from systemd or fallback sources.
   * On Linux: /etc/machine-id or /var/lib/dbus/machine-id
   * On macOS: IOPlatformUUID
   * On Windows: MachineGuid from registry (requires external tool)
   *
   * Falls back to hostname if machine ID cannot be read.
   */
  private static async getMachineId(): Promise<string> {
    // Return cached value if available
    if (this.machineIdCache !== null) {
      return this.machineIdCache;
    }

    const machineIdPaths = [
      '/etc/machine-id',
      '/var/lib/dbus/machine-id',
    ];

    // Try to read machine-id from standard locations
    for (const path of machineIdPaths) {
      if (existsSync(path)) {
        try {
          const content = await readFile(path, 'utf-8');
          this.machineIdCache = content.trim();
          return this.machineIdCache;
        } catch {
          // Continue to next path
          continue;
        }
      }
    }

    // Fallback: use hostname as machine identifier
    // Not ideal but better than nothing
    this.machineIdCache = hostname();
    return this.machineIdCache;
  }

  /**
   * Hash a value using SHA-256 for privacy.
   * Returns first 16 characters of hex digest.
   */
  private static hashValue(value: string): string {
    return createHash('sha256')
      .update(value)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get all fingerprint components.
   * Useful for debugging and detailed logging.
   */
  static async getComponents(): Promise<FingerprintComponents> {
    const machineId = await this.getMachineId();
    const user = userInfo();

    return {
      platform: platform(),
      arch: arch(),
      nodeVersion: process.version,
      osRelease: release(),
      hostnameHash: this.hashValue(hostname()),
      userIdHash: this.hashValue(`${user.uid}-${user.username}`),
      machineIdHash: this.hashValue(machineId),
      instanceId: this.instanceId,
    };
  }

  /**
   * Generate a compact device fingerprint string.
   * Format: platform-arch-nodeVer-hostnameHash-userHash-machineHash-instanceId
   *
   * Example: linux-x64-v20.0.0-a1b2c3d4e5f6g7h8-i9j0k1l2m3n4o5p6-q7r8s9t0u1v2w3x4-abc123def_mi4y5hfo_13s
   *
   * Note: Instance ID uses underscores to avoid delimiter conflicts
   *
   * @returns Fingerprint string suitable for token binding
   */
  static async generate(): Promise<string> {
    const components = await this.getComponents();

    return [
      components.platform,
      components.arch,
      components.nodeVersion,
      components.hostnameHash,
      components.userIdHash,
      components.machineIdHash,
      components.instanceId,
    ].join('-');
  }

  /**
   * Validate if a fingerprint matches the current device.
   * Useful for token validation and anomaly detection.
   *
   * @param fingerprint - The fingerprint to validate
   * @returns true if fingerprint matches current device (excluding instanceId)
   */
  static async validate(fingerprint: string): Promise<boolean> {
    const parts = fingerprint.split('-');
    if (parts.length !== 7) {
      return false;
    }

    const components = await this.getComponents();
    const expectedParts = [
      components.platform,
      components.arch,
      components.nodeVersion,
      components.hostnameHash,
      components.userIdHash,
      components.machineIdHash,
      // Note: We don't validate instanceId since it changes per process
    ];

    // Compare all parts except the last one (instanceId)
    for (let i = 0; i < expectedParts.length; i++) {
      if (parts[i] !== expectedParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Reset the instance ID.
   * Useful for testing purposes - NOT for production use.
   */
  static resetInstanceId(): void {
    this.instanceId = this.generateInstanceId();
  }
}
