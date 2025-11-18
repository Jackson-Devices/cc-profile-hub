import { FixtureBinary } from './FixtureBinary';
import { spawn } from 'child_process';

describe('FixtureBinary', () => {
  let fixtureBinary: FixtureBinary;

  beforeEach(() => {
    fixtureBinary = new FixtureBinary();
  });

  afterEach(async () => {
    await fixtureBinary.cleanup();
  });

  it('should create executable fixture', async () => {
    const binaryPath = await fixtureBinary.create();

    expect(binaryPath).toBeTruthy();
    expect(binaryPath).toContain('claude-fixture');
  });

  it('should execute and return version', (done) => {
    fixtureBinary.create().then(binaryPath => {
      const child = spawn(binaryPath, ['--version']);

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('claude-fixture');
        done();
      });
    });
  });

  it('should echo environment variables', (done) => {
    fixtureBinary.create().then(binaryPath => {
      const child = spawn(binaryPath, ['env-check'], {
        env: {
          ...process.env,
          CLAUDE_OAUTH_TOKEN: 'test-token-123'
        }
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', () => {
        expect(output).toContain('CLAUDE_OAUTH_TOKEN=test-token-123');
        done();
      });
    });
  });

  it('should cleanup fixture binary', async () => {
    const binaryPath = await fixtureBinary.create();
    await fixtureBinary.cleanup();

    // Binary should be removed
    expect(fixtureBinary['cleaned']).toBe(true);
  });
});
