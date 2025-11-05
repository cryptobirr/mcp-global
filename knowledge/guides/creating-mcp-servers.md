# Creating MCP Servers - Global Framework Guide

## Overview
All MCP servers must follow the unified MCP Global framework and be installed in `~/.mcp-global/servers/binaries/`.

## Server Creation Process

### 1. Choose Server Location
**ALWAYS** create in: `~/.mcp-global/servers/binaries/[your-server-name]/`

```bash
# Create server directory
mkdir -p ~/.mcp-global/servers/binaries/my-new-server
cd ~/.mcp-global/servers/binaries/my-new-server
```

### 2. Initialize Project
```bash
# For Node.js servers
npm init -y

# Add MCP SDK dependency
npm install @modelcontextprotocol/sdk

# Add TypeScript (recommended)
npm install typescript @types/node --save-dev
npm install tsx --save-dev  # For running TypeScript directly
```

### 3. Basic Server Structure
**File**: `src/index.ts`
```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class MyMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'my-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'my_tool',
            description: 'Description of what this tool does',
            inputSchema: {
              type: 'object',
              properties: {
                input: {
                  type: 'string',
                  description: 'Input parameter'
                }
              },
              required: ['input']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'my_tool':
          return await this.handleMyTool(request.params.arguments?.input as string);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async handleMyTool(input: string) {
    return {
      content: [
        {
          type: 'text',
          text: `Processed: ${input}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('My MCP Server running on stdio');
  }
}

const server = new MyMCPServer();
server.run().catch(console.error);
```

### 4. Package.json Configuration
**File**: `package.json`
```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
```

### 5. TypeScript Configuration
**File**: `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

### 6. Build and Test
```bash
# Install dependencies
npm install

# Build the server
npm run build

# Test the server
timeout 3 node build/index.js
# Should show: "My MCP Server running on stdio"
```

## Adding to LLM Tools

### Claude Code
```bash
claude mcp add my-server node ~/.mcp-global/servers/binaries/my-new-server/build/index.js
```

### Claude Desktop
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/Users/username/.mcp-global/servers/binaries/my-new-server/build/index.js"]
    }
  }
}
```

### Cursor
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/Users/username/.mcp-global/servers/binaries/my-new-server/build/index.js"],
      "type": "stdio"
    }
  }
}
```

## Environment Variables
If your server needs environment variables:

### In Server Code
```typescript
const apiKey = process.env.MY_API_KEY;
if (!apiKey) {
  throw new Error('MY_API_KEY environment variable is required');
}
```

### In Tool Configurations
```bash
# Claude Code
claude mcp add my-server node ~/.mcp-global/servers/binaries/my-new-server/build/index.js -e MY_API_KEY=value

# Claude Desktop
{
  "my-server": {
    "command": "node",
    "args": ["/.../build/index.js"],
    "env": {
      "MY_API_KEY": "your_value"
    }
  }
}
```

## Best Practices

### 1. Follow the Pattern
- **ALWAYS** use `~/.mcp-global/servers/binaries/[server-name]/`
- Use TypeScript for better error catching
- Include proper error handling
- Add input validation

### 2. Testing
```bash
# Test server startup
timeout 3 node build/index.js

# Test with environment variables
MY_API_KEY=test timeout 3 node build/index.js
```

### 3. Documentation
Include a README.md in your server directory explaining:
- What the server does
- Required environment variables
- How to configure it
- Example usage

### 4. Error Handling
```typescript
private async handleMyTool(input: string) {
  try {
    if (!input) {
      throw new Error('Input parameter is required');
    }

    // Your logic here
    return {
      content: [{ type: 'text', text: result }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }]
    };
  }
}
```

## Example: File Operations Server
See `~/.mcp-global/servers/binaries/mcp-reference-server/` for a complete working example that follows this exact pattern.

## Next Steps
1. Create your server following this structure
2. Test it manually first
3. Add it to Claude Code to test functionality
4. Document any environment variables needed
5. Add to other LLM tools as needed