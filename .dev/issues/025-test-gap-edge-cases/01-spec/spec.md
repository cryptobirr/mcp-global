# Test Gap Specification: Edge Case Coverage for Batch Processing

**Issue:** #25  
**Parent Issue:** #1  
**Type:** Test Gap  
**Created:** 2025-11-09T23:24:48Z  
**Status:** Specification Complete

---

## What We're Building

Adding 3 critical edge case tests for YouTube MCP Server's `batch_get_transcripts` feature to close test coverage gap from 92% to 97% (minimum threshold for PR approval). Tests validate catastrophic failure scenarios (all-fail, network timeout, disk full) that would crash production if unhandled.

**Who:** Test engineer closing coverage gaps identified during PR #20 code review  
**Outcome:** Verified error handling for batch processing edge cases, eliminating production risk from uncovered code paths

---

## User Flow (Test Execution Flow)

```
INITIAL STATE: Test suite running with 92% coverage, edge cases uncovered

STEP 1: Developer runs `npm test` → Test suite executes
         ↓
STEP 2: Vitest loads edge case test suite → Mocks configured
         ↓
STEP 3: All-fail test executes → Validates 100% failure handling
         ↓
STEP 4: Network timeout test executes → Validates timeout error categorization
         ↓
STEP 5: Disk full test executes → Validates write failure handling
         ↓
FINAL STATE: All edge case tests pass, coverage ≥97%, production-ready
```

**Transition Guards:**
- Step 1→2: Test suite must compile without errors
- Step 2→3: Mocks must be properly configured (no real API calls)
- Step 3→4: All-fail test passes (all assertions green)
- Step 4→5: Timeout test passes (error categorization correct)
- Step 5→Final: Disk full test passes (cleanup verified)

---

## Problem Statement

### Current State
- PR #20 test coverage: 92% (5% below threshold)
- Missing edge cases: all-fail scenario, network timeout, disk full
- Production risk: Uncovered error paths may fail silently or crash
- Uncovered code: Error aggregation logic, timeout categorization, write failure cleanup

### Target State
- Test coverage: ≥97% (passes PR approval gate)
- All catastrophic failure scenarios tested
- Error handling verified for batch processing edge cases
- Zero production risk from uncovered code paths

### Gap Analysis
**Missing Tests:**
1. Batch processing when all videos fail (tests lines 630-636 in src/index.ts)
2. Network timeout error handling (tests lines 628-629, error categorization)
3. Disk full error during file write (tests lines 668-673, cleanup logic)

**Impact:** These 3 scenarios represent ~5% of batch processing code paths that are currently untested.

---

## Requirements

### Must Have (Measurable Success Criteria)

**R1: Test Coverage Threshold**
- **Metric:** Test coverage ≥97% (5% increase from current 92%)
- **Verification:** Run `npm run test:coverage` → Coverage report shows ≥97%
- **Target:** 3 new test suites add ~150-200 lines of test code covering 5% of uncovered code

**R2: Edge Case Scenarios Coverage**
- **Metric:** All 3 critical edge cases have dedicated test suites
- **Verification:** Each scenario has ≥2 test cases (6 total tests minimum)
- **Target:** 
  - All-fail scenario: 2 tests
  - Network timeout: 2 tests
  - Disk full: 2 tests

**R3: Test Execution Performance**
- **Metric:** New tests execute in <5 seconds total
- **Verification:** `npm test` completion time increases by <5s
- **Target:** Each test completes in <2s (well-mocked, no real I/O)

**R4: Deterministic Test Results**
- **Metric:** 100% pass rate across 10 consecutive runs
- **Verification:** Run `for i in {1..10}; do npm test; done` → All runs pass
- **Target:** Zero flaky tests (0% failure rate)

**R5: Real Error Code Simulation**
- **Metric:** Tests use actual Node.js error codes (ETIMEDOUT, ENOSPC)
- **Verification:** Error mocks include `.code` property matching real errors
- **Target:** 
  - Timeout: `error.code === 'ETIMEDOUT'`
  - Disk full: `error.code === 'ENOSPC'`

### Must NOT

**R6: No Real I/O in Unit Tests**
- **Prohibition:** Edge case tests MUST NOT perform real network or disk I/O
- **Enforcement:** All external dependencies mocked (file system, network, YouTube API)
- **Verification:** Tests run offline without network access

