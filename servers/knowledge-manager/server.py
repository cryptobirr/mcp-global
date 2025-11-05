"""
Clean Knowledge Base MCP Server - Simple Working Version

Simplified knowledge base manager using only LanceDB for vector storage.
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
import traceback

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import mcp.server.stdio
import mcp.types as types

# Import our modules
from crawler import WebsiteCrawler
from lancedb_wrapper import LanceDBManager
from mcp_generator import MCPGenerator


class KnowledgeManagerServer:
    """
    Clean Knowledge Base MCP Server.

    Simple implementation using only LanceDB for vector storage and semantic search.
    """

    def __init__(self):
        """Initialize the Knowledge Manager server."""
        self.server = Server("knowledge-manager")

        # Initialize components
        home_dir = Path.home()
        self.knowledge_bases_dir = Path(home_dir) / ".mcp-global" / "knowledge-bases"
        self.servers_dir = Path(home_dir) / ".mcp-global" / "servers"

        # Ensure directories exist
        self.knowledge_bases_dir.mkdir(parents=True, exist_ok=True)
        self.servers_dir.mkdir(parents=True, exist_ok=True)

        # Initialize managers
        self.crawler = WebsiteCrawler()
        self.lancedb_manager = LanceDBManager(
            use_openai_embeddings=False,  # Use local embeddings by default
            embedding_model="all-MiniLM-L6-v2"
        )
        self.mcp_generator = MCPGenerator(
            servers_dir=str(self.servers_dir),
            knowledge_bases_dir=str(self.knowledge_bases_dir)
        )

        # Register handlers
        self._register_handlers()

    def _register_handlers(self):
        """Register MCP tool handlers."""

        @self.server.list_tools()
        async def list_tools() -> List[Tool]:
            """List available tools."""
            return [
                Tool(
                    name="knowledge_create",
                    description="Create a new knowledge base from a website URL",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "Website URL to crawl and create knowledge base from"
                            },
                            "kb_name": {
                                "type": "string",
                                "description": "Name for the knowledge base (will be used in MCP server name)"
                            },
                            "max_pages": {
                                "type": "integer",
                                "description": "Maximum number of pages to crawl (default: 100)",
                                "default": 100
                            },
                            "use_openai_embeddings": {
                                "type": "boolean",
                                "description": "Use OpenAI embeddings instead of local SentenceTransformer (default: false)",
                                "default": False
                            },
                            "embedding_model": {
                                "type": "string",
                                "description": "Embedding model name (for local embeddings)",
                                "default": "all-MiniLM-L6-v2"
                            }
                        },
                        "required": ["url", "kb_name"]
                    }
                ),
                Tool(
                    name="knowledge_list",
                    description="List all available knowledge bases",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                Tool(
                    name="knowledge_remove",
                    description="Remove a knowledge base and its associated MCP server",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "kb_name": {
                                "type": "string",
                                "description": "Name of the knowledge base to remove"
                            }
                        },
                        "required": ["kb_name"]
                    }
                )
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
            """Handle tool calls."""
            try:
                if name == "knowledge_create":
                    return await self._handle_knowledge_create(arguments)
                elif name == "knowledge_list":
                    return await self._handle_knowledge_list(arguments)
                elif name == "knowledge_remove":
                    return await self._handle_knowledge_remove(arguments)
                else:
                    raise ValueError(f"Unknown tool: {name}")
            except Exception as e:
                error_msg = f"Error executing {name}: {str(e)}\n\nTraceback:\n{traceback.format_exc()}"
                return [TextContent(type="text", text=error_msg)]

    async def _handle_knowledge_create(self, args: Dict[str, Any]) -> List[TextContent]:
        """Handle knowledge base creation."""
        url = args["url"]
        kb_name = args["kb_name"]
        max_pages = args.get("max_pages", 100)
        use_openai_embeddings = args.get("use_openai_embeddings", False)
        embedding_model = args.get("embedding_model", "all-MiniLM-L6-v2")

        # Validate kb_name (no special characters, no spaces)
        if not kb_name.replace("-", "").replace("_", "").isalnum():
            return [TextContent(
                type="text",
                text="❌ Invalid knowledge base name. Use only letters, numbers, hyphens, and underscores."
            )]

        kb_path = self.knowledge_bases_dir / kb_name

        # Check if knowledge base already exists
        if kb_path.exists():
            return [TextContent(
                type="text",
                text=f"❌ Knowledge base '{kb_name}' already exists."
            )]

        try:
            # Step 1: Crawl website
            print(f"🕷️  Crawling website: {url}")
            crawler = WebsiteCrawler(max_pages=max_pages)
            pages = await crawler.crawl_website(url)

            if not pages:
                return [TextContent(
                    type="text",
                    text=f"❌ No pages were crawled from {url}"
                )]

            print(f"✅ Crawled {len(pages)} pages")

            # Step 2: Create knowledge base directory
            kb_path.mkdir(parents=True, exist_ok=True)

            # Step 3: Initialize LanceDB
            print(f"📊 Initializing LanceDB at: {kb_path / 'lancedb'}")
            lancedb = LanceDBManager(
                use_openai_embeddings=use_openai_embeddings,
                embedding_model=embedding_model
            )

            if not lancedb.init_kb(str(kb_path / "lancedb")):
                return [TextContent(
                    type="text",
                    text="❌ Failed to initialize LanceDB"
                )]

            # Step 4: Add documents to vector database
            documents = []
            for i, page in enumerate(pages):
                doc = {
                    "id": f"{kb_name}_page_{i}",
                    "content": page.get("content", page.get("markdown", "")),
                    "title": page.get("title", ""),
                    "url": page.get("url", "")
                }
                if doc["content"]:  # Only add if there's content
                    documents.append(doc)

            if documents:
                success = lancedb.add_documents(str(kb_path / "lancedb"), documents)
                if not success:
                    return [TextContent(
                        type="text",
                        text="❌ Failed to add documents to vector database"
                    )]
                print(f"✅ Added {len(documents)} documents to vector database")

            # Step 5: Save metadata
            metadata = {
                "created_at": str(Path().absolute()),
                "embedding_model": embedding_model,
                "use_openai_embeddings": use_openai_embeddings,
                "version": "2.0",
                "documents": len(documents),
                "source_url": url,
                "max_pages": max_pages
            }

            with open(kb_path / "metadata.json", "w") as f:
                json.dump(metadata, f, indent=2)

            # Step 6: Generate MCP server
            print(f"🔧 Generating MCP server for {kb_name}")
            server_generated = self.mcp_generator.generate_kb_mcp(kb_name, str(kb_path))

            if server_generated:
                # Calculate server name for display
                if kb_name.endswith("-kb-data"):
                    base_name = kb_name[:-8]  # Remove "-kb-data" suffix
                    server_display_name = f"{base_name}-kb"
                else:
                    server_display_name = f"kb-{kb_name}"
                print(f"✅ Generated MCP server: {server_display_name}")

                # Auto-register the MCP server
                try:
                    import subprocess
                    server_name = self.mcp_generator.get_server_name(kb_name) if hasattr(self.mcp_generator, 'get_server_name') else server_display_name
                    server_path = self.servers_dir / server_name

                    print(f"🔧 Auto-registering MCP server: {server_name}")

                    cmd = [
                        "claude", "mcp", "add", server_name,
                        "--", "node", str(server_path / "server.js")
                    ]

                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=30
                    )

                    if result.returncode == 0:
                        print(f"✅ MCP server auto-registered: {server_name}")
                    else:
                        print(f"⚠️  Auto-registration failed (run manually): {result.stderr.strip()}")

                except Exception as e:
                    print(f"⚠️  Auto-registration error (run manually): {e}")

            else:
                print("⚠️  MCP server generation failed (knowledge base still usable)")

            # Calculate server name for display
            if kb_name.endswith("-kb-data"):
                base_name = kb_name[:-8]  # Remove "-kb-data" suffix
                server_display_name = f"{base_name}-kb"
            else:
                server_display_name = f"kb-{kb_name}"

            return [TextContent(
                type="text",
                text=f"✅ Successfully created knowledge base '{kb_name}' with {len(documents)} documents\n\n"
                     f"📂 Path: {kb_path}\n"
                     f"🔍 Search: Available via MCP server '{server_display_name}' (auto-registered)\n"
                     f"📊 Embeddings: {embedding_model}\n"
                     f"🌐 Source: {url}\n\n"
                     f"💡 Tip: Use `{server_display_name}.search()` to search the knowledge base"
            )]

        except Exception as e:
            return [TextContent(
                type="text",
                text=f"❌ Failed to create knowledge base: {str(e)}\n\n{traceback.format_exc()}"
            )]

    async def _handle_knowledge_list(self, args: Dict[str, Any]) -> List[TextContent]:
        """Handle knowledge base listing."""
        try:
            kbs = []
            for kb_dir in self.knowledge_bases_dir.iterdir():
                if kb_dir.is_dir():
                    metadata_file = kb_dir / "metadata.json"
                    if metadata_file.exists():
                        try:
                            with open(metadata_file) as f:
                                metadata = json.load(f)

                            # Check if MCP server exists
                            # Handle naming: baml-kb-data -> baml-kb
                            if kb_dir.name.endswith("-kb-data"):
                                base_name = kb_dir.name[:-8]  # Remove "-kb-data" suffix
                                server_name = f"{base_name}-kb"
                            else:
                                server_name = f"kb-{kb_dir.name}"
                            server_path = self.servers_dir / server_name
                            has_server = server_path.exists()

                            kbs.append({
                                "name": kb_dir.name,
                                "path": str(kb_dir),
                                "documents": metadata.get("documents", 0),
                                "embedding_model": metadata.get("embedding_model", "unknown"),
                                "created_at": metadata.get("created_at", "unknown"),
                                "source_url": metadata.get("source_url", "unknown"),
                                "has_server": has_server
                            })
                        except Exception:
                            continue

            if not kbs:
                return [TextContent(
                    type="text",
                    text="📚 No knowledge bases found. Use knowledge_create to create one."
                )]

            # Sort by creation time (newest first)
            kbs.sort(key=lambda x: x["created_at"], reverse=True)

            result = "📚 **Available Knowledge Bases:**\n\n"
            for kb in kbs:
                status_icon = "✅" if kb["has_server"] else "❌"
                result += f"**{kb['name']}** {status_icon}\n"
                result += f"- Path: {kb['path']}\n"
                result += f"- Documents: {kb['documents']}\n"
                result += f"- Embedding Model: {kb['embedding_model']}\n"
                result += f"- Created: {kb['created_at']}\n"
                result += f"- Source: {kb['source_url']}\n"
                result += f"- MCP Server: {'Available' if kb['has_server'] else 'Not generated'}\n\n"

            return [TextContent(type="text", text=result)]

        except Exception as e:
            return [TextContent(
                type="text",
                text=f"❌ Failed to list knowledge bases: {str(e)}"
            )]

    async def _handle_knowledge_remove(self, args: Dict[str, Any]) -> List[TextContent]:
        """Handle knowledge base removal."""
        kb_name = args["kb_name"]
        kb_path = self.knowledge_bases_dir / kb_name

        # Handle naming: baml-kb-data -> baml-kb
        if kb_name.endswith("-kb-data"):
            base_name = kb_name[:-8]  # Remove "-kb-data" suffix
            server_path = self.servers_dir / f"{base_name}-kb"
        else:
            server_path = self.servers_dir / f"kb-{kb_name}"

        try:
            if not kb_path.exists():
                return [TextContent(
                    type="text",
                    text=f"❌ Knowledge base '{kb_name}' not found"
                )]

            # Remove knowledge base directory
            import shutil
            shutil.rmtree(kb_path)
            print(f"🗑️  Removed knowledge base: {kb_path}")

            # Remove MCP server if it exists
            if server_path.exists():
                shutil.rmtree(server_path)
                print(f"🗑️  Removed MCP server: {server_path}")

            return [TextContent(
                type="text",
                text=f"✅ Successfully removed knowledge base '{kb_name}' and associated files"
            )]

        except Exception as e:
            return [TextContent(
                type="text",
                text=f"❌ Failed to remove knowledge base: {str(e)}"
            )]


async def main():
    """Main entry point for the MCP server."""
    server = KnowledgeManagerServer()

    # Create initialization options
    init_options = server.server.create_initialization_options()

    # Use stdio transport
    async with stdio_server() as (read_stream, write_stream):
        await server.server.run(read_stream, write_stream, init_options)


if __name__ == "__main__":
    asyncio.run(main())