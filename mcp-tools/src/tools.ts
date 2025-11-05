import { Search } from './search';
import { Executor } from './executor';
import { Registry } from './registry';
import { MCPServer, ExecuteToolRequest, ToolResult, SearchOptions, MCPListing, MCPDetails, ListMCPsRequest, ToolInfo } from './types';

export interface SearchToolsRequest {
  query: string;
  category?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class Tools {
  private mcpCache: Map<string, MCPDetails> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds cache

  // eslint-disable-next-line no-unused-vars
  constructor(
    private searchEngine: Search,
    private mcpExecutor: Executor,
    private mcpRegistry: Registry
  ) {}

  async searchTools(request: SearchToolsRequest): Promise<MCPServer[]> {
    const options: SearchOptions | undefined = request.category
      ? { category: request.category }
      : undefined;

    return this.searchEngine.find(request.query, options);
  }

  async executeTool(
    request: ExecuteToolRequest,
    timeoutMs?: number
  ): Promise<ToolResult> {
    // Validate request
    if (!request.server || request.server.trim() === '') {
      throw new Error('Invalid request: server is required');
    }

    if (!request.tool || request.tool.trim() === '') {
      throw new Error('Invalid request: tool is required');
    }

    // Get server configuration from registry to access environment variables
    const servers = this.mcpRegistry.getServers();
    const server = servers.find(s => s.name === request.server);
    const envVars = server?.env;

    return this.mcpExecutor.execute(request, envVars, timeoutMs);
  }

  async listCategories(): Promise<string[]> {
    const allMCPs = this.searchEngine.getAll();
    const categories = [...new Set(allMCPs.map(mcp => mcp.category))];
    return categories.sort();
  }

  async listMCPs(request: ListMCPsRequest = {}): Promise<MCPListing[] | MCPDetails[]> {
    const now = Date.now();
    const cacheValid = now - this.cacheTimestamp < this.CACHE_TTL_MS;

    // Get servers from registry
    const servers = this.mcpRegistry.getServers();

    if (request.detail === 'summary' || !request.detail) {
      // Fast summary response
      let listings = servers.map(server => this.createMCPListing(server));

      if (request.category) {
        listings = listings.filter(mcp => mcp.category === request.category);
      }

      return listings;
    }

    // Full details with caching
    const detailedMCPs: MCPDetails[] = [];

    for (const server of servers) {
      if (request.category && server.category !== request.category) {
        continue;
      }

      let details = this.mcpCache.get(server.name);

      if (!details || !cacheValid) {
        details = await this.createMCPDetails(server, request.includeTools);
        this.mcpCache.set(server.name, details);
      }

      detailedMCPs.push(details);
    }

    this.cacheTimestamp = now;
    return detailedMCPs;
  }

  async getMCPDetails(mcpName: string, includeTools: boolean = false): Promise<MCPDetails | null> {
    const servers = this.mcpRegistry.getServers();
    const server = servers.find(s => s.name === mcpName);

    if (!server) {
      return null;
    }

    const now = Date.now();
    const cacheValid = now - this.cacheTimestamp < this.CACHE_TTL_MS;

    let details = this.mcpCache.get(server.name);

    if (!details || !cacheValid || (includeTools && !details.tools)) {
      details = await this.createMCPDetails(server, includeTools);
      this.mcpCache.set(server.name, details);
      this.cacheTimestamp = now;
    }

    return details;
  }

  private createMCPListing(server: MCPServer): MCPListing {
    return {
      name: server.name,
      category: server.category,
      description: server.description,
      status: 'available' as const,
      toolCount: undefined // Will be populated if tools are fetched
    };
  }

  private async createMCPDetails(server: MCPServer, includeTools: boolean = false): Promise<MCPDetails> {
    const details: MCPDetails = {
      name: server.name,
      category: server.category,
      description: server.description,
      status: 'available' as const,
      path: server.path,
      env: server.env,
      lastChecked: new Date().toISOString()
    };

    if (includeTools) {
      try {
        // Try to get tools list by executing a quick connection test
        const tools = await this.fetchMCPTools(server);
        details.tools = tools;
        details.toolCount = tools.length;
      } catch (error) {
        details.status = 'unknown';
        details.tools = [];
        details.toolCount = 0;
      }
    }

    return details;
  }

  private async fetchMCPTools(server: MCPServer): Promise<ToolInfo[]> {
    try {
      // This is a simplified tool fetching - in reality you'd need to connect to the MCP server
      // For now, return empty array as this would require actual MCP server connection
      return [];
    } catch (error) {
      return [];
    }
  }

  async getToolsList(): Promise<ToolSchema[]> {
    return [
      {
        name: 'search_tools',
        description: 'Search for available MCP tools by keyword and category',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            category: { type: 'string', description: 'Category filter' }
          },
          required: ['query']
        }
      },
      {
        name: 'execute_tool',
        description: 'Execute a specific MCP tool',
        inputSchema: {
          type: 'object',
          properties: {
            server: { type: 'string', description: 'MCP server name' },
            tool: { type: 'string', description: 'Tool name to execute' },
            params: { type: 'object', description: 'Tool parameters' }
          },
          required: ['server', 'tool', 'params']
        }
      },
      {
        name: 'list_categories',
        description: 'List all available MCP categories',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_mcps',
        description: 'List all MCP servers with fast response and hierarchical detail levels',
        inputSchema: {
          type: 'object',
          properties: {
            detail: {
              type: 'string',
              enum: ['summary', 'full'],
              description: 'Level of detail to return (summary for fast response, full for complete info)'
            },
            category: {
              type: 'string',
              description: 'Filter by category'
            },
            includeTools: {
              type: 'boolean',
              description: 'Include tools information in full detail mode'
            }
          }
        }
      },
      {
        name: 'get_mcp_details',
        description: 'Get detailed information about a specific MCP server',
        inputSchema: {
          type: 'object',
          properties: {
            mcpName: {
              type: 'string',
              description: 'Name of the MCP server'
            },
            includeTools: {
              type: 'boolean',
              description: 'Include tools information'
            }
          },
          required: ['mcpName']
        }
      }
    ];
  }
}