**R7: No Test Pollution**
- **Prohibition:** Tests MUST NOT leak mocks or state between test cases
- **Enforcement:** Use `beforeEach` and `afterEach` for mock cleanup
- **Verification:** Tests pass when run in isolation and in full suite

**R8: No Breaking Changes**
- **Prohibition:** New tests MUST NOT modify existing test infrastructure
- **Enforcement:** Only add new test suites, don't refactor existing tests
- **Verification:** Existing 96 unit tests + 17 security tests still pass

---

## Acceptance Criteria

### AC1: All-Fail Scenario Test

**Given:** Batch processing with 3 video URLs  
**When:** All videos fail to fetch transcripts (100% failure rate)  
**Then:** 
- Results array contains 3 failure entries
- `successfulVideos === 0`
- `failedVideos === 3`
- Each result has `success: false` and error message
- No exceptions thrown during processing
- Summary report formatted correctly

### AC2: Network Timeout Test

**Given:** Batch processing with 5 video URLs  
**When:** Network timeout occurs on 3rd video (error code: ETIMEDOUT)  
**Then:**
- First 2 videos succeed (processed before timeout)
- 3rd video fails with timeout error
- Error categorized as 'NetworkTimeout' or 'NetworkError'
- Videos 4-5 continue processing after timeout
- Partial success recorded (2 successful, 3 failed)

### AC3: Disk Full Error Test

**Given:** Batch processing in individual mode with 2 video URLs  
**When:** Disk full error occurs during file write (error code: ENOSPC)  
**Then:**
- Disk error categorized as 'DiskFull' or 'FileSystemError'
- Error message includes "no space left on device"
- No partial files left in output directory
- Batch processing doesn't crash (graceful failure)
- Subsequent videos handled appropriately

### AC4: Test Coverage Increase

**Given:** Test suite running before new tests added (92% coverage)  
**When:** New edge case tests are added and executed  
**Then:**
- Coverage report shows ≥97% (5%+ increase)
- All 6 new tests pass (100% pass rate)
- Total test count increases by 6 (from 113 to 119+)
- Coverage gaps identified in PR #20 are closed

### AC5: Test Suite Integration

**Given:** Existing test suite with 96 unit + 17 security tests  
**When:** New edge case tests are integrated  
**Then:**
- All existing tests still pass (no regressions)
- `npm test` completes successfully
- No ESLint warnings or TypeScript errors
- Test execution time increases by <5 seconds

---

## Technical Specification

### Test File Location
```
servers/binaries/youtube-mcp-server/tests/unit/youtube-mcp-server.test.ts
```

### Test Suite Structure
```typescript
describe('Batch Processing - Edge Cases', () => {
  describe('All-Fail Scenario', () => {
    it('should handle batch where all videos fail', async () => {
      // Test implementation
    });
    
    it('should return accurate summary when 100% failure rate', () => {
      // Test implementation
    });
  });

  describe('Network Timeout', () => {
    it('should categorize timeout errors correctly', () => {
      // Test implementation
    });
    
    it('should handle partial success before timeout', async () => {
      // Test implementation
    });
  });

  describe('Disk Full Error', () => {
    it('should handle disk full during file write', async () => {
      // Test implementation
    });
    
    it('should categorize disk errors properly', () => {
      // Test implementation
    });
  });
});
```

### Implementation Details

#### Test 1: All-Fail Scenario
**Code Path Tested:** `src/index.ts:630-636` (error catch block in processIndividualMode)

**Mock Strategy:**
```typescript
vi.spyOn(server as any, 'processSingleTranscript').mockResolvedValue({
  success: false,
  videoUrl: 'url',
  error: 'Failed to fetch transcript',
  errorType: 'Unknown'
});
```

**Assertions (8 total):**
1. Results length equals input URLs length
2. successfulVideos === 0
3. failedVideos === videoUrls.length
4. Each result.success === false
5. Each result.error is non-empty string
6. Each result.errorType === 'Unknown'
7. mode === 'individual'
8. No exceptions thrown (wrapped in try-catch)

#### Test 2: Network Timeout
**Code Path Tested:** Error categorization logic (lines 628-629)

