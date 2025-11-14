import { Config } from '../../src/config/Config';

describe('Config Schema', () => {
  it('should validate minimal valid config', () => {
    const input = {
      claudePath: '/usr/local/bin/claude-original',
      oauth: {
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client-id',
      },
    };

    expect(() => Config.validate(input)).not.toThrow();
  });

  it('should reject invalid config', () => {
    const input = { invalid: true };

    expect(() => Config.validate(input)).toThrow();
  });

  it('should reject missing required fields', () => {
    const input = { claudePath: '/bin/claude' };

    expect(() => Config.validate(input)).toThrow(/oauth/);
  });
});
