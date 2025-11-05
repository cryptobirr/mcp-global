# Cursor IDE MCP Setup Guide

## Overview
Cursor uses project-specific JSON configuration files with a specific format requirement.

## Configuration File Location
```
[your-project-directory]/mcp.json
```

## Installation/Addition

### 1. Create Configuration File
```bash
# In your project root
touch mcp.json
```

### 2. Configuration Format
**Key Requirement**: Must include `"type": "stdio"` for each server

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "type": "stdio",
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

### 3. Working Example
```json
{
  "mcpServers": {
    "postgres-mcp-server": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/postgres-mcp-server/build/index.js"],
      "type": "stdio",
      "env": {
        "DB_PASSWORD": "your_password"
      }
    },
    "todoist": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js"],
      "type": "stdio",
      "env": {
        "TODOIST_API_TOKEN": "your_token"
      }
    }
  }
}
```

## Activation Steps
1. **Create `mcp.json`** in project root
2. **Add server configurations** with `"type": "stdio"`
3. **Validate JSON**: `python3 -m json.tool mcp.json`
4. **Restart Cursor IDE**
5. **Open project** containing the mcp.json file

## Verification
Check if Cursor recognizes the MCP servers (exact method needs verification)

## Modification
1. Edit the `mcp.json` file
2. Add/remove server entries
3. Restart Cursor IDE

## Uninstallation
1. Remove server entries from `mcp.json`
2. Or delete `mcp.json` file entirely
3. Restart Cursor IDE

## Key Differences from Other Tools
- **Project-specific**: Each project needs its own `mcp.json`
- **Type requirement**: Must include `"type": "stdio"`
- **Same command/args structure** as Claude Desktop

## Troubleshooting

### Configuration Not Recognized
- **Ensure `mcp.json` is in project root**
- **Verify `"type": "stdio"` is present** for each server
- **Validate JSON syntax**
- **Restart Cursor completely**

### Server Connection Issues
```bash
# Test server manually
node /path/to/server.js

# Should show: "Server running on stdio"
```

### Environment Variables
- Include in `"env"` object like Claude Desktop
- Test variables work: `ENV_VAR=value node /path/to/server.js`

## Status Note
⚠️ **Cursor configuration was deployed during Phase 6 but needs user verification**

The configuration format is based on deployment testing. Users should:
1. Test the setup steps above
2. Verify MCP servers appear in Cursor
3. Report any tool-specific requirements discovered

## Example from Phase 6 Deployment
```json
{
  "mcpServers": {
    "postgres-mcp-server": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/postgres-mcp-server/build/index.js"],
      "type": "stdio",
      "env": {
        "DB_PASSWORD": "Dayton01"
      }
    }
  }
}
```

This configuration was successfully deployed but needs verification of actual functionality in Cursor IDE.