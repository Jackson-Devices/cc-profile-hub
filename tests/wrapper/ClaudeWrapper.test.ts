import { ClaudeWrapper } from '../../src/wrapper/ClaudeWrapper';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

// Mock child_process
jest.mock('child_process');

describe('ClaudeWrapper', () => {
  let wrapper: ClaudeWrapper;
  let mockChildProcess: jest.Mocked<ChildProcess>;
  let spawn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock child process
    mockChildProcess = new EventEmitter() as jest.Mocked<ChildProcess>;
    mockChildProcess.kill = jest.fn();

    // Mock spawn to return our mock child process
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    spawn = require('child_process').spawn;
    spawn.mockReturnValue(mockChildProcess);

    wrapper = new ClaudeWrapper({ claudeBinaryPath: '/usr/bin/claude' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should use default binary path when not provided', () => {
    const defaultWrapper = new ClaudeWrapper();
    expect(defaultWrapper).toBeDefined();
  });

  it('should use claudeBinaryPath from config', () => {
    const customWrapper = new ClaudeWrapper({ claudeBinaryPath: '/custom/claude' });
    expect(customWrapper).toBeDefined();
  });

  it('should use binaryPath from config as fallback', () => {
    const fallbackWrapper = new ClaudeWrapper({ binaryPath: '/fallback/claude' });
    expect(fallbackWrapper).toBeDefined();
  });

  it('should spawn claude process with correct arguments', async () => {
    const runPromise = wrapper.run(['--version']);

    // Simulate successful exit
    setImmediate(() => {
      mockChildProcess.emit('exit', 0, null);
    });

    const exitCode = await runPromise;

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/claude',
      ['--version'],
      expect.objectContaining({
        stdio: 'inherit',
        shell: false,
      })
    );
    expect(exitCode).toBe(0);
  });

  it('should emit beforeSpawn and afterSpawn events', async () => {
    const beforeSpawnSpy = jest.fn();
    const afterSpawnSpy = jest.fn();

    wrapper.on('beforeSpawn', beforeSpawnSpy);
    wrapper.on('afterSpawn', afterSpawnSpy);

    const runPromise = wrapper.run(['--help']);

    // Simulate successful exit
    setImmediate(() => {
      mockChildProcess.emit('exit', 0, null);
    });

    await runPromise;

    expect(beforeSpawnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--help'],
        timestamp: expect.any(Number),
      })
    );

    expect(afterSpawnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--help'],
        exitCode: 0,
        duration: expect.any(Number),
      })
    );
  });

  it('should handle non-zero exit codes', async () => {
    const runPromise = wrapper.run(['invalid-command']);

    // Simulate error exit
    setImmediate(() => {
      mockChildProcess.emit('exit', 127, null);
    });

    const exitCode = await runPromise;
    expect(exitCode).toBe(127);
  });

  it('should handle exit with signal', async () => {
    const runPromise = wrapper.run(['long-running']);

    // Simulate signal termination
    setImmediate(() => {
      mockChildProcess.emit('exit', null, 'SIGTERM');
    });

    const exitCode = await runPromise;
    expect(exitCode).toBe(1);
  });

  it('should merge environment variables', async () => {
    const runPromise = wrapper.run(['--config'], {
      env: { CUSTOM_VAR: 'custom-value' },
    });

    // Simulate successful exit
    setImmediate(() => {
      mockChildProcess.emit('exit', 0, null);
    });

    await runPromise;

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/claude',
      ['--config'],
      expect.objectContaining({
        env: expect.objectContaining({
          CUSTOM_VAR: 'custom-value',
        }),
      })
    );
  });

  it('should handle spawn errors', async () => {
    const errorSpy = jest.fn();
    wrapper.on('error', errorSpy);

    const runPromise = wrapper.run(['--version']);

    // Simulate spawn error (e.g., binary not found)
    const spawnError = new Error('ENOENT: binary not found');
    setImmediate(() => {
      mockChildProcess.emit('error', spawnError);
    });

    const exitCode = await runPromise;

    expect(errorSpy).toHaveBeenCalledWith(spawnError);
    expect(exitCode).toBe(1);
  });

  it('should forward SIGINT to child process', async () => {
    const runPromise = wrapper.run(['long-task']);

    // Wait for spawn to be called
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate SIGINT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.emit('SIGINT' as any);

    expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGINT');

    // Clean up
    setImmediate(() => {
      mockChildProcess.emit('exit', 130, null);
    });

    await runPromise;
  });

  it('should forward SIGTERM to child process', async () => {
    const runPromise = wrapper.run(['long-task']);

    // Wait for spawn to be called
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate SIGTERM
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.emit('SIGTERM' as any);

    expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');

    // Clean up
    setImmediate(() => {
      mockChildProcess.emit('exit', 143, null);
    });

    await runPromise;
  });

  it('should clean up signal handlers after exit', async () => {
    const listenerCountBefore = process.listenerCount('SIGINT');

    const runPromise = wrapper.run(['quick-task']);

    // Simulate successful exit
    setImmediate(() => {
      mockChildProcess.emit('exit', 0, null);
    });

    await runPromise;

    const listenerCountAfter = process.listenerCount('SIGINT');
    expect(listenerCountAfter).toBe(listenerCountBefore);
  });
});
