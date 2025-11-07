/**
 * MCP Client Testing Fixtures
 *
 * Provides utilities and fixtures for testing MCP protocol compliance
 * with real server implementations using the @modelcontextprotocol/sdk.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { Readable, Writable } from 'stream';

// Test configuration
export const TEST_CONFIG = {
  // Timeout for MCP operations
  MCP_TIMEOUT: 5000,

  // Server startup delay
  SERVER_STARTUP_DELAY: 1000,

  // Test port (if needed for future TCP transport tests)
  TEST_PORT: 3001,
};

// Mock transport for in-memory testing
export class MockTransport {
  private incoming: Readable;
  private outgoing: Writable;
  private messageHandlers: Array<(message: any) => void> = [];
  private connected = false;

  constructor() {
    this.incoming = new Readable({ read() {} });
    this.outgoing = new Writable({ write(chunk, encoding, callback) { callback(); } });

    this.outgoing.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.messageHandlers.forEach(handler => handler(message));
      } catch (error) {
        // Ignore invalid JSON
      }
    });
  }

  async start() {
    this.connected = true;
    return this;
  }

  async close() {
    this.connected = false;
    this.messageHandlers = [];
  }

  onMessage(handler: (message: any) => void) {
    this.messageHandlers.push(handler);
  }

  send(message: any) {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    const data = JSON.stringify(message) + '\n';
    this.outgoing.write(data);
  }

  // Simulate incoming message from server
  receiveMessage(message: any) {
    const data = JSON.stringify(message) + '\n';
    this.incoming.push(data);
  }

  isConnectionAlive() {
    return this.connected;
  }
}

// MCP Server process wrapper for integration testing
export class McpServerProcess {
  private process: ChildProcess | null = null;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async start(serverPath: string): Promise<Client> {
    // Start the server process
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error('Failed to create server process streams');
    }

    // Set up transport
    this.transport = new StdioClientTransport({
      stdin: this.process.stdin,
      stdout: this.process.stdout,
    });

    // Create client
    this.client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Connect client to transport
    await this.client.connect(this.transport);

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.SERVER_STARTUP_DELAY));

    return this.client;
  }

  async stop() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  getClient(): Client {
    if (!this.client) {
      throw new Error('Server not started. Call start() first.');
    }
    return this.client;
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}

// Test data fixtures
export const TEST_FIXTURES = {
  // Sample tool requests
  toolRequests: {
    listTools: {
      method: 'tools/list',
    },

    getTranscript: {
      method: 'tools/call',
      params: {
        name: 'get_transcript_and_save',
        arguments: {
          video_url: 'https://www.youtube.com/watch?v=test123',
          output_path: 'test-transcript.md',
        },
      },
    },

    invalidTool: {
      method: 'tools/call',
      params: {
        name: 'nonexistent_tool',
        arguments: {},
      },
    },

    invalidParams: {
      method: 'tools/call',
      params: {
        name: 'get_transcript_and_save',
        arguments: {
          // Missing required parameters
        },
      },
    },
  },

  // Sample tool responses
  toolResponses: {
    listTools: {
      tools: [
        {
          name: 'get_transcript_and_save',
          description: 'Fetches the transcript for a YouTube video and saves it as a Markdown file.',
          inputSchema: {
            type: 'object',
            properties: {
              video_url: {
                type: 'string',
                description: 'The full URL of the YouTube video.',
              },
              output_path: {
                type: 'string',
                description: 'The local file path where the Markdown transcript should be saved.',
              },
            },
            required: ['video_url', 'output_path'],
          },
        },
      ],
    },

    transcriptSuccess: {
      content: [
        {
          type: 'text',
          text: 'Transcript successfully saved to test-transcript.md',
        },
      ],
    },

    transcriptError: {
      content: [
        {
          type: 'text',
          text: 'Failed to process transcript. Error: Transcripts are disabled for the video.',
        },
      ],
      isError: true,
    },
  },

  // Sample YouTube URLs for testing
  youtubeUrls: {
    standard: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    shorts: 'https://youtube.com/shorts/abc123xyz',
    youtuBe: 'https://youtu.be/dQw4w9WgXcQ',
    withParams: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    invalid: 'not-a-youtube-url',
    malicious: 'https://www.youtube.com/watch?v=../../../etc/passwd',
  },

  // Output path test cases
  outputPaths: {
    valid: [
      'transcript.md',
      'transcripts/video.md',
      './output/test.md',
      'data/2024/report.md',
    ],
    invalid: [
      '../../../etc/passwd',
      '/etc/shadow',
      'C:\\Windows\\System32\\config.txt',
      '',
      null,
    ],
  },
};

// Helper functions for MCP testing
export const mcpTestHelpers = {
  // Create mock client for unit testing
  createMockClient: () => {
    const mockClient = {
      request: vi.fn(),
      close: vi.fn(),
      connect: vi.fn(),
    };
    return mockClient;
  },

  // Wait for async operation with timeout
  waitForAsync: async <T>(
    operation: () => Promise<T>,
    timeoutMs: number = TEST_CONFIG.MCP_TIMEOUT
  ): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
  },

  // Verify MCP response format
  isValidMcpResponse: (response: any): boolean => {
    return (
      response &&
      typeof response === 'object' &&
      Array.isArray(response.content) &&
      response.content.every((item: any) =>
        item && typeof item === 'object' && typeof item.type === 'string'
      )
    );
  },

  // Extract text content from MCP response
  extractTextContent: (response: any): string[] => {
    if (!response?.content) return [];
    return response.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text);
  },

  // Check if response indicates error
  isError: (response: any): boolean => {
    return response?.isError === true;
  },
};

export default {
  MockTransport,
  McpServerProcess,
  TEST_CONFIG,
  TEST_FIXTURES,
  mcpTestHelpers,
};