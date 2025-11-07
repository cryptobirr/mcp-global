# youtube-mcp-server MCP Server

A Model Context Protocol server

This is a TypeScript-based MCP server that implements a simple notes system. It demonstrates core MCP concepts by providing:

- Resources representing text notes with URIs and metadata
- Tools for creating new notes
- Prompts for generating summaries of notes

## Features

### Resources
- List and access notes via `note://` URIs
- Each note has a title, content and metadata
- Plain text mime type for simple content access

### Tools
- `create_note` - Create new text notes
  - Takes title and content as required parameters
  - Stores note in server state

### Prompts
- `summarize_notes` - Generate a summary of all stored notes
  - Includes all note contents as embedded resources
  - Returns structured prompt for LLM summarization

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

### Testing

#### Unit Tests (Fast)

Run unit tests:
```bash
npm test
```

**Memory Usage Tests**: To enable GC control for accurate memory measurements, run tests with the `--expose-gc` flag:
```bash
node --expose-gc ./node_modules/.bin/vitest run
```

This allows tests to force garbage collection before memory measurements, ensuring consistent results. Tests will gracefully degrade if `--expose-gc` is not provided.

#### Integration Tests (Slow - requires real YouTube API calls)

Run integration tests:
```bash
npm run test:integration
```

**Requirements:**
- Stable internet connection
- YouTube API accessible (no rate limiting)
- Execution time: 5-10 minutes (processes real videos)

**Environment Variables:**
- `RUN_INTEGRATION_TESTS=true` - Enable integration tests (default: skip)

**What Integration Tests Verify:**
- AC1: 5hr video processing with <100MB peak memory
- AC2: 6hr video processing with <100MB peak memory
- AC5: 30min video baseline performance (no regression)
- AC6: TranscriptsDisabled error handling

**Note:** Integration tests use real YouTube videos and make actual API calls. They are automatically skipped during normal `npm test` runs to keep unit tests fast.

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "youtube-mcp-server": {
      "command": "/path/to/youtube-mcp-server/build/index.js"
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