**Mock Strategy:**
```typescript
const timeoutError = new Error('ETIMEDOUT');
(timeoutError as any).code = 'ETIMEDOUT';
vi.spyOn(server as any, 'processSingleTranscript')
  .mockResolvedValueOnce({ success: true, ... })  // Video 1 succeeds
  .mockResolvedValueOnce({ success: true, ... })  // Video 2 succeeds
  .mockRejectedValueOnce(timeoutError)             // Video 3 times out
  .mockResolvedValueOnce({ success: true, ... }); // Video 4 succeeds
```

**Assertions (7 total):**
1. successfulVideos === 3 (1, 2, 4)
2. failedVideos === 1 (3)
3. Timeout result.error contains 'ETIMEDOUT'
4. Timeout result.errorType categorized correctly
5. Processing continued after timeout
6. Partial success recorded accurately
7. Total results === 4

#### Test 3: Disk Full Error
**Code Path Tested:** `src/index.ts:668-673` (file system write in processAggregatedMode)

**Mock Strategy:**
```typescript
const diskError = new Error('ENOSPC: no space left on device');
(diskError as any).code = 'ENOSPC';
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockRejectedValue(diskError)
}));
```

**Assertions (6 total):**
1. Error caught and categorized as disk error
2. Error message includes 'ENOSPC' or 'no space'
3. error.code === 'ENOSPC'
4. Batch processing doesn't crash
5. Error result includes videoUrl
6. Graceful failure (no partial files)

### Testing Strategy

**ZERO MOCKS FOR INTEGRATION** - Real systems only for integration tests
- Integration tests (separate file) test real YouTube API
- Integration tests use real file system
- Integration tests validate end-to-end batch processing

**MOCKS PERMITTED FOR UNIT TESTS ONLY** - Isolated logic testing
- Unit tests (this spec) mock external dependencies
- File system mocked to simulate disk errors
- Network calls mocked to simulate timeouts
- YouTube API mocked for unit test isolation

**Test Matrix:**

| Test Case | Mock Target | Mock Behavior | Assertion Focus |
|-----------|-------------|---------------|-----------------|
| All-Fail | processSingleTranscript | Always return failure | Error aggregation |
| Timeout | processSingleTranscript | Throw ETIMEDOUT on 3rd call | Error categorization |
| Disk Full | fs.promises.mkdir/writeFile | Throw ENOSPC | Write failure handling |

**Coverage Target Breakdown:**
- Current: 92% (all-success paths tested)
- Gap: 5% (error paths untested)
- New: ≥97% (edge cases covered)

---

## Implementation Guidance

### Approach
**BROWNFIELD** - Adding to existing test file without refactoring

**Integration Points:**
- File: `tests/unit/youtube-mcp-server.test.ts` (line ~300, append new test suite)
- Existing test structure: `describe('YoutubeMcpServer - Real Implementation', ...)`
- New test suite: `describe('Batch Processing - Edge Cases', ...)` after existing suites

### Testing Philosophy
- **Unit tests:** Isolated logic testing with mocked dependencies
- **Integration tests:** Real systems validation (separate file, not in scope)
- **Coverage:** Focus on uncovered error paths, not happy paths
- **Determinism:** Tests must be 100% deterministic (no timeouts, no real I/O)

### Constraints

**C1: Runtime Constraints**
- Tests execute in Node.js v20.11.24+
- Vitest test framework version ^1.0.0
- Total test execution time budget: +5 seconds max

**C2: Dependency Constraints**
- Use existing Vitest mocking utilities (`vi.spyOn`, `vi.mock`)
- No new test dependencies (use installed: vitest, @types/node)
- Must work with existing test infrastructure

**C3: Compatibility Constraints**
- Tests compatible with CI/CD pipeline (GitHub Actions)
- No environment-specific assumptions (paths, OS-specific errors)
- Cross-platform error simulation (works on Linux, macOS, Windows)

**C4: Memory Constraints**
- Each test consumes <50MB memory
- No memory leaks between tests
- Mock cleanup prevents memory accumulation

### Configuration/Environment
- **Test Command:** `npm test` or `npm run test:unit`
- **Coverage Command:** `npm run test:coverage`
- **Environment Variables:** None required (all mocked)
- **File Paths:** Relative to project root (`servers/binaries/youtube-mcp-server/`)

---

## Scope

