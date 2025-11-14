/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Interface for logging implementations.
 * Provides abstraction for different logging backends.
 */
export interface ILogger {
  /**
   * Create a child logger with additional context bindings.
   * @param bindings - Additional context fields to include in all child logs
   * @returns A new logger instance with the bindings
   */
  child(bindings: Record<string, any>): ILogger;

  /**
   * Log a trace-level message (most verbose).
   * @param msg - The log message
   * @param args - Optional structured data (first arg) for context
   */
  trace(msg: string, ...args: any[]): void;

  /**
   * Log a debug-level message.
   * @param msg - The log message
   * @param args - Optional structured data (first arg) for context
   */
  debug(msg: string, ...args: any[]): void;

  /**
   * Log an info-level message.
   * @param msg - The log message
   * @param args - Optional structured data (first arg) for context
   */
  info(msg: string, ...args: any[]): void;

  /**
   * Log a warning-level message.
   * @param msg - The log message
   * @param args - Optional structured data (first arg) for context
   */
  warn(msg: string, ...args: any[]): void;

  /**
   * Log an error-level message.
   * @param msg - The log message
   * @param args - Optional structured data (first arg) for context
   */
  error(msg: string, ...args: any[]): void;
}
