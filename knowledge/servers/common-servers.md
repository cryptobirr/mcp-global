# Common MCP Servers Reference

## Proven Working Servers

### Todoist MCP Server
**Purpose**: Task management through Todoist API
**Type**: Node.js server
**Location**: `~/.mcp-global/servers/binaries/todoist-mcp-server/`

**Requirements**:
- `TODOIST_API_TOKEN` environment variable

**Test Command**:
```bash
TODOIST_API_TOKEN=your_token node ~/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js
```

**Configuration Examples**:
```bash
# Claude Code
claude mcp add todoist node ~/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js -e TODOIST_API_TOKEN=your_token

# Claude Desktop
{
  "todoist": {
    "command": "node",
    "args": ["/.../todoist-mcp-server/dist/index.js"],
    "env": {"TODOIST_API_TOKEN": "your_token"}
  }
}
```

### YouTube MCP Server
**Purpose**: Fetch YouTube video transcripts and information
**Type**: Node.js server
**Location**: `~/.mcp-global/servers/binaries/youtube-mcp-server/`

**Requirements**: None (no environment variables needed)

**Test Command**:
```bash
node ~/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js
```

**Configuration Examples**:
```bash
# Claude Code
claude mcp add youtube node ~/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js

# Claude Desktop
{
  "youtube": {
    "command": "node",
    "args": ["/.../youtube-mcp-server/build/index.js"]
  }
}
```

### Filesystem Server
**Purpose**: File system operations
**Type**: NPM package
**Source**: `@modelcontextprotocol/server-filesystem`

**Requirements**: Directory path argument

**Test Command**:
```bash
npx -y @modelcontextprotocol/server-filesystem /Users/mekonen/Documents
```

**Configuration Examples**:
```bash
# Claude Code (reliable)
claude mcp add filesystem npx -- -y @modelcontextprotocol/server-filesystem /Users/mekonen/Documents

# Claude Desktop (may have issues)
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/mekonen/Documents"]
  }
}
```

## Available But Need Setup

### PostgreSQL MCP Server
**Purpose**: Database operations
**Location**: `~/.mcp-global/servers/binaries/postgres-mcp-server/`
**Requirements**: Database connection details (DB_HOST, DB_USER, DB_PASSWORD, etc.)

### Gmail MCP Server
**Purpose**: Email operations
**Location**: `~/.mcp-global/servers/binaries/gmail-mcp/`
**Requirements**: Gmail OAuth credentials and API keys

### Google Calendar MCP Server
**Purpose**: Calendar management
**Location**: `~/.mcp-global/servers/binaries/google-calendar-mcp/`
**Requirements**: Google Calendar OAuth credentials

## Server Installation Locations
ALL MCP servers must be installed in: `~/.mcp-global/servers/binaries/`

This includes:
- External servers (todoist, youtube, gmail, etc.)
- Custom servers (mcp-reference-server)
- Any new servers you create

**Pattern**: `~/.mcp-global/servers/binaries/[server-name]/`

## Testing Any Server
```bash
# Basic test (should show "running on stdio")
node /path/to/server/main.js

# With environment variables
ENV_VAR=value node /path/to/server/main.js

# With timeout (prevents hanging)
timeout 3 node /path/to/server/main.js
```

## Common Server Issues
- **Missing environment variables**: Server fails to start
- **Wrong file paths**: "File not found" errors
- **Permission issues**: Cannot read server files
- **Dependency issues**: Server dependencies not installed