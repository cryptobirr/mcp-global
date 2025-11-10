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

## Edge Cases

### Batch Processing Edge Cases

The `batch_get_transcripts` tool handles various edge cases gracefully:

#### 1. Empty Video URL Array
**Behavior:** Returns error immediately without processing
```json
{
  "video_urls": [],
  "output_mode": "aggregated",
  "output_path": "transcripts.md"
}
```
**Result:** Error: "video_urls array cannot be empty"

#### 2. Single Video Batch
**Behavior:** Processes single video using batch logic
```json
{
  "video_urls": ["https://youtube.com/watch?v=ABC123"],
  "output_mode": "aggregated",
  "output_path": "single.md"
}
```
**Result:** Creates aggregated file with single transcript section

#### 3. Maximum Batch Size (50 videos)
**Behavior:** Processes all 50 videos with throttling
```json
{
  "video_urls": ["url1", "url2", ..., "url50"],
  "output_mode": "individual",
  "output_path": "transcripts/"
}
```
**Result:**
- Processing time: ~200 seconds (3.3 minutes)
- Each video throttled by 2s default delay
- All transcripts saved as separate files

#### 4. Exceeding Maximum Batch Size
**Behavior:** Returns error for arrays > 50 videos
```json
{
  "video_urls": ["url1", "url2", ..., "url51"],
  "output_mode": "aggregated",
  "output_path": "transcripts.md"
}
```
**Result:** Error: "Maximum batch size is 50 videos"

#### 5. Mixed Success and Failure
**Behavior:** Successful transcripts are saved, failed ones are logged
```json
{
  "video_urls": [
    "https://youtube.com/watch?v=VALID1",
    "https://youtube.com/watch?v=INVALID",
    "https://youtube.com/watch?v=VALID2"
  ],
  "output_mode": "aggregated",
  "output_path": "mixed.md"
}
```
**Result:**
```
Batch processing complete:
- Total: 3 videos
- Successful: 2 transcripts
- Failed: 1 transcript

Failed transcripts:
✗ https://youtube.com/watch?v=INVALID: Transcripts are disabled
```
**File Content:** Contains 2 successful transcript sections

#### 6. All Videos Fail
**Behavior:** Creates empty aggregated file or no files in individual mode
```json
{
  "video_urls": [
    "https://youtube.com/watch?v=DISABLED1",
    "https://youtube.com/watch?v=DISABLED2"
  ],
  "output_mode": "aggregated",
  "output_path": "all-failed.md"
}
```
**Result:**
- Aggregated mode: Creates file with header but no transcript sections
- Individual mode: No transcript files created, only directory

#### 7. Non-Existent Directory (Individual Mode)
**Behavior:** Automatically creates missing directories
```json
{
  "video_urls": ["https://youtube.com/watch?v=ABC123"],
  "output_mode": "individual",
  "output_path": "/path/that/does/not/exist/"
}
```
**Result:** Creates full directory path and saves transcript

#### 8. Existing Files (Overwrite Scenario)
**Behavior:** Overwrites existing files without warning
```json
{
  "video_urls": ["https://youtube.com/watch?v=ABC123"],
  "output_mode": "individual",
  "output_path": "transcripts/"
}
```
**Result:**
- If `transcript-ABC123.txt` exists, it will be overwritten
- No backup of previous file is created

#### 9. Invalid Output Mode
**Behavior:** Returns error for unrecognized modes
```json
{
  "video_urls": ["https://youtube.com/watch?v=ABC123"],
  "output_mode": "combined",
  "output_path": "transcripts.md"
}
```
**Result:** Error: "Invalid output_mode. Must be 'aggregated' or 'individual'"

#### 10. Duplicate Video URLs
**Behavior:** Processes each URL independently (creates duplicates)
```json
{
  "video_urls": [
    "https://youtube.com/watch?v=ABC123",
    "https://youtube.com/watch?v=ABC123"
  ],
  "output_mode": "aggregated",
  "output_path": "duplicates.md"
}
```
**Result:**
- Aggregated mode: Two identical transcript sections in same file
- Individual mode: File overwritten by second request (same filename)

