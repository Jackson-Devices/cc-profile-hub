import { writeFile, chmod, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export class FixtureBinary {
  private binaryPath: string | null = null;
  private cleaned = false;

  async create(): Promise<string> {
    const fixtureScript = `#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes('--version')) {
  console.log('claude-fixture version 1.0.0');
  process.exit(0);
}

if (args.includes('env-check')) {
  console.log('CLAUDE_OAUTH_TOKEN=' + (process.env.CLAUDE_OAUTH_TOKEN || 'NOT_SET'));
  process.exit(0);
}

// Default: echo args
console.log('Args:', args.join(' '));
process.exit(0);
`;

    this.binaryPath = join(tmpdir(), `claude-fixture-${Date.now()}`);

    await writeFile(this.binaryPath, fixtureScript, { encoding: 'utf-8' });
    await chmod(this.binaryPath, 0o755); // Make executable

    return this.binaryPath;
  }

  async cleanup(): Promise<void> {
    if (this.cleaned || !this.binaryPath) return;

    await unlink(this.binaryPath);
    this.cleaned = true;
  }
}
