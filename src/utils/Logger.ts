/* eslint-disable @typescript-eslint/no-explicit-any */
import pino from 'pino';
import { DEFAULT_REDACTION_PATHS } from './redactionPaths';
import { ILogger } from './ILogger';

export interface LoggerOptions {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  redactPaths?: string[];
}

export class Logger implements ILogger {
  private pino: pino.Logger;

  constructor(options: LoggerOptions) {
    const redactPaths = options.redactPaths || DEFAULT_REDACTION_PATHS;

    this.pino = pino({
      level: options.level,
      redact: {
        paths: redactPaths,
        censor: '[REDACTED]',
      },
    });
  }

  child(bindings: Record<string, any>): ILogger {
    const childLogger = new Logger({ level: this.pino.level as any });
    childLogger.pino = this.pino.child(bindings);
    return childLogger;
  }

  trace(msg: string, ...args: any[]): void {
    if (args.length > 0) {
      this.pino.trace(args[0], msg);
    } else {
      this.pino.trace(msg);
    }
  }

  debug(msg: string, ...args: any[]): void {
    if (args.length > 0) {
      this.pino.debug(args[0], msg);
    } else {
      this.pino.debug(msg);
    }
  }

  info(msg: string, ...args: any[]): void {
    if (args.length > 0) {
      this.pino.info(args[0], msg);
    } else {
      this.pino.info(msg);
    }
  }

  warn(msg: string, ...args: any[]): void {
    if (args.length > 0) {
      this.pino.warn(args[0], msg);
    } else {
      this.pino.warn(msg);
    }
  }

  error(msg: string, ...args: any[]): void {
    if (args.length > 0) {
      this.pino.error(args[0], msg);
    } else {
      this.pino.error(msg);
    }
  }
}
