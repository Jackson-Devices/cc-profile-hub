import { z } from 'zod';

/**
 * Configuration extracted from a profile record.
 * This is what gets passed to OAuth clients and storage components.
 * Works with any OAuth 2.0 provider (Anthropic, Auth0, custom, etc.)
 */
export interface ProfileConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  tokenStorePath: string;
  encryptionPassphrase?: string;
}

/**
 * Schema for ProfileRecord validation.
 * Generic OAuth 2.0 profile - supports any provider.
 */
export const ProfileRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(), // Human-readable profile name
  tokenUrl: z.string().url(), // OAuth token endpoint
  clientId: z.string().min(1), // OAuth client ID
  clientSecret: z.string().optional(), // Optional client secret
  scopes: z.array(z.string()).optional().default(['user:inference']), // OAuth scopes
  tokenStorePath: z.string().min(1),
  encryptionPassphrase: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().optional(),
});

/**
 * Profile record stored in the profile database.
 * Contains all configuration and metadata for a profile.
 */
export type ProfileRecord = z.infer<typeof ProfileRecordSchema>;

/**
 * Schema for WrapperState validation.
 */
export const WrapperStateSchema = z.object({
  currentProfileId: z.string().min(1).nullable(),
  lastSwitchedAt: z.coerce.date().optional(),
});

/**
 * Current state of the wrapper (which profile is active).
 * Stored separately from profile records for fast access.
 */
export type WrapperState = z.infer<typeof WrapperStateSchema>;
