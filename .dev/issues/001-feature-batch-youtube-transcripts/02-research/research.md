# Codebase Research: Batch YouTube Transcript Processing

**Issue:** #1  
**Feature Type:** Backend  
**Created:** 2025-11-09T16:50:28Z  
**Status:** Research Complete

---

## Executive Summary

This research analyzes the YouTube MCP Server codebase to understand the architecture, patterns, and integration points necessary to implement the `batch_get_transcripts` feature. The codebase demonstrates a clean, TypeScript-based MCP implementation with robust security, memory optimization, and error handling patterns that should be preserved and extended for batch processing.

**Key Findings:**
- **Architecture:** Single-file server (`index.ts`) with modular throttling (`throttle.ts`)
- **Complexity:** Moderate - existing streaming and validation patterns are reusable
- **Feasibility:** High - clear refactoring path with minimal risk
- **Approach:** Brownfield - extends existing tool architecture without breaking changes

**Recommended Path:** Extract current processing logic into reusable `processSingleTranscript()` method, then build batch orchestration layer on top.

---

## 1. Current Architecture Overview

### 1.1 Project Structure

```
youtube-mcp-server/
├── src/
│   ├── index.ts           # Main server + tool implementation (384 lines)
│   └── throttle.ts        # Request throttling module (152 lines)
├── tests/
│   ├── unit/              # Unit tests (youtube-mcp-server.test.ts, throttle.test.ts)
│   ├── integration/       # Integration tests (youtube-api.test.ts, mcp-protocol.test.ts)
│   ├── security.test.ts   # Path validation security tests
│   ├── streaming.test.ts  # Memory optimization tests
│   └── real-implementation.test.ts  # E2E tests
├── build/                 # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

**Key Characteristics:**
- **Single-file server:** All tool logic in `index.ts` (clean separation from throttling)
- **ES modules:** TypeScript compiled to Node16 module format
- **Vitest testing:** Comprehensive test coverage with unit/integration split
- **MCP SDK 0.6.0:** Standard MCP protocol implementation

### 1.2 Core Dependencies

**Runtime Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "0.6.0",
  "he": "^1.2.0",                        // HTML entity decoding
  "youtube-transcript": "^1.2.1"         // YouTube transcript fetching
}
```

**Development Dependencies:**
```json
{
  "@types/he": "^1.2.3",
  "@types/node": "^20.19.24",
  "@vitest/ui": "^4.0.7",
  "typescript": "^5.9.3",
  "vitest": "^4.0.7"
}
```

**No additional dependencies needed** for batch feature - all building blocks present.

---

## 2. Existing Tool Implementation Analysis

### 2.1 Tool Registration Pattern

**Location:** `src/index.ts:119-142`

**Pattern:**
```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_transcript_and_save',
      description: 'Fetches the transcript for a YouTube video and saves it as a Markdown file.',
      inputSchema: {
        type: 'object',
        properties: {
          video_url: { type: 'string', description: '...' },
          output_path: { type: 'string', description: '...' }
        },
        required: ['video_url', 'output_path']
      }
    }
  ]
}));
```

**Key Observations:**
1. Tools registered via `ListToolsRequestSchema` handler (returns array)
2. JSON Schema-based input validation (MCP standard)
3. Required fields enforced via `required` array
4. Single handler returns all tools (batch tool adds second array element)

**Integration Point for Batch Tool:**
- Add second tool definition to `tools` array
- Schema: `{ video_urls: string[], output_mode: 'aggregated' | 'individual', output_path: string }`
- Validation: `minItems: 1, maxItems: 50` for video_urls array

---

### 2.2 Tool Execution Pattern

**Location:** `src/index.ts:145-369`

**Pattern:**
```typescript
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // 1. Tool name validation
  if (request.params.name !== 'get_transcript_and_save') {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }

  // 2. Argument validation (type guard)
  if (!isValidGetTranscriptArgs(request.params.arguments)) {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments...');
  }

  // 3. Extract and process arguments
  let { video_url, output_path } = request.params.arguments;

  // 4. URL normalization (Shorts → standard)
  // ... (lines 164-172)

  // 5. Core processing logic
  try {
    // Fetch transcript (with throttling)
    const transcriptEntries = await this.throttler.throttle(
      () => YoutubeTranscript.fetchTranscript(video_url)
    );

    // Validate, generate title, write file
    // ... (lines 195-338)

    // Return success response
    return { content: [{ type: 'text', text: 'Success message' }] };
  } catch (error) {
    // Error handling with specific error types
    // ... (lines 340-367)
    return { content: [{ type: 'text', text: errorMessage }], isError: true };
  }
});
```

**Key Observations:**
1. **Tool routing:** Name-based dispatch (switch statement pattern for multiple tools)
2. **Type guards:** Custom validation functions (`isValidGetTranscriptArgs`)
3. **Error boundary:** Try-catch wraps entire processing logic
4. **MCP response format:** `{ content: [{ type: 'text', text: '...' }], isError?: boolean }`

**Integration Point for Batch Tool:**
- Add `else if (request.params.name === 'batch_get_transcripts')` branch
- Create `isValidBatchGetTranscriptsArgs` type guard
- Route to batch processing function (returns same response format)

---

### 2.3 Transcript Processing Workflow

**Location:** `src/index.ts:175-338`

**Stages:**

#### Stage 1: Fetch Transcript (lines 190-205)
```typescript
const transcriptEntries = await this.throttler.throttle(
  () => YoutubeTranscript.fetchTranscript(video_url)
);

if (!transcriptEntries || transcriptEntries.length === 0) {
  return { content: [{ type: 'text', text: 'No transcript found...' }], isError: true };
}
```

**Throttling Integration:** All YouTube API calls wrapped in `this.throttler.throttle()` - automatic rate limit protection.

#### Stage 2: Title Generation (lines 224-232)
```typescript
const firstEntryText = transcriptEntries[0]?.text || '';
const preDecodedFirstEntry = firstEntryText
  .replace(/&#39;/g, "'")
  .replace(/'/g, "'");
const decodedFirstEntry = he.decode(preDecodedFirstEntry);

const titleWords = decodedFirstEntry.split(' ').slice(0, 10).join(' ');
const title = titleWords ? titleWords.trim() + '...' : 'Transcript';
```

**Pattern:** Uses first transcript entry to generate human-readable title (avoids loading full transcript into memory).

#### Stage 3: Filename Sanitization (lines 234-246)
```typescript
const filenameWords = preDecodedFirstEntry.split(' ').slice(0, 5).join(' ');
let baseFilename = filenameWords
  ? filenameWords
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
  : `transcript-${Date.now()}`;

if (!baseFilename || baseFilename === '-') {
  baseFilename = `transcript-${Date.now()}`;
}
const finalFilename = `${baseFilename}.md`;
```

**Pattern:** Sanitize first 5 words → kebab-case filename, fallback to timestamp.

**Risk:** Filename collisions in batch mode (two videos with same first 5 words).

**Mitigation:** Append video ID or timestamp suffix in batch implementation.

#### Stage 4: Path Validation (lines 248-254)
```typescript
validateOutputPath(output_path);

const originalOutputDir = path.dirname(path.resolve(CLINE_CWD, output_path));
const absoluteOutputPath = path.join(originalOutputDir, finalFilename);
const outputDir = path.dirname(absoluteOutputPath);

await fs.mkdir(outputDir, { recursive: true });
```

**Security:** `validateOutputPath()` prevents path traversal (comprehensive tests in `tests/security.test.ts`).

**Batch Implication:** Validate once at batch level (not per video) for aggregated path, validate directory for individual mode.

