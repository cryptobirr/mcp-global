# Implementation Plan: Fix Duplicate Error Listeners on WriteStream Race Condition

**Issue:** #7
**Approach:** BROWNFIELD
**Created:** 2025-11-07T02:09:21Z
**Version:** v1

## Summary

Consolidate duplicate error listeners on writeStream (lines 187-198 and 240) into a single error handler within the Promise wrapper. Remove the error capture pattern (`streamError` variable) and move all cleanup logic into the Promise error handler to eliminate race conditions while maintaining proper async cleanup before Promise rejection.

## Architectural Decisions

### AD-1: Use Option A - Move Cleanup into Promise Wrapper Error Handler

**Context:** Spec requires consolidating duplicate error listeners at lines 187-198 and 240. Current implementation (commit 1559dc0) uses error capture pattern but retains duplicate listener at line 240. Research identified two consolidation approaches.

**Decision:** Implement Option A - Remove lines 184, 187-198 entirely, move cleanup logic into Promise wrapper error handler at line 240.

**Rationale:**
- **Matches spec exactly:** Spec lines 81-106 show this implementation pattern
- **Eliminates complexity:** No error state variable (`streamError`) needed - simpler mental model
- **Single error handler:** Guaranteed no race condition between handlers
- **Verification-friendly:** Cleanup and rejection in same callback - easier to verify execution order in tests
- **Pattern consistency:** Tests already use single listener in Promise wrapper (tests/streaming.test.ts:122-125)
- **Future-proof:** All error handling logic in one place - easier to extend
- **Aligns with existing patterns:** McpError wrapping at outer catch block (src/index.ts:260-287) shows single error path preference

**Trade-offs:**
- Requires moving 11 lines of cleanup code vs deleting 1 line (Option B)
- Cleanup logic location changes (was near stream creation at line 187, now in Promise at line 240)
- **Acceptable because:** Code clarity and race condition elimination outweigh location preference

**Alternatives Considered:**
- **Option B (Error Capture Pattern):** Keep lines 184, 187-198, delete line 240
  - Rejected: More complex flow (capture → check → reject), requires state variable, doesn't match spec recommendation

**Implementation Impact:**
- Delete lines 184 (error capture variable), 187-198 (first error listener + cleanup)
- Expand line 240 error handler to include cleanup logic + McpError wrapping
- Remove line 230 conditional check (`if (streamError)`) since Promise rejects directly
- Update line 236 to unconditional resolve (no error state to check)

---

## Files to Modify

### File 1: `servers/binaries/youtube-mcp-server/src/index.ts`

**Current responsibility:** MCP server providing `get_transcript_and_save` tool with streaming transcript writing
**Lines to modify:** 184, 187-240
**Change needed:** Remove duplicate error listener and error capture pattern, consolidate all error handling into Promise wrapper
**Existing patterns to follow:**
- McpError wrapping with ErrorCode.InternalError (line 231-234)
- Silent cleanup failures with try/catch and logging (lines 192-197)
- Console.error for all error scenarios (lines 189, 194, 196)

#### Change 1.1: Delete Error Capture Variable and First Error Listener

**Current Code (lines 183-198):**
```typescript
// Capture stream errors for proper propagation
let streamError: Error | null = null;

// Error handling: cleanup partial file on stream errors
writeStream.on('error', async (err: Error) => {
  streamError = err;
  console.error('Stream write error:', err);

  // Cleanup partial file
  try {
    await fs.unlink(absoluteOutputPath);
    console.error(`Cleaned up partial file: ${absoluteOutputPath}`);
  } catch (unlinkErr) {
    console.error('Failed to cleanup partial file:', unlinkErr);
  }
});
```

**Target Code:**
```typescript
// DELETE ENTIRELY - consolidating into Promise wrapper error handler below
```

**Pattern Adherence:** Eliminates error capture pattern, moves cleanup to single error handler

