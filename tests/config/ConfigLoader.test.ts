import { ConfigLoader } from '../../src/config/ConfigLoader';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('ConfigLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `config-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load valid YAML config', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /usr/bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: test-client
`
    );

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.claudePath).toBe('/usr/bin/claude');
    expect(config.oauth.clientId).toBe('test-client');
  });

  it('should throw on missing config file', async () => {
    const loader = new ConfigLoader('/nonexistent/config.yml');

    await expect(loader.load()).rejects.toThrow(/not found/);
  });

  it('should throw on invalid YAML', async () => {
    const configPath = join(tempDir, 'bad.yml');
    writeFileSync(configPath, 'invalid: yaml: content:');

    const loader = new ConfigLoader(configPath);

    await expect(loader.load()).rejects.toThrow(/YAML/);
  });
});

describe('ConfigLoader Environment Overrides', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `config-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    // Clean up env vars
    delete process.env.CC_WRAPPER_CLAUDE_PATH;
    delete process.env.CC_WRAPPER_OAUTH_CLIENT_ID;
    delete process.env.CC_WRAPPER_OAUTH_TOKEN_URL;
    delete process.env.CC_WRAPPER_REFRESH_THRESHOLD;
    delete process.env.CC_WRAPPER_LOG_LEVEL;
  });

  it('should override claudePath from env', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /default/path
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
`
    );

    process.env.CC_WRAPPER_CLAUDE_PATH = '/env/override/path';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.claudePath).toBe('/env/override/path');
  });

  it('should override oauth clientId from env', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
`
    );

    process.env.CC_WRAPPER_OAUTH_CLIENT_ID = 'env-client';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.oauth.clientId).toBe('env-client');
  });

  it('should merge env overrides with file config', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: file-client
refreshThreshold: 600
`
    );

    process.env.CC_WRAPPER_REFRESH_THRESHOLD = '120';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.refreshThreshold).toBe(120);
    expect(config.oauth.clientId).toBe('file-client'); // unchanged
  });

  it('should override oauth tokenUrl from env', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
`
    );

    process.env.CC_WRAPPER_OAUTH_TOKEN_URL = 'https://custom-oauth.example.com/token';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.oauth.tokenUrl).toBe('https://custom-oauth.example.com/token');
    expect(config.oauth.clientId).toBe('default-client'); // unchanged
  });

  it('should override log level from env', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
logging:
  level: info
`
    );

    process.env.CC_WRAPPER_LOG_LEVEL = 'debug';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.logging.level).toBe('debug');
  });

  it('should handle multiple env overrides simultaneously', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
refreshThreshold: 600
logging:
  level: info
`
    );

    process.env.CC_WRAPPER_CLAUDE_PATH = '/custom/claude';
    process.env.CC_WRAPPER_OAUTH_CLIENT_ID = 'custom-client';
    process.env.CC_WRAPPER_OAUTH_TOKEN_URL = 'https://custom.example.com/token';
    process.env.CC_WRAPPER_REFRESH_THRESHOLD = '300';
    process.env.CC_WRAPPER_LOG_LEVEL = 'trace';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.claudePath).toBe('/custom/claude');
    expect(config.oauth.clientId).toBe('custom-client');
    expect(config.oauth.tokenUrl).toBe('https://custom.example.com/token');
    expect(config.refreshThreshold).toBe(300);
    expect(config.logging.level).toBe('trace');
  });

  it('should preserve oauth config when adding tokenUrl override', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(
      configPath,
      `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: original-client
  scopes: ['user:inference', 'user:profile']
`
    );

    process.env.CC_WRAPPER_OAUTH_TOKEN_URL = 'https://new-url.example.com/token';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.oauth.tokenUrl).toBe('https://new-url.example.com/token');
    expect(config.oauth.clientId).toBe('original-client');
    expect(config.oauth.scopes).toEqual(['user:inference', 'user:profile']);
  });
});
