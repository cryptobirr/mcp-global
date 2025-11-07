/**
 * MCP Client Testing Fixtures
 *
 * Provides mock MCP client implementations and test fixtures
 * for testing MCP protocol interactions without actual server connections.
 */

import { vi } from 'vitest';

// Mock MCP request/response types
export interface MockMCPRequest {
  method: string;
  params?: any;
  id?: string | number;
}

export interface MockMCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MockMCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

// Mock transport for in-memory testing
export class MockTransport {
  private messages: MockMCPRequest[] = [];
  private responses: MockMCPResponse[] = [];
  private isClosed = false;

  async send(request: MockMCPRequest): Promise<MockMCPResponse> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    this.messages.push(request);

    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 1));

    // Return last response if available, or default success response
    return this.responses.pop() || {
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true }
    };
  }

  addResponse(response: MockMCPResponse) {
    this.responses.push(response);
  }

  getMessages(): MockMCPRequest[] {
    return [...this.messages];
  }

  close() {
    this.isClosed = true;
  }

  reset() {
    this.messages = [];
    this.responses = [];
    this.isClosed = false;
  }
}

// Mock MCP client implementation
export class MockMCPClient {
  private transport: MockTransport;
  private tools: MockMCPTool[] = [];

  constructor(transport?: MockTransport) {
    this.transport = transport || new MockTransport();
    this.setupDefaultTools();
  }

  private setupDefaultTools() {
    this.tools = [
      {
        name: 'get_transcript_and_save',
        description: 'Fetches the transcript for a YouTube video and saves it as a Markdown file.',
        inputSchema: {
          type: 'object',
          properties: {
            video_url: {
              type: 'string',
              description: 'The full URL of the YouTube video.'
            },
            output_path: {
              type: 'string',
              description: 'The local file path where the Markdown transcript should be saved.'
            }
          },
          required: ['video_url', 'output_path']
        }
      }
    ];
  }

  async listTools(): Promise<{ tools: MockMCPTool[] }> {
    const request: MockMCPRequest = {
      method: 'tools/list',
      id: Date.now()
    };

    const response = await this.transport.send(request);

    if (response.error) {
      throw new Error(`Tools list failed: ${response.error.message}`);
    }

    return {
      tools: this.tools
    };
  }

  async callTool(name: string, args: any): Promise<any> {
    const request: MockMCPRequest = {
      method: 'tools/call',
      params: {
        name,
        arguments: args
      },
      id: Date.now()
    };

    const response = await this.transport.send(request);

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  getTransport(): MockTransport {
    return this.transport;
  }

  addTool(tool: MockMCPTool) {
    this.tools.push(tool);
  }

  reset() {
    this.transport.reset();
    this.setupDefaultTools();
  }
}

// Test data fixtures
export const testData = {
  validVideoUrls: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    'https://youtube.com/shorts/abc123xyz'
  ],

  invalidVideoUrls: [
    'not-a-url',
    'https://example.com/video',
    '',
    null,
    undefined
  ],

  validOutputPaths: [
    'transcript.md',
    'transcripts/video.md',
    './output/test.md',
    'data/2024/report.md'
  ],

  invalidOutputPaths: [
    '../../../etc/passwd',
    '/etc/shadow',
    'C:\\Windows\\System32\\config.txt',
    '',
    null,
    undefined
  ],

  toolCallArgs: {
    valid: {
      video_url: 'https://www.youtube.com/watch?v=test',
      output_path: 'transcript.md'
    },
    invalidVideoUrl: {
      video_url: 'invalid-url',
      output_path: 'transcript.md'
    },
    invalidOutputPath: {
      video_url: 'https://www.youtube.com/watch?v=test',
      output_path: '../../../etc/passwd'
    },
    missingVideoUrl: {
      output_path: 'transcript.md'
    },
    missingOutputPath: {
      video_url: 'https://www.youtube.com/watch?v=test'
    }
  },

  errorResponses: {
    invalidParams: {
      code: -32602,
      message: 'Invalid arguments'
    },
    methodNotFound: {
      code: -32601,
      message: 'Unknown tool'
    },
    internalError: {
      code: -32603,
      message: 'Internal error'
    },
    transcriptError: {
      code: -32000,
      message: 'Failed to fetch transcript'
    }
  },

  successResponses: {
    transcriptSaved: {
      content: [
        {
          type: 'text',
          text: 'Transcript successfully saved to transcript.md'
        }
      ],
      isError: false
    },
    toolsList: {
      tools: [
        {
          name: 'get_transcript_and_save',
          description: 'Fetches the transcript for a YouTube video and saves it as a Markdown file.',
          inputSchema: {
            type: 'object',
            properties: {
              video_url: { type: 'string', description: 'YouTube video URL' },
              output_path: { type: 'string', description: 'Output file path' }
            },
            required: ['video_url', 'output_path']
          }
        }
      ]
    }
  }
};

// Helper functions for testing
export const helpers = {
  createMockClient(): MockMCPClient {
    return new MockMCPClient();
  },

  createMockTransport(): MockTransport {
    return new MockTransport();
  },

  simulateError(transport: MockTransport, error: any) {
    transport.addResponse({
      jsonrpc: '2.0',
      error: error,
      id: Date.now()
    });
  },

  simulateSuccess(transport: MockTransport, result: any) {
    transport.addResponse({
      jsonrpc: '2.0',
      result,
      id: Date.now()
    });
  },

  validateMCPResponse(response: MockMCPResponse): boolean {
    return response.jsonrpc === '2.0' &&
           (response.result !== undefined || response.error !== undefined);
  },

  createToolCallRequest(toolName: string, args: any): MockMCPRequest {
    return {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: Date.now()
    };
  },

  createListToolsRequest(): MockMCPRequest {
    return {
      method: 'tools/list',
      id: Date.now()
    };
  }
};