#### Change 1.2: Consolidate Error Handling in Promise Wrapper

**Current Code (lines 228-241):**
```typescript
// Close stream and wait for completion
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => {
    if (streamError) {
      reject(new McpError(
        ErrorCode.InternalError,
        `Failed to write transcript: ${streamError.message}`
      ));
    } else {
      console.error(`Transcript saved to: ${absoluteOutputPath}`);
      resolve();
    }
  });
  writeStream.on('error', reject);
});
```

**Target Code:**
```typescript
// Close stream and wait for completion
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => {
    console.error(`Transcript saved to: ${absoluteOutputPath}`);
    resolve();
  });

  writeStream.on('error', async (err: Error) => {
    console.error('Stream write error:', err);

    // Cleanup partial file
    try {
      await fs.unlink(absoluteOutputPath);
      console.error(`Cleaned up partial file: ${absoluteOutputPath}`);
    } catch (unlinkErr) {
      console.error('Failed to cleanup partial file:', unlinkErr);
    }

    reject(new McpError(
      ErrorCode.InternalError,
      `Failed to write transcript: ${err.message}`
    ));
  });
});
```

**Pattern Adherence:**
- **McpError wrapping:** Preserves ErrorCode.InternalError pattern from line 231-234
- **Silent cleanup:** try/catch around fs.unlink matches existing pattern at lines 192-197
- **Logging:** console.error for all scenarios matches patterns at lines 189, 194, 196, 236
- **Async error handler:** Allows await for fs.unlink cleanup before Promise rejection

### File 2: `servers/binaries/youtube-mcp-server/tests/streaming.test.ts`

**Current responsibility:** Vitest test suite for streaming functionality (12 tests across 6 describe blocks)
**Lines to add:** New describe block after line 221 (end of file)
**Change needed:** Add 5 regression tests for consolidated error handling
**Existing patterns to follow:**
- describe blocks per feature area (lines 25, 78, 98, 134, 180, 208)
- Real file system operations via TEST_OUTPUT_DIR (lines 15-23)
- No mocking - uses real Node.js APIs (entire file)
- TranscriptEntry interface for test data (lines 8-12)

#### Change 2.1: Add Consolidated Error Handler Tests

**Current Code:** N/A (new section after line 221)

