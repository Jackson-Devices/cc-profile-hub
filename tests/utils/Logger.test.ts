/* eslint-disable @typescript-eslint/no-explicit-any */
import { Logger } from '../../src/utils/Logger';

describe('Logger', () => {
  let logs: any[];
  let mockWrite: jest.SpyInstance;

  beforeEach(() => {
    logs = [];
    mockWrite = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      logs.push(JSON.parse(chunk));
      return true;
    });
  });

  afterEach(() => {
    mockWrite.mockRestore();
  });

  it('should log structured JSON messages', () => {
    const logger = new Logger({ level: 'info' });
    logger.info('test message', { foo: 'bar' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: 30, // pino info level
      msg: 'test message',
      foo: 'bar',
    });
  });

  it('should create child logger with context', () => {
    const logger = new Logger({ level: 'info' });
    const child = logger.child({ component: 'auth' });

    child.info('test');

    expect(logs[0]).toMatchObject({
      component: 'auth',
      msg: 'test',
    });
  });

  it('should respect log level', () => {
    const logger = new Logger({ level: 'warn' });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe(40); // pino warn level
  });
});

describe('Logger Token Redaction', () => {
  let logs: any[];
  let mockWrite: jest.SpyInstance;

  beforeEach(() => {
    logs = [];
    mockWrite = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      logs.push(JSON.parse(chunk));
      return true;
    });
  });

  afterEach(() => {
    mockWrite.mockRestore();
  });

  it('should redact accessToken field', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['accessToken', '*.accessToken'],
    });

    logger.info('token data', { accessToken: 'secret-token-12345' });

    expect(logs[0].accessToken).toBe('[REDACTED]');
  });

  it('should redact refreshToken field', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['refreshToken', '*.refreshToken'],
    });

    logger.info('refresh', { refreshToken: 'refresh-secret' });

    expect(logs[0].refreshToken).toBe('[REDACTED]');
  });

  it('should redact nested token fields', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['token.accessToken', 'token.refreshToken'],
    });

    logger.info('nested', {
      token: {
        accessToken: 'secret',
        refreshToken: 'refresh',
        expiresAt: 123456,
      },
    });

    expect(logs[0].token.accessToken).toBe('[REDACTED]');
    expect(logs[0].token.refreshToken).toBe('[REDACTED]');
    expect(logs[0].token.expiresAt).toBe(123456);
  });

  it('should redact authorization headers', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['headers.authorization', 'headers.Authorization'],
    });

    logger.info('request', {
      headers: { authorization: 'Bearer secret-token' },
    });

    expect(logs[0].headers.authorization).toBe('[REDACTED]');
  });
});

describe('Logger Methods Without Args', () => {
  let logs: any[];
  let mockWrite: jest.SpyInstance;

  beforeEach(() => {
    logs = [];
    mockWrite = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      logs.push(JSON.parse(chunk));
      return true;
    });
  });

  afterEach(() => {
    mockWrite.mockRestore();
  });

  it('should log trace without additional args', () => {
    const logger = new Logger({ level: 'trace' });
    logger.trace('trace message');

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('trace message');
    expect(logs[0].level).toBe(10); // pino trace level
  });

  it('should log trace with args', () => {
    const logger = new Logger({ level: 'trace' });
    logger.trace('trace message', { foo: 'bar' });

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('trace message');
    expect(logs[0].foo).toBe('bar');
  });

  it('should log debug without additional args', () => {
    const logger = new Logger({ level: 'debug' });
    logger.debug('debug message');

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('debug message');
    expect(logs[0].level).toBe(20); // pino debug level
  });

  it('should log debug with args', () => {
    const logger = new Logger({ level: 'debug' });
    logger.debug('debug message', { context: 'test' });

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('debug message');
    expect(logs[0].context).toBe('test');
  });

  it('should log warn without additional args', () => {
    const logger = new Logger({ level: 'warn' });
    logger.warn('warn message');

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('warn message');
    expect(logs[0].level).toBe(40); // pino warn level
  });

  it('should log warn with args', () => {
    const logger = new Logger({ level: 'warn' });
    logger.warn('warn message', { warning: 'details' });

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('warn message');
    expect(logs[0].warning).toBe('details');
  });

  it('should log error without additional args', () => {
    const logger = new Logger({ level: 'error' });
    logger.error('error message');

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('error message');
    expect(logs[0].level).toBe(50); // pino error level
  });

  it('should log error with args', () => {
    const logger = new Logger({ level: 'error' });
    logger.error('error message', { code: 500 });

    expect(logs).toHaveLength(1);
    expect(logs[0].msg).toBe('error message');
    expect(logs[0].code).toBe(500);
  });
});
