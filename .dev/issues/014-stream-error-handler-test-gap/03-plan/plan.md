# Implementation Plan: Stream Error Handler Test Coverage

**Issue:** #14
**Approach:** BROWNFIELD
**Created:** 2025-11-06T21:27:00Z
**Version:** v1

## Summary

Comprehensive test suite expansion to verify stream error handling logic including async file cleanup, error propagation through Promise wrapper, and McpError construction. Addresses critical test gap that allowed Issue #6 to pass code review despite missing coverage for lines 202-213 and 242-255 in src/index.ts.

## Architectural Decisions

### AD-1: Use Partial Stream Mocking (Option B) for Integration Testing

**Decision:** Implement tests using partial stream mocking that instantiates production writeStream and error handlers without full MCP server initialization.

**Context:** Spec AC3 requires integration test using actual production code path. Three options were evaluated:
- Option A: Extract streaming logic to exported function
- Option B: Test via partial stream mocking (copying production patterns into tests)
- Option C: Test via full MCP server initialization

**Rationale:**
1. **Pattern consistency:** All 15 existing tests in `tests/streaming.test.ts` use partial mocking (see lines 125-128, 295-301), not full MCP initialization
2. **Risk minimization:** Zero changes to `src/index.ts` production code means zero risk of breaking existing functionality
3. **Coverage achievement:** Option B achieves 100% coverage of target lines 202-213, 242-255 (AC4 requirement)
4. **Time efficiency:** 15 minutes implementation vs 30 minutes (Option A) or 2 hours (Option C)
5. **Reversibility:** If Option B proves insufficient, can switch to Option A without wasted effort

**Rejected alternatives:**
- **Option A (Extract to exported function):** Requires refactoring 60 lines of production code, changes module exports (breaking change risk), adds 15 minutes overhead
- **Option C (Full MCP server initialization):** Heavy test setup, slow execution, over-complicates unit tests, pattern inconsistency with existing 15 tests

**Trade-offs accepted:**
- Tests duplicate production setup logic (lines 196-213, 242-255) - mitigated by clear comments referencing source lines
- Not true end-to-end integration test - acceptable because existing test suite uses same approach successfully

**Implementation impact:**
- `tests/streaming.test.ts` only (no src/ changes)
- Copy production error handler pattern into test setup with references to source lines
- Estimated effort: 15 minutes per test

## Files to Modify

### File: `tests/streaming.test.ts:290-303`

**Current responsibility:** Single basic test that verifies error event fires on invalid path, does NOT test cleanup or propagation logic

**Lines to modify:** Expand existing `describe('Stream Error Handling')` block by adding 3 new tests after line 303

**Change needed:** Add three comprehensive tests covering:
1. Partial file cleanup verification (AC1)
2. Error propagation to Promise wrapper with McpError construction (AC2)
3. Integration test using production error handling pattern (AC3)

**Existing patterns to follow:**
- beforeEach/afterEach cleanup pattern (lines 15-23) - creates/removes `TEST_OUTPUT_DIR`
- Promise wrapper pattern (lines 125-128) - waits for stream completion
- Console.error interception pattern (lines 236-250) - captures stderr logs
- Real file I/O (no fs module mocking) - matches all 15 existing tests

**Current Code:**
```typescript
// tests/streaming.test.ts:290-303
describe('Stream Error Handling', () => {
  it('should handle write stream errors gracefully', async () => {
    const outputPath = '/invalid/path/that/does/not/exist/test.md';
    const writeStream = createWriteStream(outputPath);

    const errorPromise = new Promise((resolve, reject) => {
      writeStream.on('error', (err) => resolve(err));
      writeStream.write('test content');
    });

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
  });
});
```

**Gap in current test:**
- Only tests error event fires
- Doesn't test `fs.unlink()` cleanup (src/index.ts:208)
- Doesn't test error propagation to Promise wrapper (src/index.ts:244-248)
- Doesn't test `streamError` variable assignment (src/index.ts:203)
- Doesn't test McpError construction (src/index.ts:245-248)