#### 11. Rate Limiting During Batch
**Behavior:** Automatic exponential backoff retry
**Scenario:** YouTube returns 429 (Too Many Requests)
**Result:**
```
Rate limited. Retry 1/3 after 2000ms
Rate limited. Retry 2/3 after 4000ms
Rate limited. Retry 3/3 after 8000ms
```
- After max retries: Video marked as failed
- Batch continues with remaining videos

#### 12. Invalid/Malformed URLs
**Behavior:** Categorized as error, batch continues
```json
{
  "video_urls": [
    "https://youtube.com/watch?v=VALID123",
    "not-a-valid-url",
    "https://youtube.com/watch?v=VALID456"
  ],
  "output_mode": "aggregated",
  "output_path": "transcripts.md"
}
```
**Result:**
```
Batch processing complete:
- Total: 3 videos
- Successful: 2 transcripts
- Failed: 1 transcript

Failed transcripts:
✗ not-a-valid-url: Invalid YouTube URL format
```

### Single Transcript Edge Cases

#### 1. Path Traversal Attempt
**Behavior:** Sanitizes paths to prevent directory traversal attacks
```json
{
  "video_url": "https://youtube.com/watch?v=ABC123",
  "output_path": "../../etc/passwd"
}
```
**Result:** Error: "Invalid output path: directory traversal not allowed"

#### 2. Missing Parent Directory
**Behavior:** Creates parent directories automatically
```json
{
  "video_url": "https://youtube.com/watch?v=ABC123",
  "output_path": "/new/nested/dirs/transcript.txt"
}
```
**Result:** Creates `/new/nested/dirs/` and saves `transcript.txt`

#### 3. Transcripts Disabled
**Behavior:** Returns specific error message
```json
{
  "video_url": "https://youtube.com/watch?v=DISABLED"
}
```
**Result:** Error: "Transcripts are disabled for this video"

#### 4. Very Long Video (6+ hours)
**Behavior:** Streaming prevents memory overflow
**Scenario:** Video length: 6 hours 13 minutes
**Result:**
- Peak memory: <100MB
- Processing time: ~4 seconds
- File size: Depends on speech density (typically 1-2MB per hour)

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


## Environment Variables

### YOUTUBE_TRANSCRIPT_DIR

**Optional** - Customize the storage location for transcripts.

**Default**: `~/.youtube-transcripts/`

**Examples**:

```bash
# macOS/Linux
export YOUTUBE_TRANSCRIPT_DIR="$HOME/Documents/youtube-transcripts"

# Windows (PowerShell)
$env:YOUTUBE_TRANSCRIPT_DIR = "$env:USERPROFILE\Documents\youtube-transcripts"

# Docker
environment:
  - YOUTUBE_TRANSCRIPT_DIR=/data/transcripts
```



## Migration Guide (v1.0.0 → v1.1.0)

### What Changed?

**v1.0.0** (Old Behavior):
- Required `output_path` parameter for every call
- Filename based on first 5 words of transcript
- Used `.md` extension

**v1.1.0** (New Behavior):
- `output_path` parameter optional (deprecated)
- Filename format: `{video_id}_{unix_timestamp}.txt`
- Default storage: `~/.youtube-transcripts/`
- Customizable via `YOUTUBE_TRANSCRIPT_DIR` environment variable

### How to Migrate

**Before (v1.0.0)**:
```json
{
  "video_url": "https://youtube.com/watch?v=ABC123",
  "output_path": "~/Documents/transcripts/my-file.md"
}
```

**After (v1.1.0+)**:
```bash
# Set environment variable once (in ~/.bashrc or ~/.zshrc)
export YOUTUBE_TRANSCRIPT_DIR="$HOME/Documents/transcripts"
```

```json
{
  "video_url": "https://youtube.com/watch?v=ABC123"
  // Saves to: ~/Documents/transcripts/ABC123_1699123456.txt
}
```

### Benefits
- ✅ Set storage location once (not per call)
- ✅ Unique filenames (no collisions)
- ✅ Find transcripts by video ID: `ls ~/.youtube-transcripts/ABC123_*`
- ✅ Chronological sorting: `ls -lt ~/.youtube-transcripts/`


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