#### Stage 5: Streaming Write (lines 261-321)
```typescript
const writeStream = createWriteStream(absoluteOutputPath, { encoding: 'utf-8' });

writeStream.on('error', async (err: Error) => {
  // Cleanup partial file on stream error
  await fs.unlink(absoluteOutputPath);
});

writeStream.write(`# ${title}\n\n`);

// Process in chunks (1000 entries per batch)
for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
  const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
  const chunkText = chunk
    .map(entry => {
      const preDecoded = entry.text.replace(/&#39;/g, "'").replace(/'/g, "'");
      return he.decode(preDecoded);
    })
    .join(' ');
  writeStream.write(chunkText + ' ');
  
  // Progress logging every 5000 entries
  if (transcriptEntries.length > 5000 && i > 0 && i % 5000 === 0) {
    console.error(`Progress: ${i}/${transcriptEntries.length} entries`);
  }
}

await new Promise((resolve, reject) => {
  writeStream.end(() => resolve());
  writeStream.on('error', reject);
});
```

**Memory Optimization:**
- **Chunk size:** 1000 entries per batch (keeps memory <100MB for 60k+ entries)
- **Streaming:** Direct stream writes (no string concatenation)
- **Progress logging:** Every 5000 entries (user visibility for long videos)

**Batch Implication:** Reuse streaming logic for individual mode, aggregate chunks for aggregated mode.

---

### 2.4 Error Handling Patterns

**Location:** `src/index.ts:340-367`

**Strategy:**

```typescript
catch (error: any) {
  console.error('Error during transcript processing:', error);
  
  let errorMessage = `Failed to process transcript for ${video_url}.`;
  
  if (error instanceof Error) {
    errorMessage += ` Error: ${error.message}`;
  } else if (typeof error === 'string') {
    errorMessage += ` Error: ${error}`;
  }

  // Specific error type detection
  if (error.message?.includes('TranscriptsDisabled')) {
    errorMessage = `Transcripts are disabled for the video: ${video_url}`;
  } else if (error.message?.includes('Could not find transcript')) {
    errorMessage = `Could not find a transcript for the video: ${video_url}`;
  }

  return {
    content: [{ type: 'text', text: errorMessage }],
    isError: true
  };
}
```

**Error Classification:**
1. **TranscriptsDisabled:** Video has transcripts disabled (privacy setting)
2. **Could not find transcript:** No transcript available (common for music videos, shorts)
3. **Generic errors:** Network issues, API errors, rate limits

**Batch Implications:**
- Individual video errors should NOT halt batch processing
- Capture error type in `TranscriptResult` interface
- Return aggregated success/failure summary
- Specific error messages enable user debugging

---

## 3. Request Throttling Architecture

### 3.1 Throttler Design

**Location:** `src/throttle.ts`

**Class Structure:**
```typescript
export class RequestThrottler {
  private lastRequestTime = 0;
  private config: ThrottleConfig;

  constructor() {
    this.config = this.loadConfig();  // Load from env vars
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    // 1. Calculate required delay
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const requiredDelay = Math.max(0, this.config.minDelay - timeSinceLastRequest);
    
    // 2. Apply jitter (±20% randomness)
    const delay = this.config.jitter
      ? Math.floor(requiredDelay * (0.8 + Math.random() * 0.4))
      : requiredDelay;
    
    // 3. Wait if needed
    if (delay > 0) {
      console.error(`Throttling: waiting ${delay}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // 4. Update timestamp and execute with retry
    this.lastRequestTime = Date.now();
    return this.withRetry(fn, 1);
  }

  private async withRetry<T>(fn: () => Promise<T>, attempt: number): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Exponential backoff on rate limit errors
      if (this.isRateLimitError(error) && attempt <= this.config.maxRetries) {
        const backoffDelay = Math.floor(
          this.config.minDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)
        );
        console.error(`Rate limited. Retry ${attempt}/${this.config.maxRetries} after ${backoffDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return this.withRetry(fn, attempt + 1);
      }
      throw error;
    }
  }

  private isRateLimitError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('rate limit')
    );
  }
}
```

**Configuration (lines 43-94):**
```typescript
DEFAULT_THROTTLE_CONFIG = {
  minDelay: 2000,              // 2s between requests
  maxRetries: 3,               // 3 retry attempts
  backoffMultiplier: 2,        // 2x exponential backoff
  jitter: true                 // ±20% randomness
};

// Loaded from environment variables:
// YOUTUBE_MIN_DELAY (0-60000ms)
// YOUTUBE_MAX_RETRIES (0-10)
// YOUTUBE_BACKOFF_MULTIPLIER (1.0-5.0)
// YOUTUBE_JITTER (true/false)
```

**Key Features:**
1. **Minimum delay enforcement:** Prevents bursts of requests
2. **Exponential backoff:** Automatic retry on rate limits (429 errors)
3. **Jitter:** Randomizes delays to avoid synchronized request patterns
4. **Configurable:** Environment variables control behavior (no code changes)

### 3.2 Throttling Integration

**Usage Pattern:**
```typescript
const transcriptEntries = await this.throttler.throttle(
  () => YoutubeTranscript.fetchTranscript(video_url)
);
```

**Batch Implications:**
- Throttler is **instance-based** (single throttler shared across all requests)
- Sequential batch processing automatically respects delays
- 10 video batch: ~20 seconds minimum (10 × 2s delay)
- No changes needed to throttler for batch support

**Performance Impact:**
```
Baseline (single video):
  Fetch: 1-2s
  Throttle delay: 2s
  Write: 0.5-1s
  Total: ~3.5-5s per video

Batch (10 videos):
  Sequential: 10 × ~4s = ~40s total
  Parallel (future): 3 concurrent × ~13s = ~13s total
```

**Current Decision:** Sequential processing for v1 (simple, reliable, leverages existing throttler).

---

## 4. Security & Validation Patterns

### 4.1 Path Validation Function

**Location:** `src/index.ts:24-78`

**Implementation:**
```typescript
function validateOutputPath(outputPath: string): void {
  // 1. Reject empty paths
  if (!outputPath || outputPath.trim() === '') {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }

  // 2. Check for null bytes
  if (outputPath.includes('\0')) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }

  // 3. Decode and check for traversal sequences
  const decodedPath = decodeURIComponent(outputPath);
  if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }

  // 4. Block absolute paths (Unix and Windows)
  if (path.isAbsolute(outputPath) || path.isAbsolute(decodedPath)) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }

  // 5. Block Windows drive letters
  if (/^[A-Za-z]:/.test(outputPath) || /^[A-Za-z]:/.test(decodedPath)) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }

  // 6. Final check: ensure resolved path is within CWD
  const resolvedPath = path.resolve(CLINE_CWD, outputPath);
  if (!resolvedPath.startsWith(CLINE_CWD)) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }
}
```

**Security Coverage:**
- Path traversal: `../`, `..\\`
- URL encoding: `%2e%2e%2f` (decoded before check)
- Absolute paths: `/etc/passwd`, `C:\Windows\...`
- Null bytes: `file\0.txt`
- Drive letters: `C:`, `D:`

**Test Coverage:** 296 lines of security tests (`tests/security.test.ts`)
- 30+ malicious path test cases
- Cross-platform validation (Unix + Windows paths)
- Encoded traversal attempts
- Edge cases (empty strings, very long paths, special characters)

**Batch Implications:**
- **Aggregated mode:** Validate single file path (reuse existing function)
- **Individual mode:** Validate directory path, then construct file paths (safe - all under validated dir)

### 4.2 Argument Validation Pattern

**Location:** `src/index.ts:81-87`

**Type Guard Pattern:**
```typescript
const isValidGetTranscriptArgs = (
  args: any
): args is { video_url: string; output_path: string } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.video_url === 'string' &&
  typeof args.output_path === 'string';