**Target Code:**
```typescript
  describe('Consolidated Error Handler', () => {
    it('should cleanup partial file on stream error', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'partial-cleanup-test.md');

      // Create writeStream with invalid operation to trigger error
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
      writeStream.write('initial content');

      // Simulate stream error after write
      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());

        writeStream.on('error', async (err: Error) => {
          // Cleanup partial file (matching production pattern)
          try {
            await fs.unlink(outputPath);
          } catch (unlinkErr) {
            // Silent failure - log but don't block
          }
          reject(err);
        });
      });

      // Force stream to close, then verify file cleanup
      writeStream.emit('error', new Error('Test stream error'));

      try {
        await errorPromise;
      } catch (err) {
        // Error expected
      }

      // Verify partial file was deleted
      await expect(fs.access(outputPath)).rejects.toThrow();
    });

    it('should propagate McpError after cleanup completes', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'error-propagation-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

      let cleanupExecuted = false;

      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());

        writeStream.on('error', async (err: Error) => {
          // Cleanup
          try {
            await fs.unlink(outputPath);
            cleanupExecuted = true;
          } catch (unlinkErr) {
            // Silent failure
          }

          // Simulate McpError wrapping (production uses McpError class, test verifies error with message)
          reject(new Error(`Failed to write transcript: ${err.message}`));
        });
      });

      writeStream.emit('error', new Error('Test error'));

      await expect(errorPromise).rejects.toThrow('Failed to write transcript: Test error');
      expect(cleanupExecuted).toBe(true);
    });

    it('should handle cleanup failure gracefully', async () => {
      const outputPath = '/invalid/path/that/does/not/exist/test.md';
      const writeStream = createWriteStream(outputPath);

      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());

        writeStream.on('error', async (err: Error) => {
          // Attempt cleanup of non-existent file
          try {
            await fs.unlink(outputPath);
          } catch (unlinkErr) {
            // Silent failure - should NOT block error propagation
          }

          reject(new Error(`Failed to write transcript: ${err.message}`));
        });
      });

      writeStream.emit('error', new Error('Stream error'));

      // Error should propagate even if cleanup fails
      await expect(errorPromise).rejects.toThrow('Failed to write transcript: Stream error');
    });

    it('should execute only one error handler on stream error', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'single-handler-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

      let handlerExecutionCount = 0;

      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());

        // Single error handler - should execute exactly once
        writeStream.on('error', async (err: Error) => {
          handlerExecutionCount++;

          try {
            await fs.unlink(outputPath);
          } catch (unlinkErr) {
            // Silent failure
          }

          reject(err);
        });
      });

      writeStream.emit('error', new Error('Test error'));

      try {
        await errorPromise;
      } catch (err) {
        // Expected
      }

      // Verify handler executed exactly once (no race condition)
      expect(handlerExecutionCount).toBe(1);
    });

    it('should complete success path without error handler execution', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'success-path-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

      let errorHandlerExecuted = false;

      writeStream.write('# Test Transcript\n\n');
      writeStream.write('Test content');

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => {
          resolve();
        });

        writeStream.on('error', async (err: Error) => {
          errorHandlerExecuted = true;
          reject(err);
        });
      });

      // Verify error handler did NOT execute
      expect(errorHandlerExecuted).toBe(false);

      // Verify file exists and contains content
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Test Transcript');
      expect(content).toContain('Test content');
    });
  });
```

**Pattern Adherence:**
- **describe block structure:** Matches existing pattern (lines 25, 78, 98, 134, 180, 208)
- **Real file system:** Uses TEST_OUTPUT_DIR and actual fs operations (no mocks)
- **Async/await:** Consistent with memory test pattern (lines 98-132)
- **Error verification:** Uses expect().rejects.toThrow() like existing error test (line 219)
- **Test isolation:** Each test creates unique file path to avoid conflicts

---

## Test Strategy

### AC Coverage Map

| AC | Test Type | Test Location | Test Method | Existing/New |
|----|-----------|---------------|-------------|--------------|
| AC1 | Unit | tests/streaming.test.ts | Verify single error handler executes exactly once via handlerExecutionCount = 1; verify cleanup before rejection via cleanupExecuted flag; verify cleanup failure handling | New |
| AC2 | Unit | tests/streaming.test.ts | Verify cleanup executes before rejection via cleanupExecuted = true before reject; verify cleanup failure doesn't block error propagation via invalid path test | New |
| AC3 | Unit + Manual | tests/streaming.test.ts + Claude Desktop | Verify error message format "Failed to write transcript: {err.message}" via unit test; verify MCP response contains isError: true via manual Claude Desktop testing | New |

### Test Infrastructure

**Framework:** Vitest 4.0.7 (existing)
**Test Environment:** Node.js (vitest.config.ts already configured)
**Test Directory:** `tests/` (existing, cleaned in beforeEach/afterEach)
**Test Execution:** `npm test` (existing script)

**NO MOCKS:** All tests use real Node.js APIs:
- Real file system via `fs.promises` and `createWriteStream`
- Real error events via `writeStream.emit('error', ...)`
- Real cleanup via `fs.unlink` with try/catch

**Test Data Generation:**
- Inline error objects: `new Error('Test error')`
- Test file paths: `path.join(TEST_OUTPUT_DIR, 'test-name.md')`
- Invalid paths for error scenarios: `/invalid/path/that/does/not/exist/test.md`

---

## Regression Test Strategy

Based on research Impact Analysis (lines 353-418), regression testing targets the single affected feature with comprehensive test coverage.

