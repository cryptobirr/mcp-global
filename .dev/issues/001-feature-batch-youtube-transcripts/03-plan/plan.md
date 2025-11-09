# Implementation Plan: Batch YouTube Transcript Processing

**Issue:** #1  
**Feature Type:** Backend  
**Created:** 2025-11-09T16:58:45Z  
**Status:** Draft

---

## Executive Summary

This plan outlines the step-by-step implementation of the `batch_get_transcripts` tool for the YouTube MCP Server. The implementation follows a refactor-first approach: extract existing single-transcript logic into reusable components, then build batch orchestration on top. This ensures zero regression risk while enabling batch processing of 1-50 videos with aggregated or individual output modes.

**Total Estimated Time:** 26-38 hours (3.5-5 days)  
**Risk Level:** Low-Medium  
**Backward Compatibility:** 100% (existing tool unchanged)

---

## Phase 1: Code Refactoring (Foundation)

### Objective
Extract existing transcript processing logic into reusable, testable methods without changing behavior.

### Tasks

#### 1.1 Extract Single Transcript Processing
**File:** `src/index.ts`  
**Lines:** 175-338 (current implementation)  
**New Method:** `processSingleTranscript()`

**Implementation:**
```typescript
/**
 * Processes a single YouTube transcript with streaming optimization
 * @param videoUrl - YouTube video URL (standard or Shorts format)
 * @param outputPath - Relative path for transcript file
 * @returns TranscriptResult with success status, file path, and optional error
 */
private async processSingleTranscript(
  videoUrl: string,
  outputPath: string
): Promise<TranscriptResult> {
  try {
    // 1. Normalize URL (Shorts → standard)
    const normalizedUrl = this.normalizeYoutubeUrl(videoUrl);
    
    // 2. Fetch transcript (with throttling)
    const transcriptEntries = await this.throttler.throttle(
      () => YoutubeTranscript.fetchTranscript(normalizedUrl)
    );
    
    // 3. Validate transcript exists
    if (!transcriptEntries || transcriptEntries.length === 0) {
      return {
        success: false,
        videoUrl,
        error: 'No transcript found or available for this video',
        errorType: 'NotFound'
      };
    }
    
    // 4. Generate title and filename
    const { title, filename } = this.generateTitleAndFilename(transcriptEntries);
    
    // 5. Validate and construct absolute path
    validateOutputPath(outputPath);
    const absolutePath = this.constructOutputPath(outputPath, filename);
    
    // 6. Stream transcript to file
    await this.streamTranscriptToFile(transcriptEntries, absolutePath, title);
    
    return {
      success: true,
      videoUrl,
      filePath: absolutePath,
      title
    };
  } catch (error: any) {
    const { message, type } = this.categorizeError(error, videoUrl);
    return {
      success: false,
      videoUrl,
      error: message,
      errorType: type
    };
  }
}
```

**Acceptance Criteria:**
- [ ] Method signature matches interface `TranscriptResult`
- [ ] All existing processing logic moved verbatim (no behavior changes)
- [ ] Error handling preserved (same error messages)
- [ ] Throttling integration maintained

---

#### 1.2 Extract URL Normalization
**File:** `src/index.ts`  
**Lines:** 164-172 (Shorts URL conversion)  
**New Method:** `normalizeYoutubeUrl()`

**Implementation:**
```typescript
/**
 * Converts YouTube Shorts URLs to standard watch URLs
 * @param url - YouTube video URL
 * @returns Normalized URL
 */
private normalizeYoutubeUrl(url: string): string {
  const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;
  const match = url.match(shortsRegex);
  
  if (match && match[1]) {
    const videoId = match[1];
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  
  return url;
}
```

**Acceptance Criteria:**
- [ ] Shorts URLs converted to standard format
- [ ] Standard URLs returned unchanged
- [ ] Unit test: `youtube.com/shorts/abc123` → `youtube.com/watch?v=abc123`

---

#### 1.3 Extract Title and Filename Generation
**File:** `src/index.ts`  
**Lines:** 224-246 (title generation + filename sanitization)  
**New Method:** `generateTitleAndFilename()`

**Implementation:**
```typescript
/**
 * Generates human-readable title and sanitized filename from transcript
 * @param transcriptEntries - Array of transcript entries
 * @returns Object with title (first 10 words) and filename (first 5 words, sanitized)
 */
private generateTitleAndFilename(
  transcriptEntries: any[]
): { title: string; filename: string } {
  const firstEntryText = transcriptEntries[0]?.text || '';
  
  // Decode HTML entities
  const preDecoded = firstEntryText
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'");
  const decodedFirstEntry = he.decode(preDecoded);
  
  // Generate title (first 10 words)
  const titleWords = decodedFirstEntry.split(' ').slice(0, 10).join(' ');
  const title = titleWords ? titleWords.trim() + '...' : 'Transcript';
  
  // Generate filename (first 5 words, sanitized)
  const filenameWords = preDecoded.split(' ').slice(0, 5).join(' ');
  let baseFilename = filenameWords
    ? filenameWords
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
    : `transcript-${Date.now()}`;
  
  // Fallback for empty/invalid filenames
  if (!baseFilename || baseFilename === '-') {
    baseFilename = `transcript-${Date.now()}`;
  }
  
  const filename = `${baseFilename}.md`;
  
  return { title, filename };
}
```