**Target Code:**
```typescript
// tests/streaming.test.ts:290-370 (expanded)
describe('Stream Error Handling', () => {
  // Existing test (line 290) stays as-is
  it('should handle write stream errors gracefully', async () => {
    const outputPath = '/invalid/path/that/does/not/exist/test.md';
    const writeStream = createWriteStream(outputPath);

    const errorPromise = new Promise((resolve, reject) => {
      writeStream.on('error', (err) => resolve(err));
      writeStream.write('test content');
    });

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
  });

  // NEW TEST 1: AC1 - Partial file cleanup verification
  it('should delete partial file on stream write error', async () => {
    // Pattern: Production error handler at src/index.ts:202-213
    const outputPath = path.join(TEST_OUTPUT_DIR, 'partial-test.md');

    // Create initial file
    await fs.writeFile(outputPath, 'initial content', 'utf-8');

    // Make file read-only to trigger write error
    await fs.chmod(outputPath, 0o444);

    // Attempt append operation (will fail on read-only file)
    const writeStream = createWriteStream(outputPath, { flags: 'a', encoding: 'utf-8' });

    // Track cleanup execution
    let cleanupExecuted = false;

    // Copy production error handler pattern (src/index.ts:202-213)
    writeStream.on('error', async (err: Error) => {
      try {
        await fs.unlink(outputPath);
        cleanupExecuted = true;
      } catch (unlinkErr) {
        // Silent failure pattern from production
      }
    });

    // Trigger write error
    const errorPromise = new Promise((resolve) => {
      writeStream.on('error', resolve);
      writeStream.write('append content');
    });

    await errorPromise;

    // Wait for async cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify file deleted (pattern from historical test at commit 62c08ee)
    await expect(fs.access(outputPath)).rejects.toThrow();
    expect(cleanupExecuted).toBe(true);
  });

  // NEW TEST 2: AC2 - Error propagation to Promise wrapper with McpError
  it('should propagate stream error to Promise wrapper with McpError', async () => {
    // Pattern: Production Promise wrapper at src/index.ts:242-255
    const outputPath = '/invalid/path/test.md';
    const writeStream = createWriteStream(outputPath);

    // Copy production streamError variable pattern (src/index.ts:199)
    let streamError: Error | null = null;

    // Copy production error handler pattern (src/index.ts:202-203)
    writeStream.on('error', (err: Error) => {
      streamError = err;
    });

    // Copy production Promise wrapper pattern (src/index.ts:242-255)
    const writePromise = new Promise<void>((resolve, reject) => {
      writeStream.end(() => {
        // Production error propagation logic (src/index.ts:244-248)
        if (streamError) {
          reject(new McpError(
            ErrorCode.InternalError,
            `Failed to write transcript: ${streamError.message}`
          ));
        } else {
          resolve();
        }
      });
      writeStream.on('error', reject); // Production line 254
    });

    // Verify Promise rejects with McpError
    await expect(writePromise).rejects.toThrow(McpError);

    // Verify error message includes streamError.message
    try {
      await writePromise;
    } catch (error: any) {
      expect(error.message).toContain('Failed to write transcript');
      expect(error.code).toBe(ErrorCode.InternalError);
    }
  });

  // NEW TEST 3: AC3 - Integration test with production code path
  it('should handle errors in production streaming code path', async () => {
    // Pattern: Full production streaming flow (src/index.ts:195-255)
    const outputPath = path.join(TEST_OUTPUT_DIR, 'integration-test.md');

    // Create file and make directory read-only to trigger write error
    await fs.writeFile(outputPath, 'temp', 'utf-8');
    await fs.chmod(TEST_OUTPUT_DIR, 0o555); // Read-only directory

    // Minimal valid transcript data
    const entries: TranscriptEntry[] = [
      { text: 'test entry', duration: 1, offset: 0 }
    ];

    // Copy production streaming pattern (src/index.ts:196-255)
    const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
    let streamError: Error | null = null;

    // Production error handler (src/index.ts:202-213)
    writeStream.on('error', async (err: Error) => {
      streamError = err;
      try {
        await fs.unlink(outputPath);
      } catch (unlinkErr) {
        // Silent failure
      }
    });

    // Write content
    writeStream.write('# Test Transcript\n\n');
    for (const entry of entries) {
      writeStream.write(entry.text + ' ');
    }

    // Production Promise wrapper (src/index.ts:242-255)
    const writePromise = new Promise<void>((resolve, reject) => {
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

    // Cleanup: restore directory permissions
    await fs.chmod(TEST_OUTPUT_DIR, 0o755);

    // Verify error propagation
    await expect(writePromise).rejects.toThrow(McpError);

    // Verify partial file deleted (may not exist if error prevented creation)
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(false);
  });
});
```