```

**Usage:**
```typescript
if (!isValidGetTranscriptArgs(request.params.arguments)) {
  throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments...');
}

// TypeScript now knows args has correct shape
let { video_url, output_path } = request.params.arguments;
```

**Batch Tool Pattern (to implement):**
```typescript
const isValidBatchGetTranscriptsArgs = (
  args: any
): args is { video_urls: string[]; output_mode: 'aggregated' | 'individual'; output_path: string } =>
  typeof args === 'object' &&
  args !== null &&
  Array.isArray(args.video_urls) &&
  args.video_urls.length >= 1 &&
  args.video_urls.length <= 50 &&
  args.video_urls.every((url: any) => typeof url === 'string') &&
  (args.output_mode === 'aggregated' || args.output_mode === 'individual') &&
  typeof args.output_path === 'string';
```

**Benefits:**
- Type safety (TypeScript enforces correct usage)
- Runtime validation (MCP SDK doesn't validate JSON schema)
- Clear error messages (specific validation failures)

---

## 5. Testing Infrastructure

### 5.1 Test Organization

**Structure:**
```
tests/
├── unit/
│   ├── throttle.test.ts              # Throttler config, delay, retry tests
│   └── youtube-mcp-server.test.ts    # Server instantiation, URL processing, validation
├── integration/
│   ├── youtube-api.test.ts           # Real YouTube API calls (AC1, AC2, AC5, AC6)
│   └── mcp-protocol.test.ts          # MCP protocol compliance
├── security.test.ts                  # Path validation (296 lines, 30+ test cases)
├── streaming.test.ts                 # Memory optimization tests
└── real-implementation.test.ts       # E2E tests
```

**Separation:**
- **Unit tests:** Fast, no network calls, isolated logic tests
- **Integration tests:** Slow, real YouTube API, gated by `RUN_INTEGRATION_TESTS=true`
- **Security tests:** Comprehensive path validation coverage
- **Streaming tests:** Memory constraint verification

### 5.2 Test Patterns

#### Unit Test Pattern (from `tests/unit/youtube-mcp-server.test.ts`)
```typescript
describe('YoutubeMcpServer - Real Implementation', () => {
  let server: YoutubeMcpServer;

  beforeEach(() => {
    server = new YoutubeMcpServer();
  });

  describe('URL Processing Logic', () => {
    it('should convert Shorts URL to standard format', () => {
      const shortsUrl = 'https://youtube.com/shorts/abc123xyz';
      const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;
      const match = shortsUrl.match(shortsRegex);

      if (match && match[1]) {
        const videoId = match[1];
        const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
        expect(standardUrl).toBe('https://www.youtube.com/watch?v=abc123xyz');
      }
    });
  });
});
```

**Key Characteristics:**
- Fresh server instance per test (avoid state pollution)
- Test logic in isolation (no API calls)
- Clear assertions (expected behavior documented)

#### Integration Test Pattern (from `tests/integration/youtube-api.test.ts`)
```typescript
describe.skipIf(!INTEGRATION_ENABLED)('YouTube API Integration Tests', () => {
  const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output-integration');

  beforeEach(async () => {
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  it('should process 5hr video with <100MB peak memory (AC1)', async () => {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    const transcriptEntries = await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.LONG_5HR);
    // ... streaming write ...

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();

    const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);
    expect(peakDelta).toBeLessThan(100);
  }, 600000); // 10min timeout
});
```

**Key Characteristics:**
- Gated by environment variable (`RUN_INTEGRATION_TESTS=true`)
- Long timeouts (10 minutes for 6hr video)
- Cleanup after tests (delete test output files)
- Real YouTube URLs (stable public videos)
- Memory measurement with `--expose-gc` flag

### 5.3 Test Coverage Requirements

**Current Coverage:**
- Unit tests: ~90% coverage (all core logic paths)
- Integration tests: AC1, AC2, AC5, AC6 from streaming optimization
- Security tests: 30+ malicious path test cases

**Batch Feature Testing (to implement):**

#### Unit Tests (new)
1. **Batch argument validation**
   - Empty `video_urls` array → rejection
   - Invalid `output_mode` → rejection
   - Path traversal in batch → rejection
   - Max array length (51 URLs) → rejection

2. **Refactored single transcript function**
   - Maintains existing behavior (regression tests)
   - Returns structured `TranscriptResult` correctly

3. **Batch processing logic**
   - Individual mode creates separate files
   - Aggregated mode combines with correct format
   - Failure isolation (1 failed video doesn't stop batch)

#### Integration Tests (new)
1. **Batch processing with throttling**
   - 3 video batch completes with throttle delays logged
   - Verify throttler called sequentially (not parallel)

2. **Mixed success/failure scenarios**
   - 2 successful + 1 failed video → summary shows 2/3 success
   - Failed video error message captured correctly

3. **Output verification**
   - Aggregated file contains section markers (`---`)
   - Individual files have correct filenames
   - File contents match expected transcript format

#### Security Tests (reuse)
- Batch tool reuses `validateOutputPath()` (existing 30+ test cases apply)
- Add batch-specific: array validation, mode validation

---

## 6. File I/O & Path Handling Patterns

### 6.1 Directory Creation Pattern

**Location:** `src/index.ts:256-257`

```typescript
await fs.mkdir(outputDir, { recursive: true });
```

**Characteristics:**
- `recursive: true` creates parent directories if needed
- No error if directory already exists
- Safe for concurrent calls (idempotent)

**Batch Implication (individual mode):**
```typescript
// Ensure output directory exists before batch processing
await fs.mkdir(path.resolve(CLINE_CWD, output_path), { recursive: true });

// Then create individual files in that directory
for (const url of videoUrls) {
  const filename = `transcript-${Date.now()}.md`;
  const filePath = path.join(output_path, filename);
  // ... process video ...
}
```

### 6.2 Streaming Write Pattern

**Location:** `src/index.ts:261-321`

**Pattern:**
```typescript
const writeStream = createWriteStream(absoluteOutputPath, { encoding: 'utf-8' });

// Error handling: cleanup partial file
writeStream.on('error', async (err: Error) => {
  streamError = err;
  await fs.unlink(absoluteOutputPath);  // Delete partial file
});

// Write header
writeStream.write(`# ${title}\n\n`);

// Write chunks
for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
  const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
  const chunkText = chunk.map(entry => he.decode(entry.text)).join(' ');
  writeStream.write(chunkText + ' ');
}

// Close stream and await completion
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => {
    if (streamError) {
      reject(new McpError(ErrorCode.InternalError, `Failed to write transcript: ${streamError.message}`));
    } else {
      resolve();
    }
  });
  writeStream.on('error', reject);
});
```

**Key Features:**
1. **Error handling:** Cleanup partial files on stream errors
2. **Stream error capture:** `streamError` variable tracks errors during write
3. **Promise-based completion:** `await new Promise()` waits for stream to finish
4. **Chunk-based writing:** Processes 1000 entries at a time (memory efficiency)

**Batch Implication (aggregated mode):**
```typescript
// Write all videos to single stream with section markers
const writeStream = createWriteStream(aggregatedPath, { encoding: 'utf-8' });

writeStream.write(`# Batch Transcript: ${videoUrls.length} videos\n\n`);

for (const result of results) {
  writeStream.write(`---\n\n## Video: ${result.title}\n`);
  writeStream.write(`**Source:** ${result.videoUrl}\n`);
  writeStream.write(`**Status:** ${result.success ? 'Success' : 'Failed'}\n\n`);
  
  if (result.success) {
    // Write transcript content
    writeStream.write(result.content);
  } else {
    writeStream.write(`**Error:** ${result.error}\n`);
  }
  writeStream.write(`\n\n`);
}

