import { AuthManager } from '../auth/AuthManager';
import { TokenRefresher } from '../auth/TokenRefresher';
import { EncryptedTokenStore } from '../auth/EncryptedTokenStore';
import { ConfigLoader } from '../config/ConfigLoader';
import { Logger } from '../utils/Logger';
import { ClaudeWrapper } from '../wrapper/ClaudeWrapper';
import { RateLimiter } from '../utils/RateLimiter';
import { homedir } from 'os';
import { join } from 'path';
import axios from 'axios';
import { MetricsCollector } from '../auth/MetricsCollector';

export interface SimpleCLIConfig {
  configPath?: string;
  profileId?: string;
  logger?: Logger;
}

/**
 * Simplified CLI that wraps Claude with automatic token refresh.
 * Uses a single default profile for now.
 */
export class SimpleCLI {
  private configPath: string;
  private profileId: string;
  private logger: Logger;

  constructor(config: SimpleCLIConfig = {}) {
    this.configPath = config.configPath || join(homedir(), '.claude-wrapper.yml');
    this.profileId = config.profileId || process.env.CLAUDE_PROFILE || 'default';
    this.logger = config.logger || new Logger({ level: (process.env.LOG_LEVEL as any) || 'info' });
  }

  async run(args: string[]): Promise<number> {
    try {
      // Handle special commands
      if (args.includes('--wrapper-status')) {
        return await this.handleStatus();
      }

      if (args.includes('--wrapper-refresh')) {
        return await this.handleRefresh();
      }

      if (args.includes('--wrapper-help')) {
        this.showHelp();
        return 0;
      }

      // Normal Claude command - ensure token is valid and proxy
      return await this.proxyToClaude(args);
    } catch (error) {
      this.logger.error('CLI error', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('Error:', error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  private showHelp(): void {
    console.log('Claude Wrapper - Automatic token refresh for Claude CLI');
    console.log('');
    console.log('Usage:');
    console.log('  claude [args...]              Run Claude CLI with automatic token refresh');
    console.log('  claude --wrapper-status       Show current authentication status');
    console.log('  claude --wrapper-refresh      Force token refresh');
    console.log('  claude --wrapper-help         Show this help message');
    console.log('');
    console.log('Environment Variables:');
    console.log('  CLAUDE_PROFILE               Profile to use (default: "default")');
    console.log('  LOG_LEVEL                    Log level (default: "info")');
    console.log('  CLAUDE_WRAPPER_PASSPHRASE    Encryption passphrase for tokens');
    console.log('');
    console.log('Configuration:');
    console.log('  ~/.claude-wrapper.yml        Main configuration file');
    console.log('  ~/.claude-wrapper/tokens/    Token storage directory');
  }

  private async handleStatus(): Promise<number> {
    const tokenStore = this.createTokenStore();
    const token = await tokenStore.read(this.profileId);

    console.log(`Profile: ${this.profileId}`);

    if (!token) {
      console.log('Status: Not authenticated');
      console.log('');
      console.log('To authenticate, run the original Claude CLI:');
      console.log('  claude-original auth login');
      return 1;
    }

    const now = Date.now();
    const timeUntilExpiry = token.expiresAt - now;
    const isExpired = timeUntilExpiry <= 0;

    console.log(`Status: ${isExpired ? 'Expired' : 'Valid'}`);
    console.log(`Expires: ${new Date(token.expiresAt).toISOString()}`);
    console.log(`Time until expiry: ${Math.floor(timeUntilExpiry / 1000)}s`);
    console.log(`Scopes: ${token.scopes.join(', ')}`);

    return 0;
  }

  private async handleRefresh(): Promise<number> {
    console.log(`Refreshing token for profile: ${this.profileId}`);

    const authManager = await this.createAuthManager();
    const token = await authManager.ensureValidToken();

    console.log('✓ Token refreshed successfully');
    console.log(`Expires: ${new Date(token.expiresAt).toISOString()}`);

    return 0;
  }

  private async proxyToClaude(args: string[]): Promise<number> {
    const config = await this.loadConfig();

    // Ensure token is valid before running Claude
    const authManager = await this.createAuthManager();
    const token = await authManager.ensureValidToken();

    this.logger.debug('Token validated, running Claude', {
      profile: this.profileId,
      args,
    });

    // Run Claude with the validated token
    const wrapper = new ClaudeWrapper({
      claudeBinaryPath: config.claudePath,
    });

    return await wrapper.run(args, {
      env: {
        ANTHROPIC_API_KEY: token.accessToken,
      },
    });
  }

  // Helper methods

  private async loadConfig() {
    const loader = new ConfigLoader(this.configPath);
    return await loader.load();
  }

  private createTokenStore(): EncryptedTokenStore {
    const tokenPath = join(homedir(), '.claude-wrapper', 'tokens');
    const passphrase = process.env.CLAUDE_WRAPPER_PASSPHRASE;
    return new EncryptedTokenStore(tokenPath, passphrase);
  }

  private async createAuthManager(): Promise<AuthManager> {
    const config = await this.loadConfig();
    const tokenStore = this.createTokenStore();
    const metricsCollector = new MetricsCollector();

    // Create rate limiter if enabled
    const rateLimiter = config.rateLimiting?.enabled
      ? new RateLimiter({
          maxTokens: config.rateLimiting.maxTokens,
          refillRate: config.rateLimiting.refillRate,
          refillInterval: config.rateLimiting.refillInterval,
        })
      : undefined;

    const refresher = new TokenRefresher(
      {
        httpClient: axios.create(),
        tokenUrl: config.oauth.tokenUrl,
        clientId: config.oauth.clientId,
      },
      {
        metricsCollector,
        rateLimiter,
      }
    );

    return new AuthManager({
      store: tokenStore,
      refresher,
      profileId: this.profileId,
      refreshThreshold: config.refreshThreshold,
      logger: this.logger,
    });
  }
}
