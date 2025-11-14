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
  /**
   * Process timeout in milliseconds. Defaults to 30 minutes (1800000ms).
   * Set to 0 to disable timeout.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class ClaudeWrapper extends EventEmitter implements ProcessInterceptor {
  private readonly claudeBinary: string;
  private readonly timeoutMs: number;

  constructor(config: WrapperConfig = {}) {
    super();
    this.claudeBinary = config.claudeBinaryPath || config.binaryPath || 'claude-original';
    this.timeoutMs = config.timeoutMs !== undefined ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
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

      // Set up timeout if configured
      let timeoutId: NodeJS.Timeout | null = null;
      if (this.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          claudeProcess.kill('SIGTERM');
          this.emit('timeout', {
            args,
            timeoutMs: this.timeoutMs,
            timestamp: Date.now(),
          });
        }, this.timeoutMs);
      }

      // Forward signals
      const sigintHandler = (): void => {
        claudeProcess.kill('SIGINT');
      };

      const sigtermHandler = (): void => {
        claudeProcess.kill('SIGTERM');
      };

      process.on('SIGINT', sigintHandler);
      process.on('SIGTERM', sigtermHandler);

      const cleanup = (): void => {
        process.off('SIGINT', sigintHandler);
        process.off('SIGTERM', sigtermHandler);
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };

      claudeProcess.on('exit', (code, signal) => {
        cleanup();

        const exitCode = signal ? 1 : code || 0;

        this.emit('afterSpawn', {
          ...spawnEvent,
          exitCode,
          duration: Date.now() - spawnEvent.timestamp,
        });

        resolve(exitCode);
      });

      claudeProcess.on('error', (error) => {
        cleanup();
        this.emit('error', error);
        resolve(1);
      });
    });
  }
}
