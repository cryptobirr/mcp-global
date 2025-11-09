# Specification: Reduce Function Complexity - Split processBatchTranscripts()

**Issue**: #23  
**Parent Issue**: #1  
**Created**: 2025-11-09T21:28:19Z  
**Last Updated**: 2025-11-09T21:28:19Z

---

## Overview

**Problem**: The `processBatchTranscripts()` method in `src/index.ts` has high cyclomatic complexity (15+ branches, 120 lines), reducing code quality score from 97% to 90%. This creates maintainability issues and violates the Single Responsibility Principle.

**Solution**: Extract aggregated mode and individual mode logic into separate, focused methods that each handle a single output mode with clear responsibilities.

**Impact**: +4% code quality improvement (90% → 94%), improved maintainability, reduced cognitive load.

---

## Feature Classification

- **Type**: Backend (Code Quality Refactoring)
- **Complexity**: Simple
- **Approach**: Brownfield (refactoring existing code)
- **UX Required**: false

---

## Current State Analysis

### Existing Method Structure
```typescript
private async processBatchTranscripts(
  videoUrls: string[],
  outputMode: 'aggregated' | 'individual',
  outputPath: string
): Promise<BatchResult> {
  // Lines 598-772 (175 lines total, 120 lines of business logic)
  
  if (outputMode === 'individual') {
    // Branch 1: Individual mode (lines 605-642)
    // - 7 branches (validation, loop, ID extraction, error handling)
    // - 38 lines of logic
  } else {
    // Branch 2: Aggregated mode (lines 643-762)
    // - 8+ branches (validation, loop, stream writing, error handling)
    // - 120 lines of logic
  }
  
  // Shared result aggregation (lines 764-771)
}
```

### Complexity Sources
1. **Dual-mode orchestration**: Single method handles two distinct processing patterns
2. **Nested loops with error handling**: `for` loop + try/catch per video + conditional error writing
3. **Stream management**: File stream lifecycle interleaved with video processing
4. **Inline result aggregation**: Results array manipulation within mode-specific logic
5. **Mixed abstraction levels**: High-level orchestration + low-level stream operations

### Code Quality Impact
- **Current Score**: 90%
- **Gap to Target**: 7% (target: 97%)
- **Root Cause**: Single method with 15+ decision points
- **Estimated Improvement**: +4% (reduces complexity by 60%)

---

## Proposed Solution

### Refactoring Strategy
Extract two private methods with single responsibilities:

```typescript
// High-level orchestrator (remains in processBatchTranscripts)
private async processBatchTranscripts(
  videoUrls: string[],
  outputMode: 'aggregated' | 'individual',
  outputPath: string
): Promise<BatchResult> {
  // Route to appropriate mode handler (2 branches max)
  if (outputMode === 'individual') {
    return this.processIndividualMode(videoUrls, outputPath);
  } else {
    return this.processAggregatedMode(videoUrls, outputPath);
  }
}

// New method 1: Individual mode (Simple - 6 branches)
private async processIndividualMode(
  videoUrls: string[],
  outputPath: string
): Promise<BatchResult> {
  // Handles only individual file creation
  // Branches: validation, loop, ID extraction, error handling
  // ~40 lines
}

// New method 2: Aggregated mode (Moderate - 7 branches)
private async processAggregatedMode(
  videoUrls: string[],
  outputPath: string
): Promise<BatchResult> {
  // Handles only single-file aggregation
  // Branches: validation, stream setup, loop, content writing, error handling
  // ~125 lines (inherently more complex due to stream management)
}
```

### Design Principles
1. **Single Responsibility**: Each method handles exactly one output mode
2. **Consistent Abstraction**: All mode handlers operate at same level (video processing)
3. **Minimal Interface**: Each method returns `BatchResult` (existing interface)
4. **Zero Duplication**: Reuse existing helpers (`processSingleTranscript()`, `categorizeError()`, etc.)
5. **Backward Compatibility**: Public API unchanged, refactor is internal-only

---

## Technical Specification

### Method 1: processIndividualMode()

**Signature**:
```typescript
private async processIndividualMode(
  videoUrls: string[],
  outputPath: string
): Promise<BatchResult>
```

**Responsibilities**:
- Validate directory path
- Create output directory
- Process each video sequentially
- Generate unique filenames using video IDs
- Collect results for BatchResult

**Implementation** (extracted from lines 605-642):
```typescript
private async processIndividualMode(
  videoUrls: string[],
  outputPath: string
): Promise<BatchResult> {
  const results: TranscriptResult[] = [];
  
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
        errorType: 'Unknown',
      });
      
      console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
    }
  }
  
  return {
    results,
    outputPath,
    mode: 'individual',
    totalVideos: videoUrls.length,
    successfulVideos: results.filter(r => r.success).length,
    failedVideos: results.filter(r => !r.success).length,
  };
}
```

**Complexity Metrics**:
- **Branches**: 6 (validation, loop, ID extraction, try/catch, result filtering x2)
- **Lines**: ~42
- **Cyclomatic Complexity**: 7 (within threshold)