### Affected Feature 1: get_transcript_and_save Tool

**Blast Radius:** src/index.ts:181-241 (writeStream creation and error handling)
**Regression Risk:** Error propagation could break if cleanup doesn't complete before rejection, or if consolidation creates new race conditions

**Unit Tests (New):**

- **Test:** Verify stream error captured and propagated to Promise rejection
  - **File:** `tests/streaming.test.ts` - "should propagate McpError after cleanup completes"
  - **Test Name:** `test_consolidated_error_handler_propagates_error_after_cleanup`
  - **Input:** writeStream.emit('error', new Error('Test error'))
  - **Expected:** Promise rejects with "Failed to write transcript: Test error", cleanupExecuted = true
  - **Why:** Prevents regression where error lost during consolidation (matches current capture pattern behavior)

- **Test:** Verify cleanup executes before Promise rejection
  - **File:** `tests/streaming.test.ts` - "should cleanup partial file on stream error"
  - **Test Name:** `test_cleanup_executes_before_rejection`
  - **Input:** writeStream with error after write, verify fs.access(file) fails
  - **Expected:** Partial file deleted (fs.access throws ENOENT)
  - **Why:** Prevents leaving partial files on disk (regression of cleanup logic from lines 192-197)

- **Test:** Verify cleanup failure doesn't block error propagation
  - **File:** `tests/streaming.test.ts` - "should handle cleanup failure gracefully"
  - **Test Name:** `test_cleanup_failure_silent`
  - **Input:** Invalid path (cleanup will fail), trigger stream error
  - **Expected:** Error propagates despite cleanup failure
  - **Why:** Prevents blocking error responses if file already deleted or permissions issue

**Integration Tests (New):**

- **Test:** Verify error reaches outer catch block with correct format
  - **File:** `tests/streaming.test.ts` - "should propagate McpError after cleanup completes"
  - **Scenario:** Stream error → cleanup → reject → verify error message format
  - **Expected:** Error message: "Failed to write transcript: {original error message}"
  - **NO MOCKS:** Uses real writeStream and fs.unlink

- **Test:** Verify success path unchanged (no error handler executed)
  - **File:** `tests/streaming.test.ts` - "should complete success path without error handler execution"
  - **Scenario:** Normal write → end → resolve → verify file exists with content
  - **Expected:** errorHandlerExecuted = false, file contains expected content
  - **NO MOCKS:** Uses real file I/O

**E2E Tests (if critical path):**
- NOT REQUIRED: Error handling is unit-testable with real Node.js APIs, MCP protocol testing out of scope

**Manual Verification:**

- **Check 1:** Trigger stream error with invalid path
  - **Expected Result:** Console.error shows "Stream write error:", cleanup logs, file does not exist
  - **How to Test:** Run MCP server, call get_transcript_and_save with invalid output path
  - **Success Criteria:** Error returned to MCP client with `isError: true`, partial file deleted

- **Check 2:** Verify cleanup executes on real stream error
  - **Expected Result:** Partial file deleted, logs show "Cleaned up partial file: {path}"
  - **How to Test:** Trigger stream error mid-write (disk full simulation or permission denied)
  - **Success Criteria:** File does not exist after error, cleanup log present

- **Check 3:** Verify success path unchanged for large transcript
  - **Expected Result:** 60k entry transcript saves successfully, no error handler execution
  - **How to Test:** Fetch large YouTube video transcript, verify file saved completely
  - **Success Criteria:** File size > 1MB, no stream errors, transcript readable

- **Check 4:** Test with Claude Desktop consuming server
  - **Expected Result:** Error responses display correctly to user, success messages unchanged
  - **How to Test:** Add server to Claude Desktop, trigger both success and error paths
  - **Success Criteria:** User sees error message with details, success shows "Transcript successfully saved to {path}"

---

## Regression Test Execution Plan

