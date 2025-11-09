# youtube-mcp-server MCP Server

A Model Context Protocol server for fetching and saving YouTube video transcripts.

This is a TypeScript-based MCP server that provides tools for downloading YouTube video transcripts with memory-optimized streaming processing.

## Features

### Tools

#### 1. `get_transcript_and_save`
Fetches the transcript for a single YouTube video and saves it as a Markdown file.

**Parameters:**
- `video_url` (string, required): Full URL of the YouTube video
- `output_path` (string, required): Local file path where transcript should be saved

**Example:**
```json
{
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "output_path": "transcripts/video.md"
}
```

#### 2. `batch_get_transcripts` (NEW)
Fetches transcripts for multiple YouTube videos in a single operation with aggregated or individual output modes.

**Parameters:**
- `video_urls` (array of strings, required): List of YouTube video URLs (1-50 videos)
- `output_mode` (string, required): Output mode - `aggregated` (single file) or `individual` (separate files)
- `output_path` (string, required): File path for aggregated mode, directory path for individual mode

**Output Modes:**
- **aggregated**: Combines all transcripts into a single Markdown file with section markers
- **individual**: Creates separate Markdown files for each video in the specified directory

**Features:**
- Batch size: 1-50 videos per call
- Automatic throttling: Prevents YouTube rate limiting
- Error isolation: Individual video failures don't halt batch processing
- Detailed summary: Shows success/failure counts with specific error messages

**Performance:**
- Processing time: ~4 seconds per video (includes 2s throttle delay)
- Example: 10 video batch = ~40 seconds total

**Limitations:**
- Sequential processing (no parallelization)
- Playlist URLs not supported (extract video URLs manually)

**Example (Aggregated Mode):**
```json
{
  "video_urls": [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=9bZkp7q19f0"
  ],
  "output_mode": "aggregated",
  "output_path": "batch-transcripts.md"
}
```

**Example (Individual Mode):**
```json
{
  "video_urls": [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=9bZkp7q19f0"
  ],
  "output_mode": "individual",
  "output_path": "transcripts/"
}
```

**Aggregated Output Format:**
```markdown
# Batch Transcript: 2 videos
**Created:** 2025-11-09T12:00:00Z
**Mode:** Aggregated

---

## Video 1: Rick Astley Never Gonna...
**Source:** https://www.youtube.com/watch?v=dQw4w9WgXcQ
**Status:** Success

[Transcript content...]

---

## Video 2: Gangnam Style...
**Source:** https://www.youtube.com/watch?v=9bZkp7q19f0
**Status:** Success

[Transcript content...]
```

**Individual Output Format:**
- Creates separate `.md` files in specified directory
- Filenames: `transcript-{videoId}.md` (e.g., `transcript-dQw4w9WgXcQ.md`)
- Each file contains single video transcript

**Error Handling:**
Batch processing continues even if individual videos fail. Response includes detailed summary:
```
Batch processing complete:
- Total: 5 videos
- Successful: 4 transcripts
- Failed: 1 transcript

Failed transcripts:
✗ https://youtube.com/watch?v=xyz123: Transcripts are disabled for the video
```

## Request Throttling

The server implements automatic request throttling to prevent YouTube from rate-limiting or blocking transcript fetch requests during batch operations.

### How It Works

- **Minimum Delay**: Enforces configurable delay between consecutive requests (default: 2 seconds)
- **Exponential Backoff**: Automatically retries failed requests with increasing delays on rate limit errors (429)
- **Jitter**: Adds ±20% randomness to delays to prevent synchronized request patterns
- **Transparent**: All throttling happens automatically - no changes needed to your code

### Configuration

Control throttling behavior via environment variables:

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `YOUTUBE_MIN_DELAY` | 2000 | 0-60000 | Minimum milliseconds between requests |
| `YOUTUBE_MAX_RETRIES` | 3 | 0-10 | Max retry attempts on rate limit |
| `YOUTUBE_BACKOFF_MULTIPLIER` | 2.0 | 1.0-5.0 | Exponential backoff multiplier |
| `YOUTUBE_JITTER` | true | true/false | Enable delay randomization |

### Configuration Presets

**Conservative** (recommended for large batches):
```json
{
  "mcpServers": {
    "youtube-mcp-server": {
      "command": "/path/to/youtube-mcp-server/build/index.js",
      "env": {
        "YOUTUBE_MIN_DELAY": "5000",
        "YOUTUBE_MAX_RETRIES": "5",
        "YOUTUBE_BACKOFF_MULTIPLIER": "3"
      }
    }
  }
}
```

**Moderate** (default - balanced):
```json
{
  "mcpServers": {
    "youtube-mcp-server": {
      "command": "/path/to/youtube-mcp-server/build/index.js"
    }
  }
}
```

**Aggressive** (faster but higher risk):
```json
{
  "mcpServers": {
    "youtube-mcp-server": {
      "command": "/path/to/youtube-mcp-server/build/index.js",
      "env": {
        "YOUTUBE_MIN_DELAY": "500",
        "YOUTUBE_MAX_RETRIES": "2"
      }
    }
  }
}
```

### Troubleshooting

**Rate Limit Errors**: If you see "429 Too Many Requests" errors:
1. Increase `YOUTUBE_MIN_DELAY` to 5000ms or higher
2. Increase `YOUTUBE_MAX_RETRIES` to 5
3. Increase `YOUTUBE_BACKOFF_MULTIPLIER` to 3

**Slow Batch Processing**: If batch operations are too slow:
1. Decrease `YOUTUBE_MIN_DELAY` (minimum 500ms recommended)
2. Keep `YOUTUBE_MAX_RETRIES` at 2-3
3. Monitor logs for rate limit warnings

**Disable Throttling** (not recommended):
```json
"env": {
  "YOUTUBE_MIN_DELAY": "0"
}
```

### Monitoring

Throttle activity is logged to stderr (preserves MCP stdout protocol):
- `Throttling: waiting Xms before next request` - Delay applied
- `Rate limited. Retry N/M after Xms` - Retry in progress
- `[Batch Progress] Processing video N/M: {url}` - Batch progress updates

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
