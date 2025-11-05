# Claude Code MCP Setup Guide

## Overview
Claude Code uses CLI commands to manage MCP servers. **Do NOT edit JSON files manually.**

## Installation/Addition
```bash
# Basic syntax
claude mcp add <name> <command> [args...] -e ENV_VAR=value

# Examples
claude mcp add filesystem npx -- -y @modelcontextprotocol/server-filesystem /Users/mekonen/Documents

claude mcp add todoist node /path/to/todoist-server/dist/index.js -e TODOIST_API_TOKEN=your_token

claude mcp add youtube node /path/to/youtube-server/build/index.js
```

## Management Commands
```bash
# List all servers
claude mcp list

# Remove a server
claude mcp remove <name>

# Get server details
claude mcp get <name>

# Check server health
claude mcp list  # Shows ✓ Connected or ✗ Failed
```

## Verification
```bash
# In Claude Code, use the internal command:
/mcp

# Should show your configured servers instead of "No MCP servers configured"
```

## Configuration Files
- **Local**: `~/.claude.json` (project-specific)
- **User**: Global across projects
- **Project**: `.mcp.json` (team sharing)

## Modification
To modify a server:
1. Remove: `claude mcp remove <name>`
2. Add with new settings: `claude mcp add <name> ...`

## Troubleshooting

### "No MCP servers configured"
- **Cause**: Using manual JSON editing instead of CLI
- **Fix**: Use `claude mcp add` commands only

### "Failed to connect"
- **Cause**: Server path wrong or environment variables missing
- **Fix**: Test server manually: `node /path/to/server.js`

### Environment Variables
- Use `-e KEY=value` flag when adding
- For multiple variables: `-e KEY1=value1 -e KEY2=value2`

### Common Working Examples
```bash
# Filesystem (works reliably)
claude mcp add filesystem npx -- -y @modelcontextprotocol/server-filesystem /Users/mekonen/Documents

# Todoist (works with token)
claude mcp add todoist node ~/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js -e TODOIST_API_TOKEN=your_token

# YouTube (works without environment)
claude mcp add youtube node ~/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js
```