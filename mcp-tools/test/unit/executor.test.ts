import { Executor } from '../../src/executor';
import { ExecuteToolRequest, MCPNotFoundError, MCPCrashError, TimeoutError } from '../../src/types';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

class MockChildProcess extends EventEmitter {
  stdin = {
    write: jest.fn(),
    end: jest.fn()
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn();
  pid = 12345;
}

describe('Executor', () => {
  let executor: Executor;
  let mockProcess: MockChildProcess;

  beforeEach(() => {
    executor = new Executor();
    mockProcess = new MockChildProcess();
    jest.clearAllMocks();
  });

  afterEach(() => {
    executor.destroy();
  });

  describe('execute', () => {
    it('should spawn MCP and execute tool successfully', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'test-mcp',
        tool: 'test_tool',
        params: { param1: 'value1' }
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      // Simulate successful response
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({ result: 'success' }));
        mockProcess.emit('close', 0);
      }, 10);

      // Act
      const resultPromise = executor.execute(request);

      // Assert
      const result = await resultPromise;
      expect(result).toEqual({ result: 'success' });
      expect(mockSpawn).toHaveBeenCalledWith('node', ['test-mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });
      // Verify the request structure
      const sentData = mockProcess.stdin.write.mock.calls[0][0] as string;
      const sentRequest = JSON.parse(sentData.trim());

      expect(sentRequest).toEqual({
        jsonrpc: '2.0',
        id: expect.any(String),
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { param1: 'value1' }
        }
      });
    });

    it('should pass environment variables to MCP', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'test-mcp',
        tool: 'test_tool',
        params: {}
      };

      const envVars = { API_KEY: 'test-key', DEBUG: 'true' };
      mockSpawn.mockReturnValue(mockProcess as any);

      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({ result: 'success' }));
        mockProcess.emit('close', 0);
      }, 10);

      // Act
      await executor.execute(request, envVars);

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith('node', ['test-mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...envVars }
      });
    });

    it('should throw MCPNotFoundError when spawn fails', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'nonexistent-mcp',
        tool: 'test_tool',
        params: {}
      };

      mockSpawn.mockImplementation(() => {
        const error = new Error('ENOENT');
        (error as any).code = 'ENOENT';
        setTimeout(() => mockProcess.emit('error', error), 10);
        return mockProcess as any;
      });

      // Act & Assert
      await expect(executor.execute(request)).rejects.toThrow(MCPNotFoundError);
    });

    it('should throw TimeoutError when MCP hangs', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'slow-mcp',
        tool: 'slow_tool',
        params: {}
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      // Act & Assert
      await expect(executor.execute(request, {}, 100)).rejects.toThrow(TimeoutError);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should throw MCPCrashError when MCP crashes', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'crash-mcp',
        tool: 'crash_tool',
        params: {}
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Error: Something went wrong');
        mockProcess.emit('close', 1);
      }, 10);

      // Act & Assert
      await expect(executor.execute(request)).rejects.toThrow(MCPCrashError);
    });

    it('should handle multiple concurrent executions', async () => {
      // Arrange
      const requests: ExecuteToolRequest[] = Array.from({ length: 10 }, (_, i) => ({
        server: `mcp-${i}`,
        tool: 'test_tool',
        params: { index: i }
      }));

      const mockProcesses = Array.from({ length: 10 }, () => new MockChildProcess());

      mockSpawn.mockImplementation((_, __, options) => {
        const processIndex = mockSpawn.mock.calls.length - 1;
        const process = mockProcesses[processIndex];

        setTimeout(() => {
          process.stdout.emit('data', JSON.stringify({ result: `success-${processIndex}` }));
          process.emit('close', 0);
        }, 50);

        return process as any;
      });

      // Act
      const promises = requests.map(req => executor.execute(req));
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result).toEqual({ result: `success-${index}` });
      });
      expect(mockSpawn).toHaveBeenCalledTimes(10);
    });

    it('should sanitize parameters to prevent command injection', async () => {
      // Arrange
      const maliciousRequest: ExecuteToolRequest = {
        server: 'test-mcp',
        tool: 'test_tool',
        params: {
          malicious: '; rm -rf /',
          injection: '$(cat /etc/passwd)',
          command: '`whoami`'
        }
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({ result: 'safe' }));
        mockProcess.emit('close', 0);
      }, 10);

      // Act
      await executor.execute(maliciousRequest);

      // Assert
      const sentData = mockProcess.stdin.write.mock.calls[0][0] as string;
      const parsedData = JSON.parse(sentData.trim());

      // Verify the malicious strings are passed as-is to the MCP (not executed)
      expect(parsedData.params.arguments.malicious).toBe('; rm -rf /');
      expect(parsedData.params.arguments.injection).toBe('$(cat /etc/passwd)');
      expect(parsedData.params.arguments.command).toBe('`whoami`');
    });

    it('should validate path to prevent path traversal', async () => {
      // Arrange
      const traversalRequest: ExecuteToolRequest = {
        server: '../../../etc/passwd',
        tool: 'test_tool',
        params: {}
      };

      // Act & Assert
      await expect(executor.execute(traversalRequest)).rejects.toThrow('Invalid server path');
    });

    it('should handle large JSON responses', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'test-mcp',
        tool: 'large_response_tool',
        params: {}
      };

      const largeResponse = {
        result: 'A'.repeat(1000),
        data: Array.from({ length: 10 }, (_, i) => ({ id: i, value: `item-${i}` }))
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      setTimeout(() => {
        // Simulate chunked data
        const jsonString = JSON.stringify(largeResponse);
        const chunk1 = jsonString.slice(0, 500);
        const chunk2 = jsonString.slice(500);

        mockProcess.stdout.emit('data', chunk1);
        setTimeout(() => {
          mockProcess.stdout.emit('data', chunk2);
          mockProcess.emit('close', 0);
        }, 10);
      }, 10);

      // Act
      const result = await executor.execute(request);

      // Assert
      expect(result).toEqual(largeResponse);
    });
  });

  describe('process management', () => {
    it('should track and clean up spawned processes', async () => {
      // Arrange
      const request: ExecuteToolRequest = {
        server: 'test-mcp',
        tool: 'test_tool',
        params: {}
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      // Don't complete the process to test cleanup
      const promise = executor.execute(request);

      // Act
      executor.destroy();

      // Assert
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should enforce maximum concurrent process limit', async () => {
      // Arrange
      const maxConcurrent = 5;
      executor = new Executor(maxConcurrent);

      const requests = Array.from({ length: 10 }, (_, i) => ({
        server: `mcp-${i}`,
        tool: 'test_tool',
        params: { index: i }
      }));

      const mockProcesses = Array.from({ length: 10 }, () => new MockChildProcess());
      let spawnCount = 0;

      mockSpawn.mockImplementation(() => {
        const process = mockProcesses[spawnCount++];
        // Don't auto-complete to test concurrent limit
        return process as any;
      });

      // Act
      const promises = requests.map(req => executor.execute(req));

      // Allow some time for spawns
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(mockSpawn).toHaveBeenCalledTimes(maxConcurrent);

      // Cleanup
      executor.destroy();
    });
  });
});