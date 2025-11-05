/**
 * Knowledge Base MCP Server: claude-agent-sdk
 *
 * Generated MCP server providing search capabilities for the "claude-agent-sdk" knowledge base.
 * Built using LanceDB for vector similarity search.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class KnowledgeBaseServer {
  constructor(kbName, kbPath) {
    this.kbName = kbName;
    this.kbPath = kbPath;
    this.server = new Server(
      {
        name: "kb-claude-agent-sdk",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  async setup() {
    // Register tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search",
            description: "Search the claude-agent-sdk knowledge base using semantic vector search",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for the knowledge base",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return (default: 5)",
                  default: 5,
                },
              },
              required: ["query"],
            },
          },
          {
            name: "stats",
            description: "Get statistics about the claude-agent-sdk knowledge base",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search":
            return await this.handleSearch(args.query, args.limit || 5);
          case "stats":
            return await this.handleStats();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async handleSearch(query, limit = 5) {
    try {
      console.error(`Executing semantic search: ${query} (limit: ${limit})`);

      // Use Python script to perform LanceDB search
      const pythonScript = `
import sys
sys.path.insert(0, '/Users/mekonen/.mcp-global/servers/knowledge-manager')
from lancedb_wrapper import LanceDBManager
import json

manager = LanceDBManager()
results = manager.search('${this.kbPath}', '${query}', ${limit})
if results:
    print(json.dumps(results))
else:
    print(json.dumps({"error": "Search failed", "query": "${query}"}))
`;

      const result = execSync(
        `python3 -c "${pythonScript.replace(/"/g, '\"')}"`,
        { encoding: "utf8", timeout: 60000 }
      );

      const searchResults = JSON.parse(result.trim());

      if (searchResults.error) {
        throw new Error(searchResults.error);
      }

      // Format results for display
      let formattedResults = `Semantic Search Results for "${query}":\n\n`;
      formattedResults += `Found ${searchResults.total} results\n\n`;

      searchResults.results.forEach((result, index) => {
        formattedResults += `${index + 1}. Score: ${result.score.toFixed(4)}\n`;
        if (result.metadata.title) {
          formattedResults += `   Title: ${result.metadata.title}\n`;
        }
        if (result.metadata.source_url) {
          formattedResults += `   Source: ${result.metadata.source_url}\n`;
        }
        formattedResults += `   Content: ${result.content.substring(0, 500)}${result.content.length > 500 ? '...' : ''}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: formattedResults,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error performing semantic search: ${error.message}`,
          },
        ],
      };
    }
  }

  async handleStats() {
    try {
      const kbPath = this.kbPath;

      let stats = {
        name: this.kbName,
        path: kbPath,
        exists: fs.existsSync(kbPath),
        documents: 0,
        vector_db: "LanceDB",
        embedding_model: "Unknown",
      };

      // Check for LanceDB directory
      const lancedbDir = path.join(kbPath, "lancedb");
      if (fs.existsSync(lancedbDir)) {
        try {
          // Check for metadata file
          const metadataFile = path.join(kbPath, "metadata.json");
          if (fs.existsSync(metadataFile)) {
            const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            stats.embedding_model = metadata.embedding_model || "Unknown";
            stats.use_openai_embeddings = metadata.use_openai_embeddings || false;
          }
        } catch (e) {
          console.error("Error reading metadata:", e);
        }
      }

      // Count input documents
      const inputDir = path.join(kbPath, "input");
      if (fs.existsSync(inputDir)) {
        try {
          const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md'));
          stats.documents = files.length;
        } catch (e) {
          stats.documents = "Error counting files";
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Knowledge Base Statistics for "${this.kbName}":\n\n${JSON.stringify(stats, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting stats: ${error.message}`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Knowledge base MCP server running for: ${this.kbName}`);
  }
}

// Main execution
async function main() {
  const kbName = "claude-agent-sdk";
  const kbPath = "/Users/mekonen/.mcp-global/knowledge-bases/claude-agent-sdk";

  const server = new KnowledgeBaseServer(kbName, kbPath);
  await server.setup();
  await server.run();
}

// Run if this is the main module
main().catch(console.error);

export { KnowledgeBaseServer };
