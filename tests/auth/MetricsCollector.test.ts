import { MetricsCollector, RefreshMetric } from '../../src/auth/MetricsCollector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should record successful refresh with latency', () => {
    const metric: RefreshMetric = {
      timestamp: Date.now(),
      success: true,
      latencyMs: 250,
      profileId: 'test-profile',
    };

    collector.recordRefresh(metric);

    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject(metric);
  });

  it('should record failed refresh with error', () => {
    const metric: RefreshMetric = {
      timestamp: Date.now(),
      success: false,
      latencyMs: 150,
      profileId: 'test-profile',
      error: 'rate_limit_exceeded',
    };

    collector.recordRefresh(metric);

    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject(metric);
  });

  it('should record multiple retries', () => {
    const metric: RefreshMetric = {
      timestamp: Date.now(),
      success: true,
      latencyMs: 500,
      profileId: 'test-profile',
      retryCount: 3,
    };

    collector.recordRefresh(metric);

    const metrics = collector.getMetrics();
    expect(metrics[0].retryCount).toBe(3);
  });

  it('should record custom tags', () => {
    const metric: RefreshMetric = {
      timestamp: Date.now(),
      success: true,
      latencyMs: 200,
      profileId: 'test-profile',
      tags: {
        reason: 'token_expired',
        environment: 'production',
      },
    };

    collector.recordRefresh(metric);

    const metrics = collector.getMetrics();
    expect(metrics[0].tags).toEqual({
      reason: 'token_expired',
      environment: 'production',
    });
  });

  it('should calculate average latency', () => {
    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      profileId: 'profile-1',
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 200,
      profileId: 'profile-2',
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 300,
      profileId: 'profile-3',
    });

    const stats = collector.getStats();
    expect(stats.averageLatencyMs).toBe(200);
  });

  it('should calculate success rate', () => {
    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      profileId: 'profile-1',
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: false,
      latencyMs: 50,
      profileId: 'profile-2',
      error: 'network_error',
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 150,
      profileId: 'profile-3',
    });

    const stats = collector.getStats();
    expect(stats.totalRefreshes).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.667, 2);
  });

  it('should track total retry count', () => {
    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      profileId: 'profile-1',
      retryCount: 2,
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 200,
      profileId: 'profile-2',
      retryCount: 1,
    });

    const stats = collector.getStats();
    expect(stats.totalRetries).toBe(3);
  });

  it('should return empty stats when no metrics recorded', () => {
    const stats = collector.getStats();

    expect(stats).toEqual({
      totalRefreshes: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageLatencyMs: 0,
      totalRetries: 0,
    });
  });

  it('should filter metrics by time range', () => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoHoursAgo = now - 7200000;

    collector.recordRefresh({
      timestamp: twoHoursAgo,
      success: true,
      latencyMs: 100,
      profileId: 'old',
    });

    collector.recordRefresh({
      timestamp: oneHourAgo,
      success: true,
      latencyMs: 200,
      profileId: 'recent',
    });

    collector.recordRefresh({
      timestamp: now,
      success: true,
      latencyMs: 300,
      profileId: 'current',
    });

    const recentMetrics = collector.getMetrics({ since: oneHourAgo - 1000 });
    expect(recentMetrics).toHaveLength(2);
  });

  it('should filter metrics by profile ID', () => {
    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      profileId: 'profile-1',
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 200,
      profileId: 'profile-2',
    });

    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 300,
      profileId: 'profile-1',
    });

    const profileMetrics = collector.getMetrics({ profileId: 'profile-1' });
    expect(profileMetrics).toHaveLength(2);
    expect(profileMetrics.every((m) => m.profileId === 'profile-1')).toBe(true);
  });

  it('should limit returned metrics count', () => {
    for (let i = 0; i < 100; i++) {
      collector.recordRefresh({
        timestamp: Date.now(),
        success: true,
        latencyMs: 100,
        profileId: `profile-${i}`,
      });
    }

    const limited = collector.getMetrics({ limit: 10 });
    expect(limited).toHaveLength(10);
  });

  it('should clear all metrics', () => {
    collector.recordRefresh({
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      profileId: 'test',
    });

    expect(collector.getMetrics()).toHaveLength(1);

    collector.clear();

    expect(collector.getMetrics()).toHaveLength(0);
    expect(collector.getStats().totalRefreshes).toBe(0);
  });

  it('should respect max metrics storage limit', () => {
    const limitedCollector = new MetricsCollector({ maxMetrics: 5 });

    for (let i = 0; i < 10; i++) {
      limitedCollector.recordRefresh({
        timestamp: Date.now() + i,
        success: true,
        latencyMs: 100,
        profileId: `profile-${i}`,
      });
    }

    const metrics = limitedCollector.getMetrics();
    expect(metrics).toHaveLength(5);

    // Should keep the most recent 5
    expect(metrics[0].profileId).toBe('profile-5');
    expect(metrics[4].profileId).toBe('profile-9');
  });
});
