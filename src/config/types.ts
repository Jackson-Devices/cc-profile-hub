import { z } from 'zod';

export const ConfigSchema = z.object({
  claudePath: z.string().min(1),
  oauth: z.object({
    tokenUrl: z.string().url(),
    clientId: z.string().min(1),
    scopes: z.array(z.string()).optional().default(['user:inference']),
  }),
  logging: z
    .object({
      level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
      redactTokens: z.boolean().default(true),
    })
    .optional()
    .default(() => ({ level: 'info' as const, redactTokens: true })),
  refreshThreshold: z.number().min(60).default(300), // seconds before expiry
  rateLimiting: z
    .object({
      enabled: z.boolean().default(true),
      maxTokens: z.number().min(1).default(10),
      refillRate: z.number().min(1).default(1),
      refillInterval: z.number().min(1000).default(60000),
    })
    .optional()
    .default(() => ({
      enabled: true,
      maxTokens: 10,
      refillRate: 1,
      refillInterval: 60000,
    })),
  circuitBreaker: z
    .object({
      enabled: z.boolean().default(true),
      failureThreshold: z.number().min(1).default(5),
      resetTimeout: z.number().min(1000).default(60000),
      halfOpenMaxAttempts: z.number().min(1).default(3),
      timeout: z.number().min(1000).default(30000),
    })
    .optional()
    .default(() => ({
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenMaxAttempts: 3,
      timeout: 30000,
    })),
});

export type ConfigData = z.infer<typeof ConfigSchema>;
