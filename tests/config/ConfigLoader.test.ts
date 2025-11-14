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
