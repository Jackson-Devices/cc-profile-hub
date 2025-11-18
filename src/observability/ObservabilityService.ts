import { HealthCheck, HealthStatus } from '../health/HealthCheck';
import { MetricsCollector, MetricsStats, RefreshMetric } from '../auth/MetricsCollector';

/**
 * Observability endpoint for health checks and metrics.
 * Provides JSON endpoints for monitoring and diagnostics.
 */
export class ObservabilityService {
  constructor(
    private healthCheck: HealthCheck,
    private metricsCollector?: MetricsCollector
  ) {}

  /**
   * Get full health status with all component checks.
   * Suitable for detailed health monitoring dashboards.
   */
  async getHealth(): Promise<HealthStatus> {
    return await this.healthCheck.checkHealth();
  }

  /**
   * Liveness probe - lightweight check if service is alive.
   * Returns true if process is running.
   * Suitable for Kubernetes liveness probes.
   */
  async getLiveness(): Promise<{ alive: boolean; timestamp: number }> {
    const alive = await this.healthCheck.checkLiveness();
    return {
      alive,
      timestamp: Date.now(),
    };
  }

  /**
   * Readiness probe - check if service is ready to serve traffic.
   * Returns ready status and overall health.
   * Suitable for Kubernetes readiness probes.
   */
  async getReadiness(): Promise<{ ready: boolean; status: string; timestamp: number }> {
    const health = await this.healthCheck.checkHealth();
    return {
      ready: health.status !== 'unhealthy',
      status: health.status,
      timestamp: Date.now(),
    };
  }

  /**
   * Get metrics statistics.
   * Returns aggregated metrics for token refresh operations.
   */
  getMetricsStats(): MetricsStats | null {
    if (!this.metricsCollector) {
      return null;
    }
    return this.metricsCollector.getStats();
  }

  /**
   * Get raw metrics data with optional filtering.
   */
  getMetrics(options?: {
    since?: number;
    profileId?: string;
    limit?: number;
  }): RefreshMetric[] | null {
    if (!this.metricsCollector) {
      return null;
    }
    return this.metricsCollector.getMetrics(options);
  }

  /**
   * Get comprehensive observability data.
   * Combines health status and metrics in one call.
   */
  async getObservability(): Promise<{
    health: HealthStatus;
    metrics: MetricsStats | null;
    timestamp: number;
  }> {
    const health = await this.getHealth();
    const metrics = this.getMetricsStats();

    return {
      health,
      metrics,
      timestamp: Date.now(),
    };
  }
}
