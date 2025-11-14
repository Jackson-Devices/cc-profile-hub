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
});