**Acceptance Criteria:**
- [ ] Title contains first 10 words + ellipsis
- [ ] Filename is kebab-case from first 5 words
- [ ] HTML entities decoded correctly
- [ ] Fallback to timestamp if text empty

---

#### 1.4 Extract Path Construction
**File:** `src/index.ts`  
**Lines:** 252-254 (path resolution)  
**New Method:** `constructOutputPath()`

**Implementation:**
```typescript
/**
 * Constructs absolute output path from relative path and filename
 * @param outputPath - Relative output path (file or directory)
 * @param filename - Generated filename
 * @returns Absolute file path
 */
private constructOutputPath(outputPath: string, filename: string): string {
  const originalOutputDir = path.dirname(path.resolve(CLINE_CWD, outputPath));
  const absoluteOutputPath = path.join(originalOutputDir, filename);
  return absoluteOutputPath;
}
```

**Acceptance Criteria:**
- [ ] Returns absolute path within CLINE_CWD
- [ ] Handles both file and directory input paths
- [ ] Combines directory with generated filename

---

#### 1.5 Extract Streaming Write
**File:** `src/index.ts`  
**Lines:** 261-321 (streaming write logic)  
**New Method:** `streamTranscriptToFile()`

**Implementation:**
```typescript
/**
 * Streams transcript to file with chunked processing (memory optimization)
 * @param transcriptEntries - Array of transcript entries
 * @param absolutePath - Absolute file path
 * @param title - Video title for file header
 */
private async streamTranscriptToFile(
  transcriptEntries: any[],
  absolutePath: string,
  title: string
): Promise<void> {
  const CHUNK_SIZE = 1000;
  const outputDir = path.dirname(absolutePath);
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  
  // Create write stream
  const writeStream = createWriteStream(absolutePath, { encoding: 'utf-8' });
  let streamError: Error | null = null;
  
  // Error handling: cleanup partial file
  writeStream.on('error', async (err: Error) => {
    streamError = err;
    try {
      await fs.unlink(absolutePath);
    } catch (unlinkError) {
      console.error('Failed to cleanup partial file:', unlinkError);
    }
  });
  
  // Write header
  writeStream.write(`# ${title}\n\n`);
  
  // Write chunks (1000 entries per batch)
  for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
    const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
    const chunkText = chunk
      .map(entry => {
        const preDecoded = entry.text
          .replace(/&#39;/g, "'")
          .replace(/'/g, "'");
        return he.decode(preDecoded);
      })
      .join(' ');
    
    writeStream.write(chunkText + ' ');
    
    // Progress logging for large transcripts
    if (transcriptEntries.length > 5000 && i > 0 && i % 5000 === 0) {
      console.error(`Progress: ${i}/${transcriptEntries.length} entries processed`);
    }
  }
  
  // Close stream and await completion
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => {
      if (streamError) {
        reject(new McpError(
          ErrorCode.InternalError,
          `Failed to write transcript: ${streamError.message}`
        ));
      } else {
        resolve();
      }
    });
    writeStream.on('error', reject);
  });
}
```

**Acceptance Criteria:**
- [ ] Chunks processed in batches of 1000 entries
- [ ] Memory usage <100MB for 60k+ entries (existing constraint)
- [ ] Progress logged every 5000 entries
- [ ] Partial files deleted on stream error

---

#### 1.6 Extract Error Categorization
**File:** `src/index.ts`  
**Lines:** 350-355 (error type detection)  
**New Method:** `categorizeError()`

**Implementation:**
```typescript
/**
 * Categorizes errors into specific types for actionable user feedback
 * @param error - Caught error object
 * @param videoUrl - Video URL for error message
 * @returns Object with error message and type
 */
