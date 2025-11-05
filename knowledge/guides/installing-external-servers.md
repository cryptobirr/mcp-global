# Installing External MCP Servers - Global Framework Guide

## Overview
How to properly install external MCP servers into the MCP Global framework.

## Installation Process

### 1. Determine Installation Method

#### From GitHub Repository
```bash
cd ~/.mcp-global/servers/binaries/
git clone https://github.com/username/server-name.git
cd server-name
```

#### From NPM Package
```bash
mkdir -p ~/.mcp-global/servers/binaries/package-name
cd ~/.mcp-global/servers/binaries/package-name
npm init -y
npm install package-name
```

#### From Local Source
```bash
cp -r /path/to/local/server ~/.mcp-global/servers/binaries/server-name
cd ~/.mcp-global/servers/binaries/server-name
```

### 2. Build the Server

#### Node.js Servers
```bash
# Install dependencies
npm install

# Build if needed
npm run build  # or yarn build, or tsc

# Identify main file
# Look for: build/index.js, dist/index.js, src/index.js, index.js
```

#### Python Servers
```bash
# Install dependencies
pip install -r requirements.txt
# or
uv pip install -r requirements.txt

# Identify main file
# Look for: main.py, src/main.py, server.py
```

### 3. Test the Server
```bash
# For Node.js servers
timeout 3 node build/index.js  # or dist/index.js
# Should show: "Server running on stdio"

# For Python servers
timeout 3 python main.py  # or python src/main.py
# Should show server startup message

# For NPM package servers
timeout 3 npx package-name
```

### 4. Handle Environment Variables

#### Check Requirements
```bash
# Look for environment variables in:
grep -r "process.env" src/  # Node.js
grep -r "os.environ" src/   # Python
cat README.md               # Documentation
```

#### Test With Variables
```bash
# Node.js example
API_KEY=test_value timeout 3 node build/index.js

# Python example
API_KEY=test_value timeout 3 python main.py
```

### 5. Add to Global Registry (Optional)
Create an entry in `~/.mcp-global/registry/global-registry.json`:

```json
{
  "servers": {
    "your-server-name": {
      "name": "Your Server Name",
      "type": "nodejs",
      "path": "~/.mcp-global/servers/binaries/your-server-name",
      "built": true,
      "main_file": "~/.mcp-global/servers/binaries/your-server-name/build/index.js",
      "category": "productivity",
      "requires_env": ["API_KEY", "CONFIG_PATH"]
    }
  }
}
```

## Common Installation Examples

### Installing Todoist MCP Server
```bash
# 1. Clone repository
cd ~/.mcp-global/servers/binaries/
git clone https://github.com/adilansari/todoist-mcp-server.git

# 2. Build
cd todoist-mcp-server
npm install
npm run build

# 3. Test
TODOIST_API_TOKEN=test timeout 3 node dist/index.js

# 4. Add to Claude Code
claude mcp add todoist node ~/.mcp-global/servers/binaries/todoist-mcp-server/dist/index.js -e TODOIST_API_TOKEN=your_token
```

### Installing Filesystem Server (NPM)
```bash
# This is an NPM package server - different approach
# Just test it directly:
timeout 3 npx @modelcontextprotocol/server-filesystem /Users/username/Documents

# Add to Claude Code
claude mcp add filesystem npx -- -y @modelcontextprotocol/server-filesystem /Users/username/Documents
```

### Installing Custom Python Server
```bash
# 1. Copy/clone to binaries
cd ~/.mcp-global/servers/binaries/
git clone https://github.com/username/python-mcp-server.git

# 2. Install dependencies
cd python-mcp-server
pip install -r requirements.txt

# 3. Test
timeout 3 python src/server.py

# 4. Add to Claude Code
claude mcp add python-server python ~/.mcp-global/servers/binaries/python-mcp-server/src/server.py
```

## Troubleshooting Installation

### Server Won't Start
```bash
# Check dependencies
npm install  # or pip install -r requirements.txt

# Check for build step
npm run build  # or yarn build

# Check main file location
find . -name "*.js" -o -name "*.py" | grep -E "(index|main|server)"
```

### Missing Environment Variables
```bash
# Find required variables
grep -r "process.env\|os.environ" .
cat README.md
cat package.json

# Test with dummy values
API_KEY=test CONFIG_PATH=/tmp timeout 3 node build/index.js
```

### Build Failures
```bash
# Check Node.js version
node --version  # Should be >= 16

# Check Python version
python --version  # Should be >= 3.8

# Install build tools if needed
npm install -g typescript  # For TypeScript projects
```

### Path Issues
```bash
# Always use absolute paths in configurations
# ✅ Good: /Users/username/.mcp-global/servers/binaries/server/build/index.js
# ❌ Bad: ./build/index.js or ~/build/index.js
```

## Verification Steps

### 1. Confirm Installation
```bash
ls -la ~/.mcp-global/servers/binaries/your-server/
# Should show: package.json, build/ or dist/, README.md
```

### 2. Test Startup
```bash
timeout 3 node build/index.js  # Should not error or hang
```

### 3. Test in LLM Tool
```bash
# Add to Claude Code
claude mcp add test-server node ~/.mcp-global/servers/binaries/your-server/build/index.js

# Check status
claude mcp list | grep test-server
# Should show: ✓ Connected
```

### 4. Test Functionality
Use the server in Claude Code and verify it responds to requests.

## Best Practices

### 1. Always Use Binaries Location
- **NEVER** install outside `~/.mcp-global/servers/binaries/`
- This ensures consistency and management tools work properly

### 2. Document Requirements
- Note any environment variables needed
- Document the main file location
- Record any special build steps

### 3. Test Before Adding to Tools
- Always test server startup manually first
- Verify environment variables work
- Confirm no missing dependencies

### 4. Follow Naming Conventions
- Use the original server name when possible
- Keep directory names consistent with repository names
- Don't create nested subdirectories unnecessarily

## Directory Structure Result
After proper installation:
```
~/.mcp-global/servers/binaries/
├── your-server-name/
│   ├── src/              # Source code
│   ├── build/            # Compiled output
│   ├── package.json      # Dependencies
│   ├── README.md         # Documentation
│   └── node_modules/     # Dependencies
└── [other servers...]
```

All servers follow this consistent pattern within the unified MCP Global framework.