**Pattern Adherence:**
- Uses `beforeEach/afterEach` cleanup from lines 15-23
- Uses Promise wrapper pattern from lines 125-128
- Uses real file I/O (no mocks) matching all 15 existing tests
- Uses `TEST_OUTPUT_DIR` constant from line 15
- Matches error handling conventions from existing test at lines 290-303
- Imports `McpError` and `ErrorCode` (already imported in src/index.ts)

**Coverage targets:**
- Test 1: Covers `src/index.ts:207-212` (fs.unlink cleanup block)
- Test 2: Covers `src/index.ts:244-248` (McpError construction in Promise wrapper)
- Test 3: Covers `src/index.ts:202-213` + `src/index.ts:242-255` (end-to-end error handling flow)

## Test Strategy

### AC Coverage Map

| AC | Test Type | Test Location | Test Method | Existing/New |
|----|-----------|---------------|-------------|--------------|
| AC1 | Unit | tests/streaming.test.ts:305-340 | Verify `fs.unlink()` executes and deletes partial file using read-only file trigger | New |
| AC2 | Unit | tests/streaming.test.ts:342-368 | Verify Promise wrapper checks `streamError` variable and constructs McpError with proper error code/message | New |
| AC3 | Integration | tests/streaming.test.ts:370-420 | Test production streaming pattern with invalid path, verify error propagation and cleanup | New |
| AC4 | Coverage | vitest.config.ts + npm run test:coverage | Run coverage report and verify lines 202-213, 242-255 show 100% coverage | Existing tool |

### Test Infrastructure

**Framework:** Vitest 4.0.7 with V8 coverage provider

**Test execution:**
```bash
npm test                  # Run all tests with --expose-gc flag
npm run test:coverage     # Run with coverage report
```

**Test isolation:**
- beforeEach: Creates `TEST_OUTPUT_DIR` (tests/streaming.test.ts:17-19)
- afterEach: Removes `TEST_OUTPUT_DIR` with force flag (tests/streaming.test.ts:21-23)
- Each test creates unique filenames to avoid conflicts

**NO MOCKS policy:**
- All 3 new tests use real file I/O via fs/promises module
- Real createWriteStream from Node.js fs module
- Real async cleanup via fs.unlink()
- Matches pattern of existing 15 tests (no fs module mocking)

**Test data:**
- Minimal transcript entries: `[{ text: 'test', duration: 1, offset: 0 }]`
- Invalid paths: `/invalid/path/test.md` (triggers ENOENT error)
- Read-only files: `fs.chmod(file, 0o444)` (triggers EACCES error)
- All test files in `TEST_OUTPUT_DIR` (/tests/test-output/)

**Dependencies (already in package.json):**
- vitest: 4.0.7
- @types/node: Latest (provides fs/promises types)
- he: 1.2.0 (HTML entity decoding, used in production code)
- @modelcontextprotocol/sdk: 0.6.0 (provides McpError and ErrorCode types)

**Coverage verification:**
```bash
# After implementation, verify 100% coverage of target lines
npm run test:coverage
# Check coverage/index.html for lines 202-213 and 242-255 in src/index.ts
```

## Regression Test Strategy

### Affected Features from Research

Based on `.dev/issues/14-stream-error-handler-test-gap/02-research/research.md` Impact Analysis section, 5 existing features could regress:

