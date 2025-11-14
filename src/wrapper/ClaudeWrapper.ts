import { spawn, ChildProcess } from 'child_process';

export interface WrapperConfig {
  claudeBinaryPath?: string;
}

export class ClaudeWrapper {
  private readonly claudeBinary: string;

  constructor(config: WrapperConfig = {}) {
    this.claudeBinary = config.claudeBinaryPath || 'claude-original';
  }

  async run(args: string[]): Promise<number> {
    return new Promise((resolve) => {
      const claudeProcess = spawn(this.claudeBinary, args, {
        stdio: 'inherit',
        shell: false,
      });

      claudeProcess.on('exit', (code) => {
        resolve(code || 0);
      });
    });
  }
}
