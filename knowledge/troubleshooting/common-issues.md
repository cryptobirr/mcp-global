# MCP Troubleshooting Guide

## Tool-Specific Issues

### Claude Code

#### "No MCP servers configured"
**Cause**: Using manual JSON editing instead of CLI commands
**Solution**: Use only `claude mcp add` commands

#### "Failed to connect" in `claude mcp list`
**Diagnosis**:
```bash
# Test server manually
node /path/to/server.js

# Check if environment variables needed
ENV_VAR=value node /path/to/server.js
```
**Solution**: Fix server path or environment variables

### Claude Desktop

#### "Could not attach to MCP server"
**Common Causes**:
1. **Server path incorrect**
2. **Missing environment variables**
3. **Server not executable**
4. **JSON syntax errors**

**Debugging Steps**:
```bash
# 1. Test server manually
node /path/to/server.js
# Should show: "Server running on stdio"

# 2. Validate JSON
python3 -m json.tool ~/.../claude_desktop_config.json
# Should output formatted JSON without errors

# 3. Check file exists
ls -la /path/to/server.js

# 4. Test with environment variables
ENV_VAR=value node /path/to/server.js
```

#### Server Shows But Doesn't Work
**Cause**: Usually environment variable issues
**Solution**: Check server requirements and add missing env vars

### Cursor IDE

#### MCP Configuration Not Recognized
**Checklist**:
- [ ] `mcp.json` file in project root
- [ ] `"type": "stdio"` included for each server
- [ ] Valid JSON syntax
- [ ] Cursor restarted completely

## General Server Issues

### Server Won't Start
```bash
# Test server startup
timeout 5 node /path/to/server.js

# Common outputs:
# ✅ "Server running on stdio" = Working
# ❌ "Error: ENOENT" = File not found
# ❌ "Environment variable required" = Missing env var
# ❌ Timeout = Server hanging (usually env var issue)
```

### Environment Variable Problems
```bash
# Test with required variables
TODOIST_API_TOKEN=test_token node server.js

# Check what variables server expects
grep -r "process.env" /path/to/server/
```

### Permission Issues
```bash
# Check file permissions
ls -la /path/to/server.js

# Should be readable (r-- in permissions)
# Fix if needed: chmod +r /path/to/server.js
```

## Configuration Issues

### JSON Validation
```bash
# Validate any JSON file
python3 -m json.tool config.json

# Common errors:
# - Missing commas
# - Extra commas
# - Unmatched brackets
# - Unquoted strings
```

### Path Issues
- **Use absolute paths**: `/Users/mekonen/...` instead of `~/...`
- **Check spaces**: Quote paths with spaces
- **Verify existence**: `ls /path/to/file` to confirm

## Recovery Procedures

### Reset Claude Desktop MCP
```bash
# Backup current config
cp "~/Library/Application Support/Claude/claude_desktop_config.json" ~/backup.json

# Reset to empty
echo '{"mcpServers": {}}' > "~/Library/Application Support/Claude/claude_desktop_config.json"

# Restart Claude Desktop
```

### Reset Claude Code MCP
```bash
# Remove all servers
claude mcp list  # Note server names
claude mcp remove server1
claude mcp remove server2
# etc.

# Verify clean slate
claude mcp list  # Should show "No MCP servers configured"
```

### Test Minimal Setup
Start with one working server:
```bash
# Claude Code
claude mcp add youtube node ~/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js

# Claude Desktop
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js"]
    }
  }
}
```

## When to Restart Tools
- **Claude Desktop**: Always restart after config changes
- **Claude Code**: Automatic detection (no restart needed)
- **Cursor**: Restart after mcp.json changes
- **VS Code/Cline**: Restart after settings.json changes

## Getting Help
1. **Test server manually** first
2. **Validate configuration syntax**
3. **Check file permissions and paths**
4. **Try minimal working example**
5. **Check logs** if available

## Quick Diagnostic Script
```bash
#!/bin/bash
echo "=== MCP Diagnostic ==="
echo "Testing server startup..."
timeout 3 node /path/to/your/server.js 2>&1 | head -3

echo "Validating config..."
python3 -m json.tool /path/to/config.json > /dev/null && echo "✅ JSON valid" || echo "❌ JSON invalid"

echo "Checking file permissions..."
ls -la /path/to/server.js
```