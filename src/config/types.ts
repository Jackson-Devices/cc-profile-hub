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
});

export type ConfigData = z.infer<typeof ConfigSchema>;