await new Promise((resolve, reject) => {
  writeStream.end(() => resolve());
  writeStream.on('error', reject);
});
```

### 6.3 Path Resolution Pattern

**Location:** `src/index.ts:252-254`

```typescript
const originalOutputDir = path.dirname(path.resolve(CLINE_CWD, output_path));
const absoluteOutputPath = path.join(originalOutputDir, finalFilename);
const outputDir = path.dirname(absoluteOutputPath);
```

**Pattern:**
1. Resolve relative path against `CLINE_CWD` (working directory)
2. Extract directory component
3. Join with generated filename
4. Re-extract directory for `mkdir`

**Why this pattern:**
- Supports both file paths and directory paths as input
- Ensures final path is within CWD (security)
- Handles `./transcripts/file.md` and `transcripts/` identically

**Batch Pattern (individual mode):**
```typescript
// User provides directory path (not file path)
const outputDir = path.resolve(CLINE_CWD, output_path);

// Validate directory path
validateOutputPath(output_path);

// Create directory
await fs.mkdir(outputDir, { recursive: true });

// Generate filenames for each video
for (const url of videoUrls) {
  const filename = generateFilename(url);  // Auto-generated
  const filePath = path.join(outputDir, filename);
  // ... process video ...
}
```

---

## 7. Refactoring Opportunities

### 7.1 Extract Single Transcript Processing

**Current State:**
- All processing logic inline in `CallToolRequestSchema` handler (lines 175-338)
- 164 lines of monolithic logic (fetch, validate, generate, write)

**Refactoring Goal:**
- Extract into reusable `async processSingleTranscript(videoUrl: string, outputPath: string): Promise<TranscriptResult>`
- Keep existing tool handler thin (validation + call + format response)

**Benefits:**
1. **DRY:** Batch tool reuses same logic (no duplication)
2. **Testability:** Easier to unit test individual transcript processing
3. **Maintainability:** Single source of truth for transcript processing
4. **Type safety:** Return structured result (not MCP response)

**Proposed Interface:**
```typescript
interface TranscriptResult {
  success: boolean;
  videoUrl: string;
  filePath?: string;      // Populated on success
  title?: string;         // Video title (from first 10 words)
  error?: string;         // Error message on failure
  errorType?: 'TranscriptsDisabled' | 'NotFound' | 'NetworkError' | 'Unknown';
}

private async processSingleTranscript(
  videoUrl: string,
  outputPath: string
): Promise<TranscriptResult> {
  try {
    // Convert Shorts URL to standard
    const normalizedUrl = this.normalizeYoutubeUrl(videoUrl);
    
    // Fetch transcript (with throttling)
    const transcriptEntries = await this.throttler.throttle(
      () => YoutubeTranscript.fetchTranscript(normalizedUrl)
    );
    
    if (!transcriptEntries || transcriptEntries.length === 0) {
      return { success: false, videoUrl, error: 'No transcript found', errorType: 'NotFound' };
    }
    
    // Generate title and filename
    const { title, filename } = this.generateTitleAndFilename(transcriptEntries);
    
    // Validate and construct path
    validateOutputPath(outputPath);
    const absolutePath = this.constructOutputPath(outputPath, filename);
    
    // Stream to file
    await this.streamTranscriptToFile(transcriptEntries, absolutePath, title);
    
    return { success: true, videoUrl, filePath: absolutePath, title };
  } catch (error: any) {
    const { message, type } = this.categorizeError(error, videoUrl);
    return { success: false, videoUrl, error: message, errorType: type };
  }
}
```

**Refactoring Steps:**
1. Extract URL normalization (lines 164-172) → `normalizeYoutubeUrl()`
2. Extract title/filename generation (lines 224-246) → `generateTitleAndFilename()`
3. Extract path construction (lines 252-254) → `constructOutputPath()`
4. Extract streaming write (lines 261-321) → `streamTranscriptToFile()`
5. Extract error categorization (lines 350-355) → `categorizeError()`
6. Wrap all in `processSingleTranscript()` method
7. Update existing tool handler to call `processSingleTranscript()` and format response

**Risk Assessment:**
- **Low risk:** Logic moves verbatim (no behavior changes)
- **Regression tests:** Existing tests verify no behavior change
- **Incremental:** Can refactor in separate PR before batch feature

### 7.2 Modularize Error Handling

**Current State:**
- Error categorization inline in catch block (lines 350-355)

**Refactoring Goal:**
```typescript
private categorizeError(error: any, videoUrl: string): { message: string; type: ErrorType } {
  if (error.message?.includes('TranscriptsDisabled')) {
    return {
      message: `Transcripts are disabled for the video: ${videoUrl}`,
      type: 'TranscriptsDisabled'
    };
  } else if (error.message?.includes('Could not find transcript')) {
    return {
      message: `Could not find a transcript for the video: ${videoUrl}`,
      type: 'NotFound'
    };
  } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
    return {
      message: `Rate limit exceeded for ${videoUrl}`,
      type: 'RateLimit'
    };
  } else {
    return {
      message: `Failed to process transcript for ${videoUrl}. Error: ${error.message || error}`,
      type: 'Unknown'
    };
  }
}
```

**Benefits:**
- Consistent error messages across single and batch tools
- Typed error categories (enables batch summary filtering)
- Easier to add new error types (e.g., network timeout, invalid video ID)

---

## 8. Integration Points for Batch Feature

### 8.1 Tool Registration

**File:** `src/index.ts`
**Location:** Line 119-142 (inside `ListToolsRequestSchema` handler)

**Change:**
```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_transcript_and_save',
      // ... existing definition ...
    },
    {
      name: 'batch_get_transcripts',
      description: 'Fetches transcripts for multiple YouTube videos with aggregated or individual output modes',
      inputSchema: {
        type: 'object',
        properties: {
          video_urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of YouTube video URLs to process',
            minItems: 1,
            maxItems: 50
          },
          output_mode: {
            type: 'string',
            enum: ['aggregated', 'individual'],
            description: 'Save as single file (aggregated) or separate files (individual)'
          },
          output_path: {
            type: 'string',
            description: 'File path for aggregated mode, directory path for individual mode'
          }
        },
        required: ['video_urls', 'output_mode', 'output_path']
      }
    }
  ]
}));
```

**Impact:** +20 lines (adds second tool to array)

### 8.2 Tool Execution Handler

**File:** `src/index.ts`
**Location:** Line 145-369 (inside `CallToolRequestSchema` handler)

**Change:**
```typescript
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_transcript_and_save') {
    // Existing tool logic
    if (!isValidGetTranscriptArgs(request.params.arguments)) { ... }
    // ... existing processing ...
  } else if (request.params.name === 'batch_get_transcripts') {
    // New batch tool logic
    if (!isValidBatchGetTranscriptsArgs(request.params.arguments)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for batch_get_transcripts...');
    }
    
    const { video_urls, output_mode, output_path } = request.params.arguments;
    
    try {
      const result = await this.processBatchTranscripts(video_urls, output_mode, output_path);
      return this.formatBatchResponse(result);
    } catch (error: any) {
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
  } else {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }
});
```

**Impact:** +15 lines (adds branch for batch tool)

### 8.3 Batch Processing Implementation

**File:** `src/index.ts`
**Location:** After existing tool handler (new methods)

**New Methods:**

#### 1. Type Guard (validation)
```typescript
const isValidBatchGetTranscriptsArgs = (
  args: any
): args is BatchGetTranscriptsArgs =>
  typeof args === 'object' &&
  args !== null &&
  Array.isArray(args.video_urls) &&
  args.video_urls.length >= 1 &&
  args.video_urls.length <= 50 &&
  args.video_urls.every((url: any) => typeof url === 'string') &&
  (args.output_mode === 'aggregated' || args.output_mode === 'individual') &&
  typeof args.output_path === 'string';
