export interface RefreshMetric {
  timestamp: number;
  success: boolean;
  latencyMs: number;
  profileId: string;
  retryCount?: number;
  error?: string;
  tags?: Record<string, string>;
}

export interface MetricsStats {
  totalRefreshes: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageLatencyMs: number;
  totalRetries: number;
}

export interface MetricsFilter {
  since?: number;
  profileId?: string;
  limit?: number;
}

export interface MetricsCollectorOptions {
  maxMetrics?: number;
  /**
   * Maximum age of metrics in milliseconds before they are automatically cleaned up.
   * Default: 1 hour (3600000ms)
   */
  maxAge?: number;
}

export class MetricsCollector {
  private metrics: RefreshMetric[] = [];
  private readonly maxMetrics: number;
  private readonly maxAge: number;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(options: MetricsCollectorOptions = {}) {
    this.maxMetrics = options.maxMetrics || 1000;
    this.maxAge = options.maxAge || 3600000; // 1 hour default

    // Periodically clean up old metrics
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute

    // Allow Node to exit even if cleanup is pending
    this.cleanupInterval.unref();
  }

  recordRefresh(metric: RefreshMetric): void {
    this.metrics.push(metric);

    // Enforce max metrics limit - keep most recent
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(this.metrics.length - this.maxMetrics);
    }
  }

  /**
   * Remove metrics older than maxAge.
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.maxAge;
    this.metrics = this.metrics.filter((m) => m.timestamp >= cutoff);
  }

  /**
   * Stop the cleanup interval.
   * Call this when shutting down to prevent memory leaks.
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.metrics = [];
  }

  getMetrics(filter?: MetricsFilter): RefreshMetric[] {
    let filtered = [...this.metrics];

    // Filter by time range
    if (filter?.since) {
      filtered = filtered.filter((m) => m.timestamp >= filter.since!);
    }

    // Filter by profile ID
    if (filter?.profileId) {
      filtered = filtered.filter((m) => m.profileId === filter.profileId);
    }

    // Apply limit
    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getStats(): MetricsStats {
    if (this.metrics.length === 0) {
      return {
        totalRefreshes: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        averageLatencyMs: 0,
        totalRetries: 0,
      };
    }

    const successCount = this.metrics.filter((m) => m.success).length;
    const failureCount = this.metrics.filter((m) => !m.success).length;
    const totalLatency = this.metrics.reduce((sum, m) => sum + m.latencyMs, 0);
    const totalRetries = this.metrics.reduce((sum, m) => sum + (m.retryCount || 0), 0);

    return {
      totalRefreshes: this.metrics.length,
      successCount,
      failureCount,
      successRate: successCount / this.metrics.length,
      averageLatencyMs: totalLatency / this.metrics.length,
      totalRetries,
    };
  }

  clear(): void {
    this.metrics = [];
  }
}
