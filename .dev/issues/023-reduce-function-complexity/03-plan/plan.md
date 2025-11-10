# Implementation Plan: Reduce Function Complexity - Split processBatchTranscripts()

**Issue:** #23  
**Spec:** `.dev/issues/023-reduce-function-complexity/01-spec/spec.md`  
**Research:** `.dev/issues/023-reduce-function-complexity/02-research/research.md`  
**Created:** 2025-11-09T22:59:00Z

---

## Overview

**Goal:** Extract dual-mode logic from `processBatchTranscripts()` into two focused methods, reducing cyclomatic complexity from 15+ to 2.

**Strategy:** Extract-method refactoring pattern - move individual mode and aggregated mode logic into separate private methods.

**Impact:** Code quality improvement from 90% to 94% (+4%), improved maintainability, zero behavioral changes.

---

## Implementation Checklist

### Phase 1: Add processIndividualMode() Method
**File:** `servers/binaries/youtube-mcp-server/src/index.ts`  
**Location:** After line 589 (after `processSingleTranscript()`)

- [ ] Add JSDoc comment explaining method purpose
- [ ] Create method signature: `private async processIndividualMode(videoUrls: string[], outputPath: string): Promise<BatchResult>`
- [ ] Extract lines 605-642 logic:
  - [ ] Validate directory path (`validateOutputPath()`)
  - [ ] Create output directory (`fs.mkdir()`)
  - [ ] Loop through videos sequentially
  - [ ] Extract video ID for filename
  - [ ] Call `this.processSingleTranscript(url, filePath)`
  - [ ] Handle errors with try/catch, push to results array
  - [ ] Log progress to console.error
- [ ] Return BatchResult object with:
  - [ ] results array
  - [ ] outputPath
  - [ ] mode: 'individual'
  - [ ] totalVideos, successfulVideos, failedVideos

**Expected Lines:** ~50 lines (including JSDoc)  
**Expected Complexity:** 7 branches (validation, loop, ID extraction, try/catch, filters)

---

### Phase 2: Add processAggregatedMode() Method
**File:** `servers/binaries/youtube-mcp-server/src/index.ts`  
**Location:** After `processIndividualMode()`

- [ ] Add JSDoc comment explaining method purpose
- [ ] Create method signature: `private async processAggregatedMode(videoUrls: string[], outputPath: string): Promise<BatchResult>`
- [ ] Extract lines 643-762 logic:
  - [ ] Validate file path (`validateOutputPath()`)
  - [ ] Create output directory for file parent
  - [ ] Create write stream (`createWriteStream()`)
  - [ ] Write header (title, timestamp, mode)
  - [ ] Loop through videos sequentially:
    - [ ] Write section separator (if not first)
    - [ ] Normalize URL (`this.normalizeYoutubeUrl()`)
    - [ ] Fetch transcript with throttling (`this.throttler.throttle()`)
    - [ ] Handle empty transcript case
    - [ ] Generate title (`this.generateTitleAndFilename()`)
    - [ ] Write success section header
    - [ ] Write transcript content in chunks (CHUNK_SIZE=1000)
    - [ ] Handle errors (`this.categorizeError()`)
    - [ ] Push results
    - [ ] Log progress
  - [ ] Close stream with Promise wrapper
  - [ ] Log completion
- [ ] Return BatchResult object with:
  - [ ] results array
  - [ ] outputPath
  - [ ] mode: 'aggregated'
  - [ ] totalVideos, successfulVideos, failedVideos

**Expected Lines:** ~130 lines (including JSDoc)  
**Expected Complexity:** 8 branches (validation, stream, loop, separator, empty check, chunking, error)

---

### Phase 3: Simplify processBatchTranscripts() Orchestrator
**File:** `servers/binaries/youtube-mcp-server/src/index.ts`  
**Location:** Lines 598-772 (replace body only, keep signature and JSDoc)

