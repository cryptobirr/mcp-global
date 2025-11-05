"""
MCP Generator for Knowledge Base MCP Server

This module generates individual MCP servers for each knowledge base,
providing dedicated search tools for Claude Code integration.
"""

import os
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any
import shutil


def get_server_name(kb_name: str) -> str:
    """
    Convert knowledge base name to server name.

    Args:
        kb_name: Knowledge base name (e.g., "baml-kb-data")

    Returns:
        Server name (e.g., "baml-kb")
    """
    if kb_name.endswith("-kb-data"):
        base_name = kb_name[:-8]  # Remove "-kb-data" suffix
        return f"{base_name}-kb"
    else:
        return f"kb-{kb_name}"


class MCPGenerator:
    """
    Generator for Knowledge Base MCP servers.

    Creates individual MCP servers for each knowledge base with dedicated
    search and query tools that integrate with Claude Code.
    """

    def __init__(self, servers_dir: str = None, knowledge_bases_dir: str = None):
        """
        Initialize MCP Generator.

        Args:
            servers_dir: Directory for generated MCP servers
            knowledge_bases_dir: Directory for knowledge base storage
        """
        home_dir = Path.home()
        self.servers_dir = Path(servers_dir or f"{home_dir}/.mcp-global/servers")
        self.knowledge_bases_dir = Path(knowledge_bases_dir or f"{home_dir}/.mcp-global/knowledge-bases")

    def generate_kb_mcp(self, kb_name: str, kb_path: str) -> bool:
        """
        Generate a complete MCP server for a knowledge base.

        Args:
            kb_name: Name of the knowledge base
            kb_path: Path to the knowledge base directory

        Returns:
            True if successful, False otherwise
        """
        try:
            # Normalize paths
            kb_path = Path(kb_path).expanduser().resolve()

            server_name = get_server_name(kb_name)
            server_path = self.servers_dir / server_name

            print(f"🔧 Generating MCP server: {server_name}")
            print(f"📂 KB Path: {kb_path}")
            print(f"🚀 Server Path: {server_path}")

            # Create server directory
            server_path.mkdir(parents=True, exist_ok=True)

            # Generate server files
            if not self.generate_server_js(kb_name, kb_path, server_path):
                return False

            if not self.generate_package_json(kb_name, server_path):
                return False

            if not self.generate_readme_md(kb_name, kb_path, server_path):
                return False

            print(f"✅ MCP server generated: {server_name}")
            return True

        except Exception as e:
            print(f"❌ Error generating MCP server: {e}")
            return False

    def generate_server_js(self, kb_name: str, kb_path: Path, server_path: Path) -> bool:
        """
        Generate the main server.js file for the KB MCP.

        Args:
            kb_name: Name of the knowledge base
            kb_path: Path to the knowledge base directory
            server_path: Path to the server directory

        Returns:
            True if successful, False otherwise
        """
        try:
            # Escape the path for JavaScript
            escaped_kb_path = str(kb_path).replace('\\', '\\\\')
            server_name = get_server_name(kb_name)

            server_js = f'''/**
 * Knowledge Base MCP Server: {kb_name}
 *
 * Generated MCP server providing search capabilities for the "{kb_name}" knowledge base.
 * Built using LanceDB for vector similarity search.
 */

const {{ Server }} = require("@modelcontextprotocol/sdk/server/index.js");
const {{ StdioServerTransport }} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {{
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
}} = require("@modelcontextprotocol/sdk/types.js");
const {{ execSync }} = require("child_process");
const path = require("path");

class KnowledgeBaseServer {{
  constructor(kbName, kbPath) {{
    this.kbName = kbName;
    this.kbPath = kbPath;
    this.server = new Server(
      {{
        name: "{server_name}",
        version: "1.0.0",
      }},
      {{
        capabilities: {{
          tools: {{}},
        }},
      }}
    );
  }}

  async setup() {{
    // Register tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {{
      return {{
        tools: [
          {{
            name: "search",
            description: "Search the {kb_name} knowledge base using semantic vector search",
            inputSchema: {{
              type: "object",
              properties: {{
                query: {{
                  type: "string",
                  description: "Search query for the knowledge base",
                }},
                limit: {{
                  type: "number",
                  description: "Maximum number of results to return (default: 5)",
                  default: 5,
                }},
              }},
              required: ["query"],
            }},
          }},
          {{
            name: "stats",
            description: "Get statistics about the {kb_name} knowledge base",
            inputSchema: {{
              type: "object",
              properties: {{}},
            }},
          }},
        ],
      }};
    }});

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {{
      const {{ name, arguments: args }} = request.params;

      try {{
        switch (name) {{
          case "search":
            return await this.handleSearch(args.query, args.limit || 5);
          case "stats":
            return await this.handleStats();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${{name}}`
            );
        }}
      }} catch (error) {{
        console.error(`Error executing tool ${{name}}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${{error.message}}`
        );
      }}
    }});
  }}

  async handleSearch(query, limit = 5) {{
    try {{
      console.error(`Executing semantic search: ${{query}} (limit: ${{limit}})`);

      // Use Python script to perform LanceDB search
      const pythonScript = `
import sys
sys.path.insert(0, '/Users/mekonen/.mcp-global/servers/knowledge-manager')
from lancedb_wrapper import LanceDBManager
import json

manager = LanceDBManager()
results = manager.search('${{this.kbPath}}', '${{query}}', ${{limit}})
if results:
    print(json.dumps(results))
else:
    print(json.dumps({{"error": "Search failed", "query": "${{query}}"}}))
`;

      const result = execSync(
        `python3 -c "${{pythonScript.replace(/"/g, '\\"')}}"`,
        {{ encoding: "utf8", timeout: 60000 }}
      );

      const searchResults = JSON.parse(result.trim());

      if (searchResults.error) {{
        throw new Error(searchResults.error);
      }}

      // Format results for display
      let formattedResults = `Semantic Search Results for "${{query}}":\\n\\n`;
      formattedResults += `Found ${{searchResults.total}} results\\n\\n`;

      searchResults.results.forEach((result, index) => {{
        formattedResults += `${{index + 1}}. Score: ${{result.score.toFixed(4)}}\\n`;
        if (result.metadata.title) {{
          formattedResults += `   Title: ${{result.metadata.title}}\\n`;
        }}
        if (result.metadata.source_url) {{
          formattedResults += `   Source: ${{result.metadata.source_url}}\\n`;
        }}
        formattedResults += `   Content: ${{result.content.substring(0, 500)}}${{result.content.length > 500 ? '...' : ''}}\\n\\n`;
      }});

      return {{
        content: [
          {{
            type: "text",
            text: formattedResults,
          }},
        ],
      }};
    }} catch (error) {{
      return {{
        content: [
          {{
            type: "text",
            text: `Error performing semantic search: ${{error.message}}`,
          }},
        ],
      }};
    }}
  }}

  async handleStats() {{
    try {{
      const fs = require('fs');
      const kbPath = this.kbPath;

      let stats = {{
        name: this.kbName,
        path: kbPath,
        exists: fs.existsSync(kbPath),
        documents: 0,
        vector_db: "LanceDB",
        embedding_model: "Unknown",
      }};

      // Check for LanceDB directory
      const lancedbDir = path.join(kbPath, "lancedb");
      if (fs.existsSync(lancedbDir)) {{
        try {{
          // Check for metadata file
          const metadataFile = path.join(kbPath, "metadata.json");
          if (fs.existsSync(metadataFile)) {{
            const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            stats.embedding_model = metadata.embedding_model || "Unknown";
            stats.use_openai_embeddings = metadata.use_openai_embeddings || false;
          }}
        }} catch (e) {{
          console.error("Error reading metadata:", e);
        }}
      }}

      // Count input documents
      const inputDir = path.join(kbPath, "input");
      if (fs.existsSync(inputDir)) {{
        try {{
          const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md'));
          stats.documents = files.length;
        }} catch (e) {{
          stats.documents = "Error counting files";
        }}
      }}

      return {{
        content: [
          {{
            type: "text",
            text: `Knowledge Base Statistics for "${{this.kbName}}":\\n\\n${{JSON.stringify(stats, null, 2)}}`,
          }},
        ],
      }};
    }} catch (error) {{
      return {{
        content: [
          {{
            type: "text",
            text: `Error getting stats: ${{error.message}}`,
          }},
        ],
      }};
    }}
  }}

  async run() {{
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Knowledge base MCP server running for: ${{this.kbName}}`);
  }}
}}

// Main execution
async function main() {{
  const kbName = "{kb_name}";
  const kbPath = "{escaped_kb_path}";

  const server = new KnowledgeBaseServer(kbName, kbPath);
  await server.setup();
  await server.run();
}}

if (require.main === module) {{
  main().catch(console.error);
}}

module.exports = {{ KnowledgeBaseServer }};
'''

            server_file = server_path / "server.js"
            server_file.write_text(server_js)

            print(f"✅ Generated server.js for {kb_name}")
            return True

        except Exception as e:
            print(f"❌ Error generating server.js: {e}")
            return False

    def generate_package_json(self, kb_name: str, server_path: Path) -> bool:
        """
        Generate package.json for the KB MCP.

        Args:
            kb_name: Name of the knowledge base
            server_path: Path to the server directory

        Returns:
            True if successful, False otherwise
        """
        try:
            server_name = get_server_name(kb_name)
            package_json = {
                "name": server_name,
                "version": "1.0.0",
                "description": f"Knowledge Base MCP server for {kb_name}",
                "main": "server.js",
                "type": "module",
                "scripts": {
                    "start": "node server.js",
                    "dev": "node --watch server.js"
                },
                "dependencies": {
                    "@modelcontextprotocol/sdk": "^0.5.0"
                },
                "keywords": [
                    "mcp",
                    "knowledge-base",
                    "lancedb",
                    "vector-search",
                    "search",
                    kb_name
                ],
                "author": "Knowledge Base MCP Generator",
                "license": "MIT"
            }

            package_file = server_path / "package.json"
            package_file.write_text(json.dumps(package_json, indent=2))

            print(f"✅ Generated package.json for {kb_name}")
            return True

        except Exception as e:
            print(f"❌ Error generating package.json: {e}")
            return False

    def generate_readme_md(self, kb_name: str, kb_path: Path, server_path: Path) -> bool:
        """
        Generate README.md for the KB MCP.

        Args:
            kb_name: Name of the knowledge base
            kb_path: Path to the knowledge base directory
            server_path: Path to the server directory

        Returns:
            True if successful, False otherwise
        """
        try:
            server_name = get_server_name(kb_name)
            readme_content = f"""# Knowledge Base MCP Server: {server_name}

This MCP server provides search capabilities for the "{kb_name}" knowledge base, built using LanceDB.

## Installation

1. Install dependencies:
```bash
npm install
```

2. Register with Claude Code:
```bash
claude mcp add {server_name} -- node server.js
```

## Usage

Once registered, you can use these tools in Claude Code:

### Semantic Search
For natural language queries about the content:
```bash
mcp__kb_{kb_name.replace('-', '_')}__search({{query: "how to implement X"}})
```

You can also specify the number of results:
```bash
mcp__kb_{kb_name.replace('-', '_')}__search({{query: "architecture patterns", limit: 10}})
```

### Statistics
Get knowledge base information:
```bash
mcp__kb_{kb_name.replace('-', '_')}__stats()
```

## Configuration

- **Knowledge Base Path**: `{kb_path}`
- **Vector Database**: LanceDB
- **Search Method**: Semantic vector similarity search
- **Supported Queries**: Natural language questions

## Generated Files

- `server.js`: Main MCP server implementation
- `package.json`: NPM package configuration
- `README.md`: This documentation

## Details

This server was automatically generated by the Knowledge Base MCP system.
It provides direct access to the LanceDB-powered vector database for the {kb_name} content.

The knowledge base contains:
- Vector embeddings for semantic search
- Full document content with metadata
- Source URLs and titles
- Similarity-based ranking

## Support

For issues or questions about this knowledge base server, check the original knowledge base configuration.
"""

            readme_file = server_path / "README.md"
            readme_file.write_text(readme_content)

            print(f"✅ Generated README.md for {kb_name}")
            return True

        except Exception as e:
            print(f"❌ Error generating README.md: {e}")
            return False

    def register_with_claude(self, kb_name: str, server_path: str = None) -> bool:
        """
        Register the generated MCP server with Claude Code.

        Args:
            kb_name: Name of the knowledge base
            server_path: Path to the server directory (optional)

        Returns:
            True if successful, False otherwise
        """
        try:
            server_name = get_server_name(kb_name)
            if server_path is None:
                server_path = self.servers_dir / server_name
            else:
                server_path = Path(server_path)

            server_js = server_path / "server.js"

            if not server_js.exists():
                print(f"❌ Server file not found: {server_js}")
                return False

            # Register with Claude
            cmd = [
                "claude", "mcp", "add", server_name,
                "--", "node", str(server_js)
            ]

            print(f"🚀 Registering MCP server: {server_name}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                print(f"✅ MCP server registered: {server_name}")
                return True
            else:
                print(f"❌ Failed to register MCP server: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print(f"❌ MCP registration timed out")
            return False
        except Exception as e:
            print(f"❌ Error registering MCP server: {e}")
            return False

    def unregister_from_claude(self, kb_name: str) -> bool:
        """
        Unregister the MCP server from Claude Code.

        Args:
            kb_name: Name of the knowledge base

        Returns:
            True if successful, False otherwise
        """
        try:
            server_name = get_server_name(kb_name)
            cmd = ["claude", "mcp", "remove", server_name]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                print(f"✅ MCP server unregistered: {server_name}")
                return True
            else:
                print(f"❌ Failed to unregister MCP server: {result.stderr}")
                return False

        except Exception as e:
            print(f"❌ Error unregistering MCP server: {e}")
            return False

    def remove_kb_mcp(self, kb_name: str, unregister: bool = True) -> bool:
        """
        Remove a knowledge base MCP server.

        Args:
            kb_name: Name of the knowledge base
            unregister: Whether to unregister from Claude first

        Returns:
            True if successful, False otherwise
        """
        try:
            server_name = get_server_name(kb_name)
            server_path = self.servers_dir / server_name

            # Unregister from Claude if requested
            if unregister:
                self.unregister_from_claude(kb_name)

            # Remove server directory
            if server_path.exists():
                shutil.rmtree(server_path)
                print(f"✅ Removed MCP server directory: {server_path}")

            print(f"✅ MCP server removed: {server_name}")
            return True

        except Exception as e:
            print(f"❌ Error removing MCP server: {e}")
            return False

    def list_generated_mcp_servers(self) -> List[str]:
        """
        List all generated MCP servers.

        Returns:
            List of knowledge base names
        """
        try:
            servers = []
            for item in self.servers_dir.iterdir():
                if item.is_dir() and item.name.endswith("-kb"):
                    kb_name = item.name[:-3] + "-kb-data"  # Add "-kb-data" suffix
                    servers.append(kb_name)

            return servers

        except Exception as e:
            print(f"❌ Error listing MCP servers: {e}")
            return []


# Test the module if run directly
if __name__ == "__main__":
    import sys
    import tempfile

    if len(sys.argv) < 3:
        print("Usage: python mcp_generator.py <kb_name> <kb_path>")
        sys.exit(1)

    kb_name = sys.argv[1]
    kb_path = sys.argv[2]

    generator = MCPGenerator()

    print(f"Testing MCP generator with kb_name: {kb_name}, kb_path: {kb_path}")

    # Generate MCP server
    if generator.generate_kb_mcp(kb_name, kb_path):
        print("✅ MCP generation successful")

        # List generated servers
        servers = generator.list_generated_mcp_servers()
        print(f"✅ Generated servers: {servers}")

        print("MCP generator test completed")
    else:
        print("❌ MCP generation failed")
        sys.exit(1)