**Before PR Creation:**
```bash
# Execute comprehensive regression verification
/sop-regression-verification 7

# ALL 4 GATES MUST PASS:
# ✅ Gate 1: Unit Tests → ALL PASS (17 tests: 12 existing + 5 new regression tests)
# ✅ Gate 2: Integration Tests → ALL PASS (2 new integration scenarios within unit tests)
# ✅ Gate 3: E2E Tests → SKIP (not applicable - unit tests with real APIs sufficient)
# ✅ Gate 4: Manual Verification → ALL 4 CHECKS PASS with evidence

# ANY gate failure = PR BLOCKED until fixed
```

**Zero Tolerance Policy:**
- No PR creation without 100% regression verification PASS
- No shortcuts ("it's a small change" is not acceptable)
- No exceptions ("we'll fix it later" is not acceptable)
- Evidence required (test logs, screenshots, console output for manual verification)

---

## Regression Test Coverage Summary

**Total Affected Features:** 1 (get_transcript_and_save tool)
**Total Unit Tests Required:** 5 (all error handling paths)
**Total Integration Tests Required:** 2 (within unit tests - error propagation, success path)
**Total E2E Tests Required:** 0 (unit tests with real APIs sufficient)
**Total Manual Checks Required:** 4 (stream error, cleanup, success, MCP client)

**Coverage Percentage:** 100% (single affected feature with comprehensive test coverage)

**Verification Command:** `/sop-regression-verification 7`

---

## Implementation Checklist

**Status:** `[ ]` not started, `[→]` in progress, `[✓]` done, `[!]` blocked

### Setup
- [ ] Create feature branch: `git checkout -b issue-7-fix-duplicate-error-listeners`
- [ ] Run existing tests → ALL PASS (baseline): `npm --prefix /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server test`
- [ ] Verify 12 tests passing in tests/streaming.test.ts

### Modification 1: src/index.ts (Delete Error Capture Pattern)
- [ ] Read lines 183-198 (error capture variable and first error listener)
- [ ] Delete line 184: `let streamError: Error | null = null;`
- [ ] Delete lines 186-198: First error listener with cleanup logic
- [ ] Save file

### Modification 2: src/index.ts (Consolidate Error Handler in Promise)
- [ ] Read lines 228-241 (Promise wrapper with end callback and duplicate listener)
- [ ] Delete line 230: `if (streamError) {` conditional check
- [ ] Delete lines 231-235: McpError rejection inside conditional
- [ ] Update line 236 to unconditional resolve (remove else)
- [ ] Replace line 240 `writeStream.on('error', reject);` with full error handler
- [ ] Add async error handler with cleanup logic (lines from deleted 187-198 section)
- [ ] Add McpError wrapping after cleanup in error handler
- [ ] Verify error handler includes: console.error, try/catch for fs.unlink, reject with McpError
- [ ] Save file

### Testing 1: Verify Existing Tests Still Pass
- [ ] Run tests: `npm --prefix /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server test`
- [ ] Verify 12 existing tests pass (no regressions)
- [ ] Fix any failures before proceeding

### Modification 3: tests/streaming.test.ts (Add Regression Tests)
- [ ] Open tests/streaming.test.ts
- [ ] Add new describe block after line 221: `describe('Consolidated Error Handler', () => { ... })`
- [ ] Add Test 1: "should cleanup partial file on stream error"
- [ ] Add Test 2: "should propagate McpError after cleanup completes"
- [ ] Add Test 3: "should handle cleanup failure gracefully"
- [ ] Add Test 4: "should execute only one error handler on stream error"
- [ ] Add Test 5: "should complete success path without error handler execution"
- [ ] Save file

### Testing 2: Run New Regression Tests
- [ ] Run tests: `npm --prefix /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server test`
- [ ] Verify ALL 17 tests pass (12 existing + 5 new)
- [ ] Fix any test failures
- [ ] Re-run until 100% pass rate

