import { ConfigSchema, ConfigData } from './types';

export class Config {
  static validate(input: unknown): ConfigData {
    return ConfigSchema.parse(input);
  }

  constructor(private data: ConfigData) {}

  get claudePath(): string {
    return this.data.claudePath;
  }

  get oauth(): ConfigData['oauth'] {
    return this.data.oauth;
  }

  get logging(): ConfigData['logging'] {
    return this.data.logging;
  }

  get refreshThreshold(): number {
    return this.data.refreshThreshold;
  }
}
