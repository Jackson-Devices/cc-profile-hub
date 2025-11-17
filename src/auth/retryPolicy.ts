export interface RetryPolicy {
  maxAttempts: number;
  retryableStatusCodes: number[];
  getDelayMs(attempt: number): number;
  applyJitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  applyJitter: true,
  getDelayMs(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s
    return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
  },
};

export function shouldRetry(statusCode: number, attempt: number, policy: RetryPolicy): boolean {
  return policy.retryableStatusCodes.includes(statusCode) && attempt < policy.maxAttempts;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply jitter to delay (±20% random variation)
 */
export function applyJitter(delayMs: number): number {
  if (delayMs === 0) return 0;

  const jitterRange = 0.2; // ±20%
  const minDelay = delayMs * (1 - jitterRange);
  const maxDelay = delayMs * (1 + jitterRange);

  return Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
}