---

### Method 2: processAggregatedMode()

**Signature**:
```typescript
private async processAggregatedMode(
  videoUrls: string[],
  outputPath: string
): Promise<BatchResult>
```

**Responsibilities**:
- Validate file path
- Create write stream with header
- Process each video sequentially
- Stream transcript content directly to file
- Handle section separators
- Collect results for BatchResult

**Implementation** (extracted from lines 643-762):
```typescript
private async processAggregatedMode(
  videoUrls: string[],
  outputPath: string
): Promise<BatchResult> {
  const results: TranscriptResult[] = [];
  
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
          errorType: 'NotFound',
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
        filePath: path.relative(CLINE_CWD, absolutePath),
        title,
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
        errorType: type,
      });
      
      console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
    }
  }
  
  // Close stream
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });
  
  console.error(`Aggregated batch transcript saved to: ${absolutePath}`);
  
  return {
    results,
    outputPath,
    mode: 'aggregated',
    totalVideos: videoUrls.length,
    successfulVideos: results.filter(r => r.success).length,
    failedVideos: results.filter(r => !r.success).length,
  };
}
```

**Complexity Metrics**:
- **Branches**: 7 (validation, stream setup, loop, separator, empty check, chunking loop, error handling)
- **Lines**: ~125
- **Cyclomatic Complexity**: 8 (acceptable for aggregated stream processing)
- **Note**: Higher complexity than individual mode is justified by streaming requirements

---

### Updated processBatchTranscripts()

**New Implementation** (orchestrator only):
```typescript
private async processBatchTranscripts(
  videoUrls: string[],
  outputMode: 'aggregated' | 'individual',
  outputPath: string
): Promise<BatchResult> {
  // Simple router - delegates to mode-specific handlers
  if (outputMode === 'individual') {
    return this.processIndividualMode(videoUrls, outputPath);
  } else {
    return this.processAggregatedMode(videoUrls, outputPath);
  }
}
```

**Complexity Metrics**:
- **Branches**: 2 (single if/else)
- **Lines**: 8
- **Cyclomatic Complexity**: 2 (minimal - pure orchestration)

---

## Validation Criteria

### Code Quality Metrics
- [ ] `processBatchTranscripts()` reduced to ≤10 lines (orchestration only)
- [ ] `processBatchTranscripts()` cyclomatic complexity ≤3
- [ ] `processIndividualMode()` cyclomatic complexity ≤8
- [ ] `processAggregatedMode()` cyclomatic complexity ≤10
- [ ] No code duplication between new methods
- [ ] All existing helper methods reused (no inline logic duplication)

