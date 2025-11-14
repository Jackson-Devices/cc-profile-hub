import { readFile } from 'fs/promises';
import { load as parseYaml } from 'js-yaml';
import { Config } from './Config';

export class ConfigLoader {
  constructor(private configPath: string) {}

  async load(): Promise<Config> {
    let content: string;

    try {
      content = await readFile(this.configPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Config file not found: ${this.configPath}`);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (error: any) {
      throw new Error(`Invalid YAML in config file: ${error.message}`);
    }

    const validated = Config.validate(parsed);
    return new Config(validated);
  }
}
