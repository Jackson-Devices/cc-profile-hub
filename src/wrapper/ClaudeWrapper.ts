import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface WrapperConfig {
  claudeBinaryPath?: string;
}

export interface SpawnEvent {
  args: string[];
  timestamp: number;
}

export class ClaudeWrapper extends EventEmitter {
  private readonly claudeBinary: string;

  constructor(config: WrapperConfig = {}) {
    super();
    this.claudeBinary = config.claudeBinaryPath || 'claude-original';
  }

  async run(args: string[], options: { env?: Record<string, string> } = {}): Promise<number> {
    return new Promise((resolve) => {
      const spawnEvent: SpawnEvent = {
        args,
        timestamp: Date.now(),
      };

      this.emit('beforeSpawn', spawnEvent);

      const env = { ...process.env, ...options.env };

      const claudeProcess = spawn(this.claudeBinary, args, {
        stdio: 'inherit',
        shell: false,
        env,
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

        const exitCode = signal ? 128 + (signal as any) : code || 0;

        this.emit('afterSpawn', {
          ...spawnEvent,
          exitCode,
          duration: Date.now() - spawnEvent.timestamp,
        });

        resolve(exitCode);
      });

      claudeProcess.on('error', (error) => {
        this.emit('error', error);
        resolve(1);
      });
    });
  }
}
