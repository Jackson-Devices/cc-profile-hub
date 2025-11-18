import { ProfileManager } from '../profile/ProfileManager';
import { TokenStore } from '../auth/TokenStore';
import { Logger } from '../utils/Logger';

/**
 * Health status for a single component.
 */
export interface ComponentHealth {
  /**
   * Component name.
   */
  name: string;

  /**
   * Health status: healthy, degraded, unhealthy.
   */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Human-readable status message.
   */
  message?: string;

  /**
   * Additional metadata about the component.
   */
  metadata?: Record<string, unknown>;

  /**
   * Last check timestamp.
   */
  lastCheck: number;

  /**
   * Response time in milliseconds.
   */
  responseTimeMs?: number;
}

/**
 * Overall application health status.
 */
export interface HealthStatus {
  /**
   * Overall status (worst of all components).
   */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Timestamp of health check.
   */
  timestamp: number;

  /**
   * Individual component health checks.
   */
  checks: Record<string, ComponentHealth>;

  /**
   * Application version.
   */
  version?: string;

  /**
   * Uptime in milliseconds.
   */
  uptimeMs: number;
}

/**
 * Options for health checks.
 */
export interface HealthCheckOptions {
  /**
   * Path to profiles file.
   */
  profilesPath: string;

  /**
   * Path to token storage directory.
   */
  tokenStorePath: string;

  /**
   * Application version.
   */
  version?: string;

  /**
   * Logger instance.
   */
  logger?: Logger;
}

/**
 * Performs health checks on application components.
 * Used for liveness/readiness probes in production.
 */
export class HealthCheck {
  private profileManager: ProfileManager;
  private tokenStore: TokenStore;
  private logger: Logger;
  private version?: string;
  private startTime: number;
  private profilesPath: string;
  private tokenStorePath: string;

  constructor(options: HealthCheckOptions) {
    this.profileManager = new ProfileManager(options.profilesPath);
    this.tokenStore = new TokenStore(options.tokenStorePath);
    this.logger = options.logger || new Logger({ level: "info" });
    this.version = options.version;
    this.startTime = Date.now();
    this.profilesPath = options.profilesPath;
    this.tokenStorePath = options.tokenStorePath;
  }

  /**
   * Perform a complete health check of all components.
   * Returns overall health status with individual component checks.
   */
  async checkHealth(): Promise<HealthStatus> {
    const checks: Record<string, ComponentHealth> = {};

    // Check all components in parallel
    const [profileCheck, tokenStoreCheck, fileSystemCheck] = await Promise.all([
      this.checkProfiles(),
      this.checkTokenStore(),
      this.checkFileSystem(),
    ]);

    checks.profiles = profileCheck;
    checks.tokenStore = tokenStoreCheck;
    checks.fileSystem = fileSystemCheck;

    // Overall status is the worst of all checks
    const overallStatus = this.determineOverallStatus(Object.values(checks));

    return {
      status: overallStatus,
      timestamp: Date.now(),
      checks,
      version: this.version,
      uptimeMs: Date.now() - this.startTime,
    };
  }

  /**
   * Check if the application is alive (liveness probe).
   * Lighter weight than full health check.
   */
  async checkLiveness(): Promise<boolean> {
    // Just check if process is running and can execute code
    return true;
  }

  /**
   * Check if the application is ready to serve traffic (readiness probe).
   * More thorough than liveness check.
   */
  async checkReadiness(): Promise<boolean> {
    const health = await this.checkHealth();
    return health.status !== 'unhealthy';
  }

  /**
   * Check profile manager health.
   */
  private async checkProfiles(): Promise<ComponentHealth> {
    const start = Date.now();

    try {
      // Try to list profiles (read operation)
      const profiles = await this.profileManager.list();

      return {
        name: 'profiles',
        status: 'healthy',
        message: `${profiles.length} profiles available`,
        metadata: {
          profileCount: profiles.length,
        },
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'profiles',
        status: 'unhealthy',
        message: `Failed to access profiles: ${(error as Error).message}`,
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  /**
   * Check token store health.
   */
  private async checkTokenStore(): Promise<ComponentHealth> {
    const start = Date.now();

    try {
      // Try to read a token (should return null for non-existent profile, not error)
      await this.tokenStore.read('__health_check__');

      return {
        name: 'tokenStore',
        status: 'healthy',
        message: 'Token store accessible',
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'tokenStore',
        status: 'unhealthy',
        message: `Token store error: ${(error as Error).message}`,
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  /**
   * Check file system health.
   */
  private async checkFileSystem(): Promise<ComponentHealth> {
    const start = Date.now();

    try {
      const { access } = await import('fs/promises');
      const { constants } = await import('fs');
      const { dirname } = await import('path');

      // Check if profiles path directory is writable
      const profilesDir = dirname(this.profilesPath);
      await access(profilesDir, constants.W_OK | constants.R_OK);

      return {
        name: 'fileSystem',
        status: 'healthy',
        message: 'File system accessible',
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'fileSystem',
        status: 'unhealthy',
        message: `File system error: ${(error as Error).message}`,
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  /**
   * Determine overall status from component checks.
   */
  private determineOverallStatus(
    checks: ComponentHealth[]
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = checks.map((c) => c.status);

    if (statuses.some((s) => s === 'unhealthy')) {
      return 'unhealthy';
    }

    if (statuses.some((s) => s === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }
}
