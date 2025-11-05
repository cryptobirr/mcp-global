import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { ExecuteToolRequest, ToolResult, MCPNotFoundError, MCPCrashError, TimeoutError } from './types';

interface ActiveProcess {
  id: string;
  process: ChildProcess;
  timeout?: any;
}

export class Executor {
  private activeProcesses = new Map<string, ActiveProcess>();
  private processQueue: Array<() => void> = [];

  // eslint-disable-next-line no-unused-vars
  constructor(private maxConcurrentProcesses: number = 100) {}

  async execute(
    request: ExecuteToolRequest,
    envVars?: Record<string, string>,
    timeoutMs: number = 30000
  ): Promise<ToolResult> {
    this.validateServerPath(request.server);

    // Check concurrent process limit
    if (this.activeProcesses.size >= this.maxConcurrentProcesses) {
      return new Promise((resolve, reject) => {
        this.processQueue.push(() => {
          this.execute(request, envVars, timeoutMs).then(resolve).catch(reject);
        });
      });
    }

    const requestId = randomUUID();

    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...envVars };

      let childProcess: ChildProcess;

      try {
        childProcess = spawn('node', [request.server], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env
        });
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          reject(new MCPNotFoundError(request.server));
          return;
        }
        reject(error);
        return;
      }

      const processInfo: ActiveProcess = {
        id: requestId,
        process: childProcess
      };

      this.activeProcesses.set(requestId, processInfo);

      // Set up timeout
      const timeout = setTimeout(() => {
        this.killProcess(requestId);
        reject(new TimeoutError(request.server));
      }, timeoutMs);

      processInfo.timeout = timeout;

      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Handle process errors
      childProcess.on('error', (error: any) => {
        this.cleanupProcess(requestId);
        if (error.code === 'ENOENT') {
          reject(new MCPNotFoundError(request.server));
        } else {
          reject(error);
        }
      });

      // Collect stdout data
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString();

        // Try to parse complete JSON responses
        try {
          const response = JSON.parse(stdoutBuffer);
          this.cleanupProcess(requestId);
          resolve(response);
          return;
        } catch (error) {
          // Continue collecting data if JSON is incomplete
          // Try line by line parsing for streaming responses
          const lines = stdoutBuffer.split('\n');
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.trim()) {
              try {
                const response = JSON.parse(line);
                if (response.id === requestId || response.result !== undefined || response.error !== undefined) {
                  this.cleanupProcess(requestId);
                  resolve(response);
                  return;
                }
              } catch (parseError) {
                // Continue to next line
              }
            }
          }
          // Keep the last incomplete line
          stdoutBuffer = lines[lines.length - 1] || '';
        }
      });

      // Collect stderr data
      childProcess.stderr?.on('data', (data: Buffer) => {
        stderrBuffer += data.toString();
      });

      // Handle process close
      childProcess.on('close', (code: number) => {
        this.cleanupProcess(requestId);

        if (code !== 0) {
          reject(new MCPCrashError(request.server, stderrBuffer));
          return;
        }

        // Try to parse any remaining stdout
        if (stdoutBuffer.trim()) {
          try {
            const response = JSON.parse(stdoutBuffer);
            resolve(response);
          } catch (error) {
            resolve({ result: stdoutBuffer });
          }
        } else {
          resolve({ result: null });
        }
      });

      // Send the request
      const jsonrpcRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: request.tool,
          arguments: request.params
        }
      };

      childProcess.stdin?.write(JSON.stringify(jsonrpcRequest) + '\n');
    });
  }

  private validateServerPath(serverPath: string): void {
    // Prevent path traversal attacks
    if (serverPath.includes('..')) {
      throw new Error('Invalid server path');
    }
  }

  private killProcess(requestId: string): void {
    const processInfo = this.activeProcesses.get(requestId);
    if (processInfo) {
      processInfo.process.kill('SIGTERM');
      // Force kill after 1 second if still running
      setTimeout(() => {
        if (this.activeProcesses.has(requestId)) {
          processInfo.process.kill('SIGKILL');
        }
      }, 1000);
    }
  }

  private cleanupProcess(processId: string): void {
    const processInfo = this.activeProcesses.get(processId);
    if (processInfo) {
      if (processInfo.timeout) {
        clearTimeout(processInfo.timeout);
      }
      this.activeProcesses.delete(processId);

      // Process next queued request
      if (this.processQueue.length > 0) {
        const nextProcess = this.processQueue.shift();
        if (nextProcess) {
          setImmediate(nextProcess);
        }
      }
    }
  }

  destroy(): void {
    // Kill all active processes
    for (const [, processInfo] of this.activeProcesses) {
      if (processInfo.timeout) {
        clearTimeout(processInfo.timeout);
      }
      processInfo.process.kill('SIGTERM');
    }
    this.activeProcesses.clear();
    this.processQueue.length = 0;
  }
}