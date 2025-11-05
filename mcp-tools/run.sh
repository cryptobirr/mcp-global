#!/usr/bin/env bash
# MCP-Tools Server Runner

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Set the registry path to the global registry
export MCP_REGISTRY_PATH="${HOME}/.mcp-global/global-registry.json"

# Change to the script directory
cd "$SCRIPT_DIR"

# Run the MCP server
exec node dist/index.js