### In Scope
1. **All-Fail Test:** Batch where all videos fail to fetch transcripts
2. **Network Timeout Test:** Simulated network timeout during transcript fetch
3. **Disk Full Test:** Simulated disk full error during file write
4. **Test Coverage Increase:** From 92% to ≥97%
5. **Documentation:** Inline comments explaining edge case simulation

### Out of Scope
- **Performance testing:** Covered in separate integration tests
- **New functionality:** Only testing existing code from PR #20
- **Refactoring implementation:** No changes to `src/index.ts`
- **Testing other tools:** Focus on `batch_get_transcripts` only
- **Real YouTube API testing:** Unit tests use mocks (integration tests use real API)
- **Retry logic testing:** Not implemented in PR #20, out of scope
- **Concurrency testing:** Batch processing is sequential, not concurrent

---

## Failure Modes & Edge Cases

### Edge Case 1: All Videos Fail
**Scenario:** Every video in batch fails to fetch transcript  
**Expected Behavior:** 
- No exceptions thrown
- successfulVideos === 0
- All results have success: false
- Summary report shows 0/N successful

**Risk:** High - Production batch jobs could fail silently without proper error aggregation

### Edge Case 2: Network Timeout Mid-Batch
**Scenario:** Network timeout occurs after processing some videos  
**Expected Behavior:**
- Partial success recorded (videos before timeout succeed)
- Timeout error categorized correctly
- Processing continues for remaining videos
- Summary shows mixed success/failure

**Risk:** Medium - Partial failures could go unnoticed without proper categorization

### Edge Case 3: Disk Full During Write
**Scenario:** File system runs out of space during transcript write  
**Expected Behavior:**
- Disk error categorized as 'DiskFull'
- No partial files left behind
- Graceful failure with descriptive error
- Batch processing doesn't crash

**Risk:** High - Could leave file system in inconsistent state or crash server

### Edge Case 4: Mock Leakage Between Tests
**Scenario:** Mocks from one test pollute another test's environment  
**Expected Behavior:**
- Tests pass when run in isolation
- Tests pass when run in full suite
- Mocks cleaned up in afterEach

**Risk:** Medium - Flaky tests reduce confidence in test suite

### Edge Case 5: Error Code Missing
**Scenario:** Error object doesn't have `.code` property  
**Expected Behavior:**
- Error categorized as 'Unknown'
- No exceptions thrown during categorization
- Error message still captured

**Risk:** Low - Graceful degradation expected

---

## Success Metrics

### Primary Metrics

**M1: Test Coverage**
- **Threshold:** ≥97% (PASS) | <97% (FAIL)
- **Measurement:** Run `npm run test:coverage` → Parse coverage report
- **Target:** 97.0% or higher

**M2: Test Pass Rate**
- **Threshold:** 100% (PASS) | <100% (FAIL)
- **Measurement:** `npm test` exit code 0 + all assertions green
- **Target:** 119+ tests passing (113 existing + 6 new)

**M3: Test Determinism**
- **Threshold:** 100% pass rate over 10 runs (PASS) | Any failure (FAIL)
- **Measurement:** `for i in {1..10}; do npm test; done` → All runs succeed
- **Target:** Zero flaky tests

### Secondary Metrics

**M4: Code Quality**
- **Threshold:** Zero ESLint warnings (PASS) | Any warnings (FAIL)
- **Measurement:** `npm run lint` exit code 0
- **Target:** Clean lint report

**M5: Build Performance**
- **Threshold:** Test execution time increase <5s (PASS) | ≥5s (FAIL)
- **Measurement:** Compare `npm test` time before/after
- **Target:** <5 second increase

---

## UX/UI Requirements

**N/A** - This is a test-only change with no user-facing impact.

---

## Open Questions

None - Specification is complete and ready for implementation.

---

## References

- **Parent Issue:** #1 (Batch YouTube Transcript Processing)
- **Related PR:** #20 (Original batch processing implementation)
- **Test File:** `tests/unit/youtube-mcp-server.test.ts`
- **Implementation:** `src/index.ts` (methods: `processBatchTranscripts`, `processIndividualMode`, `processAggregatedMode`)
- **Coverage Report:** Run `npm run test:coverage` for current baseline (92%)

---

## Metadata

**Feature Type:** Testing  
**Complexity:** Simple  
**Approach:** Brownfield  
**Estimated Effort:** 3-4 hours  
**Impact:** +5% test coverage (92% → 97%)  
**UX Required:** false

---