```

**Impact:** +10 lines

#### 2. Batch Orchestration
```typescript
private async processBatchTranscripts(
  videoUrls: string[],
  outputMode: 'aggregated' | 'individual',
  outputPath: string
): Promise<BatchResult> {
  const results: TranscriptResult[] = [];
  
  if (outputMode === 'individual') {
    // Validate directory path
    validateOutputPath(outputPath);
    const outputDir = path.resolve(CLINE_CWD, outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Process each video sequentially
    for (const url of videoUrls) {
      const filename = `transcript-${Date.now()}-${results.length}.md`;
      const filePath = path.join(outputPath, filename);
      
      try {
        const result = await this.processSingleTranscript(url, filePath);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          videoUrl: url,
          error: error.message || 'Unknown error',
          errorType: 'Unknown'
        });
      }
    }
  } else {
    // Aggregated mode: fetch all transcripts, then combine
    for (const url of videoUrls) {
      // Process to temporary in-memory storage or temp files
      // ... implementation ...
    }
    
    await this.writeAggregatedTranscript(results, outputPath);
  }
  
  return {
    results,
    outputPath,
    mode: outputMode,
    totalVideos: videoUrls.length,
    successfulVideos: results.filter(r => r.success).length,
    failedVideos: results.filter(r => !r.success).length
  };
}
```

**Impact:** +50 lines

#### 3. Aggregated Output Writer
```typescript
private async writeAggregatedTranscript(
  results: TranscriptResult[],
  outputPath: string
): Promise<void> {
  validateOutputPath(outputPath);
  const absolutePath = path.resolve(CLINE_CWD, outputPath);
  const outputDir = path.dirname(absolutePath);
  await fs.mkdir(outputDir, { recursive: true });
  
  const writeStream = createWriteStream(absolutePath, { encoding: 'utf-8' });
  
  // Write header
  writeStream.write(`# Batch Transcript: ${results.length} videos\n`);
  writeStream.write(`**Created:** ${new Date().toISOString()}\n`);
  writeStream.write(`**Mode:** Aggregated\n\n`);
  
  // Write each video section
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    writeStream.write(`---\n\n`);
    writeStream.write(`## Video ${i + 1}: ${result.title || 'Unknown'}\n`);
    writeStream.write(`**Source:** ${result.videoUrl}\n`);
    writeStream.write(`**Status:** ${result.success ? 'Success' : 'Failed'}\n\n`);
    
    if (result.success) {
      // Write transcript content (already processed)
      // ... read from temp file or memory ...
    } else {
      writeStream.write(`**Error:** ${result.error}\n`);
    }
    writeStream.write(`\n`);
  }
  
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });
}
```

**Impact:** +40 lines

#### 4. Response Formatter
```typescript
private formatBatchResponse(result: BatchResult): object {
  const successList = result.results
    .filter(r => r.success)
    .map(r => `✓ ${r.filePath}`)
    .join('\n');
  
  const failureList = result.results
    .filter(r => !r.success)
    .map(r => `✗ ${r.videoUrl}: ${r.error}`)
    .join('\n');
  
  let responseText = `Batch processing complete:\n`;
  responseText += `- Total: ${result.totalVideos} videos\n`;
  responseText += `- Successful: ${result.successfulVideos} transcripts\n`;
  responseText += `- Failed: ${result.failedVideos} transcripts\n\n`;
  
  if (result.successfulVideos > 0) {
    responseText += `Successful transcripts:\n${successList}\n\n`;
  }
  
  if (result.failedVideos > 0) {
    responseText += `Failed transcripts:\n${failureList}\n\n`;
  }
  
  responseText += `Output: ${result.outputPath} (${result.mode} mode)`;
  
  return {
    content: [{ type: 'text', text: responseText }]
  };
}
```

**Impact:** +30 lines

**Total New Code:** ~150 lines (plus ~150 lines from refactoring existing code)

**Final File Size:** 384 lines (current) + 150 lines (new) = ~534 lines (manageable for single-file server)

---

## 9. Risk Assessment & Mitigation

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Rate limiting during batch** | Medium | High | Requires throttling (#3) implementation first; sequential processing leverages existing throttler |
| **Filename collisions (individual mode)** | Medium | Low | Append timestamp + index to filename: `transcript-${Date.now()}-${index}.md` |
| **Large aggregated files crash server** | Low | Medium | Streaming write handles large files (existing optimization proven for 6hr videos) |
| **Memory leak in refactored code** | Low | High | Reuse existing streaming logic (proven reliable); add memory tests |
| **Breaking existing tool** | Low | High | Regression tests verify no behavior change; refactor in separate PR |
| **Path traversal in batch mode** | Low | Critical | Reuse `validateOutputPath()` (30+ test cases already cover batch scenarios) |

### 9.2 Performance Risks

| Risk | Impact | Current Measurement | Target | Mitigation |
|------|--------|---------------------|--------|------------|
| **Batch timeout** | High | 10 videos × 4s = ~40s | <5 minutes for 50 videos | Document expected duration; consider lowering max batch size if needed |
| **Memory spike in aggregated mode** | Medium | <100MB for single 6hr video | <200MB for 50 videos | Use temp files for aggregated mode (stream from temp files to final file) |
| **Throttle delay too aggressive** | Low | 2s default delay | User-configurable | Document configuration options in README |

### 9.3 User Experience Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No progress visibility** | Medium | Console.error logs show throttle delays and progress (visible in MCP server logs) |
| **Confusing error messages** | Low | Specific error types (TranscriptsDisabled, NotFound) with actionable messages |
| **Unexpected batch size limit** | Low | Clear error message: "Maximum 50 videos per batch. Split large batches into multiple calls." |

### 9.4 Security Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Path traversal via batch array** | Low | Critical | Validate each video URL (already done by `YoutubeTranscript.fetchTranscript`); validate output path once (reuses existing validation) |
| **Null byte injection** | Very Low | Medium | Existing `validateOutputPath()` checks null bytes (`\0`) |
| **Resource exhaustion (50 videos)** | Low | Medium | Hard limit of 50 videos; throttling prevents API abuse |

---

## 10. Blocking Decisions

### 10.1 Aggregated Mode Implementation Strategy

**Decision Required:** How to handle aggregated mode processing?

**Options:**

#### Option A: In-Memory Aggregation
- Fetch all transcripts to memory
- Combine into single string
- Write to file

**Pros:**
- Simple implementation
- Single write operation

**Cons:**
- Memory spike for large batches (50 videos × ~10MB = 500MB)
- Violates existing <100MB memory constraint

#### Option B: Temporary File Aggregation
- Fetch each transcript to temp file
- Stream from temp files to final aggregated file
- Cleanup temp files

**Pros:**
- Maintains memory efficiency (<100MB)
- Leverages existing streaming logic

**Cons:**
- More complex (temp file management)
- Extra disk I/O

#### Option C: Sequential Streaming Aggregation
- Open single write stream for aggregated file
- Fetch each transcript and stream directly to aggregated file
- No temp files or in-memory storage

**Pros:**
- Simplest implementation
- Maximum memory efficiency
- No temp file cleanup needed

**Cons:**
- Complexity in handling per-video metadata (need to buffer first transcript entry for title)

**Recommendation:** **Option C (Sequential Streaming Aggregation)**
- Aligns with existing streaming optimization
- Minimal memory footprint
- Simplest implementation (no temp file management)
- Buffer only first transcript entry per video for title (negligible memory)

---

### 10.2 Filename Strategy (Individual Mode)

**Decision Required:** How to generate unique filenames for individual mode?

**Current Behavior:** Uses first 5 words of transcript + sanitization
- **Risk:** Collisions if two videos have same first 5 words

**Options:**

#### Option A: Timestamp Suffix (Current)
```typescript
const baseFilename = sanitize(firstFiveWords);
const filename = `${baseFilename}-${Date.now()}.md`;
```

**Pros:**
- Guaranteed unique (timestamp precision)
- Human-readable base name

**Cons:**
- Collisions possible if two videos processed in same millisecond
- Loses semantic meaning if base name is empty

#### Option B: Video ID Suffix
```typescript
const videoId = extractVideoId(videoUrl);  // From URL
const baseFilename = sanitize(firstFiveWords);
const filename = `${baseFilename}-${videoId}.md`;
```

**Pros:**
- Guaranteed unique (video ID is unique)
- Deterministic (same video always generates same filename)
- Semantic (ID links to source video)

**Cons:**
- Need to extract video ID from URL (additional logic)
- Less human-readable (random alphanumeric ID)

#### Option C: Index Suffix (Simplest)
```typescript
const baseFilename = sanitize(firstFiveWords);
const filename = `${baseFilename}-${index}.md`;
```

**Pros:**
- Simple (just use array index)
- Human-readable (sequential numbering)

**Cons:**
- Not deterministic (order-dependent)
- Collisions possible across multiple batch calls

**Recommendation:** **Option B (Video ID Suffix)**
- Guaranteed uniqueness
- Deterministic (important for idempotent operations)
- Semantic traceability (filename → video URL)
- Implementation: Extract video ID from URL using regex (already done for Shorts conversion)

---

### 10.3 Progress Reporting Strategy

**Decision Required:** How to provide progress visibility during batch processing?

**Current Behavior:** Console.error logs (visible in MCP server logs, not in MCP responses)

**Options:**

#### Option A: No Progress (Current)
- Only log to console.error
- Final summary after completion

**Pros:**
- Simple (no changes to MCP response format)
- Aligns with existing logging pattern

**Cons:**
- No visibility for long batches (50 videos = ~3 minutes)
- User doesn't know if batch is stuck or processing

#### Option B: Intermediate MCP Responses (Streaming)
- Send progress updates via MCP streaming protocol
- Requires MCP SDK streaming support

**Pros:**
- Real-time progress visibility
- Best UX for long batches

**Cons:**
- MCP SDK may not support streaming responses (need to verify)
- Complex implementation

#### Option C: Console.error Logs + Final Summary (Enhanced Logging)
- Log each video completion to console.error
- Include progress counter: "Processing video 5/10..."
- Final summary shows all results

**Pros:**
- Simple implementation (just enhance existing logs)
- Visible in MCP server logs (if user checks)
- No MCP protocol changes

**Cons:**
- Requires user to check server logs (not ideal UX)

**Recommendation:** **Option C (Enhanced Logging)**
- Most pragmatic for v1 (no MCP SDK research needed)
- Aligns with existing logging pattern
- Future enhancement: Investigate MCP streaming for v2

**Implementation:**
```typescript
for (let i = 0; i < videoUrls.length; i++) {
  console.error(`[Batch Progress] Processing video ${i + 1}/${videoUrls.length}: ${videoUrls[i]}`);
  const result = await this.processSingleTranscript(videoUrls[i], ...);
  console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
}
```

---

## 11. Affected Features & Integration Points

### 11.1 Direct Dependencies

1. **Request Throttling (#3)** - REQUIRED
   - Batch operations will trigger rate limits without throttling
   - Must be implemented/functional before batch feature ships
   - Integration: Batch tool reuses `this.throttler.throttle()` wrapper

2. **Path Validation (existing)** - REUSED
   - `validateOutputPath()` function prevents path traversal
   - Batch tool calls this once for output path
   - No changes needed (security tests already cover batch scenarios)

3. **Streaming Optimization (existing)** - REUSED
   - `createWriteStream()` pattern for memory efficiency
   - Batch tool uses same chunked streaming approach
   - No changes needed (proven for 6hr videos, will scale to batch)

### 11.2 Regression Risk Mapping

**No regressions expected** if refactoring follows best practices:

| Feature | Risk | Mitigation |
|---------|------|------------|
| **Existing `get_transcript_and_save` tool** | Low | Refactor in separate PR; regression tests verify behavior unchanged |
| **Path validation security** | Very Low | No changes to `validateOutputPath()`; existing 30+ test cases apply |
| **Memory optimization** | Low | Reuse exact same streaming pattern; memory tests verify <100MB constraint |
| **Throttling** | Very Low | No changes to throttler; batch just calls `throttle()` more times |
| **Error handling** | Low | Extract error categorization (behavior unchanged); new error types additive only |

**Test Coverage Required:**
- Run full test suite after refactoring (unit + integration + security)
- Add regression test: Existing tool behavior unchanged (input → output mapping)
- Memory test: Batch processing stays <200MB for 50 videos

---

## 12. Implementation Complexity Assessment

### 12.1 Complexity Metrics

**Code Changes:**
- Lines added: ~150 (batch logic) + ~20 (tool registration) = **170 lines new code**
- Lines refactored: ~150 (extract single transcript processing) = **150 lines moved**
- Total impact: **320 lines** (from 384 lines → ~700 lines)

**File Modifications:**
- Modified: `src/index.ts` (all changes in single file)
- Unchanged: `src/throttle.ts` (throttler works as-is)

**Test Additions:**
- Unit tests: ~200 lines (batch validation, processing logic)
- Integration tests: ~150 lines (batch with throttling, mixed results)
- Security tests: ~50 lines (batch-specific path validation)
- Total: **~400 lines of test code**

**Overall Complexity:** **Moderate**
- Existing patterns are well-established and reusable
- No new dependencies or architectural changes
- Largest risk is refactoring existing code (mitigated by regression tests)

### 12.2 Implementation Timeline Estimate

**Phase 1: Refactoring (Day 1-2)**
- Extract `processSingleTranscript()` method
- Extract helper functions (URL normalization, filename generation, error categorization)
- Run regression tests (ensure existing tool unchanged)
- Estimated: **8-12 hours**

**Phase 2: Batch Logic (Day 2-3)**
- Implement `processBatchTranscripts()` (individual mode)
- Add type guard and tool registration
- Write unit tests for individual mode
- Estimated: **6-8 hours**

**Phase 3: Aggregated Mode (Day 3-4)**
- Implement `writeAggregatedTranscript()` helper
- Add aggregated mode logic to batch processing
- Write unit tests for aggregated mode
- Estimated: **4-6 hours**

**Phase 4: Testing & Refinement (Day 4-5)**
- Integration tests (batch with throttling)
- Security tests (batch-specific)
- Manual testing (all test cases)
- Documentation updates (README, tool descriptions)
- Estimated: **6-8 hours**

**Phase 5: Review & Merge (Day 5)**
- Code review
- Performance profiling (memory, execution time)
- Final regression testing
- Estimated: **2-4 hours**

**Total Estimated Time:** **26-38 hours** (3.5-5 days for single developer)

---

## 13. Testing Strategy

### 13.1 Unit Test Plan

**File:** `tests/unit/batch-get-transcripts.test.ts` (new file)

**Test Cases:**

#### Input Validation Tests
```typescript
describe('Batch Get Transcripts - Input Validation', () => {
  it('should reject empty video_urls array', () => { ... });
  it('should reject video_urls array exceeding max length (51)', () => { ... });
  it('should reject invalid output_mode', () => { ... });
  it('should reject path traversal attempts', () => { ... });
  it('should accept valid batch arguments', () => { ... });
});
```

#### Refactored Single Transcript Tests
```typescript
describe('processSingleTranscript - Refactored Logic', () => {
  it('should maintain existing behavior (regression)', () => { ... });
  it('should return TranscriptResult on success', () => { ... });
  it('should return TranscriptResult on failure', () => { ... });
  it('should categorize error types correctly', () => { ... });
});
```

#### Batch Processing Logic Tests
```typescript
describe('processBatchTranscripts - Individual Mode', () => {
  it('should create separate files for each video', () => { ... });
  it('should generate unique filenames', () => { ... });
  it('should continue processing after individual video failure', () => { ... });
  it('should return BatchResult with correct counts', () => { ... });
});