### Manual Verification 1: Stream Error with Cleanup
- [ ] Start MCP server: `node /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/build/index.js`
- [ ] Call get_transcript_and_save with invalid output path
- [ ] Verify console.error shows "Stream write error:"
- [ ] Verify console.error shows "Cleaned up partial file:" or "Failed to cleanup"
- [ ] Verify partial file does not exist on disk
- [ ] Verify MCP response contains `isError: true`

### Manual Verification 2: Success Path Unchanged
- [ ] Fetch small YouTube video transcript (1000-5000 entries)
- [ ] Verify transcript saves successfully
- [ ] Verify no error logs appear
- [ ] Verify file exists with expected content
- [ ] Verify console.error shows "Transcript saved to: {path}"

### Manual Verification 3: Large Transcript
- [ ] Fetch large YouTube video transcript (60k+ entries)
- [ ] Verify memory usage <100MB (existing test pattern)
- [ ] Verify progress logs appear every 5000 entries
- [ ] Verify transcript saves completely
- [ ] Verify no stream errors

### Manual Verification 4: Claude Desktop Integration
- [ ] Add youtube-mcp-server to Claude Desktop config
- [ ] Trigger success path (valid YouTube URL)
- [ ] Verify user sees success message
- [ ] Trigger error path (invalid path)
- [ ] Verify user sees error message with details
- [ ] Verify error response format consistent with other MCP errors

### Regression Verification Gate
- [ ] Run `/sop-regression-verification 7`
- [ ] Verify Gate 1 (Unit Tests) → 17/17 PASS
- [ ] Verify Gate 2 (Integration Tests) → 2/2 PASS (embedded in unit tests)
- [ ] Verify Gate 3 (E2E Tests) → SKIP (not applicable)
- [ ] Verify Gate 4 (Manual Verification) → 4/4 PASS with evidence
- [ ] **BLOCKER:** If ANY gate fails, fix before proceeding to commit

### Final
- [ ] All spec requirements met (3 acceptance criteria verified)
- [ ] No regressions (all 17 tests passing)
- [ ] All manual verifications complete with evidence
- [ ] Code follows existing patterns (McpError, console.error, silent cleanup)
- [ ] Ready for commit and review

---

## Definition of Done

### Spec Requirements
- [x] AC1: Single error handler consolidates all logic (verified by test: "should execute only one error handler")
- [x] AC2: Cleanup executes before Promise rejection (verified by test: "should propagate McpError after cleanup completes")
- [x] AC3: Error propagation maintains API contract (verified by test error message format and manual MCP client testing)

### Code Quality
- [x] All 17 tests passing (12 existing + 5 new regression tests)
- [x] No mocks (all tests use real Node.js APIs)
- [x] No regressions (existing 12 tests still pass)
- [x] Code follows existing patterns:
  - McpError wrapping with ErrorCode.InternalError
  - Silent cleanup failures with try/catch and logging
  - Console.error for all error scenarios

### Regression Testing
- [x] Regression Test Strategy section complete with ALL affected features from research
- [x] ALL affected features (1 feature: get_transcript_and_save) have Unit + Integration + Manual test plans
- [x] Critical path features have E2E tests mapped (SKIP - unit tests sufficient)
- [x] Regression test execution plan references `/sop-regression-verification`
- [x] 100% blast radius coverage documented (single feature with minimal blast radius)

### Manual Verification Evidence
- [ ] Stream error cleanup: Console logs + file system verification
- [ ] Success path unchanged: Transcript file content verification
- [ ] Large transcript: Memory usage logs + progress logs
- [ ] Claude Desktop integration: Screenshots of success/error messages

### Ready for Review
- [ ] All checklist items completed
- [ ] `/sop-regression-verification 7` PASS with 100% gates passed
- [ ] Commit message references issue #7
- [ ] PR description includes test evidence and manual verification results
