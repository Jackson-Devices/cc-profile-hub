import { readFile } from 'fs/promises';
import { load as parseYaml } from 'js-yaml';
import { Config } from './Config';
import { applyEnvOverrides } from './envOverrides';
import { ConfigError } from '../errors/ConfigError';

export class ConfigLoader {
  constructor(private configPath: string) {}

  async load(): Promise<Config> {
    let content: string;

    try {
      content = await readFile(this.configPath, 'utf-8');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new ConfigError(`Config file not found: ${this.configPath}`, { path: this.configPath });
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ConfigError(`Invalid YAML in config file: ${message}`, { path: this.configPath });
    }

    // Apply environment overrides
    const withOverrides = applyEnvOverrides(parsed);

    const validated = Config.validate(withOverrides);
    return new Config(validated);
  }
}
