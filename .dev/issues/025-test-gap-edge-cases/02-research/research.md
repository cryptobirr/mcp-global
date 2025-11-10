# Research Report: Edge Case Test Coverage for YouTube MCP Server

**Issue:** #25  
**Phase:** Research  
**Created:** 2025-11-09T23:40:00Z  
**Status:** Complete

---

## Executive Summary

Codebase analysis reveals batch processing implementation (PR #20) with robust error handling infrastructure BUT missing edge case test coverage for catastrophic failure scenarios. Current test suite covers happy paths and partial failures but not all-fail, network timeout, or disk full scenarios.

**Key Finding:** Error categorization logic exists (`categorizeError` method) but doesn't handle ETIMEDOUT or ENOSPC error codes. Edge case tests will need to mock these scenarios since categorization defaults to 'Unknown' type.

**Complexity:** Simple - Adding tests only, no implementation changes required  
**Feasibility:** High - Clear integration points, existing test patterns to follow  
**Risk:** Low - Test-only changes, well-isolated from production code

---

## Codebase Analysis

### 1. Batch Processing Implementation

**File:** `src/index.ts`  
**Lines:** 597-807 (210 lines total)

**Key Methods:**
- `processBatchTranscripts` (lines 797-807) - Entry point, routes to mode-specific methods
- `processIndividualMode` (lines 597-649) - Handles individual file mode
- `processAggregatedMode` (lines 657-792) - Handles aggregated file mode
- `processSingleTranscript` (lines 538-595) - Core transcript processing logic
- `categorizeError` (lines 503-530) - Error classification logic

### 2. Error Handling Architecture

**Error Categorization (`categorizeError` method, lines 503-530):**
```typescript
private categorizeError(error: any, videoUrl: string): 
  { message: string; type: ErrorType }
{
  const errorMessage = error.message?.toLowerCase() || '';

  if (errorMessage.includes('transcriptsdisabled')) {
    return { message: '...', type: 'TranscriptsDisabled' };
  } else if (errorMessage.includes('could not find transcript')) {
    return { message: '...', type: 'NotFound' };
  } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
    return { message: '...', type: 'RateLimit' };
  } else {
    return { message: '...', type: 'Unknown' };
  }
}
```

**Supported ErrorTypes:**
```typescript
type ErrorType = 
  | 'TranscriptsDisabled'
  | 'NotFound'
  | 'RateLimit'
  | 'Unknown';
```

**CRITICAL FINDING:** No specific handling for:
- Network timeouts (ETIMEDOUT)
- Disk full errors (ENOSPC)
- File system errors

These will default to `errorType: 'Unknown'` (line 634 in processIndividualMode)

### 3. Error Handling in Batch Processing

**Individual Mode Error Handling (lines 628-638):**
```typescript
} catch (error: any) {
  // Capture error but continue processing
  results.push({
    success: false,
    videoUrl: url,
    error: error.message || 'Unknown error',
    errorType: 'Unknown',  // <-- Edge case: defaults to 'Unknown'
  });

  console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
}
```

**Key Behaviors:**
- Errors caught and added to results array ✅
- Processing continues after error ✅
- Error categorization bypassed in catch block ❌ (uses 'Unknown' directly)
- No special handling for catastrophic errors ❌

**Aggregated Mode Error Handling (lines 745-766):**
- Similar pattern to individual mode
- Uses `categorizeError` for transcript fetch errors ✅
- Catch block defaults to 'Unknown' for other errors ❌

### 4. Existing Test Coverage

**Test File:** `tests/unit/youtube-mcp-server.test.ts`  
**Current Tests:** 96 unit tests + 17 security tests = 113 total  
**Coverage:** 92%

**Test Structure:**
```typescript
describe('YoutubeMcpServer - Real Implementation', () => {
  let server: YoutubeMcpServer;

  beforeEach(() => {
    server = new YoutubeMcpServer();
  });

  describe('Test Suite Name', () => {
    it('should do something', () => {
      // Test logic with vi.spyOn for mocking
    });
  });
});
```

**Mocking Patterns Used:**
- `vi.spyOn(object, 'method')` for method mocking
- `mockResolvedValue()` for async success
- `mockRejectedValue()` for async errors
- `beforeEach` for test isolation

**Gaps in Coverage:**
1. No tests for 100% failure rate in batch processing
2. No tests for network timeout errors (ETIMEDOUT)
3. No tests for disk full errors (ENOSPC)
4. No tests for file system write failures

### 5. File System & I/O Patterns

**File System Operations (Individual Mode):**
```typescript
// Line 608: Create directory
await fs.mkdir(outputDir, { recursive: true });

// Handled in processSingleTranscript via constructOutputPath → streamTranscriptToFile
// Uses createWriteStream for file writing
```

**File System Operations (Aggregated Mode):**
```typescript
// Line 669: Create directory
await fs.mkdir(outputDir, { recursive: true });

// Line 672: Create write stream
const writeStream = createWriteStream(absolutePath, { encoding: 'utf-8' });

// Line 676-795: Write data to stream
writeStream.write('...');
```

**CRITICAL FINDING:** File write errors not explicitly tested
- `mkdir` failures could throw ENOSPC
- `createWriteStream` failures not tested
- Stream write errors not handled in tests

### 6. Network & API Patterns

**Network Operations:**
```typescript
// Line 548-550: Fetch transcript with throttling
const transcriptEntries = await this.throttler.throttle(
  () => YoutubeTranscript.fetchTranscript(normalizedUrl)
);
```

**Throttling Implementation:** `src/throttle.ts`
- RequestThrottler class manages rate limiting
- No timeout handling visible in throttle logic
- Relies on YouTube transcript library for network errors

**CRITICAL FINDING:** Network timeout errors come from underlying library
- ETIMEDOUT errors would propagate through throttler
- No specific timeout handling in server code
- Tests need to mock YouTube transcript fetch errors

---

## Edge Case Analysis

### Edge Case 1: All-Fail Scenario

**Code Path:** `processIndividualMode` lines 610-639

**What Happens:**
1. Loop processes each video URL
2. `processSingleTranscript` fails for ALL videos
3. Each failure caught in catch block (lines 628-638)
4. All results have `success: false`
5. Final summary: `successfulVideos: 0`, `failedVideos: N`

**Current Coverage:** None - No tests for 100% failure rate

**Test Requirements:**
- Mock `processSingleTranscript` to always return failure
- Verify error aggregation works correctly
- Ensure processing doesn't halt on first failure
- Validate summary report accuracy

### Edge Case 2: Network Timeout

**Code Path:** `processSingleTranscript` lines 548-550 → catch block line 581-586

**What Happens:**
1. `YoutubeTranscript.fetchTranscript` throws ETIMEDOUT error
2. Error caught in try-catch (line 580)
3. `categorizeError` called but doesn't recognize ETIMEDOUT
4. Returns `{ type: 'Unknown', message: '...' }`
5. Result added with `errorType: 'Unknown'`

**Current Coverage:** None - No timeout simulation tests

**Test Requirements:**
- Mock fetch to throw error with code: 'ETIMEDOUT'
- Verify error caught and processing continues
- Test both individual and aggregated modes
- Validate partial success before timeout

### Edge Case 3: Disk Full Error

**Code Path:** File write operations lines 608, 669-672

**What Happens:**
1. `fs.mkdir` or `createWriteStream` fails with ENOSPC
2. Error propagates through promise chain
3. Caught in outer catch block (lines 628-638 or 745-766)
4. Added to results with `errorType: 'Unknown'`

**Current Coverage:** None - No file system failure tests

**Test Requirements:**
- Mock fs.promises to throw ENOSPC errors
- Mock createWriteStream to fail
- Verify cleanup (no partial files)
- Test both mkdir and write failures

---

## Implementation Strategy

### Test Suite Structure

**Location:** Add to `tests/unit/youtube-mcp-server.test.ts` (append to existing file)

**Position:** After line ~300 (end of existing test suites)

**Structure:**
```typescript
describe('Batch Processing - Edge Cases', () => {
  let server: YoutubeMcpServer;

  beforeEach(() => {
    server = new YoutubeMcpServer();
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Clean up mocks
  });

  describe('All-Fail Scenario', () => {
    // 2 tests
  });

  describe('Network Timeout', () => {
    // 2 tests
  });

  describe('Disk Full Error', () => {
    // 2 tests
  });
});
```

### Mocking Strategy

**Approach 1: Mock Private Methods (Recommended)**
```typescript
// Mock processSingleTranscript (private method)
vi.spyOn(server as any, 'processSingleTranscript').mockResolvedValue({
  success: false,
  videoUrl: 'url',
  error: 'Mocked error',
  errorType: 'Unknown'
});
```

**Pros:** 
- Isolates batch processing logic
- Fast execution (no real I/O)
- Easy to control success/failure patterns

**Cons:**
- Tests internal implementation (private methods)

**Approach 2: Mock External Dependencies**
```typescript
// Mock file system
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockRejectedValue(new Error('ENOSPC'))
}));

// Mock YouTube library
vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
  }
}));
```

**Pros:**
- Tests public API surface
- More realistic integration

**Cons:**
- Harder to control exact failure points
- May affect other tests (mock pollution)

**RECOMMENDATION:** Use Approach 1 (mock private methods) for:
- All-Fail Scenario
- Network Timeout (partial)

Use Approach 2 (mock dependencies) for:
- Disk Full Error
- Network Timeout (error code verification)

### Test Implementation Plan

**Test 1: All-Fail Scenario**
```typescript
it('should handle batch where all videos fail', async () => {
  // Mock processSingleTranscript to always fail
  const mockResult = {
    success: false,
    videoUrl: 'mock-url',
    error: 'Mocked failure',
    errorType: 'Unknown' as const
  };

  vi.spyOn(server as any, 'processSingleTranscript')
    .mockResolvedValue(mockResult);

  // Call processIndividualMode
  const videoUrls = ['url1', 'url2', 'url3'];
  const result = await (server as any).processIndividualMode(
    videoUrls,
    'output'
  );

  // Assertions
  expect(result.successfulVideos).toBe(0);
  expect(result.failedVideos).toBe(3);
  expect(result.results.length).toBe(3);
  expect(result.results.every(r => r.success === false)).toBe(true);
});
```

**Test 2: Network Timeout**
```typescript
it('should handle network timeout during batch processing', async () => {
  // Create realistic timeout error
  const timeoutError = new Error('ETIMEDOUT');
  (timeoutError as any).code = 'ETIMEDOUT';

  // Mock partial success then timeout
  vi.spyOn(server as any, 'processSingleTranscript')
    .mockResolvedValueOnce({ success: true, ... }) // Video 1 succeeds
    .mockResolvedValueOnce({ success: true, ... }) // Video 2 succeeds
    .mockRejectedValueOnce(timeoutError)            // Video 3 times out
    .mockResolvedValueOnce({ success: true, ... }); // Video 4 succeeds

  const videoUrls = ['url1', 'url2', 'url3', 'url4'];
  const result = await (server as any).processIndividualMode(
    videoUrls,
    'output'
  );

  // Assertions
  expect(result.successfulVideos).toBe(3);
  expect(result.failedVideos).toBe(1);
  expect(result.results[2].error).toContain('ETIMEDOUT');
});
```

**Test 3: Disk Full Error**
```typescript
it('should handle disk full during file write', async () => {
  // Mock file system to throw ENOSPC
  const diskError = new Error('ENOSPC: no space left on device');
  (diskError as any).code = 'ENOSPC';

  // Mock mkdir to fail
  const mkdirMock = vi.fn().mockRejectedValue(diskError);
  vi.spyOn(fs, 'mkdir').mockImplementation(mkdirMock);

  const videoUrls = ['url1', 'url2'];
  
  try {
    await (server as any).processIndividualMode(videoUrls, 'output');
    expect.fail('Should have thrown disk error');
  } catch (error: any) {
    expect(error.code).toBe('ENOSPC');
    expect(error.message).toContain('no space');
  }
});
```

---

## Dependencies & Constraints

### Runtime Dependencies
- **Node.js:** v20.11.24+
- **Vitest:** ^1.0.0
- **TypeScript:** v5.x

### Test Dependencies (Already Installed)
- `vitest` - Test framework
- `@types/node` - TypeScript types
- `youtube-transcript` - YouTube API (mocked in tests)

### Constraint 1: No New Dependencies
- Use existing test infrastructure
- No additional npm packages required
- Leverage Vitest mocking utilities

### Constraint 2: No Implementation Changes
- Tests only - no production code modification
- Error categorization stays as-is (ETIMEDOUT → 'Unknown')
- No refactoring of batch processing logic

### Constraint 3: Test Isolation
- Tests must not affect other test suites
- Mock cleanup in `afterEach`
- No shared state between tests

### Constraint 4: Execution Performance
- Each test <2 seconds
- Total new tests <5 seconds
- No real I/O operations

---

## Risks & Mitigations

### Risk 1: Mock Pollution
**Impact:** Mocks leak between tests, causing flaky failures  
**Likelihood:** Medium  
**Mitigation:** 
- Use `beforeEach` and `afterEach` for setup/cleanup
- Call `vi.restoreAllMocks()` in afterEach
- Test in isolation and full suite

### Risk 2: Private Method Testing Brittleness
**Impact:** Tests break if method names change  
**Likelihood:** Low (stable API from PR #20)  
**Mitigation:**
- Document dependency on private methods
- Consider public API testing for critical paths
- Accept trade-off for test isolation

### Risk 3: Error Code Inconsistency
**Impact:** Tests use wrong error codes, false positives  
**Likelihood:** Low  
**Mitigation:**
- Use real Node.js error codes (ETIMEDOUT, ENOSPC)
- Verify with Node.js documentation
- Test error.code property, not just error.message

### Risk 4: Coverage Measurement Accuracy
**Impact:** Coverage report doesn't reach 97% despite tests  
**Likelihood:** Low  
**Mitigation:**
- Run coverage before and after
- Verify lines covered in report
- May need to add more edge cases if 97% not reached

---

## Success Criteria Validation

### Can We Reach 97% Coverage?
**Analysis:** Yes, highly likely

**Current Uncovered Lines (estimated):**
- Error handling in processIndividualMode: ~8 lines (628-638)
- Error handling in processAggregatedMode: ~12 lines (745-766)
- Edge case branches in categorizeError: ~4 lines
- Total: ~24 lines uncovered

**New Tests Will Cover:**
- All-fail: Lines 628-638 (individual), 745-766 (aggregated) → ~20 lines
- Network timeout: Error categorization branches → ~4 lines
- Disk full: File system error paths → ~5-8 lines

**Projected Coverage:** 92% + 5% = **97%** ✅

### Are Tests Implementable in 3-4 Hours?
**Analysis:** Yes, feasible

**Time Breakdown:**
- Test suite setup: 30 minutes
- All-fail tests (2): 1 hour
- Network timeout tests (2): 1 hour
- Disk full tests (2): 1 hour
- Debugging/refinement: 30 minutes

**Total:** 3.5 hours ✅

### Will Tests Be Deterministic?
**Analysis:** Yes, if properly mocked

**Determinism Factors:**
- No real network calls (mocked) ✅
- No real file I/O (mocked) ✅
- No time-dependent logic ✅
- Controlled mock responses ✅

**Recommendation:** Use `afterEach(() => vi.restoreAllMocks())` to prevent pollution ✅

---

## Related Work

### PR #20 (Original Implementation)
- Implemented batch processing
- Added throttling for rate limiting
- Created error handling infrastructure
- **Gap:** No edge case tests for catastrophic failures

### Issue #1 (Parent Feature)
- Requested batch transcript processing
- Defined acceptance criteria
- Specified error handling requirements
- **Gap:** Didn't require edge case test coverage initially

### Existing Test Suite
- 96 unit tests cover happy paths
- 17 security tests cover path traversal, injection
- **Gap:** No catastrophic failure scenarios

---

## Open Questions

**Q1:** Should we add ETIMEDOUT and ENOSPC to ErrorType union?  
**A:** No - Out of scope. Tests will validate 'Unknown' type is used correctly.

**Q2:** Should we refactor error categorization to handle these cases?  
**A:** No - Test-only change scope. Implementation changes would require new spec.

**Q3:** Do we need integration tests for these edge cases?  
**A:** No - Unit tests sufficient for coverage gap. Integration tests separate concern.

**Q4:** Should we test aggregated mode separately?  
**A:** Yes - Different code paths. Need tests for both individual and aggregated modes.

---

## Recommendations

### Immediate Actions
1. ✅ Create test suite structure in existing test file
2. ✅ Implement all-fail scenario tests (highest impact)
3. ✅ Implement network timeout tests
4. ✅ Implement disk full tests
5. ✅ Verify coverage reaches ≥97%

### Future Enhancements (Out of Scope)
- Add ETIMEDOUT and ENOSPC to ErrorType union
- Enhance categorizeError to handle file system errors
- Add retry logic for network timeouts
- Create integration tests for edge cases with real systems

### Documentation Updates (In Scope)
- Add inline comments explaining edge case simulation
- Document mock cleanup strategy
- Reference Node.js error codes in comments

---

## Conclusion

**Feasibility:** ✅ High - Clear integration points, existing patterns to follow  
**Complexity:** ✅ Simple - Adding tests only, no implementation changes  
**Risk:** ✅ Low - Isolated to test file, well-defined scope  
**Impact:** ✅ High - Closes 5% coverage gap, validates error handling  

**Ready to Proceed:** YES - All research complete, clear implementation path

**Next Phase:** Planning (create detailed implementation checklist)

---

## References

### Code Files Analyzed
- `src/index.ts` (lines 503-807) - Batch processing and error handling
- `tests/unit/youtube-mcp-server.test.ts` (lines 1-300) - Existing test patterns
- `src/throttle.ts` - Request throttling (referenced but not modified)

### Documentation Referenced
- PR #20 description - Implementation details
- Issue #1 - Original feature requirements
- Node.js Error Codes - ETIMEDOUT, ENOSPC definitions
- Vitest Documentation - Mocking patterns

### Tools Used
- Vitest mocking utilities (vi.spyOn, vi.mock)
- TypeScript type system
- Node.js error code constants

---

**Research Completed:** 2025-11-09T23:40:00Z  
**Researcher:** orchestrate-feature (codebase analysis)  
**Next Step:** Create implementation plan (Phase 3)
