# Claude Desktop MCP Setup Guide

## Overview
Claude Desktop uses JSON configuration files. Manual editing required.

## Configuration File Location
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

## Installation/Addition

### 1. Create/Edit Configuration File
```bash
# Create directory if needed
mkdir -p "$HOME/Library/Application Support/Claude"

# Edit the file
nano "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

### 2. Configuration Format
```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2", "/path/to/server"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

### 3. Working Examples
```json
{
  "mcpServers": {
    "todoist": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js"],
      "env": {
        "TODOIST_API_TOKEN": "your_token_here"
      }
    },
    "youtube": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js"]
    }
  }
}
```

## Activation Steps
1. **Edit configuration file** with your servers
2. **Validate JSON syntax**: `python3 -m json.tool file.json`
3. **Completely quit Claude Desktop** (Cmd+Q)
4. **Restart Claude Desktop**
5. **Wait for servers to initialize**

## Verification
Ask Claude Desktop: *"How many MCPs can you see?"*

Expected response should list your servers:
- Todoist MCP - For task management
- YouTube MCP - For fetching YouTube video transcripts

## Modification
1. Edit the JSON file
2. Add/remove/modify server entries
3. Restart Claude Desktop completely

## Uninstallation
1. Remove server entry from JSON file
2. Restart Claude Desktop
Or delete entire config file to remove all servers

## Troubleshooting

### "Could not attach to MCP server"
**Common Causes:**
- **Server path wrong**: Verify file exists at specified path
- **Permissions issue**: Ensure files are readable
- **Missing dependencies**: Test server manually
- **Environment variables**: Check if server needs env vars

**Debugging Steps:**
```bash
# Test server manually
node /path/to/server.js

# Should show: "Server running on stdio"

# Validate JSON
python3 -m json.tool ~/.../claude_desktop_config.json

# Check file permissions
ls -la ~/.../claude_desktop_config.json
```

### Known Issues
- **Filesystem server**: May fail on certain directories (use Documents or Desktop)
- **NPX servers**: Sometimes unreliable, prefer local node servers

### Working Server Paths
```json
{
  "mcpServers": {
    "todoist": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js"],
      "env": {
        "TODOIST_API_TOKEN": "7a97a335befbe8b31a0f19ec91e11d02cb1c8600"
      }
    },
    "youtube": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js"]
    }
  }
}
```

### Critical Requirements
- **Complete restart required** after any config changes
- **JSON must be valid** (use validation tools)
- **Absolute paths** work more reliably than relative paths
- **Environment variables** must be in "env" object