describe('processBatchTranscripts - Aggregated Mode', () => {
  it('should combine all transcripts into single file', () => { ... });
  it('should include section markers between videos', () => { ... });
  it('should include metadata for each video', () => { ... });
  it('should handle failures in aggregated output', () => { ... });
});
```

### 13.2 Integration Test Plan

**File:** `tests/integration/batch-youtube-api.test.ts` (new file)

**Test Cases:**

#### Batch Processing with Throttling
```typescript
describe.skipIf(!INTEGRATION_ENABLED)('Batch Transcripts - Throttling', () => {
  it('should process 3 video batch with throttle delays', async () => {
    // Verify throttler called sequentially (not parallel)
    // Verify delay logs: "Throttling: waiting Xms before next request"
    // Verify all 3 videos processed successfully
  }, 120000); // 2min timeout (3 videos × 4s each × buffer)
});
```

#### Mixed Success/Failure Scenarios
```typescript
describe.skipIf(!INTEGRATION_ENABLED)('Batch Transcripts - Error Handling', () => {
  it('should handle 2 successful + 1 failed video', async () => {
    const videoUrls = [
      TEST_VIDEOS.SHORT_30MIN,     // Success
      TEST_VIDEOS.SHORT_30MIN,     // Success (duplicate)
      TEST_VIDEOS.DISABLED         // Failure (TranscriptsDisabled)
    ];
    // Verify summary shows 2/3 success
    // Verify failed video error message captured
  }, 180000); // 3min timeout
});
```

#### Output Verification
```typescript
describe.skipIf(!INTEGRATION_ENABLED)('Batch Transcripts - Output Format', () => {
  it('should create aggregated file with section markers', async () => {
    // Verify file contains "---" separators
    // Verify each video section has metadata (source URL, status)
  }, 180000);

  it('should create individual files with correct filenames', async () => {
    // Verify files named with video IDs
    // Verify file contents match expected format
  }, 180000);
});
```

### 13.3 Security Test Plan

**File:** `tests/security.test.ts` (extend existing)

**New Test Cases:**

```typescript
describe('Batch Transcripts - Security', () => {
  describe('should validate batch output paths', () => {
    it('should block path traversal in aggregated mode', () => {
      const args = {
        video_urls: ['https://youtube.com/watch?v=test'],
        output_mode: 'aggregated',
        output_path: '../../../etc/passwd'
      };
      expect(() => validateBatchArgs(args)).toThrow(McpError);
    });

    it('should block path traversal in individual mode', () => {
      const args = {
        video_urls: ['https://youtube.com/watch?v=test'],
        output_mode: 'individual',
        output_path: '../../../tmp/'
      };
      expect(() => validateBatchArgs(args)).toThrow(McpError);
    });
  });

  describe('should validate batch array inputs', () => {
    it('should reject non-array video_urls', () => { ... });
    it('should reject array exceeding max length', () => { ... });
    it('should reject array with non-string elements', () => { ... });
  });
});
```

### 13.4 Manual Test Cases

**Test 1: Aggregated Mode (All Successful)**
```
Input:
  video_urls: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=9bZkp7q19f0',
    'https://www.youtube.com/watch?v=jNQXAC9IVRw'
  ]
  output_mode: 'aggregated'
  output_path: 'batch-test.md'