- [ ] Keep method signature unchanged (lines 598-602)
- [ ] Keep JSDoc comment unchanged (lines 591-597)
- [ ] Replace method body (lines 603-771) with router logic:
  ```typescript
  if (outputMode === 'individual') {
    return this.processIndividualMode(videoUrls, outputPath);
  } else {
    return this.processAggregatedMode(videoUrls, outputPath);
  }
  ```

**Expected Lines:** 8 lines total (signature + router)  
**Expected Complexity:** 2 branches (single if/else)

---

## File Modification Plan

**File:** `servers/binaries/youtube-mcp-server/src/index.ts`

**Changes:**
1. **Lines 590-589** (after `processSingleTranscript()`):
   - Insert `processIndividualMode()` method (~50 lines)

2. **After new `processIndividualMode()`**:
   - Insert `processAggregatedMode()` method (~130 lines)

3. **Lines 603-771** (inside `processBatchTranscripts()`):
   - Replace with 6-line router

**Net Line Count:**
- Before: 821 lines
- After: ~831 lines (+10 lines for method signatures and comments)

---

## Testing Strategy

### Automated Tests
**Command:** `npm test`

**Expectations:**
- [ ] All 96 unit tests pass (no changes to tests)
- [ ] All 17 security tests pass (no changes to tests)
- [ ] 0 new test failures
- [ ] 0 TypeScript compilation errors

**Pre-Refactor Baseline:**
```bash
cd /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server
npm test > /tmp/baseline-tests-23.txt
```

**Post-Refactor Validation:**
```bash
npm test > /tmp/refactored-tests-23.txt
diff /tmp/baseline-tests-23.txt /tmp/refactored-tests-23.txt
# Expected: No differences (identical output)
```

### Manual Tests

**Test 1: Individual Mode (10 Videos)**
- [ ] Run batch processing with 10 YouTube URLs in individual mode
- [ ] Verify 10 files created in output directory
- [ ] Verify filenames match pattern: `transcript-{videoId}-{index}.md`
- [ ] Verify file content matches expected Markdown format
- [ ] Verify progress logging matches pre-refactor format

**Test 2: Aggregated Mode (10 Videos)**
- [ ] Run batch processing with 10 YouTube URLs in aggregated mode
- [ ] Verify 1 file created at output path
- [ ] Verify file contains:
  - [ ] Header with video count, timestamp, mode
  - [ ] 10 sections (one per video)
  - [ ] Section separators (`---`) between videos
  - [ ] Video titles, sources, statuses
- [ ] Verify progress logging matches pre-refactor format

**Test 3: Error Handling (Mixed Success/Failure)**
- [ ] Run batch with 5 valid URLs + 5 invalid URLs
- [ ] Verify processing continues after failures
- [ ] Verify results array contains all 10 entries
- [ ] Verify error messages categorized correctly
- [ ] Verify successful videos processed correctly

### Build Validation
- [ ] Run `npm run build` and verify 0 TypeScript errors
- [ ] Verify no new ESLint warnings
- [ ] Verify bundle size unchanged (±5%)

---

## Implementation Sequence

### Step 1: Create Feature Branch
```bash
cd /Users/mekonen/.mcp-global
git checkout -b issue-23-reduce-function-complexity
```

### Step 2: Run Baseline Tests
```bash
cd servers/binaries/youtube-mcp-server
npm install
npm test > /tmp/baseline-tests-23.txt
npm run build
```

### Step 3: Implement processIndividualMode()
**Time Estimate:** 30 minutes

1. Open `src/index.ts`
2. Locate line 589 (after `processSingleTranscript()`)
3. Add JSDoc comment
4. Add method signature
5. Copy lines 605-642 logic
6. Adjust variable scoping (create `results` array)
7. Adjust return statement (create `BatchResult` object)
8. Save file

**Verification:**
```bash
npm run build  # Must succeed
```

### Step 4: Implement processAggregatedMode()
**Time Estimate:** 45 minutes