### Functional Requirements
- [ ] All existing unit tests pass without modification
- [ ] All existing integration tests pass without modification
- [ ] Backward compatibility: 100% (public API unchanged)
- [ ] Manual test: Individual mode processes 10 videos correctly
- [ ] Manual test: Aggregated mode processes 10 videos correctly
- [ ] Error handling unchanged (failed videos don't halt batch)

### Build & Test
- [ ] Build passes with 0 TypeScript errors
- [ ] All 96 unit tests pass
- [ ] All 17 security tests pass
- [ ] No new test coverage gaps introduced

---

## Implementation Constraints

### What to Refactor
1. ✅ Extract `processIndividualMode()` from lines 605-642
2. ✅ Extract `processAggregatedMode()` from lines 643-762
3. ✅ Simplify `processBatchTranscripts()` to 2-branch router
4. ✅ Preserve all existing helper method calls
5. ✅ Maintain exact same `BatchResult` structure

### What NOT to Change
1. ❌ Public API (`batch_get_transcripts` tool signature)
2. ❌ `BatchResult` interface structure
3. ❌ Error categorization logic
4. ❌ Throttling behavior
5. ❌ Stream chunking logic (CHUNK_SIZE = 1000)
6. ❌ Progress logging format
7. ❌ File naming conventions
8. ❌ Existing helper methods (`processSingleTranscript()`, `normalizeYoutubeUrl()`, etc.)
9. ❌ Test files (unit or integration)

### Test Strategy
```bash
# Verify no behavior change
npm test                    # All tests must pass
npm run build              # Build must succeed with 0 errors

# Manual validation
# 1. Test individual mode with 5 videos
# 2. Test aggregated mode with 5 videos
# 3. Test error handling (invalid URL in batch)
# 4. Verify file output matches pre-refactor format exactly
```

---

## Dependencies

### Tech Stack
- **Language**: TypeScript 5.x
- **Runtime**: Node.js ^20.11.24
- **Framework**: @modelcontextprotocol/sdk 0.6.0
- **Libraries**: 
  - youtube-transcript ^1.2.1
  - he (HTML entity decoder)
  - fs/promises (native)

### Related Code
- **Depends On**: 
  - `processSingleTranscript()` (lines 538-589)
  - `normalizeYoutubeUrl()` (lines 332-344)
  - `extractVideoId()` (lines 351-371)
  - `generateTitleAndFilename()` (lines 378-411)
  - `categorizeError()` (lines 503-530)
  - `RequestThrottler` (throttle.ts)

- **Used By**:
  - `CallToolRequestSchema` handler (line 300)
  - `batch_get_transcripts` tool

---

## Risk Assessment

### Risks
1. **Stream Behavior Change**: Potential for subtle timing differences in stream writes
   - **Mitigation**: Preserve exact stream write sequence, test with 50-video batch

2. **Error Handling Regression**: Risk of changing error propagation behavior
   - **Mitigation**: Maintain exact same try/catch structure, verify all error paths

3. **Performance Impact**: Additional method call overhead
   - **Mitigation**: Negligible (~1ms per batch), dominated by network I/O (4s per video)

### Testing Strategy
- **Unit Tests**: No changes required (implementation detail)
- **Integration Tests**: No changes required (public API unchanged)
- **Manual Testing**: 
  - Test 1: Individual mode with 10 videos (verify file count, names, content)
  - Test 2: Aggregated mode with 10 videos (verify single file, section markers)
  - Test 3: Mixed success/failure batch (verify error isolation)

---

## Out of Scope

The following are explicitly NOT included in this refactoring:
- ❌ Changing batch size limits (remains 1-50 videos)
- ❌ Adding parallelization (remains sequential processing)
- ❌ Modifying throttling behavior (2s delay unchanged)
- ❌ Changing file output format (Markdown structure unchanged)
- ❌ Adding new features or capabilities
- ❌ Optimizing aggregated mode streaming logic
- ❌ Changing error categorization types
- ❌ Modifying progress logging format

---

## Open Questions

None. All implementation details are deterministic based on existing code.

---

## Success Metrics

### Primary Goal
- **Code Quality Score**: 90% → 94% (+4%)
- **Metric**: Cyclomatic complexity reduction from 15+ to <3 (processBatchTranscripts)

### Secondary Goals
- **Maintainability**: Each mode handler independently modifiable
- **Readability**: Clear separation between individual and aggregated logic
- **Test Coverage**: Maintained at 100% (no new uncovered branches)

### Verification
```bash
# Before refactoring
npm run lint -- --max-complexity 15  # Should pass (current state)

# After refactoring  
npm run lint -- --max-complexity 10  # Should pass (target state)
npm test                             # All 113 tests pass
npm run build                        # 0 errors
```

---

## Implementation Notes

### File Modification Plan
**File**: `servers/binaries/youtube-mcp-server/src/index.ts`

**Changes**:
1. Add `processIndividualMode()` after line 589 (after `processSingleTranscript()`)
2. Add `processAggregatedMode()` after new `processIndividualMode()`
3. Replace `processBatchTranscripts()` body (lines 603-771) with router logic
4. Verify method ordering follows existing pattern (helpers before orchestrators)

**Line Count Impact**:
- Before: 822 lines
- After: ~822 lines (±5 lines, no significant change)
- Reason: Code is moved, not added/removed

### Testing Checklist
```bash
# Pre-refactor baseline
git checkout main
npm install
npm test > baseline-tests.txt
npm run build

# Refactor implementation
# (implement changes)

# Post-refactor validation
npm test > refactored-tests.txt
diff baseline-tests.txt refactored-tests.txt  # Should be identical

npm run build  # Must succeed with 0 errors
```

---

## Estimated Effort

- **Implementation**: 2 hours
  - Extract individual mode: 30 minutes
  - Extract aggregated mode: 45 minutes
  - Update processBatchTranscripts router: 15 minutes
  - Build-test-commit cycles: 30 minutes

- **Testing**: 1.5 hours
  - Run full test suite: 15 minutes
  - Manual test individual mode: 30 minutes
  - Manual test aggregated mode: 30 minutes
  - Verify error handling: 15 minutes

- **Documentation**: 0.5 hours
  - Update inline comments: 30 minutes

**Total**: 4 hours (as estimated in issue #23)

---

## Acceptance Criteria

- [x] Specification created with DoD requirements
- [ ] `processIndividualMode()` extracted (lines 605-642 → new method)
- [ ] `processAggregatedMode()` extracted (lines 643-762 → new method)
- [ ] `processBatchTranscripts()` simplified to router (2 branches)
- [ ] All 96 unit tests pass without modification
- [ ] All 17 security tests pass without modification
- [ ] Build succeeds with 0 TypeScript errors
- [ ] Manual test: Individual mode processes 10 videos correctly
- [ ] Manual test: Aggregated mode processes 10 videos correctly
- [ ] Code quality score improves to 94%+
- [ ] No new code duplication introduced
- [ ] Backward compatibility: 100% (API unchanged)

---

## References

- **Parent Issue**: #1 (Batch process multiple YouTube transcripts)
- **Related PR**: #20 (Original batch processing implementation)
- **Source File**: `servers/binaries/youtube-mcp-server/src/index.ts`
- **DoD Template**: `~/.claude/agents/dod-code-spec.md`