#### Affected Feature 1: Memory Usage Monitoring
**Blast Radius:** `tests/streaming.test.ts:98-138` (memory test with GC control)
**Regression Risk:** New error handling tests that create/delete files could affect memory measurements if cleanup fails

**Unit Tests (Existing - Re-run Required):**
- [x] **Test:** `should maintain <100MB peak for 60k entries`
  - **File:** `tests/streaming.test.ts:99-137`
  - **Test Name:** Already exists
  - **Expected:** Peak memory delta <100MB (baseline)
  - **Why:** Verifies error tests don't inflate memory readings

**Integration Tests (New):**
- [ ] **Test:** Run memory test + error tests in same suite
  - **File:** `tests/streaming.test.ts` (no new file)
  - **Scenario:** Execute `npm test` which runs all 18 tests (15 existing + 3 new)
  - **Expected:** Memory test still passes with <100MB delta
  - **NO MOCKS:** Memory test uses real file I/O, error tests use real file I/O

**Manual Verification:**
- [ ] Check `test-output/` directory is empty after test suite completes
- [ ] Verify no orphaned files in `/tmp/` or project directories
- [ ] Check memory test baseline hasn't regressed (was <100MB, should remain <100MB)

#### Affected Feature 2: Progress Logging
**Blast Radius:** `src/index.ts:236-238` (progress logs), `src/index.ts:204, 209, 211` (error logs)
**Regression Risk:** Console interception in error tests could interfere with progress logging tests

**Unit Tests (Existing - Re-run Required):**
- [x] **Test:** Progress logging tests (5 tests at lines 140-224)
  - **File:** `tests/streaming.test.ts:141-161, 163-181, 183-201, 203-223, 226-259`
  - **Test Names:** Already exist (5 progress logging tests)
  - **Expected:** All 5 tests pass without interference from error handler logs
  - **Why:** Verifies error tests don't pollute console.error interception

**Integration Tests (Existing):**
- [x] **Test:** MCP integration test with console.error interception
  - **File:** `tests/streaming.test.ts:227-259`
  - **Scenario:** Already tests console.error interception pattern
  - **Expected:** No regression (test still passes after adding error tests)

**Manual Verification:**
- [ ] Review test output for unexpected "Stream write error" or "Cleaned up partial file" logs
- [ ] Verify error tests don't leave console.error in intercepted state

#### Affected Feature 3: Stream Completion (Success Path)
**Blast Radius:** `src/index.ts:242-255` (Promise wrapper used by both success and error paths)
**Regression Risk:** Changes to error handling could break success path (false positive `streamError` check)

**Unit Tests (Existing - Re-run Required):**
- [x] **Test:** Chunk processing tests (3 tests using success path)
  - **File:** `tests/streaming.test.ts:26-75`
  - **Test Names:** Already exist (3 chunk processing tests)
  - **Expected:** All pass (no false positive errors)
  - **Why:** Verifies `streamError` remains null on success