1. Locate end of `processIndividualMode()`
2. Add JSDoc comment
3. Add method signature
4. Copy lines 643-762 logic
5. Adjust variable scoping (create `results` array)
6. Preserve all stream operations
7. Adjust return statement (create `BatchResult` object)
8. Save file

**Verification:**
```bash
npm run build  # Must succeed
```

### Step 5: Simplify processBatchTranscripts()
**Time Estimate:** 15 minutes

1. Locate lines 603-771 (method body)
2. Delete lines 603-771
3. Replace with router logic (6 lines)
4. Verify signature unchanged (lines 598-602)
5. Verify JSDoc unchanged (lines 591-597)
6. Save file

**Verification:**
```bash
npm run build  # Must succeed
```

### Step 6: Run Tests
**Time Estimate:** 1 hour

```bash
npm test > /tmp/refactored-tests-23.txt
diff /tmp/baseline-tests-23.txt /tmp/refactored-tests-23.txt

# If tests pass identically, proceed to manual tests
# If tests differ, debug and fix
```

### Step 7: Manual Testing
**Time Estimate:** 30 minutes

Run Test 1, Test 2, Test 3 as documented above.

### Step 8: Commit Changes
```bash
git add servers/binaries/youtube-mcp-server/src/index.ts
git commit -m "refactor: split processBatchTranscripts into mode-specific methods

- Extract processIndividualMode() for individual file processing
- Extract processAggregatedMode() for aggregated stream processing
- Simplify processBatchTranscripts() to 2-branch router
- Reduces cyclomatic complexity from 15+ to 2 (main method)
- Code quality improvement: 90% → 94%
- Zero behavioral changes, all tests pass

Closes #23"
```

### Step 9: Create Pull Request
```bash
git push -u origin issue-23-reduce-function-complexity

gh pr create \
  --repo cryptobirr/mcp-global \
  --base main \
  --head issue-23-reduce-function-complexity \
  --title "[CODE-QUALITY] Reduce function complexity (split processBatchTranscripts) - Issue #23" \
  --body "## Summary
Refactored \`processBatchTranscripts()\` to reduce cyclomatic complexity by extracting dual-mode logic into focused methods.

## Changes
- Added \`processIndividualMode()\` (lines 590+, ~50 lines, complexity: 7)
- Added \`processAggregatedMode()\` (after individual mode, ~130 lines, complexity: 8)
- Simplified \`processBatchTranscripts()\` to router (complexity reduced from 15+ to 2)

## Impact
- **Code Quality**: 90% → 94% (+4%)
- **Maintainability**: Each mode independently modifiable
- **Backward Compatibility**: 100% (public API unchanged)

## Testing
- ✅ All 96 unit tests pass (unchanged)
- ✅ All 17 security tests pass (unchanged)
- ✅ Build succeeds with 0 TypeScript errors
- ✅ Manual tests verify identical behavior (individual + aggregated modes)

## Metrics
- **Before**: 175 lines, 15+ branches, complexity 17
- **After**: 8 lines (router), 2 branches, complexity 2

Closes #23
Related: #1 (parent issue)"
```

---

## Architectural Decisions

### Decision 1: Method Names
**Chosen:** `processIndividualMode()` and `processAggregatedMode()`

**Rationale:**
- Matches existing `process*` naming pattern in codebase
- Mode suffix clearly indicates which output mode handled
- Consistent with `processSingleTranscript()` and `processBatchTranscripts()`

**Alternatives Considered:**
- `batchIndividual()` / `batchAggregated()` - Rejected (less clear, breaks pattern)
- `handleIndividual()` / `handleAggregated()` - Rejected (inconsistent with existing handlers)

### Decision 2: Method Placement
**Chosen:** Insert after `processSingleTranscript()` (line 589)

**Rationale:**
- Logical flow: single → individual → aggregated → batch orchestrator
- Follows existing pattern: helpers before orchestrators
- Minimal diff (new methods inserted, not appended)

