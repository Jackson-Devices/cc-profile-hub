import { EventEmitter } from 'events';

export interface ProcessInterceptorConfig {
  binaryPath?: string;
}

export interface ProcessSpawnEvent {
  args: string[];
  timestamp: number;
}

export interface ProcessExitEvent extends ProcessSpawnEvent {
  exitCode: number;
  duration: number;
}

export interface RunOptions {
  env?: Record<string, string>;
}

export interface ProcessInterceptor extends EventEmitter {
  run(args: string[], options?: RunOptions): Promise<number>;
}