Expected:
  - Single file created: batch-test.md
  - Contains 3 sections separated by "---"
  - Each section has metadata (source URL, status: Success)
  - Summary shows "3/3 successful"
```

**Test 2: Individual Mode (Mixed Results)**
```
Input:
  video_urls: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',  // Success
    'https://www.youtube.com/watch?v=invalid123',   // Failure
    'https://www.youtube.com/watch?v=9bZkp7q19f0'   // Success
  ]
  output_mode: 'individual'
  output_path: 'transcripts/'

Expected:
  - Directory created: transcripts/
  - 2 files created (for successful videos)
  - Summary shows "2/3 successful, 1/3 failed"
  - Failed video error message: "Could not find a transcript for..."
```

**Test 3: Throttling Verification**
```
Input:
  video_urls: [5 valid YouTube URLs]
  output_mode: 'individual'
  output_path: 'transcripts/'

Expected:
  - Console logs show: "Throttling: waiting Xms before next request"
  - Total processing time: ~20-30 seconds (5 × 4s average)
  - All 5 videos processed successfully
```

**Test 4: Empty Array Rejection**
```
Input:
  video_urls: []
  output_mode: 'aggregated'
  output_path: 'batch.md'

Expected:
  - Immediate rejection
  - Error message: "Invalid arguments... video_urls must contain at least 1 URL"
```

**Test 5: Max Batch Size Enforcement**
```
Input:
  video_urls: [51 YouTube URLs]
  output_mode: 'aggregated'
  output_path: 'batch.md'

Expected:
  - Immediate rejection
  - Error message: "Maximum 50 videos per batch. Split large batches into multiple calls."
```

---

## 14. Documentation Requirements

### 14.1 README Updates

**Section to Add:** After "Request Throttling" section

```markdown
## Batch Transcript Processing

Process multiple YouTube videos in a single operation with aggregated or individual output modes.

### Tool: `batch_get_transcripts`

**Description:** Fetches transcripts for multiple YouTube videos with configurable output modes.

**Arguments:**
- `video_urls` (array of strings, required): List of YouTube video URLs (1-50 videos)
- `output_mode` (string, required): Output mode - `aggregated` (single file) or `individual` (separate files)
- `output_path` (string, required): File path for aggregated mode, directory path for individual mode

**Examples:**

**Aggregated Mode** (combine into single file):
```json
{
  "video_urls": [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=9bZkp7q19f0",
    "https://www.youtube.com/watch?v=jNQXAC9IVRw"
  ],
  "output_mode": "aggregated",
  "output_path": "batch-transcripts.md"
}
```

**Individual Mode** (separate files):
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

### Output Format

**Aggregated Mode:**
```markdown
# Batch Transcript: 3 videos
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

**Individual Mode:**
- Creates separate `.md` files in specified directory
- Filenames: `transcript-{videoId}.md` (e.g., `transcript-dQw4w9WgXcQ.md`)
- Each file contains single video transcript

### Performance

- **Processing Time:** ~4 seconds per video (includes 2s throttle delay)
- **Batch Size Limit:** 50 videos maximum (enforced)
- **Example:** 10 video batch = ~40 seconds total

### Error Handling

Batch processing continues even if individual videos fail:
- TranscriptsDisabled: Video has transcripts disabled (privacy setting)
- NotFound: No transcript available for video
- NetworkError: Connection or API error

**Response includes detailed summary:**
```
Batch processing complete:
- Total: 5 videos
- Successful: 4 transcripts
- Failed: 1 transcript

Failed transcripts:
✗ https://youtube.com/watch?v=xyz123: Transcripts are disabled for the video
```

### Limitations

- Maximum 50 videos per batch (split large batches into multiple calls)
- Sequential processing only (no parallelization in v1)
- Playlist URLs not supported (extract individual video URLs manually)
```

