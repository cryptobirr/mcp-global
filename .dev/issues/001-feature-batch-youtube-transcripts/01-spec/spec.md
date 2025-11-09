# Feature Specification: Batch YouTube Transcript Processing

**Issue:** #1  
**Feature Type:** Backend  
**Complexity:** Moderate  
**Approach:** Brownfield (extends existing tool)  
**Created:** 2025-11-09T16:41:53Z  
**Status:** Draft

---

## Executive Summary

Add batch processing capability to YouTube MCP Server, enabling users to fetch transcripts for multiple videos in a single operation with configurable output modes (aggregated or individual files) and robust error handling that continues processing despite individual video failures.

**Impact:** Reduces user interaction overhead from N tool calls to 1 tool call for batch operations. Critical for research, content analysis, and documentation workflows involving multiple videos.

**Dependencies:** Requires request throttling (#3) to be functional to prevent YouTube rate limiting during batch operations.

---

## Problem Statement

### Current Limitations
1. **One video per call**: Users must invoke `get_transcript_and_save` separately for each video
2. **No aggregation support**: No way to combine multiple transcripts into a single document
3. **Manual orchestration**: Users must implement their own batch logic and error handling
4. **No progress visibility**: No feedback during multi-video processing

### User Pain Points
- Researchers processing 10+ video playlists waste time on repetitive tool calls
- Content analysts manually combine transcripts into single reference documents
- Failed transcripts require full workflow restart (no partial results)

---

## Proposed Solution

### New Tool: `batch_get_transcripts`

Add batch processing tool that:
1. Accepts array of YouTube video URLs
2. Supports two output modes: `aggregated` (single file) or `individual` (separate files)
3. Continues processing on individual video failures
4. Returns detailed success/failure summary with file paths
5. Leverages existing throttling infrastructure (#3) for rate limit prevention

### Architecture Decision
- **Reuse over rewrite**: Leverage existing `get_transcript_and_save` logic via internal refactor
- **Fail-safe design**: Each video processed in try-catch block; failures logged but don't halt batch
- **Memory efficiency**: Maintain streaming approach for individual transcripts (existing optimization)

---

## Technical Design

### 1. Tool Definition

```typescript
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
```

**Validation Rules:**
- `video_urls`: Min 1, max 50 (prevent excessive batch sizes)
- `output_path`: Must pass existing `validateOutputPath()` security checks
- `output_mode`: Strictly enum-validated (prevent invalid modes)

### 2. Code Architecture

**Location:** `servers/binaries/youtube-mcp-server/src/index.ts`

**Changes Required:**

#### A. Refactor Existing Logic (DRY Principle)
Extract transcript processing into reusable function:

```typescript
/**
 * Processes a single YouTube transcript with streaming optimization
 * @returns TranscriptResult with success status, file path, and optional error
 */
private async processSingleTranscript(
  videoUrl: string,
  outputPath: string
): Promise<TranscriptResult> {
  // Move lines 164-367 (current get_transcript_and_save logic) here
  // Return structured result instead of MCP response
}

interface TranscriptResult {
  success: boolean;
  videoUrl: string;
  filePath?: string;      // Populated on success
  title?: string;         // Video title (from first 10 words)
  error?: string;         // Error message on failure
  duration?: string;      // Future: video duration metadata
}
```

#### B. Implement Batch Processing
```typescript
private async processBatchTranscripts(
  videoUrls: string[],
  outputMode: 'aggregated' | 'individual',
  outputPath: string
): Promise<BatchResult> {
  const results: TranscriptResult[] = [];
  
  if (outputMode === 'individual') {
    // Ensure output directory exists
    await fs.mkdir(path.resolve(CLINE_CWD, outputPath), { recursive: true });
    
    // Process each video sequentially (leverages throttler)
    for (const url of videoUrls) {
      const filename = `transcript-${Date.now()}.md`; // Auto-generated
      const filePath = path.join(outputPath, filename);
      
      try {
        const result = await this.processSingleTranscript(url, filePath);
        results.push(result);
      } catch (error) {
        // Capture failure but continue processing
        results.push({
          success: false,
          videoUrl: url,
          error: error.message || 'Unknown error'
        });
      }
    }
  } else {
    // Aggregated mode: fetch all transcripts first, then combine
    for (const url of videoUrls) {
      // Process to temporary in-memory storage
      // (Implementation detail: may need temp files for streaming efficiency)
    }
    
    // Combine into single file with section markers
    await this.writeAggregatedTranscript(results, outputPath);
  }
  
  return { results, outputPath, mode: outputMode };
}
```

#### C. Aggregated Output Format
```markdown
# Batch Transcript: {N} videos
**Created:** {ISO-8601 timestamp}
**Mode:** Aggregated

---

## Video 1: {Title from first 10 words}
**Source:** {video_url}
**Status:** Success
**Duration:** {duration if available}

{Transcript content with streaming processing}

---

## Video 2: {Title}
**Source:** {video_url}
**Status:** Failed
**Error:** TranscriptsDisabled

---

## Video 3: {Title}
...
```

**Section Markers:**
- Use `---` (triple dash) as primary separator
- Include metadata block for each video (source URL, status, error if failed)
- Maintain chronological order matching input `video_urls` array

### 3. Error Handling Strategy

**Principles:**
1. **Fail-safe by default**: Individual video errors don't halt batch
2. **Transparent failures**: All errors included in results summary
3. **Actionable feedback**: Specific error messages (e.g., "TranscriptsDisabled" vs generic failure)

**Error Classification:**

| Error Type | Handling | Example |
|------------|----------|---------|
| Invalid URL format | Skip video, log error | Malformed URL string |
| Transcripts disabled | Skip video, note in summary | YouTube privacy setting |
| Rate limit (429) | Throttler handles retry | YouTube blocking |
| Network timeout | Skip after throttler exhausts retries | Connection failure |
| Path traversal attempt | Reject entire batch | Security violation |
| Empty video_urls array | Reject immediately | Validation failure |

**Batch-Level Failures (halt processing):**
- Output path validation failure (security risk)
- Unable to create output directory (filesystem issue)
- Empty `video_urls` array (invalid request)

**Video-Level Failures (continue processing):**
- Transcript fetch failure (network, API error)
- Transcripts disabled for video
- Invalid video ID

### 4. Integration with Request Throttling

**Critical:** Batch operations MUST use existing `RequestThrottler` class to prevent YouTube rate limiting.

**Throttling Behavior:**
```typescript
// Already integrated in processSingleTranscript via:
const transcriptEntries = await this.throttler.throttle(
  () => YoutubeTranscript.fetchTranscript(video_url)
);
```

**Batch Processing Impact:**
- 10 video batch with default 2000ms delay = ~20 seconds minimum processing time
- Users can configure via environment variables (see throttle.ts config)
- Progress logging shows throttle delays: `"Throttling: waiting 1800ms before next request"`

**Configuration (inherited from #3):**
- `YOUTUBE_MIN_DELAY`: Minimum delay between requests (default: 2000ms)
- `YOUTUBE_MAX_RETRIES`: Retry attempts on rate limit (default: 3)
- `YOUTUBE_BACKOFF_MULTIPLIER`: Exponential backoff factor (default: 2)
- `YOUTUBE_JITTER`: Add randomness to delays (default: true)

---

## API Contract

### Input Schema

```typescript
interface BatchGetTranscriptsArgs {
  video_urls: string[];          // Required, 1-50 URLs
  output_mode: 'aggregated' | 'individual';  // Required
  output_path: string;           // Required, relative to CWD
}
```

**Validation:**
- `video_urls`: Non-empty array, max 50 items, each item is string
- `output_mode`: Enum validation (only 'aggregated' or 'individual')
- `output_path`: Must pass `validateOutputPath()` security checks

**Security:**
- Path traversal prevention (reuse existing `validateOutputPath()`)
- No absolute paths allowed
- No `../` or `..\` sequences
- Must resolve within `CLINE_CWD`

### Output Schema

**Success Response:**
```typescript
{
  content: [{
    type: 'text',
    text: `Batch processing complete:
- Total: ${total} videos
- Successful: ${successful} transcripts
- Failed: ${failed} transcripts

Successful transcripts:
${successList.map(r => `✓ ${r.filePath}`).join('\n')}

Failed transcripts:
${failureList.map(r => `✗ ${r.videoUrl}: ${r.error}`).join('\n')}

Output: ${outputPath} (${outputMode} mode)`
  }]
}
```

**Error Response (batch-level failure):**
```typescript
{
  content: [{
    type: 'text',
    text: 'Batch processing failed: {reason}'
  }],
  isError: true
}
```

**Output Examples:**

*Aggregated mode (all successful):*
```
Batch processing complete:
- Total: 3 videos
- Successful: 3 transcripts
- Failed: 0 transcripts

Output: transcripts/batch-2025-11-09.md (aggregated mode)
```

*Individual mode (mixed results):*
```
Batch processing complete:
- Total: 5 videos
- Successful: 4 transcripts
- Failed: 1 transcript

Successful transcripts:
✓ transcripts/video-intro-to-ai.md
✓ transcripts/machine-learning-basics.md
✓ transcripts/neural-networks-explained.md
✓ transcripts/deep-learning-tutorial.md

Failed transcripts:
✗ https://youtube.com/watch?v=xyz123: Transcripts are disabled for the video

Output: transcripts/ (individual mode)
```

---

## File Structure Changes

### Modified Files
1. **`src/index.ts`** (primary changes)
   - Extract `processSingleTranscript()` method (refactor existing logic)
   - Add `processBatchTranscripts()` method (new)
   - Add `writeAggregatedTranscript()` helper (new)
   - Update `ListToolsRequestSchema` handler (add batch tool definition)
   - Update `CallToolRequestSchema` handler (add batch tool route)
   - Add `BatchGetTranscriptsArgs` interface (new type)
   - Add `TranscriptResult` interface (new type)
   - Add `BatchResult` interface (new type)

2. **`src/throttle.ts`** (no changes required)
   - Existing throttler works for batch operations via sequential processing

### New Files
None (all changes in existing `index.ts`)

### File Size Impact
- **Current `index.ts`**: 384 lines
- **Estimated after changes**: ~520 lines (+136 lines)
  - Refactored single transcript function: ~150 lines (moved)
  - Batch processing logic: ~80 lines (new)
  - Aggregated output formatting: ~40 lines (new)
  - Type definitions: ~16 lines (new)

---

## Data Flow

### Aggregated Mode
```
User Request
  ↓
Validate inputs (video_urls, output_path, output_mode)
  ↓
For each video URL (sequential):
  ↓
  Apply throttling (RequestThrottler.throttle)
  ↓
  Fetch transcript (YoutubeTranscript.fetchTranscript)
  ↓
  Stream to temporary storage
  ↓
  Capture result (success/failure)
  ↓
Combine all transcripts into single file
  ↓
Write aggregated markdown file with section markers
  ↓
Return summary (success count, failure count, file path)
```

### Individual Mode
```
User Request
  ↓
Validate inputs (video_urls, output_path, output_mode)
  ↓
Create output directory (if not exists)
  ↓
For each video URL (sequential):
  ↓
  Apply throttling (RequestThrottler.throttle)
  ↓
  Fetch transcript (YoutubeTranscript.fetchTranscript)
  ↓
  Generate filename from video title
  ↓
  Stream to individual file (path.join(output_path, filename))
  ↓
  Capture result (success/failure)
  ↓
Return summary (list of created files, failures)
```

### Error Handling Flow
```
Video processing error occurs
  ↓
Is it a batch-level error? (path validation, empty array)
  ├─ YES → Halt immediately, return error response
  └─ NO → Continue to next video
        ↓
        Log failure in TranscriptResult
        ↓
        Include in final summary (failed transcripts section)
        ↓
        User sees which videos failed and why
```

---

## Memory & Performance Considerations

### Memory Efficiency
1. **Streaming preserved**: Each transcript uses existing streaming logic (~100MB peak for 60k+ entries)
2. **Sequential processing**: Only 1 transcript in memory at a time (no parallelization)
3. **Aggregated mode caveat**: May need temporary files for very large batches (10+ long videos)

### Performance Profile
- **Baseline (existing)**: 1 video = ~2-5 seconds (throttle delay + fetch + write)
- **Batch (new)**: N videos = N × (2-5 seconds) sequential processing
- **Example**: 10 video batch = ~20-50 seconds total
- **Bottleneck**: YouTube rate limiting (intentional via throttling)

### Optimization Opportunities (Future)
1. Parallel processing with concurrency limit (e.g., 3 concurrent requests)
2. Chunk-based aggregation (stream directly to aggregated file vs temp storage)
3. Caching for duplicate URLs in batch

**Note:** Initial implementation prioritizes reliability over speed. Parallelization deferred to avoid complex rate limit coordination.

---

## Testing Requirements

### Unit Tests
1. **Input validation**
   - Empty `video_urls` array → rejection
   - Invalid `output_mode` → rejection
   - Path traversal attempts → rejection
   - Max array length enforcement (51 URLs → rejection)

2. **Refactored single transcript function**
   - Maintains existing behavior (regression tests)
   - Returns structured `TranscriptResult` correctly

3. **Batch processing logic**
   - Individual mode creates separate files
   - Aggregated mode combines with correct format
   - Failure isolation (1 failed video doesn't stop batch)

### Integration Tests
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

### Security Tests
1. **Path validation**
   - Batch tool reuses `validateOutputPath()` (existing security tests apply)
   - Aggregated path traversal attempts rejected
   - Individual directory traversal attempts rejected

### Manual Test Cases
1. **Aggregated mode (all successful)**
   - Input: 3 valid video URLs, `output_mode: 'aggregated'`, `output_path: 'batch.md'`
   - Expected: Single file created with 3 sections, success summary

2. **Individual mode (mixed results)**
   - Input: 2 valid + 1 invalid URL, `output_mode: 'individual'`, `output_path: 'transcripts/'`
   - Expected: 2 files created, 1 failure in summary

3. **Throttling verification**
   - Input: 5 valid URLs
   - Expected: Logs show "Throttling: waiting Xms" between requests

4. **Empty array rejection**
   - Input: `video_urls: []`
   - Expected: Immediate rejection with validation error

---

## Backward Compatibility

### Guarantees
1. **Existing tool unchanged**: `get_transcript_and_save` continues working identically
2. **No breaking changes**: Refactored logic maintains exact same behavior
3. **Configuration preserved**: Throttling environment variables work for both tools

### Migration Path
- No migration required (additive feature)
- Users can adopt batch tool incrementally
- Single-video workflows continue using existing tool (no performance impact)

---

## Dependencies

### Internal Dependencies
1. **Request Throttling (#3)**: REQUIRED
   - Batch operations will trigger rate limits without throttling
   - Must be implemented/functional before batch feature ships

### External Dependencies
- `@modelcontextprotocol/sdk: 0.6.0` (unchanged)
- `youtube-transcript: ^1.2.1` (unchanged)
- `he: ^1.2.0` (unchanged, for HTML entity decoding)
- Node.js: `^20.11.24` (unchanged)

---

## Edge Cases & Constraints

### Batch Size Limits
- **Hard limit**: 50 videos per batch (enforced via `maxItems: 50`)
- **Reasoning**: 50 videos × 3 seconds = ~2.5 minutes (acceptable UX), prevents abuse
- **User workaround**: Split large batches into multiple calls

### Shorts URL Conversion
- Existing logic converts `youtube.com/shorts/ID` → `youtube.com/watch?v=ID`
- Applies to batch tool automatically (reused logic)

### Filename Conflicts (Individual Mode)
- **Risk**: Two videos with same title → filename collision
- **Mitigation**: Append timestamp suffix: `transcript-${Date.now()}.md`
- **Future enhancement**: Append video ID for guaranteed uniqueness

### Empty Transcripts
- **Scenario**: Video has no transcript available
- **Handling**: Treated as failure, included in "Failed transcripts" summary
- **Error message**: "No transcript found or available for {url}"

### Aggregated File Size
- **Risk**: 50 long videos → multi-MB aggregated file
- **Mitigation**: Streaming write (existing optimization) handles large files
- **User control**: Batch size limit (50 max) caps worst-case file size

---

## Open Questions

1. **Filename strategy for individual mode**
   - Current: Auto-generated from first 5 words of transcript
   - Alternative: Use video ID (guaranteed unique but less readable)
   - Decision: Keep existing strategy, add timestamp for collision prevention

2. **Progress reporting during batch**
   - Current: Only `console.error` logs (not visible to MCP clients)
   - Future: Streaming progress updates via MCP protocol (requires SDK support)
   - Decision: Defer to future enhancement (SDK limitation)

3. **Parallel processing**
   - Current: Sequential processing (simple, reliable)
   - Future: Concurrent requests with rate limit coordination
   - Decision: Sequential for v1, revisit based on user feedback

4. **Aggregated file metadata**
   - Include video durations? (requires additional API call)
   - Include timestamps for each section?
   - Decision: Add timestamps only (no additional API calls needed)

---

## Out of Scope

### Explicitly Not Included
1. **Playlist URL support**: Users must extract individual video URLs manually
2. **Video metadata fetching**: No duration, view count, upload date (requires separate API)
3. **Parallel processing**: Sequential only (see Open Questions)
4. **Resume capability**: Failed batches must be retried manually
5. **Custom section templates**: Aggregated format is fixed
6. **Video filtering**: No skip-if-already-processed logic

### Future Enhancements
- Playlist URL parsing (extract all video IDs automatically)
- Parallel processing with concurrency control
- Batch operation pause/resume
- Custom aggregated file templates
- Video metadata enrichment (title, duration, upload date)

---

## Success Metrics

### Functional Success
- [ ] Batch tool accepts 1-50 video URLs
- [ ] Aggregated mode creates single file with section markers
- [ ] Individual mode creates separate files per video
- [ ] Failed videos don't halt batch processing
- [ ] Summary shows success/failure counts with details
- [ ] Throttling prevents rate limiting during batch operations
- [ ] Existing `get_transcript_and_save` tool works identically (no regression)

### Quality Metrics
- [ ] 100% test coverage for new batch processing code
- [ ] Security tests pass (path validation)
- [ ] Integration tests verify throttling behavior
- [ ] Memory usage <200MB for 50 video batch (streaming efficiency)

### User Experience
- [ ] Clear success/failure feedback in summary
- [ ] Actionable error messages (e.g., "Transcripts disabled" vs generic failure)
- [ ] Reasonable performance (50 videos < 5 minutes)

---

## Implementation Checklist

### Phase 1: Refactoring (Day 1)
- [ ] Extract `processSingleTranscript()` from existing tool handler
- [ ] Add `TranscriptResult` interface
- [ ] Update existing tool to use refactored function
- [ ] Run existing tests (ensure no regression)

### Phase 2: Batch Logic (Day 2)
- [ ] Implement `processBatchTranscripts()` for individual mode
- [ ] Add input validation for batch arguments
- [ ] Add batch tool to `ListToolsRequestSchema` handler
- [ ] Add batch tool route to `CallToolRequestSchema` handler
- [ ] Write unit tests for individual mode

### Phase 3: Aggregated Mode (Day 3)
- [ ] Implement `writeAggregatedTranscript()` helper
- [ ] Add aggregated mode logic to `processBatchTranscripts()`
- [ ] Write unit tests for aggregated mode
- [ ] Write integration test (3 videos, mixed results)

### Phase 4: Testing & Refinement (Day 4)
- [ ] Add security tests (path validation)
- [ ] Add throttling integration test
- [ ] Manual testing (all test cases from Testing Requirements)
- [ ] Update documentation (README, tool descriptions)

### Phase 5: Review & Merge (Day 5)
- [ ] Code review
- [ ] Performance profiling (memory, execution time)
- [ ] Final regression testing
- [ ] Merge to main

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Rate limiting during batch | High | Medium | Requires throttling (#3) implementation first |
| Large aggregated files crash server | Medium | Low | Streaming write handles large files (existing optimization) |
| Filename collisions (individual mode) | Low | Medium | Timestamp suffix prevents collisions |
| Batch timeout (50 videos × 5s = 4+ min) | Medium | Medium | Document expected duration, consider lowering max batch size |
| Memory leak in refactored code | High | Low | Reuse existing streaming logic (proven reliable) |

---

## Approval & Sign-Off

**Technical Lead:** _Pending review_  
**Security Review:** _Pending review_  
**Product Owner:** _Pending review_  

**Definition of Done:**
- [ ] All acceptance criteria met (see issue #1)
- [ ] Test coverage ≥95% for new code
- [ ] Security tests pass (path validation)
- [ ] Documentation updated (README, API docs)
- [ ] No regressions in existing functionality
- [ ] Performance acceptable (50 videos < 5 minutes)

---

## References

- **Issue:** [#1 - Batch process multiple YouTube transcripts](https://github.com/cryptobirr/mcp-global/issues/1)
- **Related:** [#3 - Request throttling for YouTube blocking prevention](https://github.com/cryptobirr/mcp-global/issues/3)
- **Codebase:** `servers/binaries/youtube-mcp-server/src/index.ts`
- **Dependencies:** `package.json` line 29-31
- **MCP SDK Docs:** [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-09T16:41:53Z  
**Status:** Ready for Review
