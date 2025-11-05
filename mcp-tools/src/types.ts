export interface MCPServer {
  name: string;
  category: string;
  description: string;
  path: string;
  env?: Record<string, string>;
}

export interface Registry {
  servers: Record<string, MCPServer>;
}

export interface SearchOptions {
  category?: string;
}

export interface ExecuteToolRequest {
  server: string;
  tool: string;
  params: Record<string, any>;
}

export interface ToolResult {
  result?: any;
  error?: string;
}

export interface MCPListing {
  name: string;
  category: string;
  description: string;
  status: 'available' | 'unknown';
  toolCount?: number;
}

export interface MCPDetails extends MCPListing {
  path: string;
  env?: Record<string, string>;
  tools?: ToolInfo[];
  lastChecked?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  schema?: any;
}

export interface ListMCPsRequest {
  detail?: 'summary' | 'full';
  category?: string;
  includeTools?: boolean;
}

export class MCPNotFoundError extends Error {
  constructor(server: string) {
    super(`MCP server not found: ${server}`);
    this.name = 'MCPNotFoundError';
  }
}

export class MCPCrashError extends Error {
  constructor(server: string, stderr: string) {
    super(`MCP server crashed: ${server}. Error: ${stderr}`);
    this.name = 'MCPCrashError';
  }
}

export class TimeoutError extends Error {
  constructor(server: string) {
    super(`MCP server timeout: ${server}`);
    this.name = 'TimeoutError';
  }
}

export class RegistryParseError extends Error {
  constructor(message: string) {
    super(`Registry parse error: ${message}`);
    this.name = 'RegistryParseError';
  }
}

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = 'FileNotFoundError';
  }
}