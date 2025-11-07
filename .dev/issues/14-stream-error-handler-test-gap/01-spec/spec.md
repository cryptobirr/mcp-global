## 📋 SPEC: Stream Error Handler Test Coverage

**Approach:** BROWNFIELD
**Tech Stack:** TypeScript, Vitest, Node.js fs module
**Feature Type:** BACKEND

---

### What We're Building

Comprehensive test suite for stream error handling logic that verifies async file cleanup, error propagation, and partial file deletion behavior. This addresses a critical test gap that allowed Issue #6 to pass code review.

---

### User Flow

1. Stream error occurs during transcript file write operation
2. Error handler captures error and assigns to `streamError` variable
3. System attempts async cleanup via `fs.unlink()` to delete partial file
4. Error propagates to Promise wrapper with proper McpError construction
5. Calling code receives rejected promise with detailed error message

---

### Requirements

**Must Have:**
- Test that verifies partial file cleanup using async `fs.unlink()` (covers src/index.ts:208-212)
- Test that verifies error propagation from stream handler to Promise wrapper (covers src/index.ts:242-255)
- Test that verifies `streamError` variable assignment and McpError construction (covers src/index.ts:203, 244-248)
- Integration test using actual production code path (not isolated stream mocks)
- 100% code coverage for error handling logic at lines 202-213 and 242-255

**Should Have:**
- Test for cleanup failure scenarios (when `fs.unlink()` itself fails)
- Test for concurrent error scenarios (multiple streams failing simultaneously)
- Performance test to ensure cleanup doesn't block stream processing

**Must NOT:**
- ❌ Use isolated stream mocks that bypass production error handler code
- ❌ Test only error event emission without verifying cleanup behavior
- ❌ Skip testing the Promise wrapper error propagation logic

---

### Acceptance Criteria

**AC1:** Partial file cleanup test verifies async `fs.unlink()` execution
- Given: A write stream encounters an error mid-write creating a partial file
- When: The error handler executes (src/index.ts:202-213)
- Then: The partial file is deleted via `fs.unlink()` and file no longer exists on disk

**AC2:** Error propagation test verifies Promise wrapper behavior
- Given: Stream error handler captures an error and assigns to `streamError` variable
- When: Stream completes and Promise wrapper checks `streamError` (src/index.ts:242-255)
- Then: Promise rejects with McpError containing proper error code and message from `streamError`

**AC3:** Integration test verifies end-to-end error handling
- Given: Production streaming function called with invalid output path
- When: Stream error occurs during actual transcript writing
- Then: Error handler executes cleanup, Promise wrapper rejects, and partial file is deleted

**AC4:** Code coverage verification
- Given: All three new tests pass successfully
- When: Running `npm run test:coverage`
- Then: Lines 202-213 and 242-255 in src/index.ts show 100% coverage

---

### Implementation Notes

**[For BROWNFIELD Projects]:**
- Files to modify: `tests/streaming.test.ts:290-303` (expand existing test suite)
- Pattern to follow: `tests/streaming.test.ts:1-289` (existing streaming tests structure)
- Integration points: 
  - Error handler at `src/index.ts:202-213`
  - Promise wrapper at `src/index.ts:242-255`
  - `streamError` variable at `src/index.ts:203`
- Testing approach: Add three new test cases to existing `describe('Stream Error Handling')` block
- Tech stack components: Vitest test framework, Node.js fs/promises module, path module
- Test data: Use `/tmp/claude-test-$$` directory for temporary files to avoid project pollution

**Test Structure:**
```typescript
// tests/streaming.test.ts - expand existing suite

describe('Stream Error Handling', () => {
  // Existing test (line 290) stays as-is
  it('should handle write stream errors gracefully', async () => { ... });

  // NEW TEST 1: Partial file cleanup
  it('should delete partial file on stream write error', async () => {
    // 1. Create temp directory in /tmp/
    // 2. Write initial content to file
    // 3. Make file read-only (chmod 0o444) to trigger write error
    // 4. Attempt append operation via createWriteStream
    // 5. Verify error handler deletes partial file via fs.unlink
    // 6. Assert file no longer exists
  });

  // NEW TEST 2: Error propagation to Promise wrapper
  it('should propagate stream error to Promise wrapper with McpError', async () => {
    // 1. Create invalid output path (/invalid/path)
    // 2. Set up streamError variable tracking
    // 3. Create Promise wrapper matching production pattern (lines 242-255)
    // 4. Trigger stream error
    // 5. Verify Promise rejects with McpError
    // 6. Verify error message includes streamError.message
  });

  // NEW TEST 3: Integration test with production code
  it('should handle errors in production streaming code path', async () => {
    // 1. Mock transcript entries (minimal valid data)
    // 2. Use actual streaming function from src/index.ts (may require export)
    // 3. Provide invalid output path (permission denied or non-existent parent)
    // 4. Call production streaming function
    // 5. Verify Promise rejects with McpError
    // 6. Verify partial file doesn't exist after error
  });
});
```

**Refactoring Requirements:**
- Extract streaming logic from `src/index.ts:195-255` into testable function if not already exported
- Function signature: `streamTranscriptToFile(entries: TranscriptEntry[], outputPath: string, options?: StreamOptions): Promise<void>`
- This enables integration test (AC3) to use actual production code

**Coverage Targets:**
- Before: Lines 202-213 and 242-255 have 0% coverage
- After: Lines 202-213 and 242-255 have 100% coverage
- Verification: `npm run test:coverage` shows green for error handling blocks

---

### Open Questions

- [ ] Should we also test cleanup failure scenarios (when `fs.unlink()` throws)?
- [ ] Does streaming logic need extraction into separate module for better testability?
- [ ] Should tests use real file I/O or mock fs module for faster execution?

### Out of Scope

- Performance optimization of streaming logic (focus is test coverage)
- Refactoring streaming implementation (only test additions unless export needed)
- Testing non-error streaming scenarios (already covered by existing tests lines 1-289)
- UI/UX changes (backend test implementation only)
