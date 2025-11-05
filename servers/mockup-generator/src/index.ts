#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { registerComponentTool, handleRegisterComponent } from './tools/register-component.js';
import { generateScreenshotsTool, handleGenerateScreenshots } from './tools/generate-screenshots.js';
import { getScreenshotsTool, handleGetScreenshots } from './tools/get-screenshots.js';
import { listProjectsTool, handleListProjects } from './tools/list-projects.js';
import { servePreviewTool, handleServePreview } from './tools/serve-preview.js';

const server = new Server(
  {
    name: 'mockup-generator',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    registerComponentTool,
    generateScreenshotsTool,
    getScreenshotsTool,
    listProjectsTool,
    servePreviewTool,
  ],
}));

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'mockup_register_component':
        return await handleRegisterComponent(args);

      case 'mockup_generate_screenshots':
        return await handleGenerateScreenshots(args);

      case 'mockup_get_screenshots':
        return await handleGetScreenshots(args);

      case 'mockup_list_projects':
        return await handleListProjects();

      case 'mockup_serve_preview':
        return await handleServePreview(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error executing tool "${name}": ${error.message}\n\nStack trace:\n${error.stack}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Mockup Generator MCP Server running on stdio');
  console.error('Available tools:');
  console.error('  - mockup_register_component');
  console.error('  - mockup_generate_screenshots');
  console.error('  - mockup_get_screenshots');
  console.error('  - mockup_list_projects');
  console.error('  - mockup_serve_preview');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
