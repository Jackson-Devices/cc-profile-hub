/* eslint-disable @typescript-eslint/no-explicit-any */

export function applyEnvOverrides(config: any): any {
  const overrides: any = { ...config };

  if (process.env.CC_WRAPPER_CLAUDE_PATH) {
    overrides.claudePath = process.env.CC_WRAPPER_CLAUDE_PATH;
  }

  if (process.env.CC_WRAPPER_OAUTH_CLIENT_ID) {
    overrides.oauth = {
      ...overrides.oauth,
      clientId: process.env.CC_WRAPPER_OAUTH_CLIENT_ID,
    };
  }

  if (process.env.CC_WRAPPER_OAUTH_TOKEN_URL) {
    overrides.oauth = {
      ...overrides.oauth,
      tokenUrl: process.env.CC_WRAPPER_OAUTH_TOKEN_URL,
    };
  }

  if (process.env.CC_WRAPPER_REFRESH_THRESHOLD) {
    overrides.refreshThreshold = parseInt(process.env.CC_WRAPPER_REFRESH_THRESHOLD, 10);
  }

  if (process.env.CC_WRAPPER_LOG_LEVEL) {
    overrides.logging = {
      ...overrides.logging,
      level: process.env.CC_WRAPPER_LOG_LEVEL,
    };
  }

  return overrides;
}
