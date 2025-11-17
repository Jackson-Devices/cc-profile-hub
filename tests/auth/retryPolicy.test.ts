import { applyJitter } from '../../src/auth/retryPolicy';

describe('Retry Policy Jitter', () => {
  it('should apply jitter within ±20% range', () => {
    const baseDelay = 1000;
    const samples: number[] = [];

    // Generate 100 samples
    for (let i = 0; i < 100; i++) {
      samples.push(applyJitter(baseDelay));
    }

    // All samples should be within ±20%
    samples.forEach((sample) => {
      expect(sample).toBeGreaterThanOrEqual(800);
      expect(sample).toBeLessThanOrEqual(1200);
    });

    // Verify we're getting distribution (not all same value)
    const unique = new Set(samples);
    expect(unique.size).toBeGreaterThan(50); // At least 50 unique values
  });

  it('should handle zero delay', () => {
    const jittered = applyJitter(0);
    expect(jittered).toBe(0);
  });

  it('should maintain average around base delay', () => {
    const baseDelay = 2000;
    const samples: number[] = [];

    for (let i = 0; i < 1000; i++) {
      samples.push(applyJitter(baseDelay));
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    // Average should be close to base delay (within 5%)
    expect(avg).toBeGreaterThan(1900);
    expect(avg).toBeLessThan(2100);
  });
});
