import { ClaudeWrapper } from '../../../src/wrapper/ClaudeWrapper';
import { spawn } from 'child_process';

jest.mock('child_process');

describe('ClaudeWrapper', () => {
  describe('Command Execution', () => {
    it('should pass through command arguments to claude binary', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            callback(0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const wrapper = new ClaudeWrapper();
      await wrapper.run(['--version']);

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        ['--version'],
        expect.any(Object)
      );
    });

    it('should preserve exit code from claude process', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            callback(42); // Non-zero exit
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const wrapper = new ClaudeWrapper();
      const exitCode = await wrapper.run(['invalid-command']);

      expect(exitCode).toBe(42);
    });
  });

  describe('Signal Handling', () => {
    it('should forward SIGINT to claude process', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockKill = jest.fn();
      const mockProcess = {
        on: jest.fn(),
        kill: mockKill,
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const wrapper = new ClaudeWrapper();
      const runPromise = wrapper.run(['--version']);

      // Simulate SIGINT after spawn
      process.emit('SIGINT' as any);

      expect(mockKill).toHaveBeenCalledWith('SIGINT');

      // Trigger exit to complete the promise
      const exitCallback = mockProcess.on.mock.calls.find(
        (call: any) => call[0] === 'exit'
      )?.[1];
      if (exitCallback) exitCallback(0);

      await runPromise;
    });

    it('should forward SIGTERM to claude process', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockKill = jest.fn();
      const mockProcess = {
        on: jest.fn(),
        kill: mockKill,
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const wrapper = new ClaudeWrapper();
      const runPromise = wrapper.run(['--version']);

      // Simulate SIGTERM after spawn
      process.emit('SIGTERM' as any);

      expect(mockKill).toHaveBeenCalledWith('SIGTERM');

      // Trigger exit to complete the promise
      const exitCallback = mockProcess.on.mock.calls.find(
        (call: any) => call[0] === 'exit'
      )?.[1];
      if (exitCallback) exitCallback(0);

      await runPromise;
    });
  });

  describe('Environment Management', () => {
    it('should inject custom environment variables', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            callback(0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const wrapper = new ClaudeWrapper();
      await wrapper.run(['prompt'], { env: { CUSTOM_VAR: 'value' } });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ CUSTOM_VAR: 'value' }),
        })
      );
    });

    it('should merge custom env with parent env', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            callback(0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockClear();
      mockSpawn.mockReturnValue(mockProcess);

      const originalEnv = process.env.PATH;
      const wrapper = new ClaudeWrapper();
      await wrapper.run(['prompt'], { env: { CUSTOM_VAR: 'value' } });

      const spawnCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      const spawnOptions = spawnCall[2] as any;

      expect(spawnOptions.env).toHaveProperty('CUSTOM_VAR', 'value');
      expect(spawnOptions.env).toHaveProperty('PATH', originalEnv);
    });
  });

  describe('Lifecycle Events', () => {
    it('should emit beforeSpawn and afterSpawn events', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      const mockProcess = {
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            callback(0);
          }
          return mockProcess;
        }),
        kill: jest.fn(),
      } as any;

      mockSpawn.mockReturnValue(mockProcess);

      const wrapper = new ClaudeWrapper();
      const beforeSpy = jest.fn();
      const afterSpy = jest.fn();

      wrapper.on('beforeSpawn', beforeSpy);
      wrapper.on('afterSpawn', afterSpy);

      await wrapper.run(['--version']);

      expect(beforeSpy).toHaveBeenCalledTimes(1);
      expect(beforeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--version'],
          timestamp: expect.any(Number),
        })
      );

      expect(afterSpy).toHaveBeenCalledTimes(1);
      expect(afterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--version'],
          timestamp: expect.any(Number),
          exitCode: 0,
          duration: expect.any(Number),
        })
      );
    });
  });
});
