import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import {
  ProcessInterceptor,
  ProcessInterceptorConfig,
  ProcessSpawnEvent,
  RunOptions,
} from './ProcessInterceptor.interface';

export interface WrapperConfig extends ProcessInterceptorConfig {
  claudeBinaryPath?: string;
}

export class ClaudeWrapper extends EventEmitter implements ProcessInterceptor {
  private readonly claudeBinary: string;

  constructor(config: WrapperConfig = {}) {
    super();
    this.claudeBinary = config.claudeBinaryPath || config.binaryPath || 'claude-original';
  }

  async run(args: string[], options: RunOptions = {}): Promise<number> {
    return new Promise((resolve) => {
      const spawnEvent: ProcessSpawnEvent = {
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

        const exitCode = signal ? 1 : code || 0;

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
