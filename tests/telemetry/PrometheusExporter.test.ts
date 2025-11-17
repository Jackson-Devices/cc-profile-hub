import { PrometheusExporter } from '../../src/telemetry/PrometheusExporter';
import { MetricsCollector } from '../../src/auth/MetricsCollector';

describe('PrometheusExporter', () => {
  let metricsCollector: MetricsCollector;
  let exporter: PrometheusExporter;

  beforeEach(() => {
    metricsCollector = new MetricsCollector();
    exporter = new PrometheusExporter(metricsCollector);
  });

  afterEach(() => {
    metricsCollector.destroy();
  });

  describe('exportMetrics', () => {
    it('should export metrics in Prometheus format', () => {
      // Record some metrics
      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 123,
        retryCount: 0,
        timestamp: Date.now(),
        
        profileId: 'test-profile',
      });

      const output = exporter.exportMetrics();

      expect(output).toContain('token_refresh_success_rate');
      expect(output).toContain('token_refresh_latency_ms_avg');
      expect(output).toContain('token_refresh_retries_total');
    });

    it('should include HELP and TYPE annotations', () => {
      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 100,
        retryCount: 0,
        timestamp: Date.now(),
        profileId: 'test',
      });

      const output = exporter.exportMetrics();

      expect(output).toMatch(/# HELP token_refresh_success_rate/);
      expect(output).toMatch(/# TYPE token_refresh_success_rate gauge/);
    });

    it('should export success rate correctly', () => {
      // 3 successes, 1 failure
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordRefresh({
          success: true,
          latencyMs: 100,
          retryCount: 0,
          timestamp: Date.now(),
        
          profileId: 'test',
        });
      }

      metricsCollector.recordRefresh({
        success: false,
        latencyMs: 100,
        retryCount: 2,
        timestamp: Date.now(),
        
        profileId: 'test',
        error: 'Test error',
      });

      const output = exporter.exportMetrics();

      // Success rate should be 0.75 (3/4)
      expect(output).toMatch(/token_refresh_success_rate 0\.75/);
    });

    it('should export average latency correctly', () => {
      // Latencies: 100, 200, 300 -> avg = 200
      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 100,
        retryCount: 0,
        timestamp: Date.now(),
        profileId: 'test',
      });

      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 200,
        retryCount: 0,
        timestamp: Date.now(),
        profileId: 'test',
      });

      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 300,
        retryCount: 0,
        timestamp: Date.now(),
        profileId: 'test',
      });

      const output = exporter.exportMetrics();

      expect(output).toMatch(/token_refresh_latency_ms_avg 200/);
    });

    it('should export retry counts', () => {
      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 100,
        retryCount: 2,
        timestamp: Date.now(),
        profileId: 'test',
      });

      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 150,
        retryCount: 1,
        timestamp: Date.now(),
        profileId: 'test',
      });

      const output = exporter.exportMetrics();

      // Total retries should be 3 (2 + 1)
      expect(output).toMatch(/token_refresh_retries_total 3/);
    });

    it('should export per-profile metrics with labels', () => {
      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 100,
        retryCount: 0,
        timestamp: Date.now(),
        
        profileId: 'profile-1',
      });

      metricsCollector.recordRefresh({
        success: false,
        latencyMs: 200,
        retryCount: 1,
        timestamp: Date.now(),
        
        profileId: 'profile-2',
      });

      const output = exporter.exportMetrics();

      expect(output).toContain('token_refresh_success_rate_by_profile{profile_id="profile-1"}');
      expect(output).toContain('token_refresh_success_rate_by_profile{profile_id="profile-2"}');
      expect(output).toContain('token_refresh_latency_ms_avg_by_profile{profile_id="profile-1"}');
    });

    it('should escape special characters in labels', () => {
      metricsCollector.recordRefresh({
        success: true,
        latencyMs: 100,
        retryCount: 0,
        timestamp: Date.now(),
        
        profileId: 'profile"with\\quotes',
      });

      const output = exporter.exportMetrics();

      // Should escape backslashes and quotes
      expect(output).toContain('profile_id="profile\\"with\\\\quotes"');
    });

    it('should handle zero metrics gracefully', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('token_refresh_success_rate 0');
      expect(output).toContain('token_refresh_latency_ms_avg 0');
    });
  });
});