private categorizeError(
  error: any,
  videoUrl: string
): { message: string; type: ErrorType } {
  const errorMessage = error.message?.toLowerCase() || '';
  
  if (errorMessage.includes('transcriptsdisabled')) {
    return {
      message: `Transcripts are disabled for the video: ${videoUrl}`,
      type: 'TranscriptsDisabled'
    };
  } else if (errorMessage.includes('could not find transcript')) {
    return {
      message: `Could not find a transcript for the video: ${videoUrl}`,
      type: 'NotFound'
    };
  } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
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

**Acceptance Criteria:**
- [ ] TranscriptsDisabled errors detected
- [ ] NotFound errors detected
- [ ] RateLimit errors detected
- [ ] Unknown errors return generic message

---

#### 1.7 Update Existing Tool Handler
**File:** `src/index.ts`  
**Lines:** 145-369 (CallToolRequestSchema handler)  
**Change:** Replace inline logic with `processSingleTranscript()` call

**Implementation:**
```typescript
// Inside CallToolRequestSchema handler
if (request.params.name === 'get_transcript_and_save') {
  // Validation (unchanged)
  if (!isValidGetTranscriptArgs(request.params.arguments)) {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments...');
  }
  
  let { video_url, output_path } = request.params.arguments;
  
  try {
    // Call refactored method
    const result = await this.processSingleTranscript(video_url, output_path);
    
    // Format response
    if (result.success) {
      return {
        content: [{
          type: 'text',
          text: `Transcript saved successfully!\n\nFile: ${result.filePath}\nTitle: ${result.title}`
        }]
      };
    } else {
      return {
        content: [{ type: 'text', text: result.error }],
        isError: true
      };
    }
  } catch (error: any) {
    console.error('Error during transcript processing:', error);
    return {
      content: [{
        type: 'text',
        text: `Failed to process transcript for ${video_url}. Error: ${error.message}`
      }],
      isError: true
    };
  }
}
```

**Acceptance Criteria:**
- [ ] Existing tool behavior unchanged
- [ ] Same success message format
- [ ] Same error message format
- [ ] All regression tests pass

---

#### 1.8 Add Type Interfaces
**File:** `src/index.ts`  
**Location:** Before class definition (after imports)

**Implementation:**
```typescript
/**
 * Result of processing a single transcript
 */
interface TranscriptResult {
  success: boolean;
  videoUrl: string;
  filePath?: string;      // Populated on success
  title?: string;         // Video title (from first 10 words)
  error?: string;         // Error message on failure
  errorType?: ErrorType;  // Categorized error type
}

/**
 * Categorized error types for transcript processing
 */
type ErrorType = 'TranscriptsDisabled' | 'NotFound' | 'RateLimit' | 'Unknown';

/**
 * Result of batch transcript processing
 */
interface BatchResult {
  results: TranscriptResult[];
  outputPath: string;
  mode: 'aggregated' | 'individual';
  totalVideos: number;
  successfulVideos: number;
  failedVideos: number;
}
```

**Acceptance Criteria:**
- [ ] Interfaces match method signatures
- [ ] TypeScript compilation succeeds
- [ ] Types exported if needed by tests

---

### Phase 1 Testing

#### Regression Tests
**File:** `tests/unit/youtube-mcp-server.test.ts`

**New Test Suite:**
```typescript
describe('Refactored Single Transcript Processing', () => {
  let server: YoutubeMcpServer;

  beforeEach(() => {
    server = new YoutubeMcpServer();
  });

  it('should maintain existing behavior for single transcript', async () => {
    // Compare old vs new implementation output
    // Verify file contents identical
    // Verify success message identical
  });

  it('should return TranscriptResult on success', async () => {
    const result = await server['processSingleTranscript'](
      'https://www.youtube.com/watch?v=test',
      'transcript.md'
    );
    
    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(result.title).toBeDefined();
  });

  it('should return TranscriptResult on failure', async () => {
    const result = await server['processSingleTranscript'](
      'https://www.youtube.com/watch?v=invalid',
      'transcript.md'
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorType).toBeDefined();
  });
});
```

**Acceptance Criteria:**
- [ ] All existing tests pass (100% regression safety)
- [ ] New tests verify refactored methods work correctly
- [ ] Test coverage maintained at ≥90%

---

### Phase 1 Deliverables

- [ ] 6 new private methods extracted from existing code
- [ ] 3 new TypeScript interfaces defined
- [ ] Existing tool handler updated to use refactored methods
- [ ] Zero behavior changes (verified by regression tests)
- [ ] All unit tests passing

**Estimated Time:** 8-12 hours  
**Risk:** Low (regression tests verify no changes)

---

## Phase 2: Batch Tool Implementation

### Objective
Add `batch_get_transcripts` tool with individual mode support.

### Tasks

#### 2.1 Add Tool Registration
**File:** `src/index.ts`  
**Location:** Line 119-142 (ListToolsRequestSchema handler)

**Implementation:**
```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_transcript_and_save',
      // ... existing definition ...
    },
    {
      name: 'batch_get_transcripts',
      description: 'Fetches transcripts for multiple YouTube videos with aggregated or individual output modes.',
      inputSchema: {
        type: 'object',
        properties: {
          video_urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of YouTube video URLs to process (1-50 videos)',
            minItems: 1,
            maxItems: 50
          },
          output_mode: {
            type: 'string',
            enum: ['aggregated', 'individual'],
            description: 'Output mode: "aggregated" (single file) or "individual" (separate files)'
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

**Acceptance Criteria:**
- [ ] Tool appears in MCP tool list
- [ ] Schema validation enforces 1-50 video limit
- [ ] Enum validation for output_mode

---

#### 2.2 Add Type Guard
**File:** `src/index.ts`  
**Location:** After `isValidGetTranscriptArgs` (line 81-87)

**Implementation:**
```typescript
/**
 * Arguments for batch_get_transcripts tool
 */
interface BatchGetTranscriptsArgs {
  video_urls: string[];
  output_mode: 'aggregated' | 'individual';
  output_path: string;
}

/**
 * Type guard for batch_get_transcripts arguments
 */
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

**Acceptance Criteria:**
- [ ] Type guard validates all required fields
- [ ] Rejects empty arrays
- [ ] Rejects arrays exceeding 50 items
- [ ] Rejects invalid output_mode values

---

#### 2.3 Add Tool Execution Handler
**File:** `src/index.ts`  
**Location:** Inside CallToolRequestSchema handler (after existing tool)

**Implementation:**
```typescript
} else if (request.params.name === 'batch_get_transcripts') {
  // Validate arguments
  if (!isValidBatchGetTranscriptsArgs(request.params.arguments)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid arguments for batch_get_transcripts. Required: video_urls (array, 1-50 items), output_mode ("aggregated" or "individual"), output_path (string)'
    );
  }
  
  const { video_urls, output_mode, output_path } = request.params.arguments;
  
  try {
    // Process batch
    const result = await this.processBatchTranscripts(
      video_urls,
      output_mode,
      output_path
    );
    
    // Format response
    return this.formatBatchResponse(result);
  } catch (error: any) {
    console.error('Batch processing error:', error);
    return {
      content: [{
        type: 'text',
        text: `Batch processing failed: ${error.message}`
      }],
      isError: true
    };
  }
} else {
  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unknown tool: ${request.params.name}`
  );
}
```

**Acceptance Criteria:**
- [ ] Tool routes to batch processing logic
- [ ] Arguments validated before processing
- [ ] Errors caught and returned as MCP errors

---

#### 2.4 Implement Batch Processing (Individual Mode)
**File:** `src/index.ts`  
**Location:** New private method

**Implementation:**
```typescript
/**
 * Processes multiple YouTube transcripts in batch
 * @param videoUrls - Array of YouTube video URLs (1-50)
 * @param outputMode - Output mode: aggregated or individual
 * @param outputPath - File path (aggregated) or directory path (individual)
 * @returns BatchResult with processing summary
 */
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
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Process each video sequentially
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      
      // Extract video ID for unique filename
      const videoId = this.extractVideoId(url);
      const filename = `transcript-${videoId || Date.now()}-${i}.md`;
      const filePath = path.join(outputPath, filename);
      
      console.error(`[Batch Progress] Processing video ${i + 1}/${videoUrls.length}: ${url}`);
      
      try {
        const result = await this.processSingleTranscript(url, filePath);
        results.push(result);
        
        console.error(
          `[Batch Progress] Video ${i + 1}/${videoUrls.length}: ${result.success ? 'SUCCESS' : 'FAILED'}`
        );
      } catch (error: any) {
        // Capture error but continue processing
        results.push({
          success: false,
          videoUrl: url,
          error: error.message || 'Unknown error',
          errorType: 'Unknown'
        });
        
        console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
      }
    }
  } else {
    // Aggregated mode (implemented in Phase 3)
    throw new Error('Aggregated mode not yet implemented');
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

**Acceptance Criteria:**
- [ ] Processes videos sequentially (throttler handles delays)
- [ ] Creates output directory if not exists
- [ ] Generates unique filenames with video ID
- [ ] Continues processing after individual failures
- [ ] Logs progress to console.error

---

#### 2.5 Implement Video ID Extraction
**File:** `src/index.ts`  
**Location:** New private method

**Implementation:**
```typescript
/**
 * Extracts video ID from YouTube URL
 * @param url - YouTube video URL
 * @returns Video ID or null if not found
 */
private extractVideoId(url: string): string | null {
  // Standard URL: youtube.com/watch?v=VIDEO_ID
  const standardMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (standardMatch && standardMatch[1]) {
    return standardMatch[1];
  }
  
  // Shorts URL: youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch && shortsMatch[1]) {
    return shortsMatch[1];
  }
  
  // Short URL: youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch && shortMatch[1]) {
    return shortMatch[1];
  }
  
  return null;
}
```

**Acceptance Criteria:**
- [ ] Extracts ID from standard URLs
- [ ] Extracts ID from Shorts URLs
- [ ] Extracts ID from youtu.be URLs
- [ ] Returns null for invalid URLs

---

#### 2.6 Implement Response Formatter
**File:** `src/index.ts`  
**Location:** New private method

**Implementation:**
```typescript
/**
 * Formats batch processing result as MCP response
 * @param result - BatchResult from processing
 * @returns MCP response object
 */
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

**Acceptance Criteria:**
- [ ] Summary shows total/successful/failed counts
- [ ] Success list shows file paths
- [ ] Failure list shows URLs and error messages
- [ ] Output path and mode included

---

### Phase 2 Testing

#### Unit Tests
**File:** `tests/unit/batch-get-transcripts.test.ts` (new)

**Test Cases:**
```typescript
describe('Batch Get Transcripts - Individual Mode', () => {
  let server: YoutubeMcpServer;
  const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output-batch');

  beforeEach(async () => {
    server = new YoutubeMcpServer();
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  it('should reject empty video_urls array', () => {
    const args = { video_urls: [], output_mode: 'individual', output_path: 'out/' };
    expect(isValidBatchGetTranscriptsArgs(args)).toBe(false);
  });

  it('should reject video_urls array exceeding max length', () => {
    const args = {
      video_urls: new Array(51).fill('https://youtube.com/watch?v=test'),
      output_mode: 'individual',
      output_path: 'out/'
    };
    expect(isValidBatchGetTranscriptsArgs(args)).toBe(false);
  });

  it('should reject invalid output_mode', () => {
    const args = {
      video_urls: ['https://youtube.com/watch?v=test'],
      output_mode: 'invalid',
      output_path: 'out/'
    };
    expect(isValidBatchGetTranscriptsArgs(args)).toBe(false);
  });

  it('should accept valid batch arguments', () => {
    const args = {
      video_urls: ['https://youtube.com/watch?v=test'],
      output_mode: 'individual',
      output_path: 'out/'
    };
    expect(isValidBatchGetTranscriptsArgs(args)).toBe(true);
  });

  it('should extract video ID from standard URL', () => {
    const videoId = server['extractVideoId']('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(videoId).toBe('dQw4w9WgXcQ');
  });

  it('should extract video ID from Shorts URL', () => {
    const videoId = server['extractVideoId']('https://youtube.com/shorts/abc123xyz');
    expect(videoId).toBe('abc123xyz');
  });

  it('should extract video ID from youtu.be URL', () => {
    const videoId = server['extractVideoId']('https://youtu.be/dQw4w9WgXcQ');
    expect(videoId).toBe('dQw4w9WgXcQ');
  });
});
```

**Acceptance Criteria:**
- [ ] All input validation tests pass
- [ ] Video ID extraction tests pass
- [ ] Type guard tests pass

---

### Phase 2 Deliverables

- [ ] Batch tool registered in MCP tool list
- [ ] Type guard and interface for batch arguments
- [ ] Tool execution handler routing to batch processing
- [ ] Individual mode implementation complete
- [ ] Video ID extraction for unique filenames
- [ ] Response formatter for batch results
- [ ] Unit tests for validation and ID extraction

**Estimated Time:** 6-8 hours  
**Risk:** Low-Medium (new functionality, well-defined requirements)

---

## Phase 3: Aggregated Mode Implementation

### Objective
Add aggregated output mode support to batch processing.

### Tasks

#### 3.1 Implement Aggregated Mode Processing
**File:** `src/index.ts`  
**Location:** Inside `processBatchTranscripts()` method

**Implementation:**
```typescript
} else {
  // Aggregated mode: stream all transcripts to single file
  
  // Validate file path
  validateOutputPath(outputPath);
  const absolutePath = path.resolve(CLINE_CWD, outputPath);
  const outputDir = path.dirname(absolutePath);
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  
  // Create write stream
  const writeStream = createWriteStream(absolutePath, { encoding: 'utf-8' });
  
  // Write header
  const timestamp = new Date().toISOString();
  writeStream.write(`# Batch Transcript: ${videoUrls.length} videos\n`);
  writeStream.write(`**Created:** ${timestamp}\n`);
  writeStream.write(`**Mode:** Aggregated\n\n`);
  
  // Process each video sequentially
  for (let i = 0; i < videoUrls.length; i++) {
    const url = videoUrls[i];
    
    console.error(`[Batch Progress] Processing video ${i + 1}/${videoUrls.length}: ${url}`);
    
    // Write section separator
    if (i > 0) {
      writeStream.write(`\n---\n\n`);
    }
    
    try {
      // Normalize URL
      const normalizedUrl = this.normalizeYoutubeUrl(url);
      
      // Fetch transcript (with throttling)
      const transcriptEntries = await this.throttler.throttle(
        () => YoutubeTranscript.fetchTranscript(normalizedUrl)
      );
      
      if (!transcriptEntries || transcriptEntries.length === 0) {
        // Write failure section
        writeStream.write(`## Video ${i + 1}: No transcript available\n`);
        writeStream.write(`**Source:** ${url}\n`);
        writeStream.write(`**Status:** Failed\n`);
        writeStream.write(`**Error:** No transcript found or available\n\n`);
        
        results.push({
          success: false,
          videoUrl: url,
          error: 'No transcript found or available',
          errorType: 'NotFound'
        });
        
        console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
        continue;
      }
      
      // Generate title
      const { title } = this.generateTitleAndFilename(transcriptEntries);
      
      // Write success section header
      writeStream.write(`## Video ${i + 1}: ${title}\n`);
      writeStream.write(`**Source:** ${url}\n`);
      writeStream.write(`**Status:** Success\n\n`);
      
      // Write transcript content (chunked)
      const CHUNK_SIZE = 1000;
      for (let j = 0; j < transcriptEntries.length; j += CHUNK_SIZE) {
        const chunk = transcriptEntries.slice(j, j + CHUNK_SIZE);
        const chunkText = chunk
          .map(entry => {
            const preDecoded = entry.text
              .replace(/&#39;/g, "'")
              .replace(/'/g, "'");
            return he.decode(preDecoded);
          })
          .join(' ');
        
        writeStream.write(chunkText + ' ');
      }
      
      writeStream.write(`\n`);
      
      results.push({
        success: true,
        videoUrl: url,
        filePath: absolutePath,
        title
      });
      
      console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: SUCCESS`);
    } catch (error: any) {
      // Write failure section
      const { message, type } = this.categorizeError(error, url);
      
      writeStream.write(`## Video ${i + 1}: Processing failed\n`);
      writeStream.write(`**Source:** ${url}\n`);
      writeStream.write(`**Status:** Failed\n`);
      writeStream.write(`**Error:** ${message}\n\n`);
      
      results.push({
        success: false,
        videoUrl: url,
        error: message,
        errorType: type
      });
      
      console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
    }
  }
  
  // Close stream
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });
}
```

**Acceptance Criteria:**
- [ ] All transcripts written to single file
- [ ] Section separators (`---`) between videos
- [ ] Metadata for each video (source, status)
- [ ] Failed videos included with error message
- [ ] Streaming write maintains memory efficiency

---

### Phase 3 Testing

#### Unit Tests
**File:** `tests/unit/batch-get-transcripts.test.ts`

**New Test Cases:**
```typescript
describe('Batch Get Transcripts - Aggregated Mode', () => {
  it('should combine all transcripts into single file', async () => {
    // Test aggregated file creation
    // Verify file contains all videos
  });

  it('should include section markers between videos', async () => {
    // Read aggregated file
    // Verify "---" separators present
  });

  it('should include metadata for each video', async () => {
    // Verify each section has source URL, status
  });

  it('should handle failures in aggregated output', async () => {
    // Mix successful and failed videos
    // Verify failed videos included with error message
  });
});
```

#### Integration Tests
**File:** `tests/integration/batch-youtube-api.test.ts` (new)

**Test Cases:**
```typescript
describe.skipIf(!INTEGRATION_ENABLED)('Batch Transcripts - Integration', () => {
  const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output-batch-integration');

  beforeEach(async () => {
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  it('should process 3 video batch with throttle delays', async () => {
    const videoUrls = [
      TEST_VIDEOS.SHORT_30MIN,
      TEST_VIDEOS.SHORT_30MIN,
      TEST_VIDEOS.SHORT_30MIN
    ];
    
    const result = await server['processBatchTranscripts'](
      videoUrls,
      'individual',
      path.join(TEST_OUTPUT_DIR, 'transcripts')
    );
    
    expect(result.successfulVideos).toBe(3);
    expect(result.failedVideos).toBe(0);
    
    // Verify files created
    const files = await fs.readdir(path.join(TEST_OUTPUT_DIR, 'transcripts'));
    expect(files.length).toBe(3);
  }, 120000); // 2min timeout

  it('should handle 2 successful + 1 failed video', async () => {
    const videoUrls = [
      TEST_VIDEOS.SHORT_30MIN,     // Success
      'https://youtube.com/watch?v=invalid',  // Failure
      TEST_VIDEOS.SHORT_30MIN      // Success
    ];
    
    const result = await server['processBatchTranscripts'](
      videoUrls,
      'individual',
      path.join(TEST_OUTPUT_DIR, 'transcripts')
    );
    
    expect(result.successfulVideos).toBe(2);
    expect(result.failedVideos).toBe(1);
  }, 180000); // 3min timeout

  it('should create aggregated file with section markers', async () => {
    const videoUrls = [
      TEST_VIDEOS.SHORT_30MIN,
      TEST_VIDEOS.SHORT_30MIN
    ];
    
    const outputPath = path.join(TEST_OUTPUT_DIR, 'batch.md');
    
    await server['processBatchTranscripts'](
      videoUrls,
      'aggregated',
      outputPath
    );
    
    const content = await fs.readFile(outputPath, 'utf-8');
    
    // Verify header
    expect(content).toContain('# Batch Transcript: 2 videos');
    
    // Verify section separators
    expect(content).toContain('---');
    
    // Verify metadata
    expect(content).toContain('**Source:**');
    expect(content).toContain('**Status:**');
  }, 180000); // 3min timeout
});
```

**Acceptance Criteria:**
- [ ] Integration tests pass with real YouTube videos
- [ ] Throttling verified (delays logged)
- [ ] Mixed success/failure scenarios handled
- [ ] Aggregated file format verified

---

### Phase 3 Deliverables

- [ ] Aggregated mode implementation complete
- [ ] Section markers between videos
- [ ] Metadata included for each video
- [ ] Failed videos included in aggregated output
- [ ] Unit tests for aggregated mode
- [ ] Integration tests for batch processing

**Estimated Time:** 4-6 hours  
**Risk:** Low (reuses existing streaming patterns)

---

## Phase 4: Security & Edge Cases

### Objective
Ensure batch tool is secure and handles edge cases correctly.

### Tasks

#### 4.1 Security Tests
**File:** `tests/security.test.ts`

**New Test Cases:**
```typescript
describe('Batch Transcripts - Security', () => {
  it('should block path traversal in aggregated mode', () => {
    const args = {
      video_urls: ['https://youtube.com/watch?v=test'],
      output_mode: 'aggregated',
      output_path: '../../../etc/passwd'
    };
    
    expect(() => {
      validateOutputPath(args.output_path);
    }).toThrow(McpError);
  });

  it('should block path traversal in individual mode', () => {
    const args = {
      video_urls: ['https://youtube.com/watch?v=test'],
      output_mode: 'individual',
      output_path: '../../../tmp/'
    };
    
    expect(() => {
      validateOutputPath(args.output_path);
    }).toThrow(McpError);
  });

  it('should reject non-array video_urls', () => {
    const args = {
      video_urls: 'not-an-array',
      output_mode: 'individual',
      output_path: 'out/'
    };
    
    expect(isValidBatchGetTranscriptsArgs(args)).toBe(false);
  });
});
```

**Acceptance Criteria:**
- [ ] Path traversal attempts rejected
- [ ] Array validation enforced
- [ ] Max length enforced
- [ ] All security tests pass

---

#### 4.2 Edge Case Handling

**Test Cases:**
1. **Empty transcript**: Video has no transcript available
2. **Very long batch**: 50 videos (max limit)
3. **Duplicate URLs**: Same video multiple times
4. **Mixed URL formats**: Standard, Shorts, youtu.be
5. **Filename collisions**: Two videos with same first 5 words

**Implementation Notes:**
- Empty transcripts: Already handled (marked as failed)
- Long batches: Tested in integration tests
- Duplicates: Allowed (each gets unique filename with index)
- Mixed formats: Already handled (URL normalization)
- Collisions: Prevented by video ID suffix

**Acceptance Criteria:**
- [ ] All edge cases documented
- [ ] Tests added for critical edge cases
- [ ] Error messages actionable

---

### Phase 4 Deliverables

- [ ] Security tests pass (path validation)
- [ ] Edge cases handled correctly
- [ ] Error messages user-friendly
- [ ] Documentation updated with limitations

**Estimated Time:** 2-4 hours  
**Risk:** Low (reuses existing security patterns)

---

## Phase 5: Documentation & Review

### Objective
Update documentation and prepare for code review.

### Tasks

#### 5.1 Update README
**File:** `README.md`

**New Section:**
```markdown
## Batch Transcript Processing

Process multiple YouTube videos in a single operation with aggregated or individual output modes.

### Tool: `batch_get_transcripts`

**Arguments:**
- `video_urls` (array of strings, required): List of YouTube video URLs (1-50 videos)
- `output_mode` (string, required): Output mode - `aggregated` (single file) or `individual` (separate files)
- `output_path` (string, required): File path for aggregated mode, directory path for individual mode

**Examples:**

Aggregated Mode (combine into single file):
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

Individual Mode (separate files):
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

**Performance:**
- Processing time: ~4 seconds per video (includes 2s throttle delay)
- Batch size limit: 50 videos maximum
- Example: 10 video batch = ~40 seconds total

**Error Handling:**
Batch processing continues even if individual videos fail. Response includes detailed summary of successes and failures.

**Limitations:**
- Maximum 50 videos per batch
- Sequential processing only (no parallelization)
- Playlist URLs not supported (extract video URLs manually)
```

**Acceptance Criteria:**
- [ ] README updated with batch tool documentation
- [ ] Examples provided for both modes
- [ ] Performance characteristics documented
- [ ] Limitations clearly stated

---

#### 5.2 Update Tool Description
**File:** `src/index.ts` (tool registration)

**Enhanced Description:**
```typescript
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
- Playlist URLs not supported (extract video URLs manually)`
```

**Acceptance Criteria:**
- [ ] Tool description comprehensive
- [ ] Key features highlighted
- [ ] Performance expectations clear

---

#### 5.3 Code Review Preparation

**Checklist:**
- [ ] All tests passing (unit + integration + security)
- [ ] Code follows existing patterns (streaming, throttling, validation)
- [ ] TypeScript compilation succeeds with no errors
- [ ] No console.log statements (only console.error for progress)
- [ ] Error messages user-friendly and actionable
- [ ] Comments added for complex logic
- [ ] No code duplication (DRY principle followed)

---

### Phase 5 Deliverables

- [ ] README updated with batch tool documentation
- [ ] Tool description enhanced
- [ ] Code review checklist completed
- [ ] All tests passing
- [ ] Documentation reviewed for accuracy

**Estimated Time:** 2-4 hours  
**Risk:** Low (documentation and review)

---

## Testing Summary

### Unit Tests (New)
**File:** `tests/unit/batch-get-transcripts.test.ts`

**Coverage:**
- Input validation (empty array, max length, invalid mode)
- Video ID extraction (standard, Shorts, youtu.be URLs)
- Type guards (batch arguments)
- Response formatting
- Error categorization

**Estimated Lines:** ~200

---

### Integration Tests (New)
**File:** `tests/integration/batch-youtube-api.test.ts`

**Coverage:**
- 3 video batch with throttling
- Mixed success/failure scenarios
- Aggregated file format verification
- Individual files creation
- Memory usage verification

**Estimated Lines:** ~150

---

### Security Tests (Extended)
**File:** `tests/security.test.ts`

**New Coverage:**
- Batch path validation (aggregated + individual modes)
- Array validation (type, length)
- Enum validation (output_mode)

**Estimated Lines:** ~50

---

### Manual Test Plan

**Test 1: Aggregated Mode (All Successful)**
- Input: 3 valid YouTube URLs, aggregated mode
- Expected: Single file with 3 sections, all successful

**Test 2: Individual Mode (Mixed Results)**
- Input: 2 valid + 1 invalid URL, individual mode
- Expected: 2 files created, 1 failure in summary

**Test 3: Throttling Verification**
- Input: 5 valid URLs
- Expected: Console logs show throttle delays, ~20-30s total

**Test 4: Empty Array Rejection**
- Input: Empty video_urls array
- Expected: Validation error

**Test 5: Max Batch Size Enforcement**
- Input: 51 URLs
- Expected: Validation error

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Rate limiting during batch | High | Low | Throttler handles delays; sequential processing prevents bursts |
| Memory spike in aggregated mode | Medium | Low | Streaming write maintains <100MB constraint |
| Filename collisions | Low | Low | Video ID suffix ensures uniqueness |
| Breaking existing tool | High | Very Low | Refactoring verified by regression tests |

### Performance Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Batch timeout (50 videos) | Medium | Document expected duration (~3-5 minutes); user-configurable throttle delay |
| Slow sequential processing | Low | Future enhancement: parallel processing with concurrency control |

---

## Files Modified

### Source Files
1. **src/index.ts**
   - Lines added: ~320 (150 new + 170 refactored)
   - Lines before: 384
   - Lines after: ~700
   - Changes:
     - Extract 6 new private methods (refactoring)
     - Add 3 new type interfaces
     - Add batch tool registration
     - Add batch tool handler
     - Add batch processing logic (individual + aggregated modes)

### Test Files
1. **tests/unit/batch-get-transcripts.test.ts** (NEW)
   - Lines: ~200
   - Coverage: Input validation, video ID extraction, type guards

2. **tests/integration/batch-youtube-api.test.ts** (NEW)
   - Lines: ~150
   - Coverage: Real YouTube API calls, throttling, mixed results

3. **tests/security.test.ts** (MODIFIED)
   - Lines added: ~50
   - Coverage: Batch-specific path validation

### Documentation Files
1. **README.md** (MODIFIED)
   - New section: Batch Transcript Processing
   - Examples for aggregated and individual modes
   - Performance characteristics

---

## Dependencies

### Blocking Dependencies
1. **Request Throttling (#3)** - REQUIRED
   - Must be implemented before batch feature
   - Batch processing triggers rate limits without throttling
   - Integration: Reuses `this.throttler.throttle()` wrapper

### No New External Dependencies
- All functionality uses existing dependencies
- `@modelcontextprotocol/sdk: 0.6.0` (unchanged)
- `youtube-transcript: ^1.2.1` (unchanged)
- `he: ^1.2.0` (unchanged)

---

## Backward Compatibility

### Guarantees
- [ ] Existing `get_transcript_and_save` tool works identically
- [ ] No breaking changes to API
- [ ] Configuration preserved (throttling environment variables)
- [ ] Security patterns maintained (path validation)

### Verification
- [ ] All existing tests pass (100% regression safety)
- [ ] Manual testing of existing tool
- [ ] Performance benchmarks unchanged

---

## Success Criteria

### Functional Requirements
- [ ] Batch tool accepts 1-50 video URLs
- [ ] Aggregated mode creates single file with section markers
- [ ] Individual mode creates separate files per video
- [ ] Failed videos don't halt batch processing
- [ ] Summary shows success/failure counts with details
- [ ] Throttling prevents rate limiting
- [ ] Existing tool works identically (no regression)

### Quality Requirements
- [ ] Test coverage ≥95% for new code
- [ ] Security tests pass (path validation)
- [ ] Integration tests verify throttling behavior
- [ ] Memory usage <200MB for 50 video batch

### User Experience
- [ ] Clear success/failure feedback
- [ ] Actionable error messages
- [ ] Reasonable performance (50 videos < 5 minutes)
- [ ] Progress visibility via console logs

---

## Implementation Timeline

**Total Estimated Time:** 26-38 hours (3.5-5 days)

### Day 1: Refactoring (8-12 hours)
- Extract `processSingleTranscript()` and helper methods
- Add type interfaces
- Update existing tool handler
- Run regression tests

### Day 2: Batch Logic (6-8 hours)
- Add tool registration and type guard
- Implement individual mode
- Add video ID extraction
- Write unit tests

### Day 3: Aggregated Mode (4-6 hours)
- Implement aggregated processing
- Add section markers and metadata
- Write unit tests

### Day 4: Testing (6-8 hours)
- Integration tests (batch with throttling)
- Security tests (path validation)
- Manual testing (all test cases)
- Edge case handling

### Day 5: Documentation & Review (2-4 hours)
- Update README
- Enhance tool description
- Code review preparation
- Final regression testing

---

## Next Steps

1. **Verify Request Throttling (#3)** - Ensure implemented and functional
2. **Start Phase 1** - Begin refactoring existing code
3. **Run Regression Tests** - Verify no behavior changes after refactoring
4. **Proceed to Phase 2** - Implement batch tool (individual mode first)
5. **Integration Testing** - Test with real YouTube videos
6. **Documentation** - Update README and tool descriptions
7. **Code Review** - Submit PR for review

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-09T16:58:45Z  
**Status:** Ready for Implementation
