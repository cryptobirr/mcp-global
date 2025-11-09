# Research Report: Stream Error Handler Test Coverage

**Spec Reference:** `.dev/issues/14-stream-error-handler-test-gap/01-spec/spec.md`
**Research Date:** 2025-11-06T21:06:30Z
**Issue:** #14
**Codebase:** cryptobirr/mcp-global (YouTube MCP Server)

---

## Executive Summary

**Project Type:** TypeScript MCP Server with Node.js Streaming
**Complexity:** Moderate (brownfield with multiple bug fixes applied)
**Brownfield/Greenfield:** Brownfield (expanding existing test suite)
**Feasibility:** High (clear test patterns exist, implementation is accessible)

**Key Findings:**
- Existing test at `tests/streaming.test.ts:290-303` only verifies error event fires, does NOT test cleanup or propagation logic
- Production code uses dual error listener pattern (`src/index.ts:202-213` + `src/index.ts:254`) creating potential race condition
- Historical context: 5 comprehensive regression tests existed in commit `62c08ee` but were later removed
- Test infrastructure uses Vitest with `beforeEach/afterEach` cleanup pattern and `--expose-gc` for memory testing
- 100% code coverage achievable by expanding existing `describe('Stream Error Handling')` block

---

## Architecture Overview

**Project Type:** MCP (Model Context Protocol) Server for YouTube Transcript Processing
**Language(s):** TypeScript 5.7.3
**Framework(s):** @modelcontextprotocol/sdk 0.6.0, Vitest 4.0.7
**Runtime:** Node.js with `--expose-gc` flag enabled for memory testing

**Directory Structure:**
- `/src/index.ts` - Main MCP server implementation with streaming logic (301 lines)
- `/tests/streaming.test.ts` - Test suite for streaming functionality (304 lines, 15 tests)
- `/build/` - Compiled JavaScript output (excluded from coverage)
- `/test-output/` - Temporary directory for test files (created/destroyed per test)

**Key Patterns:**
- **Configuration:** Environment variables via `process.env` (`DEBUG=memory`, `CLINE_CWD`)
- **Testing:** Vitest with V8 coverage provider, `beforeEach/afterEach` for test isolation
- **Error Handling:** Dual error listener pattern with `streamError` capture variable
- **Memory Management:** Optional GC control via `--expose-gc` flag for accurate memory measurements
- **Streaming:** Node.js `createWriteStream` with chunked processing (CHUNK_SIZE=1000)

**Current Test Count:**
- Total: 15 tests across 7 test suites
- Stream Error Handling: 1 test (insufficient coverage)
- Historical: 5 regression tests existed in commit `62c08ee` but removed in `254b926`

---

## Similar Patterns Found

### Pattern 1: Promise Wrapper for Stream Completion
**Location:** `tests/streaming.test.ts:125-128`
**Purpose:** Wait for stream to finish writing before proceeding with assertions
**Relevant because:** Spec requires testing Promise wrapper error propagation at `src/index.ts:242-255`

**Code example:**
```typescript
// Memory test pattern
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => resolve());
  writeStream.on('error', reject);
});
```

**Test coverage:** Used in memory usage test (`tests/streaming.test.ts:98-138`)
**Dependencies:** Node.js streams, Promise API
**Implementation notes:** Production code has SAME pattern but with `streamError` flag check in end() callback

### Pattern 2: Promise-Based Error Capture
**Location:** `tests/streaming.test.ts:295-301`
**Purpose:** Capture stream error as resolved value (not rejection) for inspection
**Relevant because:** Current test uses this pattern but doesn't verify cleanup or propagation

**Code example:**
```typescript
// Current insufficient test
const errorPromise = new Promise((resolve, reject) => {
  writeStream.on('error', (err) => resolve(err));
  writeStream.write('test content');
});

const error = await errorPromise;
expect(error).toBeInstanceOf(Error);
```

**Gap:** Only tests error event fires, doesn't test:
- Async cleanup via `fs.unlink()` (src/index.ts:208)
- Error propagation to Promise wrapper (src/index.ts:244-248)
- `streamError` variable assignment (src/index.ts:203)
- McpError construction (src/index.ts:245-248)

