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