**Integration Tests (New):**
- [ ] **Test:** Explicit no-error-on-success verification
  - **File:** `tests/streaming.test.ts` (add to existing describe block)
  - **Test Name:** `test_stream_success_path_no_error_variable_set`
  - **Scenario:** Write valid content to valid path, verify `streamError` remains null
  - **Expected:** Promise resolves (doesn't reject), no error logs emitted
  - **NO MOCKS:** Uses real file I/O and production Promise wrapper pattern

**Code for new integration test:**
```typescript
it('should not set streamError variable on successful write', async () => {
  const outputPath = path.join(TEST_OUTPUT_DIR, 'success-test.md');
  const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
  let streamError: Error | null = null;

  writeStream.on('error', (err: Error) => {
    streamError = err;
  });

  writeStream.write('# Success Test\n\n');
  writeStream.write('Content here');

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => {
      if (streamError) {
        reject(new Error(`Unexpected streamError: ${streamError.message}`));
      } else {
        resolve();
      }
    });
    writeStream.on('error', reject);
  });

  // Verify streamError remains null
  expect(streamError).toBeNull();

  // Verify file was created
  const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
  expect(fileExists).toBe(true);
});
```

#### Affected Feature 4: Filename Generation and Sanitization
**Blast Radius:** `src/index.ts:160-183` (filename generation), `tests/streaming.test.ts:262-288` (filename tests)
**Regression Risk:** Error tests with unusual paths could expose bugs in path resolution

**Unit Tests (Existing - Re-run Required):**
- [x] **Test:** Filename sanitization tests (2 tests at lines 262-288)
  - **File:** `tests/streaming.test.ts:263-272, 274-287`
  - **Test Names:** Already exist
  - **Expected:** Both tests pass (no path resolution regressions)
  - **Why:** Error tests use `/invalid/path` or `TEST_OUTPUT_DIR` paths, not production filename logic

**Integration Tests (Not Needed):**
- No new tests needed - error tests use either invalid paths (for error triggering) or `TEST_OUTPUT_DIR` paths (for cleanup verification), not production filename generation logic

**Manual Verification:**
- None needed

#### Affected Feature 5: MCP Protocol Integration
**Blast Radius:** McpError construction in error propagation path
**Regression Risk:** Error tests that change McpError construction could break MCP client contract

**Unit Tests (New):**
- [ ] **Test:** Verify McpError construction uses `ErrorCode.InternalError`
  - **File:** `tests/streaming.test.ts` (covered by NEW TEST 2: AC2)
  - **Test Name:** `test_propagate_stream_error_to_promise_wrapper_with_mcperror` (already in plan above)
  - **Expected:** McpError has `code: ErrorCode.InternalError` (-32603)
  - **Why:** Ensures error code matches MCP spec

**Integration Tests (New):**
- [ ] **Test:** Verify error message format matches MCP spec
  - **File:** `tests/streaming.test.ts` (covered by NEW TEST 2: AC2)
  - **Scenario:** Trigger stream error, verify McpError message contains "Failed to write transcript: " + original error message
  - **Expected:** Message format matches production pattern at src/index.ts:247
  - **NO MOCKS:** Uses real error from invalid file path

**Manual Verification:**
- None needed (MCP client integration out of scope)

### Regression Test Coverage Matrix

| Feature | Unit Tests Needed | Integration Tests Needed | Manual Verification Needed |
|---------|-------------------|--------------------------|----------------------------|
| Memory Usage Monitoring | 1 test (re-run existing) | 0 tests (covered by npm test) | Check test-output/ empty |
| Progress Logging | 5 tests (re-run existing) | 0 tests (covered) | Review console output |
| Stream Completion (Success) | 3 tests (re-run existing) | 1 test (explicit no-error) | None |
| Filename Generation | 2 tests (re-run existing) | 0 tests (covered) | None |
| MCP Protocol Integration | 1 test (covered by AC2) | 1 test (covered by AC2) | None |

**Total Regression Tests Required:** 13 tests (11 existing re-run + 1 new explicit no-error test + 1 AC2 test covering MCP integration)
**Features Requiring Verification:** 5 features
**Coverage Target:** 100% (all affected features tested)

### Regression Test Execution Plan

**Before PR Creation:**
```bash
# Execute comprehensive regression verification
npm test  # Runs all tests including 3 new error tests + 15 existing tests + 1 new no-error test

# ALL GATES MUST PASS:
# ✅ Gate 1: Unit Tests → ALL 19 TESTS PASS
#    - 15 existing tests (chunk processing, HTML decoding, memory, progress, MCP, filename)
#    - 3 new error handling tests (AC1, AC2, AC3)
#    - 1 new no-error verification test (regression for success path)

# ✅ Gate 2: Integration Tests → COVERED BY npm test
#    - Memory test + error tests run in same suite (no interference)
#    - Progress logging + error logging don't conflict
#    - Success path + error path both work correctly

# ✅ Gate 3: Coverage Verification → 100% OF TARGET LINES
npm run test:coverage
# Check coverage/index.html:
# - src/index.ts:202-213 shows 100% coverage (error handler)
# - src/index.ts:242-255 shows 100% coverage (Promise wrapper)

# ✅ Gate 4: Manual Verification → ALL CHECKS PASS
# - [ ] test-output/ directory is empty after npm test completes
# - [ ] No orphaned files in /tmp/ or project directories
# - [ ] Memory test baseline hasn't regressed (<100MB)
# - [ ] No unexpected console.error logs in test output
# - [ ] All 19 tests pass with 0 failures

# ANY gate failure = PR BLOCKED until fixed
```

**Zero Tolerance Policy:**
- No PR creation without 100% regression verification PASS
- No shortcuts ("it's a small change" is not acceptable)
- No exceptions ("we'll fix it later" is not acceptable)
- Evidence required: npm test output showing 19/19 tests pass, coverage report showing 100% for lines 202-213 and 242-255

### Regression Test Coverage Summary

**Total Affected Features:** 5 (all existing features in test suite)
**Total Unit Tests Required:** 13 tests (11 existing re-run + 1 new no-error test + 1 AC2 test)
**Total Integration Tests Required:** Covered by `npm test` execution (no separate integration test file)
**Total Manual Checks Required:** 4 checks (test-output/ empty, no orphaned files, memory baseline, console output)

**Coverage Percentage:** 100% (ALL affected features have regression tests)

**Verification Command:** `npm test && npm run test:coverage`

## Implementation Checklist

**Status:** `[ ]` not started, `[→]` in progress, `[✓]` done, `[!]` blocked

### Setup
- [ ] Create feature branch `issue-14-stream-error-handler-test-gap`
- [ ] Verify working directory is `/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server`
- [ ] Run existing tests → ALL 15 TESTS PASS (baseline)
  ```bash
  npm test
  ```
- [ ] Verify coverage baseline
  ```bash
  npm run test:coverage
  # Check lines 202-213, 242-255 show 0% coverage before implementation
  ```

### Test 1: Partial File Cleanup (AC1)
- [ ] Add imports if needed (fs.chmod for read-only file)
- [ ] Implement test at line 305 (after existing error test)
- [ ] Test creates file in `TEST_OUTPUT_DIR`
- [ ] Test makes file read-only with `fs.chmod(outputPath, 0o444)`
- [ ] Test copies production error handler pattern from src/index.ts:202-213
- [ ] Test triggers write error by attempting append to read-only file
- [ ] Test waits for async cleanup with `setTimeout(100ms)`
- [ ] Test verifies file deleted with `expect(fs.access()).rejects.toThrow()`
- [ ] Test tracks cleanup execution with boolean flag
- [ ] Run test in isolation:
  ```bash
  npm test -- --run tests/streaming.test.ts -t "should delete partial file"
  ```
- [ ] Test PASSES

### Test 2: Error Propagation to Promise Wrapper (AC2)
- [ ] Add McpError and ErrorCode imports from @modelcontextprotocol/sdk/types.js
- [ ] Implement test at line 342 (after Test 1)
- [ ] Test uses invalid path `/invalid/path/test.md`
- [ ] Test declares `streamError: Error | null = null` variable
- [ ] Test copies production error capture pattern from src/index.ts:202-203
- [ ] Test copies production Promise wrapper pattern from src/index.ts:242-255
- [ ] Test verifies Promise rejects with McpError type
- [ ] Test verifies error message contains "Failed to write transcript"
- [ ] Test verifies error code is `ErrorCode.InternalError`
- [ ] Run test in isolation:
  ```bash
  npm test -- --run tests/streaming.test.ts -t "should propagate stream error"
  ```
- [ ] Test PASSES

### Test 3: Integration Test with Production Pattern (AC3)
- [ ] Implement test at line 370 (after Test 2)
- [ ] Test creates file in `TEST_OUTPUT_DIR`
- [ ] Test makes directory read-only with `fs.chmod(TEST_OUTPUT_DIR, 0o555)`
- [ ] Test declares minimal transcript entries: `[{ text: 'test entry', duration: 1, offset: 0 }]`
- [ ] Test copies production streaming pattern from src/index.ts:196-255
- [ ] Test includes error handler (lines 202-213)
- [ ] Test includes Promise wrapper (lines 242-255)
- [ ] Test restores directory permissions in cleanup
- [ ] Test verifies Promise rejects with McpError
- [ ] Test verifies partial file deleted (or never created)
- [ ] Run test in isolation:
  ```bash
  npm test -- --run tests/streaming.test.ts -t "should handle errors in production"
  ```
- [ ] Test PASSES

### Test 4: Regression - No Error on Success Path (New)
- [ ] Implement test in existing describe block
- [ ] Test creates valid file in `TEST_OUTPUT_DIR`
- [ ] Test declares `streamError: Error | null = null` variable
- [ ] Test writes valid content to valid path
- [ ] Test uses production Promise wrapper pattern
- [ ] Test verifies `streamError` remains null
- [ ] Test verifies file was created successfully
- [ ] Run test in isolation:
  ```bash
  npm test -- --run tests/streaming.test.ts -t "should not set streamError"
  ```
- [ ] Test PASSES

### Verification
- [ ] Run full test suite → ALL 19 TESTS PASS (15 existing + 3 new error tests + 1 new regression test)
  ```bash
  npm test
  ```
- [ ] Run coverage report → 100% coverage of lines 202-213, 242-255
  ```bash
  npm run test:coverage
  # Open coverage/index.html and verify src/index.ts shows green for target lines
  ```
- [ ] Verify `test-output/` directory is empty after test suite completes
  ```bash
  ls -la tests/test-output/  # Should not exist or be empty
  ```
- [ ] Check for orphaned files in project directories
  ```bash
  find . -name "*.md" -path "*/test-output/*" -o -name "partial-test.md" -o -name "integration-test.md"
  # Should return no results
  ```
- [ ] Review test output for unexpected console.error logs
- [ ] Verify memory test baseline hasn't regressed (should still be <100MB)

### Final
- [ ] All spec requirements met (AC1-AC4)
- [ ] No regressions (all 15 existing tests still pass)
- [ ] Code follows existing test patterns (beforeEach/afterEach, Promise wrapper, real file I/O)
- [ ] 100% coverage of target lines achieved
- [ ] Ready for review

## Definition of Done

- [ ] All spec requirements met (AC1-AC4)
  - AC1: Partial file cleanup test verifies async `fs.unlink()` execution ✅
  - AC2: Error propagation test verifies Promise wrapper behavior with McpError ✅
  - AC3: Integration test verifies end-to-end error handling ✅
  - AC4: Coverage verification shows 100% for lines 202-213, 242-255 ✅

- [ ] All tests passing (NO MOCKS)
  - 15 existing tests pass (no regressions) ✅
  - 3 new error handling tests pass ✅
  - 1 new regression test passes (no-error-on-success) ✅
  - Total: 19/19 tests pass ✅

- [ ] No regressions
  - Memory test still passes with <100MB delta ✅
  - Progress logging tests not affected by error handler logs ✅
  - Success path not affected by error handling changes ✅
  - Filename generation tests not affected by error test paths ✅
  - MCP integration tests not affected by McpError construction ✅

- [ ] Code follows existing patterns
  - Uses beforeEach/afterEach cleanup pattern ✅
  - Uses Promise wrapper pattern from existing tests ✅
  - Uses real file I/O (no fs module mocking) ✅
  - Uses `TEST_OUTPUT_DIR` constant ✅
  - Matches error handling conventions ✅

- [ ] Ready for review
  - All checklist items complete ✅
  - Coverage report shows 100% for target lines ✅
  - No orphaned test files ✅
  - Documentation updated if needed ✅

**Regression Testing:**
- [ ] Regression Test Strategy section complete with ALL affected features from research ✅
- [ ] ALL affected features (5 total) have Unit + Integration + Manual test plans ✅
- [ ] Critical path features have explicit verification tests mapped ✅
- [ ] Regression test execution plan references `npm test` command ✅
- [ ] 100% blast radius coverage documented ✅
