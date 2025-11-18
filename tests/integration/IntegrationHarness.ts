import { Config } from '../../src/config/Config';
import { TokenStore } from '../../src/auth/TokenStore';
import { TokenRefresher } from '../../src/auth/TokenRefresher';
import { AuthManager } from '../../src/auth/AuthManager';
import { ProfileManager } from '../../src/profile/ProfileManager';
import { StateManager } from '../../src/profile/StateManager';
import { TokenData } from '../../src/auth/TokenData';
import { ProfileRecord, ProfileConfig } from '../../src/profile/ProfileTypes';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import axios, { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { AxiosHttpClient } from '../../src/http/AxiosHttpClient';

export interface TestProfileInput {
  nickname: string;
  email: string;
}

export class IntegrationHarness {
  config!: Config;
  tokenStore!: TokenStore;
  tokenRefresher!: TokenRefresher;
  profileManager!: ProfileManager;
  authManager!: AuthManager | null;
  stateManager!: StateManager;
  mockHttp!: MockAdapter;

  private httpClient!: AxiosInstance;
  private cleaned = false;

  constructor(private testDir: string) {}

  async setup(): Promise<void> {
    // Create test directory
    await mkdir(this.testDir, { recursive: true });

    // Initialize HTTP client with mock
    this.httpClient = axios.create();
    this.mockHttp = new MockAdapter(this.httpClient);

    // Initialize config (minimal test config)
    // Use Config.validate() to apply defaults via Zod
    const configData = Config.validate({
      claudePath: '/usr/local/bin/claude',
      oauth: {
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: 'test-client-id',
        scopes: ['user:inference']
      },
      logging: {
        level: 'error',
        redactTokens: true
      },
      refreshThreshold: 300
    });
    this.config = new Config(configData);

    // Initialize token store
    const tokenStorePath = join(this.testDir, 'tokens');
    await mkdir(tokenStorePath, { recursive: true });
    this.tokenStore = new TokenStore(tokenStorePath);

    // Initialize token refresher with HTTP client
    const httpClientWrapper = new AxiosHttpClient(this.httpClient);
    this.tokenRefresher = new TokenRefresher({
      httpClient: httpClientWrapper,
      tokenUrl: this.config.oauth.tokenUrl,
      clientId: this.config.oauth.clientId
    });

    // Initialize profile manager
    const profilesPath = join(this.testDir, 'profiles.json');
    this.profileManager = new ProfileManager(profilesPath, {
      disableRateLimit: true // Disable rate limiting for tests
    });

    // Initialize state manager
    const statePath = join(this.testDir, 'state.json');
    this.stateManager = new StateManager(statePath, this.profileManager);

    // AuthManager will be created per-profile
    this.authManager = null;
  }

  async createTestProfile(input: TestProfileInput): Promise<ProfileRecord> {
    // Generate profile ID from nickname
    const profileId = input.nickname.toLowerCase().replace(/\s+/g, '-');

    // Create profile config
    const config: ProfileConfig = {
      tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
      clientId: `test-client-${profileId}`,
      tokenStorePath: join(this.testDir, 'tokens', profileId),
      scopes: ['user:inference']
    };

    return await this.profileManager.create(profileId, config);
  }

  async injectToken(profileId: string, tokenData: Partial<TokenData>): Promise<void> {
    const fullToken: TokenData = {
      accessToken: tokenData.accessToken || 'test-access',
      refreshToken: tokenData.refreshToken || 'test-refresh',
      expiresAt: tokenData.expiresAt || Date.now() + 3600000,
      grantedAt: tokenData.grantedAt || Date.now(),
      scopes: tokenData.scopes || ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: tokenData.deviceFingerprint || 'test-device'
    };

    await this.tokenStore.write(profileId, fullToken);
  }

  createAuthManager(profileId: string): AuthManager {
    return new AuthManager({
      store: this.tokenStore,
      refresher: this.tokenRefresher,
      profileId,
      refreshThreshold: this.config.refreshThreshold
    });
  }

  async getActiveProfile(): Promise<ProfileRecord | null> {
    const currentProfileId = await this.stateManager.getCurrentProfile();
    if (!currentProfileId) {
      return null;
    }
    return await this.profileManager.read(currentProfileId);
  }

  async cleanup(): Promise<void> {
    if (this.cleaned) return;

    // Remove test directory
    await rm(this.testDir, { recursive: true, force: true });

    this.cleaned = true;
  }
}