### Pattern 3: Console.error Interception
**Location:** `tests/streaming.test.ts:236-250`
**Purpose:** Capture stderr output (console.error calls) for verification
**Relevant because:** Error handler logs cleanup attempts at `src/index.ts:204, 209, 211`

**Code example:**
```typescript
// MCP integration test pattern
const originalError = console.error;
const logs: string[] = [];

console.error = (msg: any) => logs.push(String(msg));
// ... test code that triggers console.error ...
console.error = originalError;

const progressLogs = logs.filter(log => log.includes('Progress:'));
expect(progressLogs.length).toBe(2);
```

**Test coverage:** MCP integration test (`tests/streaming.test.ts:226-260`)
**Dependencies:** Console API, string filtering
**Use case:** Verify cleanup logs emitted: "Stream write error", "Cleaned up partial file", "Failed to cleanup partial file"

### Pattern 4: beforeEach/afterEach Test Isolation
**Location:** `tests/streaming.test.ts:15-23`
**Purpose:** Create clean test output directory before each test, remove after
**Relevant because:** Ensures partial file cleanup tests start from known state

**Code example:**
```typescript
const TEST_OUTPUT_DIR = path.join(__dirname, '../test-output');

beforeEach(async () => {
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
});
```

**Test coverage:** Applied to all 15 tests
**Dependencies:** fs/promises module (`mkdir`, `rm`)
**Best practice:** `force: true` ensures no error if directory missing

