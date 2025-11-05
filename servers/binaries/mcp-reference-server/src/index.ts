#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

class MCPReferenceServer {
  private server: Server;
  private knowledgeBase: string;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-reference-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Path to knowledge base
    this.knowledgeBase = path.join(process.env.HOME || '', '.mcp-global', 'knowledge');

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_tool_guide',
            description: 'Get setup guide for Claude Code, Claude Desktop, or Cursor',
            inputSchema: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  enum: ['claude-code', 'claude-desktop', 'cursor'],
                  description: 'Which LLM tool to get guide for'
                }
              },
              required: ['tool']
            }
          },
          {
            name: 'get_server_info',
            description: 'Get information about common MCP servers',
            inputSchema: {
              type: 'object',
              properties: {
                server: {
                  type: 'string',
                  enum: ['todoist', 'youtube', 'filesystem', 'common-servers'],
                  description: 'Which server to get info about, or "common-servers" for overview'
                }
              },
              required: ['server']
            }
          },
          {
            name: 'get_troubleshooting_help',
            description: 'Get troubleshooting help for common MCP issues',
            inputSchema: {
              type: 'object',
              properties: {
                issue: {
                  type: 'string',
                  description: 'Describe the issue you are having'
                },
                tool: {
                  type: 'string',
                  enum: ['claude-code', 'claude-desktop', 'cursor', 'general'],
                  description: 'Which tool is having the issue'
                }
              },
              required: ['issue']
            }
          },
          {
            name: 'get_creation_guide',
            description: 'Get guide for creating new MCP servers in the global framework',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'get_installation_guide',
            description: 'Get guide for installing external MCP servers',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'list_available_guides',
            description: 'List all available guides and documentation',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'get_activation_guide',
            description: 'Get detailed activation instructions for specific LLM tools',
            inputSchema: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  enum: ['claude-code', 'claude-desktop', 'cursor', 'continue', 'cline'],
                  description: 'Which LLM tool to get activation instructions for'
                }
              },
              required: ['tool']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'get_tool_guide':
          return await this.getToolGuide(request.params.arguments?.tool as string);

        case 'get_server_info':
          return await this.getServerInfo(request.params.arguments?.server as string);

        case 'get_troubleshooting_help':
          return await this.getTroubleshootingHelp(
            request.params.arguments?.issue as string,
            request.params.arguments?.tool as string
          );

        case 'get_creation_guide':
          return await this.getCreationGuide();

        case 'get_installation_guide':
          return await this.getInstallationGuide();

        case 'list_available_guides':
          return await this.listAvailableGuides();

        case 'get_activation_guide':
          return await this.getActivationGuide(request.params.arguments?.tool as string);

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async getToolGuide(tool: string) {
    try {
      const guidePath = path.join(this.knowledgeBase, 'tools', `${tool}.md`);
      const content = fs.readFileSync(guidePath, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: `# ${tool.toUpperCase()} Setup Guide\n\n${content}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not find guide for ${tool}. Available tools: claude-code, claude-desktop, cursor`
          }
        ]
      };
    }
  }

  private async getServerInfo(server: string) {
    try {
      let filePath: string;

      if (server === 'common-servers') {
        filePath = path.join(this.knowledgeBase, 'servers', 'common-servers.md');
      } else {
        // For now, all server info is in common-servers.md
        // This can be expanded to individual server files later
        filePath = path.join(this.knowledgeBase, 'servers', 'common-servers.md');
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not find server information for ${server}`
          }
        ]
      };
    }
  }

  private async getTroubleshootingHelp(issue: string, tool?: string) {
    try {
      const troubleshootingPath = path.join(this.knowledgeBase, 'troubleshooting', 'common-issues.md');
      const content = fs.readFileSync(troubleshootingPath, 'utf-8');

      let response = `# Troubleshooting Help\n\n`;

      if (tool) {
        response += `**Issue**: ${issue}\n**Tool**: ${tool}\n\n`;
      } else {
        response += `**Issue**: ${issue}\n\n`;
      }

      response += content;

      return {
        content: [
          {
            type: 'text',
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error loading troubleshooting guide: ${error}`
          }
        ]
      };
    }
  }

  private async listAvailableGuides() {
    try {
      const guides = [];

      // List tool guides
      const toolsDir = path.join(this.knowledgeBase, 'tools');
      if (fs.existsSync(toolsDir)) {
        const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.md'));
        guides.push('## Tool Setup Guides');
        toolFiles.forEach(file => {
          const toolName = file.replace('.md', '');
          guides.push(`- ${toolName}: Use \`get_tool_guide\` with tool="${toolName}"`);
        });
      }

      // List server info
      guides.push('\n## Server Information');
      guides.push('- Use `get_server_info` with server="common-servers" for overview');
      guides.push('- Available servers: todoist, youtube, filesystem');

      // List troubleshooting
      guides.push('\n## Troubleshooting');
      guides.push('- Use `get_troubleshooting_help` with your issue description');

      // List activation guides
      guides.push('\n## Activation Guides');
      guides.push('- Use `get_activation_guide` with tool="claude-code" for Claude Code setup');
      guides.push('- Use `get_activation_guide` with tool="claude-desktop" for Claude Desktop setup');
      guides.push('- Use `get_activation_guide` with tool="cursor" for Cursor IDE setup');
      guides.push('- Use `get_activation_guide` with tool="continue" for Continue.dev setup');
      guides.push('- Use `get_activation_guide` with tool="cline" for Cline/VS Code setup');

      return {
        content: [
          {
            type: 'text',
            text: guides.join('\n')
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing guides: ${error}`
          }
        ]
      };
    }
  }

  private async getCreationGuide() {
    try {
      const guidePath = path.join(this.knowledgeBase, 'guides', 'creating-mcp-servers.md');
      const content = fs.readFileSync(guidePath, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error loading creation guide: ${error}`
          }
        ]
      };
    }
  }

  private async getInstallationGuide() {
    try {
      const guidePath = path.join(this.knowledgeBase, 'guides', 'installing-external-servers.md');
      const content = fs.readFileSync(guidePath, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error loading installation guide: ${error}`
          }
        ]
      };
    }
  }

  private async getActivationGuide(tool: string) {
    try {
      const runbookPath = path.join(process.env.HOME || '', '.mcp-global', 'docs', 'MCP_ACTIVATION_RUNBOOK.md');
      const fullContent = fs.readFileSync(runbookPath, 'utf-8');

      let extractedContent = '';

      switch (tool) {
        case 'claude-code':
          extractedContent = this.extractSection(fullContent, '## 🟢 Claude Code - PROVEN WORKING', '---');
          break;
        case 'claude-desktop':
          extractedContent = this.extractSection(fullContent, '## 🟢 Claude Desktop - PROVEN WORKING', '---');
          break;
        case 'cursor':
          extractedContent = this.extractSection(fullContent, '## 🔄 Cursor IDE - PARTIALLY TESTED', '---');
          break;
        case 'continue':
          extractedContent = this.extractSection(fullContent, '## 🔄 Continue.dev - PARTIALLY TESTED', '---');
          break;
        case 'cline':
          extractedContent = this.extractSection(fullContent, '## 🔄 Cline/VS Code - PARTIALLY TESTED', '---');
          break;
        default:
          throw new Error(`Unknown tool: ${tool}. Available tools: claude-code, claude-desktop, cursor, continue, cline`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `# ${tool.toUpperCase()} Activation Guide\n\n${extractedContent}\n\n---\n\n## 🛠️ Server Testing & Validation\n\n### Test Any Server Manually\n\`\`\`bash\n# Test server startup (should not error)\ntimeout 3 node /path/to/server.js 2>&1 | head -5\n\n# Expected output: "Server running on stdio" or similar\n\`\`\`\n\n### Environment Variable Testing\n\`\`\`bash\n# Test with environment variables\nENV_VAR=value timeout 3 node /path/to/server.js\n\n# Should start without environment errors\n\`\`\`\n\n### JSON Validation\n\`\`\`bash\n# Validate configuration file syntax\npython3 -m json.tool /path/to/config.json\n\n# Should output formatted JSON without errors\n\`\`\``
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error loading activation guide for ${tool}: ${error}`
          }
        ]
      };
    }
  }

  private extractSection(content: string, startMarker: string, endMarker: string): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex(line => line.includes(startMarker));

    if (startIndex === -1) {
      return `Section not found for marker: ${startMarker}`;
    }

    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith(endMarker)) {
        endIndex = i;
        break;
      }
    }

    return lines.slice(startIndex, endIndex).join('\n');
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Reference Server running on stdio');
  }
}

const server = new MCPReferenceServer();
server.run().catch(console.error);