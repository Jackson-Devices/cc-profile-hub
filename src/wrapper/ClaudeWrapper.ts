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

      // Forward signals
      const sigintHandler = (): void => {
        claudeProcess.kill('SIGINT');
      };

      const sigtermHandler = (): void => {
        claudeProcess.kill('SIGTERM');
      };

      process.on('SIGINT', sigintHandler);
      process.on('SIGTERM', sigtermHandler);

      claudeProcess.on('exit', (code, signal) => {
        process.off('SIGINT', sigintHandler);
        process.off('SIGTERM', sigtermHandler);
        resolve(signal ? 128 + (signal as any) : code || 0);
      });
    });
  }
}