**Alternatives Considered:**
- End of class - Rejected (breaks logical grouping)
- Before `processBatchTranscripts()` - Same as chosen (equivalent)

### Decision 3: Return Type
**Chosen:** Keep `BatchResult` interface unchanged

**Rationale:**
- Public contract unchanged (backward compatibility)
- Mode handlers return same structure as orchestrator
- Enables future refactoring flexibility

### Decision 4: Error Handling
**Chosen:** Preserve exact same try/catch structure and error categorization

**Rationale:**
- Zero behavioral changes (refactoring goal)
- Proven error handling already tested
- Categorization logic reused (`this.categorizeError()`)

---

## Risk Mitigation

### Risk 1: Stream Behavior Change
**Mitigation:**
- Preserve exact write sequence from lines 655-759
- No reordering of stream.write() calls
- Maintain Promise wrapper for stream.end()
- Test with 50-video batch (max limit)

### Risk 2: Error Propagation
**Mitigation:**
- Maintain identical try/catch structure
- Reuse existing `this.categorizeError()` helper
- Verify error messages unchanged in manual tests
- Test mixed success/failure scenarios

### Risk 3: Performance Regression
**Mitigation:**
- Method call overhead negligible (<1ms vs 4s network I/O)
- No algorithm changes (sequential processing unchanged)
- Monitor build bundle size (expect ±5% max)

---

## Dependencies

**Existing (No Changes):**
- `@modelcontextprotocol/sdk` v0.6.0
- `youtube-transcript` v1.2.1
- `he` v1.2.0
- `fs/promises` (Node.js native)
- `fs.createWriteStream` (Node.js native)

**Helper Methods (Reused, No Changes):**
- `validateOutputPath()` (global function)
- `this.extractVideoId()`
- `this.processSingleTranscript()`
- `this.normalizeYoutubeUrl()`
- `this.generateTitleAndFilename()`
- `this.categorizeError()`
- `this.throttler.throttle()`

---

## Success Criteria

### Code Quality Metrics
- [x] Implementation plan created with comprehensive checklist
- [ ] `processBatchTranscripts()` reduced to ≤10 lines
- [ ] `processBatchTranscripts()` cyclomatic complexity ≤3
- [ ] `processIndividualMode()` cyclomatic complexity ≤8
- [ ] `processAggregatedMode()` cyclomatic complexity ≤10
- [ ] No code duplication between new methods
- [ ] All existing helper methods reused

### Functional Requirements
- [ ] All 96 unit tests pass without modification
- [ ] All 17 security tests pass without modification
- [ ] Build succeeds with 0 TypeScript errors
- [ ] Manual test: Individual mode processes 10 videos correctly
- [ ] Manual test: Aggregated mode processes 10 videos correctly
- [ ] Manual test: Error handling unchanged (mixed batch)

### Process Requirements
- [ ] Feature branch created
- [ ] Baseline tests captured
- [ ] Implementation completed
- [ ] Post-refactor tests identical to baseline
- [ ] Manual tests verified
- [ ] Commit created with detailed message
- [ ] PR created with comprehensive description

---

## Estimated Timeline

**Total:** 4 hours

- **Setup & Baseline:** 15 minutes
- **Phase 1 (Individual Mode):** 30 minutes
- **Phase 2 (Aggregated Mode):** 45 minutes
- **Phase 3 (Router):** 15 minutes
- **Testing (Automated):** 30 minutes
- **Testing (Manual):** 30 minutes
- **Commit & PR:** 30 minutes
- **Buffer:** 15 minutes

---

## References

**Spec:** `.dev/issues/023-reduce-function-complexity/01-spec/spec.md`  
**Research:** `.dev/issues/023-reduce-function-complexity/02-research/research.md`  
**Source File:** `servers/binaries/youtube-mcp-server/src/index.ts:598-772`  
**Related Issue:** #23  
**Parent Issue:** #1

---

**Plan Status:** Ready for Implementation  
**Blocking Issues:** None  
**Open Questions:** None

