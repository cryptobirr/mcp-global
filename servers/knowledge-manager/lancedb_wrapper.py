"""
LanceDB Wrapper for Knowledge Base MCP Server
Manages LanceDB initialization, indexing, and querying.
Version: 2.0 - Pure LanceDB Implementation
Created: 2025-10-18
"""

import os
import asyncio
from pathlib import Path
from typing import Dict, Optional, List, Any
import json
import uuid
import hashlib
import re

try:
    import lancedb
    import pyarrow as pa
    import pandas as pd
    from sentence_transformers import SentenceTransformer
    import openai
    from openai import OpenAI
except ImportError as e:
    print(f"❌ Missing dependencies: {e}")
    print("Please install: pip install lancedb pyarrow pandas sentence-transformers openai")
    raise


class LanceDBManager:
    """Manager for LanceDB knowledge base operations."""

    def __init__(self,
                 embedding_model: str = "all-MiniLM-L6-v2",
                 use_openai_embeddings: bool = False,
                 openai_api_key: Optional[str] = None,
                 openai_model: str = "text-embedding-3-small"):
        """
        Initialize LanceDB manager.

        Args:
            embedding_model: HuggingFace model name for embeddings
            use_openai_embeddings: Whether to use OpenAI embeddings instead
            openai_api_key: OpenAI API key (if using OpenAI embeddings)
            openai_model: OpenAI embedding model
        """
        self.use_openai_embeddings = use_openai_embeddings
        self.openai_api_key = openai_api_key
        self.openai_model = openai_model

        if use_openai_embeddings:
            if not openai_api_key:
                openai_api_key = os.getenv("OPENAI_API_KEY")
                if not openai_api_key:
                    raise ValueError("OpenAI API key required when use_openai_embeddings=True")
            self.openai_client = OpenAI(api_key=openai_api_key)
            self.embedding_model = openai_model
        else:
            self.embedding_model = SentenceTransformer(embedding_model)

        self.db = None
        self.table = None

    def init_kb(self, kb_path: str) -> bool:
        """
        Initialize a new knowledge base with LanceDB.

        Args:
            kb_path: Path to knowledge base directory

        Returns:
            True if successful
        """
        kb_path = Path(kb_path)
        kb_path.mkdir(parents=True, exist_ok=True)

        print(f"📁 Initializing LanceDB at: {kb_path}")

        try:
            # Initialize LanceDB connection
            db_path = kb_path / "lancedb"
            self.db = lancedb.connect(str(db_path))

            print("✅ LanceDB initialized")

            # Create metadata file
            if self.use_openai_embeddings:
                embedding_model_name = self.embedding_model
            else:
                embedding_model_name = getattr(self.embedding_model, '_model_name_or_path', 'unknown-model')
            metadata = {
                "created_at": pd.Timestamp.now().isoformat(),
                "embedding_model": embedding_model_name,
                "use_openai_embeddings": self.use_openai_embeddings,
                "version": "2.0"
            }

            metadata_file = kb_path / "metadata.json"
            metadata_file.write_text(json.dumps(metadata, indent=2))

            return True
        except Exception as e:
            print(f"❌ LanceDB init failed: {e}")
            return False

    def add_documents(self, kb_path: str, documents: List[Dict[str, Any]]) -> bool:
        """
        Add documents to the knowledge base.

        Args:
            kb_path: Path to knowledge base directory
            documents: List of documents with 'content' and 'metadata' keys

        Returns:
            True if successful
        """
        if not self.db:
            if not self.init_kb(kb_path):
                return False

        try:
            # Generate embeddings and create table data
            table_data = []

            print(f"📝 Processing {len(documents)} documents...")

            for i, doc in enumerate(documents):
                content = doc.get('content', '')
                metadata = doc.get('metadata', {})

                if not content.strip():
                    continue

                # Generate unique ID
                doc_id = str(uuid.uuid4())

                # Generate embedding
                if self.use_openai_embeddings:
                    embedding = self._get_openai_embedding(content)
                else:
                    embedding = self.embedding_model.encode(content)

                # Create table row
                row = {
                    'id': doc_id,
                    'content': content,
                    'embedding': embedding.tolist() if hasattr(embedding, 'tolist') else embedding,
                    **metadata
                }

                table_data.append(row)

                if (i + 1) % 10 == 0:
                    print(f"  Processed {i + 1}/{len(documents)} documents")

            if not table_data:
                print("⚠️  No valid documents to add")
                return False

            # Create PyArrow schema
            schema = pa.schema([
                pa.field('id', pa.string()),
                pa.field('content', pa.string()),
                pa.field('vector', pa.list_(pa.float32())),  # Rename to 'vector' for LanceDB
                # Add metadata fields dynamically
                *[pa.field(key, pa.string()) for key in table_data[0].keys()
                  if key not in ['id', 'content', 'embedding']]
            ])

            # Update table data to use 'vector' instead of 'embedding'
            for row in table_data:
                row['vector'] = row.pop('embedding')

            # Create or get table
            table_name = "documents"
            if table_name not in self.db.table_names():
                self.table = self.db.create_table(table_name, data=table_data, schema=schema)
            else:
                self.table = self.db.open_table(table_name)
                self.table.add(table_data)

            print(f"✅ Added {len(table_data)} documents to knowledge base")
            return True

        except Exception as e:
            print(f"❌ Failed to add documents: {e}")
            return False

    def _get_openai_embedding(self, text: str) -> List[float]:
        """Get embedding from OpenAI API."""
        try:
            response = self.openai_client.embeddings.create(
                model=self.openai_model,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"❌ OpenAI embedding failed: {e}")
            raise

    def search(self, kb_path: str, query: str, limit: int = 5) -> Optional[Dict[str, Any]]:
        """
        Search the knowledge base.

        Args:
            kb_path: Path to knowledge base directory
            query: Search query
            limit: Maximum number of results

        Returns:
            Search results or None if failed
        """
        kb_path = Path(kb_path)

        try:
            # Connect to database if not already connected
            if not self.db:
                db_path = kb_path / "lancedb"
                if not db_path.exists():
                    print(f"❌ Knowledge base not found: {kb_path}")
                    return None
                self.db = lancedb.connect(str(db_path))

            # Open table
            if "documents" not in self.db.table_names():
                print("❌ No documents found in knowledge base")
                return None

            self.table = self.db.open_table("documents")

            # Generate query embedding
            if self.use_openai_embeddings:
                query_embedding = self._get_openai_embedding(query)
            else:
                query_embedding = self.embedding_model.encode(query)

            # Perform search
            results = self.table.search(query_embedding).limit(limit).to_pandas()

            if results.empty:
                return {
                    "query": query,
                    "results": [],
                    "total": 0
                }

            # Format results
            formatted_results = []
            for _, row in results.iterrows():
                result = {
                    "id": row.get('id', ''),
                    "content": row.get('content', ''),
                    "score": float(row.get('_distance', 0.0)),
                    "metadata": {k: v for k, v in row.items()
                               if k not in ['id', 'content', 'embedding', '_distance']}
                }
                formatted_results.append(result)

            return {
                "query": query,
                "results": formatted_results,
                "total": len(formatted_results)
            }

        except Exception as e:
            print(f"❌ Search failed: {e}")
            return None

    def get_stats(self, kb_path: str) -> Dict:
        """
        Get statistics about a knowledge base.

        Args:
            kb_path: Path to knowledge base directory

        Returns:
            Dictionary with KB statistics
        """
        kb_path = Path(kb_path)

        stats = {
            'name': kb_path.name,
            'path': str(kb_path),
            'exists': kb_path.exists(),
            'documents': 0,
            'embedding_model': self.embedding_model,
            'use_openai_embeddings': self.use_openai_embeddings,
            'version': '2.0'
        }

        if not kb_path.exists():
            return stats

        try:
            # Connect to database
            db_path = kb_path / "lancedb"
            if db_path.exists():
                db = lancedb.connect(str(db_path))

                if "documents" in db.table_names():
                    table = db.open_table("documents")
                    stats['documents'] = len(table)

                # Get metadata if available
                metadata_file = kb_path / "metadata.json"
                if metadata_file.exists():
                    metadata = json.loads(metadata_file.read_text())
                    stats.update(metadata)

        except Exception as e:
            print(f"⚠️  Error reading stats: {e}")

        return stats

    def delete_kb(self, kb_path: str) -> bool:
        """
        Delete a knowledge base.

        Args:
            kb_path: Path to knowledge base directory

        Returns:
            True if successful
        """
        kb_path = Path(kb_path)

        try:
            if kb_path.exists():
                import shutil
                shutil.rmtree(kb_path)
                print(f"✅ Knowledge base deleted: {kb_path}")
                return True
            else:
                print(f"⚠️  Knowledge base not found: {kb_path}")
                return True
        except Exception as e:
            print(f"❌ Failed to delete knowledge base: {e}")
            return False


if __name__ == "__main__":
    # Test the LanceDB manager
    import sys

    if len(sys.argv) < 2:
        print("Usage: python lancedb_wrapper.py <kb_path>")
        sys.exit(1)

    test_path = sys.argv[1]

    manager = LanceDBManager(use_openai_embeddings=False)

    # Initialize
    if manager.init_kb(test_path):
        print(f"\n✅ Knowledge base initialized at: {test_path}")

        # Add test documents
        test_docs = [
            {
                "content": "Python is a high-level programming language with dynamic semantics.",
                "metadata": {"source": "test", "topic": "programming"}
            },
            {
                "content": "LanceDB is a vector database that makes it easy to store and search embeddings.",
                "metadata": {"source": "test", "topic": "database"}
            }
        ]

        if manager.add_documents(test_path, test_docs):
            print("✅ Test documents added")

            # Test search
            results = manager.search(test_path, "programming language")
            if results:
                print(f"✅ Search results: {results}")

            # Show stats
            stats = manager.get_stats(test_path)
            print(f"✅ Stats: {stats}")
        else:
            print("❌ Failed to add test documents")
    else:
        print("❌ Failed to initialize knowledge base")