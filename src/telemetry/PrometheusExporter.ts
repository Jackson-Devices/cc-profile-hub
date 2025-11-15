import { MetricsCollector, RefreshMetric } from '../auth/MetricsCollector';

/**
 * Exports metrics in Prometheus text format.
 * Integrates with MetricsCollector to expose token refresh metrics.
 */
export class PrometheusExporter {
  constructor(private metricsCollector: MetricsCollector) {}

  /**
   * Export metrics in Prometheus text format.
   * Format: https://prometheus.io/docs/instrumenting/exposition_formats/
   */
  exportMetrics(): string {
    const stats = this.metricsCollector.getStats();
    const metrics: string[] = [];

    // Token refresh success rate
    metrics.push('# HELP token_refresh_success_rate Success rate of token refresh operations');
    metrics.push('# TYPE token_refresh_success_rate gauge');
    metrics.push(`token_refresh_success_rate ${stats.successRate}`);
    metrics.push('');

    // Token refresh latency (average)
    metrics.push('# HELP token_refresh_latency_ms_avg Average latency of token refresh operations in milliseconds');
    metrics.push('# TYPE token_refresh_latency_ms_avg gauge');
    metrics.push(`token_refresh_latency_ms_avg ${stats.averageLatency}`);
    metrics.push('');

    // Token refresh total retries
    metrics.push('# HELP token_refresh_retries_total Total number of token refresh retries');
    metrics.push('# TYPE token_refresh_retries_total counter');
    metrics.push(`token_refresh_retries_total ${stats.totalRetries}`);
    metrics.push('');

    // Token refresh total attempts
    metrics.push('# HELP token_refresh_attempts_total Total number of token refresh attempts');
    metrics.push('# TYPE token_refresh_attempts_total counter');
    metrics.push(`token_refresh_attempts_total ${stats.totalAttempts}`);
    metrics.push('');

    // Token refresh successes
    metrics.push('# HELP token_refresh_success_total Total number of successful token refreshes');
    metrics.push('# TYPE token_refresh_success_total counter');
    metrics.push(`token_refresh_success_total ${stats.successCount}`);
    metrics.push('');

    // Token refresh failures
    metrics.push('# HELP token_refresh_failure_total Total number of failed token refreshes');
    metrics.push('# TYPE token_refresh_failure_total counter');
    metrics.push(`token_refresh_failure_total ${stats.failureCount}`);
    metrics.push('');

    // Per-profile metrics
    this.addPerProfileMetrics(metrics);

    return metrics.join('\n');
  }

  /**
   * Add per-profile metrics with labels.
   */
  private addPerProfileMetrics(metrics: string[]): void {
    // Get all metrics
    const allMetrics = this.metricsCollector.getMetrics({ limit: 10000 });

    // Group by profile
    const byProfile = new Map<string, RefreshMetric[]>();
    for (const metric of allMetrics) {
      const profileId = metric.profileId || 'unknown';
      if (!byProfile.has(profileId)) {
        byProfile.set(profileId, []);
      }
      byProfile.get(profileId)!.push(metric);
    }

    // Per-profile success rate
    metrics.push('# HELP token_refresh_success_rate_by_profile Success rate by profile');
    metrics.push('# TYPE token_refresh_success_rate_by_profile gauge');
    for (const [profileId, profileMetrics] of byProfile) {
      const successes = profileMetrics.filter((m) => m.success).length;
      const total = profileMetrics.length;
      const rate = total > 0 ? successes / total : 0;
      metrics.push(`token_refresh_success_rate_by_profile{profile_id="${this.escapeLabel(profileId)}"} ${rate}`);
    }
    metrics.push('');

    // Per-profile average latency
    metrics.push('# HELP token_refresh_latency_ms_avg_by_profile Average latency by profile in milliseconds');
    metrics.push('# TYPE token_refresh_latency_ms_avg_by_profile gauge');
    for (const [profileId, profileMetrics] of byProfile) {
      const latencies = profileMetrics.filter((m) => m.latencyMs !== undefined).map((m) => m.latencyMs!);
      const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
      metrics.push(`token_refresh_latency_ms_avg_by_profile{profile_id="${this.escapeLabel(profileId)}"} ${avgLatency}`);
    }
    metrics.push('');

    // Per-profile retry count
    metrics.push('# HELP token_refresh_retries_by_profile Total retries by profile');
    metrics.push('# TYPE token_refresh_retries_by_profile counter');
    for (const [profileId, profileMetrics] of byProfile) {
      const totalRetries = profileMetrics.reduce((sum, m) => sum + (m.retryCount || 0), 0);
      metrics.push(`token_refresh_retries_by_profile{profile_id="${this.escapeLabel(profileId)}"} ${totalRetries}`);
    }
    metrics.push('');
  }

  /**
   * Escape label values for Prometheus format.
   * Backslashes and quotes must be escaped.
   */
  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
