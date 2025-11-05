import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Registry } from './registry.js';
import { Search } from './search.js';
import { Executor } from './executor.js';
import { Tools } from './tools.js';
import { Telemetry } from './telemetry.js';

const DEFAULT_REGISTRY_PATH = process.env.MCP_REGISTRY_PATH ||
  `${process.env.HOME}/.mcp-global/global-registry.json`;

class MCPToolsServer {
  private server: Server;
  private registry: Registry;
  private search: Search;
  private executor: Executor;
  private tools: Tools;
  private telemetry: Telemetry;

  constructor(registryPath: string = DEFAULT_REGISTRY_PATH) {
    this.server = new Server(
      {
        name: 'mcp-tools',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize components
    this.registry = new Registry(registryPath);
    this.search = new Search();
    this.executor = new Executor();
    this.telemetry = new Telemetry();
    this.tools = new Tools(this.search, this.executor, this.registry);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.telemetry.recordSearchDuration(async () => {
        const toolsList = await this.tools.getToolsList();
        return { tools: toolsList };
      });
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const correlationId = this.telemetry.generateCorrelationId();
      this.telemetry.setCorrelationId(correlationId);

      try {
        switch (name) {
          case 'search_tools': {
            return await this.telemetry.recordSearchDuration(async () => {
              const results = await this.tools.searchTools({
                query: (args?.query as string) || '',
                category: args?.category as string | undefined
              });
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(results, null, 2)
                  }
                ]
              };
            });
          }

          case 'execute_tool': {
            return await this.telemetry.recordMCPExecution(
              args?.server as string,
              args?.tool as string,
              async () => {
                const result = await this.tools.executeTool({
                  server: args?.server as string,
                  tool: args?.tool as string,
                  params: (args?.params as Record<string, any>) || {}
                });
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(result, null, 2)
                    }
                  ]
                };
              }
            );
          }

          case 'list_categories': {
            return await this.telemetry.recordSearchDuration(async () => {
              const categories = await this.tools.listCategories();
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(categories, null, 2)
                  }
                ]
              };
            });
          }

          case 'list_mcps': {
            return await this.telemetry.recordSearchDuration(async () => {
              const result = await this.tools.listMCPs({
                detail: args?.detail as 'summary' | 'full' | undefined,
                category: args?.category as string | undefined,
                includeTools: args?.includeTools as boolean | undefined
              });
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              };
            });
          }

          case 'get_mcp_details': {
            return await this.telemetry.recordSearchDuration(async () => {
              const result = await this.tools.getMCPDetails(
                args?.mcpName as string,
                args?.includeTools as boolean | undefined
              );
              if (!result) {
                throw new Error(`MCP server not found: ${args?.mcpName}`);
              }
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              };
            });
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        this.telemetry.recordError('tool_execution_error', error.message, {
          tool: name,
          correlationId
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async start(): Promise<void> {
    // Load registry and index tools
    const servers = await this.registry.load();
    this.search.index(servers);

    // Start server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async stop(): Promise<void> {
    this.registry.destroy();
    this.executor.destroy();
    this.telemetry.destroy();
    await this.server.close();
  }
}

// Start server if running as main module
if (require.main === module) {
  const server = new MCPToolsServer();

  server.start().catch((error) => {
    console.error('Failed to start MCP Tools server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down MCP Tools server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down MCP Tools server...');
    await server.stop();
    process.exit(0);
  });
}

export { MCPToolsServer };
export * from './types.js';
export { Registry } from './registry.js';
export { Search } from './search.js';
export { Executor } from './executor.js';
export { Tools } from './tools.js';
export { Telemetry } from './telemetry.js';