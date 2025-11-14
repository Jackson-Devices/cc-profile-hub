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
