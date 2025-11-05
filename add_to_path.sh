#!/bin/bash
# Add MCP Global to PATH
echo 'export PATH="$HOME/.mcp-global:$PATH"' >> ~/.zshrc
source ~/.zshrc
echo "MCP Global added to PATH. You can now use 'mcp' command globally."