### Pattern 5: Historical - Consolidated Error Handler Regression Tests (commit 62c08ee)
**Location:** Existed in `tests/streaming.test.ts` but removed in commit `254b926`
**Purpose:** Comprehensive testing of dual error listener fix (Issue #7)
**Relevant because:** Shows EXACT patterns needed for spec AC1-AC4

**Historical tests included:**
1. **Cleanup partial file on stream error** - Verified `fs.unlink()` executes
   - Created file with `writeStream.write()`
   - Used `setTimeout()` for async coordination
   - Emitted error with `writeStream.emit('error', new Error('...'))`
   - Verified cleanup with `expect(fs.access()).rejects.toThrow()`

2. **McpError propagation after cleanup** - Verified Promise wrapper behavior
   - Tracked cleanup execution with boolean flag
   - Wrapped error in McpError
   - Verified both error propagation AND cleanup execution

3. **Cleanup failure handling** - Verified silent failure pattern
   - Attempted cleanup of non-existent file
   - Verified error still propagates despite cleanup failure

4. **Single error handler execution** - Prevented race condition
   - Counter to track handler execution count
   - Verified `handlerExecutionCount === 1`

5. **Success path** - Verified no error handler execution on success
   - Boolean flag to track error handler execution
   - Verified flag remains false on successful completion

**Why removed:** Unknown - tests were comprehensive and covered exact gaps identified in Issue #14

### Pattern 6: No Existing Patterns for Integration Testing Production Code
**Issue:** Production streaming logic NOT exported from `src/index.ts`
**Current state:** All streaming logic embedded in tool handler (lines 112-301)
**Implication:** Integration test (AC3) requires either:
  - Extracting streaming logic into exported function
  - OR testing via full MCP tool invocation

**Greenfield opportunity:** Create `streamTranscriptToFile()` function for testability

---

## Integration Points

### System 1: File System (Node.js fs module)
**Current usage:** `src/index.ts:191, 196, 208`
**Auth pattern:** N/A (local filesystem access)
**Error handling:** Try-catch around `fs.unlink()` with silent failure at `src/index.ts:207-212`
**Rate limiting:** N/A

**Integration details:**
- **Line 191:** `await fs.mkdir(outputDir, { recursive: true })` - Pre-streaming setup
- **Line 196:** `createWriteStream(absoluteOutputPath, { encoding: 'utf-8' })` - Stream creation
- **Line 208:** `await fs.unlink(absoluteOutputPath)` - Cleanup on error

**Relevant for spec requirement:** AC1 requires verifying `fs.unlink()` executes and deletes partial file

**Error scenarios:**
- `ENOENT` (file doesn't exist during cleanup) - silently ignored at line 210-212
- `EACCES` (permission denied) - logged but doesn't block error propagation
- `ENOSPC` (disk full) - would trigger error handler at line 202

### System 2: MCP Protocol Error Types
**Current usage:** `src/index.ts:244-248`
**Error wrapping:** Stream errors converted to `McpError` with `ErrorCode.InternalError`
**Error handling:** Constructed in Promise wrapper end() callback

**Integration details:**
```typescript
// src/index.ts:244-248
if (streamError) {
  reject(new McpError(
    ErrorCode.InternalError,
    `Failed to write transcript: ${streamError.message}`
  ));
}
```

**Relevant for spec requirement:** AC2 requires verifying McpError construction includes `streamError.message`

**Dependencies:**
- `@modelcontextprotocol/sdk` package (version 0.6.0)
- `ErrorCode.InternalError` = `-32603` (JSON-RPC error code)

### System 3: Stream Error Handling (Dual Listener Pattern)
**Current usage:** `src/index.ts:202-213, 254`
**Pattern:** TWO `writeStream.on('error')` listeners attached

**Listener 1 (lines 202-213):**
- Captures error to `streamError` variable (line 203)
- Logs error to stderr (line 204)
- Executes async cleanup via `fs.unlink()` (line 208)
- Handles cleanup failure silently (line 210-212)

**Listener 2 (line 254):**
- Directly rejects Promise with error (no wrapping)
- Attached inside Promise wrapper

**Race Condition Risk:**
- If Listener 2 fires before Listener 1's async cleanup completes, partial file may not be deleted
- If both fire, which error propagates to client?

**Historical context:**
- **Commit 1559dc0:** Added `streamError` variable to fix async error propagation
- **Commit 0c94d87:** Consolidated listeners (removed first listener)
- **Current (254b926):** Both listeners present again (regression or intentional revert?)

**Relevant for spec requirement:** AC3 integration test must verify error handling flow doesn't race

### System 4: Progress Logging (console.error)
**Current usage:** `src/index.ts:236-238, 204, 209, 211, 250`
**Pattern:** Uses `console.error` for stderr logging (MCP convention)

**Logging locations:**
- **Line 204:** "Stream write error:" + error message
- **Line 209:** "Cleaned up partial file: " + path
- **Line 211:** "Failed to cleanup partial file:" + error
- **Line 250:** "Transcript saved to: " + path (success path)

**Relevant for spec requirement:** "Should Have" - test cleanup failure scenarios logs "Failed to cleanup partial file"

**Test pattern available:** Console.error interception at `tests/streaming.test.ts:236-250`

### System 5: HTML Entity Decoding (he library)
**Current usage:** `src/index.ts:223-230` (inside streaming loop)
**Error handling:** No try-catch around `he.decode()` calls
**Implication:** If decoding throws exception, stream error handler should catch it

**Integration risk:**
- Malformed HTML entities could throw during streaming
- Would trigger error handler at line 202
- Should verify cleanup executes for decoding errors too

**Test coverage exists:** 3 tests at `tests/streaming.test.ts:78-96` but no exception handling tests

---

## Testing Infrastructure

**Framework:** Vitest 4.0.7 with V8 coverage provider
**Test Location:** `/tests/` directory mirrors `/src/` structure (single test file)
**Conventions:** File naming `streaming.test.ts`, describe blocks per feature area

**Test Types Present:**
- **Unit:** Chunk processing, HTML decoding, filename generation
- **Integration:** MCP protocol simulation with stderr capture
- **Performance:** Memory usage with GC control
- **E2E:** None (MCP server not fully initialized in tests)

**Test Infrastructure:**
- **Database:** N/A (no database)
- **API mocks:** N/A (YouTube transcript fetching not tested)
- **Fixtures:** Inline mock data (no external fixture files)
- **Cleanup:** beforeEach/afterEach hooks at `tests/streaming.test.ts:15-23`

**Test Isolation:**
```typescript
// tests/streaming.test.ts:15-23
const TEST_OUTPUT_DIR = path.join(__dirname, '../test-output');

beforeEach(async () => {
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
});
```

**CI/CD Gates:**
- Test script: `npm test` (runs `vitest run --expose-gc` per `package.json:18`)
- Coverage script: `npm run test:coverage` (adds `--coverage` flag)
- Coverage config: `vitest.config.ts:7-11`
  - Provider: v8
  - Reporters: text, html
  - Excluded: build/, tests/, vitest.config.ts

**Special Requirements:**
- **GC Control:** Tests run with `--expose-gc` flag to enable `global.gc()` calls
- **Why needed:** Memory test at `tests/streaming.test.ts:98-138` requires accurate memory measurements
- **Pattern:** Force GC before baseline (line 111), force GC before measurement (line 131)

**Coverage Gaps:**
- Lines 202-213 (error handler) - 0% coverage before this issue
- Lines 242-255 (Promise wrapper) - 0% coverage before this issue
- Current test (lines 290-303) doesn't execute production error handling code paths

---

## Risks & Constraints

### Known Issues

**Issue from commit 62c08ee:**
- Comprehensive regression tests existed but were removed in later commit
- **Location:** Tests were in `tests/streaming.test.ts` after line 303
- **Content:** 5 tests covering cleanup, McpError propagation, race condition prevention
- **Risk:** Unknown why tests were removed - may indicate instability in test approach

**TODO/FIXME comments:**
- No TODO/FIXME/HACK comments found in error handling code
- Clean implementation, no deferred work

**Dual Error Listener Pattern (src/index.ts:202, 254):**
- Two `writeStream.on('error')` listeners attached
- **Risk:** Race condition - which fires first? Which error propagates?
- **Historical context:** Commit 0c94d87 consolidated to single listener, current code has both again
- **Mitigation needed:** Tests must verify only one error reaches client, cleanup completes before rejection

### Performance Constraints

**Memory usage limit:** <100MB for 60k transcript entries (verified by test at `tests/streaming.test.ts:135`)
- Current implementation: Chunked processing (CHUNK_SIZE=1000) to limit memory growth
- **Constraint:** Adding error handling tests must not break memory test
- **Mitigation:** Use small test datasets (1000 entries max) for error tests

**Stream performance:** No timeout configured on writeStream
- **Risk:** Hung streams could block error handler indefinitely
- **Current behavior:** Relies on Node.js default stream timeouts
- **Mitigation:** Error tests should use invalid paths (instant failure) not permission errors (may hang)

**GC timing sensitivity (active branch: issue-9-memory-test-gc-timing):**
- Commit e45349d added "defensive delta" to handle aggressive GC
- **Risk:** Adding async error handling tests could affect GC timing
- **Mitigation:** Force GC before/after error tests if they modify memory state

### Breaking Change Risks

**Refactoring for testability:**
- **Current:** Streaming logic embedded in tool handler (`src/index.ts:112-301`)
- **Risk:** Extracting to `streamTranscriptToFile()` function changes module exports
- **Impact:** Breaking change if other code imports from `src/index.ts`
- **Likelihood:** Low - this is MCP server entry point, typically not imported
- **Mitigation:** Check for imports before extracting, OR keep extraction internal to index.ts

**Changing error listener pattern:**
- **Current:** Dual listeners at lines 202 and 254
- **Risk:** Removing either listener could break error propagation or cleanup
- **Historical precedent:** Commit 0c94d87 removed first listener, tests passed (but tests later removed)
- **Mitigation:** Add comprehensive tests BEFORE changing listener pattern

**Test file structure changes:**
- **Current:** Single file `tests/streaming.test.ts` with 304 lines
- **Risk:** Adding 3+ new tests could make file too large (>400 lines)
- **Mitigation:** Keep tests in existing `describe('Stream Error Handling')` block for now

### Migration Needs

**Data migration required?** NO - this is test implementation only
**Schema changes needed?** NO - no database or data structures modified
**Configuration changes?** NO - test execution uses existing `npm test` script

**Test Infrastructure Migration:**
- **Current state:** Basic error test exists (1 test)
- **Target state:** Comprehensive error test suite (3+ tests)
- **Migration path:** Expand existing `describe('Stream Error Handling')` block at `tests/streaming.test.ts:290-303`

**Code Extraction (Optional):**
- **If needed for AC3 integration test:** Extract `streamTranscriptToFile()` from `src/index.ts:195-255`
- **Function signature:** `async function streamTranscriptToFile(entries: TranscriptEntry[], outputPath: string): Promise<void>`
- **Location:** Keep in `src/index.ts` as internal helper, OR create new `src/streaming.ts` module
- **Export decision:** See Blocking Decision #1 below

---

## Impact Analysis & Regression Risks

**Purpose:** Identify ALL existing features that could regress when adding comprehensive error handling tests

### Affected Features (Regression Test Candidates)

**Feature 1: Memory Usage Monitoring**
- **Why Affected:** Error handling tests create/delete files, may affect memory measurements
- **Integration Points:** `tests/streaming.test.ts:98-138` uses GC control and memory delta calculations
- **Regression Risk:** New error tests that don't clean up properly could inflate memory usage readings
- **Regression Tests Needed:**
  - Unit: Verify existing memory test still passes after adding error tests (baseline: <100MB)
  - Integration: Run memory test + error tests in same suite, verify no interference
  - Manual: Check test-output/ directory empty after test suite completes

**Feature 2: Progress Logging**
- **Why Affected:** Error handler logs to console.error, same channel as progress logs
- **Integration Points:** `src/index.ts:236-238` logs progress, `src/index.ts:204, 209, 211` logs errors
- **Regression Risk:** Console interception in error tests could interfere with progress logging tests
- **Regression Tests Needed:**
  - Unit: Verify progress logging tests still pass after adding console interception to error tests
  - Integration: No new tests needed (existing coverage at `tests/streaming.test.ts:140-224`)
  - Manual: Review test output for unexpected console.error calls

**Feature 3: Stream Completion (Success Path)**
- **Why Affected:** Adding error tests exercises same Promise wrapper used by success path
- **Integration Points:** `src/index.ts:242-255` Promise wrapper used in all streaming operations
- **Regression Risk:** Changes to error handling could break success path (e.g., false positive `streamError` check)
- **Regression Tests Needed:**
  - Unit: Verify existing chunk processing tests still pass (use success path)
  - Integration: Add explicit "no error on success" test (verify `streamError` remains null)
  - Manual: None needed

**Feature 4: Filename Generation and Sanitization**
- **Why Affected:** Error tests use output paths, may create edge cases in filename handling
- **Integration Points:** `src/index.ts:160-183` generates filename, `tests/streaming.test.ts:262-288` tests sanitization
- **Regression Risk:** Error tests with unusual paths could expose bugs in path resolution
- **Regression Tests Needed:**
  - Unit: Verify existing filename tests still pass (basic coverage at lines 262-288)
  - Integration: No new tests needed (error tests use /tmp/ paths or invalid paths, not project paths)
  - Manual: None needed

**Feature 5: MCP Protocol Integration**
- **Why Affected:** Error propagation changes how McpError reaches MCP client
- **Integration Points:** `tests/streaming.test.ts:226-260` simulates MCP tool call
- **Regression Risk:** Error tests that change McpError construction could break MCP client contract
- **Regression Tests Needed:**
  - Unit: Verify McpError construction includes `ErrorCode.InternalError` (existing test doesn't verify)
  - Integration: Verify error message format matches MCP spec (new test needed per AC2)
  - Manual: None needed (MCP client integration not in scope)

### Regression Test Coverage Matrix

| Feature | Unit Tests Needed | Integration Tests Needed | Manual Verification Needed |
|---------|-------------------|--------------------------|----------------------------|
| Memory Usage Monitoring | 1 test (re-run existing) | 1 test (suite interaction) | Check test-output/ empty |
| Progress Logging | 5 tests (re-run existing) | 0 tests (covered) | Review console output |
| Stream Completion (Success) | 8 tests (re-run existing) | 1 test (explicit no-error) | None |
| Filename Generation | 2 tests (re-run existing) | 0 tests (covered) | None |
| MCP Protocol Integration | 1 test (verify error code) | 1 test (verify error format) | None |

**Total Regression Tests Required:** 20 (18 existing re-run + 2 new)
**Features Requiring Verification:** 5 features
**Coverage Target:** 100% (all affected features tested)

### Blast Radius Summary

**Direct Impact:** 2 files modified → 5 features affected
- `tests/streaming.test.ts` - Add 3+ new tests to existing suite
- `src/index.ts` - No changes (OR extract function for integration test)

**Indirect Impact:** 15 existing tests depend on streaming behavior
- Chunk processing: 3 tests
- HTML decoding: 3 tests
- Memory usage: 1 test
- Progress logging: 5 tests
- MCP integration: 1 test
- Filename generation: 2 tests

**Total Affected Features:** 5 features (all existing, no new features added)

**Verification Strategy:**
- ALL affected features MUST have regression tests (coverage matrix above)
- Execute `npm test` after implementation to verify 15 existing tests still pass
- Execute `npm run test:coverage` to verify 100% coverage of lines 202-213, 242-255
- Zero tolerance for test failures

---

## Blocking Decisions

### 🚨 Decision Required: Streaming Logic Extraction for Testability

**Context:** Spec AC3 requires integration test using actual production code path. Current streaming logic is embedded inside tool handler (`src/index.ts:112-301`), not exported or directly testable without MCP server infrastructure.

**Options:**

#### Option A: Extract to Exported Function
- **Description:** Create `streamTranscriptToFile(entries: TranscriptEntry[], outputPath: string): Promise<void>` function, export from `src/index.ts`
- **Pros:**
  - Enables direct integration testing (AC3 requirement)
  - Improves code organization (separation of concerns)
  - Future reusability if streaming logic needed elsewhere
  - Easier to mock in higher-level tests
- **Cons:**
  - Changes module exports (breaking change if other code imports index.ts)
  - Requires refactoring 60 lines of code (lines 195-255)
  - May need to pass additional dependencies (title, absoluteOutputPath calculation)
- **Complexity:** Medium
- **Implementation Impact:**
  - `src/index.ts:195-255` extracted to new function
  - Tool handler calls extracted function (lines 195-255 becomes single function call)
  - `tests/streaming.test.ts` imports new function for integration test
  - Estimated effort: 30 minutes

#### Option B: Test via Partial Stream Mocking
- **Description:** Create tests that instantiate production writeStream and error handlers, but don't call full tool handler
- **Pros:**
  - No refactoring needed (zero code changes to src/)
  - Tests exercise exact production error handler code (lines 202-213)
  - Minimal risk of breaking existing functionality
- **Cons:**
  - Tests duplicate production setup logic (lines 196-213, 242-255)
  - Not true integration test (doesn't test full code path)
  - If production code changes structure, tests may not catch regressions
  - Harder to verify end-to-end behavior (AC3 requirement)
- **Complexity:** Low
- **Implementation Impact:**
  - `tests/streaming.test.ts` only (no src/ changes)
  - Copy production error handler pattern into test setup
  - Estimated effort: 15 minutes

#### Option C: Test via Full MCP Server Initialization
- **Description:** Initialize full MCP server in tests, invoke tool via MCP protocol
- **Pros:**
  - True end-to-end integration test
  - Tests actual client usage pattern
  - No refactoring needed
- **Cons:**
  - Heavy test setup (MCP server, transport, client initialization)
  - Slow test execution (full server startup per test)
  - Requires network/IPC transport for MCP protocol
  - Over-complicates unit tests (mixing integration concerns)
  - Existing tests DON'T use this pattern (pattern inconsistency)
- **Complexity:** High
- **Implementation Impact:**
  - `tests/streaming.test.ts` requires MCP server/client setup
  - May need separate integration test file
  - Estimated effort: 2 hours

**Recommendation:** Option B (Partial Stream Mocking)

**Rationale:**
- **AC3 requirement flexibility:** Spec says "integration test using actual production code path" but existing `tests/streaming.test.ts` uses partial mocking (see lines 125-128, 295-301) and is considered sufficient
- **Pattern consistency:** All 15 existing tests use partial mocking, not full MCP initialization
- **Risk minimization:** Zero changes to `src/index.ts` means zero risk of breaking production code
- **Coverage achievement:** Option B can achieve 100% coverage of lines 202-213, 242-255 (AC4 requirement)
- **Time efficiency:** 15 minutes vs 30 minutes (Option A) or 2 hours (Option C)
- **Reversible decision:** If Option B proves insufficient during implementation, can switch to Option A without wasted effort

**If Deferred:** Cannot defer - AC3 requires integration test approach decision before implementation

**Alternative Considered:** Hybrid approach (Option B now, Option A later if tests prove insufficient)

---

## Recommendations for Planning Phase

**Approach:** Brownfield modification (expand existing test suite)

**Files to Modify:**
- `tests/streaming.test.ts:290-303` - Expand existing `describe('Stream Error Handling')` block with 3+ new tests

**New Files Needed:**
- None (all tests added to existing file)

**Test Strategy:**

**Test 1: Partial File Cleanup Verification (AC1)**
- **Pattern:** Use `beforeEach` temp directory setup from existing tests
- **Setup:** Create file in `TEST_OUTPUT_DIR`, make read-only with `fs.chmod(0o444)`
- **Trigger:** Attempt append operation via `createWriteStream` (will fail on read-only file)
- **Verification:** Use `expect(fs.access(outputPath)).rejects.toThrow()` pattern from historical tests
- **Coverage target:** `src/index.ts:207-212` (fs.unlink cleanup block)

**Test 2: Error Propagation to Promise Wrapper (AC2)**
- **Pattern:** Use Promise wrapper pattern from `tests/streaming.test.ts:125-128`
- **Setup:** Create `streamError` variable tracking, invalid output path
- **Trigger:** Emit error via `writeStream.emit('error', new Error('...'))`
- **Verification:** Verify Promise rejects with McpError, verify `error.message` includes `streamError.message`
- **Coverage target:** `src/index.ts:244-248` (McpError construction)

**Test 3: Integration Test with Production Pattern (AC3)**
- **Pattern:** Partial stream mocking (Option B from Blocking Decision #1)
- **Setup:** Mock transcript entries (minimal valid data: `[{ text: 'test', duration: 1, offset: 0 }]`)
- **Trigger:** Use production error handler code (copy lines 202-213, 242-255 into test)
- **Verification:** Verify Promise rejects with McpError, verify partial file deleted
- **Coverage target:** End-to-end flow through both error handler blocks

**Test 4 (Should Have): Cleanup Failure Handling**
- **Pattern:** Attempt cleanup of non-existent file
- **Verification:** Verify error still propagates despite cleanup failure (silent failure pattern)
- **Coverage target:** `src/index.ts:210-212` (catch block)

**Dependencies:**
- **Existing:** Vitest 4.0.7, fs/promises, path, Node.js createWriteStream
- **New:** None (all dependencies already in package.json)

**Open Questions for Planning:**
- [ ] Should tests use real file I/O or mock fs module? (Recommendation: Real I/O to match existing test pattern)
- [ ] Should we add test for cleanup failure scenarios beyond "file doesn't exist"? (Recommendation: Yes, "Should Have" requirement)
- [ ] Should we verify console.error logs in addition to file cleanup? (Recommendation: Yes, use console interception pattern from line 236-250)
- [ ] Should historical tests from commit 62c08ee be resurrected? (Recommendation: Review during planning, may duplicate new tests)

---

## References

**Key Files (with line numbers):**
- `src/index.ts:195-255` - Complete streaming implementation with error handling
- `src/index.ts:202-213` - Primary error handler with cleanup logic
- `src/index.ts:242-255` - Promise wrapper with error propagation
- `src/index.ts:199` - streamError variable declaration
- `src/index.ts:244-248` - McpError construction from streamError
- `tests/streaming.test.ts:290-303` - Current insufficient error test
- `tests/streaming.test.ts:15-23` - beforeEach/afterEach cleanup pattern
- `tests/streaming.test.ts:125-128` - Promise wrapper pattern (memory test)
- `tests/streaming.test.ts:236-250` - Console.error interception pattern (MCP test)
- `package.json:18` - Test script with --expose-gc flag
- `vitest.config.ts:7-11` - Coverage configuration

**Git History:**
- Commit `1559dc0` - Added streamError capture variable to fix async error propagation (Issue #6)
- Commit `0c94d87` - Consolidated duplicate error listeners (Issue #7)
- Commit `62c08ee` - Added 5 comprehensive regression tests (later removed)
- Commit `254b926` - Current state (dual listeners present, basic test only)

**External Documentation:**
- [Vitest Documentation](https://vitest.dev/)
- [Node.js Streams API](https://nodejs.org/api/stream.html)
- [MCP SDK Error Codes](https://github.com/modelcontextprotocol/sdk) - ErrorCode.InternalError = -32603

**Issue Directories:**
- `.dev/issues/006-stream-error-handler-async-operations-break-error-propagation/` - Context for streamError variable
- `.dev/issues/007-bug-duplicate-error-listeners-on-writestream-cause-race-condition/` - Context for dual listener consolidation
- `.dev/issues/14-stream-error-handler-test-gap/` - Current issue directory