### 14.2 Tool Description Updates

**File:** `src/index.ts` (tool registration)

Update tool descriptions to be comprehensive:

```typescript
{
  name: 'batch_get_transcripts',
  description: `Fetches transcripts for multiple YouTube videos with aggregated or individual output modes.
    
    Output Modes:
    - aggregated: Combines all transcripts into a single Markdown file with section markers
    - individual: Creates separate Markdown files for each video in the specified directory
    
    Features:
    - Batch size: 1-50 videos per call
    - Automatic throttling: Prevents YouTube rate limiting
    - Error isolation: Individual video failures don't halt batch processing
    - Detailed summary: Shows success/failure counts with specific error messages
    
    Performance:
    - Processing time: ~4 seconds per video (includes throttle delay)
    - Example: 10 video batch = ~40 seconds total
    
    Limitations:
    - Sequential processing (no parallelization)
    - Playlist URLs not supported (extract video URLs manually)`,
  inputSchema: { ... }
}
```

---

## 15. Feasibility & Recommendation

### 15.1 Feasibility Score: **High (9/10)**

**Strengths:**
- ✅ All building blocks present (throttling, streaming, validation)
- ✅ Clear refactoring path with low regression risk
- ✅ Existing test infrastructure supports batch testing
- ✅ No new dependencies required
- ✅ Architecture supports extension (single-file server, modular throttling)

**Weaknesses:**
- ⚠️ Moderate code complexity (~320 lines new/refactored)
- ⚠️ Requires request throttling (#3) to be implemented first
- ⚠️ Aggregated mode requires careful memory management

### 15.2 Complexity Score: **Moderate**

**Factors:**
- Code volume: ~320 lines (150 new + 170 refactored)
- Test volume: ~400 lines (unit + integration + security)
- Integration points: 2 (tool registration + execution handler)
- Refactoring scope: 1 function extraction (low risk)
- Dependencies: 1 blocking dependency (request throttling #3)

**Comparison:**
- **Simple:** Single-function change, <100 lines, no refactoring
- **Moderate:** Multi-function change, 200-500 lines, minor refactoring ✅
- **Complex:** Architectural change, >500 lines, major refactoring

### 15.3 Approach: **Brownfield**

**Rationale:**
- Extends existing `get_transcript_and_save` tool architecture
- Reuses existing validation, streaming, and throttling patterns
- No breaking changes to existing functionality
- Additive feature (new tool added to tools array)

### 15.4 Final Recommendation: **PROCEED WITH IMPLEMENTATION**

**Recommended Sequence:**
1. **Week 1:** Implement request throttling (#3) - BLOCKING DEPENDENCY
2. **Week 2:** Refactor existing tool (extract `processSingleTranscript()`) - LOW RISK
3. **Week 3:** Implement batch tool (individual mode first, then aggregated) - MODERATE RISK
4. **Week 4:** Testing, documentation, review - LOW RISK

**Success Criteria:**
- [ ] All regression tests pass (existing tool behavior unchanged)
- [ ] Batch tool supports 1-50 videos
- [ ] Memory usage <200MB for 50 video batch
- [ ] Throttling prevents rate limiting
- [ ] Error handling: individual failures don't halt batch
- [ ] Documentation updated (README, tool descriptions)

**Risk Mitigation:**
- Implement refactoring in separate PR (verify regression tests before batch feature)
- Start with individual mode (simpler than aggregated)
- Add comprehensive unit tests before integration tests
- Manual testing with real YouTube videos (3-5 video batches)

---

## Appendix A: Key Code Patterns to Preserve

### A.1 Streaming Write Pattern (Memory Optimization)

**From:** `src/index.ts:261-321`

**Pattern:**
```typescript
const CHUNK_SIZE = 1000;
const writeStream = createWriteStream(absoluteOutputPath, { encoding: 'utf-8' });

writeStream.on('error', async (err: Error) => {
  await fs.unlink(absoluteOutputPath);  // Cleanup partial file
});

writeStream.write(`# ${title}\n\n`);

for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
  const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
  const chunkText = chunk
    .map(entry => {
      const preDecoded = entry.text.replace(/&#39;/g, "'").replace(/'/g, "'");
      return he.decode(preDecoded);
    })
    .join(' ');
  writeStream.write(chunkText + ' ');
}

await new Promise<void>((resolve, reject) => {
  writeStream.end(() => resolve());
  writeStream.on('error', reject);
});
```

**Why Preserve:**
- Keeps memory <100MB for 60k+ entry transcripts
- Proven in integration tests (AC1, AC2)
- Batch feature must maintain this pattern

### A.2 Throttle Wrapper Pattern

**From:** `src/index.ts:191-193`

**Pattern:**
```typescript
const transcriptEntries = await this.throttler.throttle(
  () => YoutubeTranscript.fetchTranscript(video_url)
);
```

**Why Preserve:**
- Automatic rate limit protection
- Configurable via environment variables
- Batch feature must wrap all YouTube API calls with this

### A.3 Error Categorization Pattern

**From:** `src/index.ts:350-355`

**Pattern:**
```typescript
if (error.message?.includes('TranscriptsDisabled')) {
  errorMessage = `Transcripts are disabled for the video: ${video_url}`;
} else if (error.message?.includes('Could not find transcript')) {
  errorMessage = `Could not find a transcript for the video: ${video_url}`;
}
```

**Why Preserve:**
- Specific error messages enable user debugging
- Tested in integration tests (AC6)
- Batch feature should return same error types

### A.4 Path Validation Pattern

**From:** `src/index.ts:24-78`

**Pattern:**
```typescript
function validateOutputPath(outputPath: string): void {
  if (!outputPath || outputPath.trim() === '') {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }
  
  if (outputPath.includes('\0')) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }
  
  const decodedPath = decodeURIComponent(outputPath);
  if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }
  
  // ... more checks ...
  
  const resolvedPath = path.resolve(CLINE_CWD, outputPath);
  if (!resolvedPath.startsWith(CLINE_CWD)) {
    throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
  }
}
```

**Why Preserve:**
- Prevents path traversal attacks
- 30+ test cases verify security
- Batch feature must reuse this function (not reimplement)

---

## Appendix B: References

### B.1 Related Issues

- **#1:** [FEATURE] Batch process multiple YouTube transcripts (this issue)
- **#3:** [FEATURE] Request throttling for YouTube blocking prevention (blocking dependency)

### B.2 Codebase Files Analyzed

**Source Files:**
- `src/index.ts` (384 lines) - Main server implementation
- `src/throttle.ts` (152 lines) - Request throttling module

**Test Files:**
- `tests/unit/youtube-mcp-server.test.ts` (300 lines)
- `tests/unit/throttle.test.ts` (150 lines)
- `tests/integration/youtube-api.test.ts` (183 lines)
- `tests/security.test.ts` (296 lines)
- `tests/streaming.test.ts` (200 lines)

**Configuration Files:**
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript compiler config
- `README.md` - User documentation

### B.3 External Dependencies

- `@modelcontextprotocol/sdk: 0.6.0` - MCP protocol implementation
- `youtube-transcript: ^1.2.1` - YouTube transcript fetching
- `he: ^1.2.0` - HTML entity decoding
- Node.js: `^20.11.24` (from package.json devDependencies)

### B.4 Documentation

- **MCP SDK Docs:** https://github.com/modelcontextprotocol/sdk
- **youtube-transcript Docs:** https://www.npmjs.com/package/youtube-transcript
- **Vitest Docs:** https://vitest.dev/

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-09T16:50:28Z  
**Status:** Research Complete - Ready for Planning Phase
