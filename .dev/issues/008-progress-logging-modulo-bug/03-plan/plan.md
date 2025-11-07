# Implementation Plan: Fix Progress Logging Modulo Arithmetic

**Issue:** #8
**Approach:** BROWNFIELD
**Created:** 2025-11-07T02:43:10Z
**Version:** v1

---

## Summary

Fix progress logging condition in youtube-mcp-server's streaming transcript processor to use semantically correct modulo arithmetic (`i % 5000 === 0 && i > 0`) instead of buggy chunk-end position check (`(i + CHUNK_SIZE) % 5000 === 0`). Synchronize test suite to match corrected behavior and simplify message format to report current index `i` directly.

---

## Architectural Decisions

### AD-1: Use Option B - Report Current Index (i) in Progress Messages

**Context:** Current implementation reports `Math.min(i + CHUNK_SIZE, total)` as processed count. With fix changing condition from `(i + CHUNK_SIZE) % 5000 === 0` to `i % 5000 === 0`, the logged number relationship changes.

**Decision:** Change progress message to report current loop index `i` instead of `i + CHUNK_SIZE`.

**Rationale:**
- **Mathematical alignment:** Condition triggers at `i % 5000 === 0`, so reporting `i` directly aligns trigger logic with displayed value
- **Simplicity:** Removes `Math.min()` complexity and edge case handling for final chunk
- **Spec guidance:** Recommended implementation in spec.md:82-86 uses simplified format: `console.error(\`Progress: ${i}/${total} entries\`)`
- **Correctness:** At i=5000, reports "5000 processed" which is mathematically accurate
- **Test impact:** Minimal - tests already expect these exact numbers (5000, 10000), just need variable reference change

**Alternatives Considered:**
- **Option A (Keep i + CHUNK_SIZE):** Would maintain existing message format but create off-by-one appearance (at i=5000, reports 6000)
- **Option C (Percentage-based):** Higher complexity, loses absolute count information

**Implementation Impact:**
- `src/index.ts:205`: Change `Math.min(i + CHUNK_SIZE, transcriptEntries.length)` to `i`
- `tests/streaming.test.ts:149,172`: Change `Math.min(i + CHUNK_SIZE, entries.length)` to `i`
- Test expectations remain unchanged (already expect "Progress: 5000/10000" format)

**Trade-offs:**
- ✅ Simpler logic, easier to maintain
- ✅ Direct mathematical correspondence between condition and output
- ⚠️ Semantic shift: Reports entries processed BEFORE current chunk completes (vs AFTER)

---

## Files to Modify

### File: `servers/binaries/youtube-mcp-server/src/index.ts`

**Current responsibility:** MCP server implementation with streaming transcript processing
**Lines to modify:** 204-206
**Change needed:** Fix progress logging condition and simplify message format
**Existing patterns to follow:**
- MCP error handling with McpError (lines 86-90, 228-231)
- console.error() for stderr output (17 total calls)
- Constant usage: CHUNK_SIZE, PROGRESS_THRESHOLD (lines 135-136)

**Current Code (BUGGY):**
```typescript
// Lines 204-206
if (transcriptEntries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
  const processed = Math.min(i + CHUNK_SIZE, transcriptEntries.length);
  console.error(`Progress: ${processed}/${transcriptEntries.length} entries`);
}
```

**Target Code (FIXED):**
```typescript
// Lines 204-206
if (transcriptEntries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
  console.error(`Progress: ${i}/${transcriptEntries.length} entries`);
}
```

**Pattern Adherence:**
- Maintains console.error() for stderr (MCP protocol contract)
- Uses existing PROGRESS_THRESHOLD constant
- Follows boolean short-circuit pattern (length check first, then modulo)
- Removes unnecessary `Math.min()` complexity

---

### File: `servers/binaries/youtube-mcp-server/tests/streaming.test.ts`

**Current responsibility:** Vitest test suite for streaming implementation
**Lines to modify:** 147, 149, 170, 172
**Change needed:** Synchronize test conditions and message format with production fix
**Existing patterns to follow:**
- Test structure: describe blocks with it() assertions (lines 14-383)
- Fixture generation: Array.from() patterns (lines 27-31, 44-48)
- Assertions: expect().toContain(), expect().toBe() (standard Vitest)

**Current Code (Test 1 - BUGGY):**
```typescript
// Lines 147-149
if (entries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
  const processed = Math.min(i + CHUNK_SIZE, entries.length);
  progressLogs.push(`Progress: ${processed}/${entries.length} entries`);
}
```

**Target Code (Test 1 - FIXED):**
```typescript
// Lines 147-149
if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
  progressLogs.push(`Progress: ${i}/${entries.length} entries`);
}
```

**Current Code (Test 2 - BUGGY):**
```typescript
// Lines 170-172
if (entries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
  const processed = Math.min(i + CHUNK_SIZE, entries.length);
  progressLogs.push(`Progress: ${processed}/${entries.length} entries`);
}
```

**Target Code (Test 2 - FIXED):**
```typescript
// Lines 170-172
if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
  progressLogs.push(`Progress: ${i}/${entries.length} entries`);
}
```

**Pattern Adherence:**
- Test assertions remain unchanged (already expect "Progress: 5000/10000 entries" format)
- Maintains existing fixture generation patterns
- Preserves test structure and organization

---

## Test Strategy

### AC Coverage Map

| AC | Test Type | Test Location | Test Method | Existing/New |
|----|-----------|---------------|-------------|--------------|
| AC1 | Unit | tests/streaming.test.ts:135-156 | Update existing test: change condition to `i % 5000 === 0 && i > 0`, verify logs at i=5000, i=10000 for 10k entries with CHUNK_SIZE=1000 | Existing (update) |
| AC2 | Unit | tests/streaming.test.ts (new) | New boundary test: verify NO log at i=0, logs appear only at i>0 positions | New |
| AC3 | Unit | tests/streaming.test.ts (new) | New stability test: 10k entries with CHUNK_SIZE=500, verify logs at i=5000, i=10000 (not at 4500, 5500, etc.) | New |

### Test Infrastructure

**Framework:** Vitest 4.0.7 with Node.js environment (vitest.config.ts:1-13)

**Test Execution:**
```bash
npm test                # Run all tests
npm run test:watch      # Watch mode during development
npm run test:coverage   # Generate coverage report
```

**Test Data Generation:** In-line fixtures using `Array.from()` patterns (no external files)

**Assertions:** Standard Vitest expect API
- `expect(progressLogs).toContain('Progress: 5000/10000 entries')` - Exact message match
- `expect(progressLogs.length).toBe(0)` - No logs for ≤5000 entries
- `expect(progressLogs.length).toBeGreaterThan(0)` - At least one log for >5000 entries

**NO MOCKS:** All tests use real:
- File system operations (fs.mkdir, fs.rm, createWriteStream)
- HTML entity decoding (he.decode)
- Loop iteration logic (actual for loops matching production)

**Test Setup/Teardown:**
- beforeEach: Create TEST_OUTPUT_DIR (lines 17-19)
- afterEach: Remove TEST_OUTPUT_DIR with recursive force (lines 21-23)

---

## Regression Test Strategy

### Affected Features from Research

Based on `02-research/research.md` Impact Analysis (lines 287-370), this fix affects 5 features that share the streaming loop context.

#### Affected Feature 1: Progress Logging to stderr

**Blast Radius:** src/index.ts:204-206 (direct modification)
**Regression Risk:** Logs could appear at wrong intervals, not at all, or at i=0 if fix is incorrect

**Unit Tests (New):**
- [x] **Test:** Boundary validation - no log at i=0
  - **File:** `tests/streaming.test.ts` (new test after line 177)
  - **Test Name:** `test_progress_logging_skips_zero_position`
  - **Input:** 10000 entries, CHUNK_SIZE=1000, loop starts at i=0
  - **Expected:** progressLogs array does NOT contain any message with "Progress: 0/"
  - **Why:** Prevents regression where `i % 5000 === 0` triggers at i=0 without `i > 0` guard

- [x] **Test:** Stability across different CHUNK_SIZE values
  - **File:** `tests/streaming.test.ts` (new test after boundary test)
  - **Test Name:** `test_progress_logging_stable_with_chunk_size_500`
  - **Input:** 10000 entries, CHUNK_SIZE=500 (different from production default 1000)
  - **Expected:**
    - progressLogs contains "Progress: 5000/10000 entries"
    - progressLogs contains "Progress: 10000/10000 entries"
    - progressLogs does NOT contain "Progress: 4500/..." or "Progress: 5500/..."
  - **Why:** Validates fix works regardless of CHUNK_SIZE value (spec AC3)

- [x] **Test:** Update existing test at lines 135-156
  - **File:** `tests/streaming.test.ts:147,149`
  - **Action:** Change condition to `i % 5000 === 0 && i > 0`, change message to use `i`
  - **Expected:** Existing assertions still pass (toContain "Progress: 5000/10000", "Progress: 10000/10000")
  - **Why:** Synchronize test logic with production fix

**Integration Tests (New):**
- [x] **Test:** MCP tool call with stderr capture
  - **File:** `tests/streaming.test.ts` (new test in separate describe block)
  - **Test Name:** `test_mcp_tool_progress_logging_integration`
  - **Scenario:**
    1. Create 10000 mock transcript entries
    2. Intercept console.error calls
    3. Simulate MCP tool execution path (streaming loop)
    4. Capture stderr output
  - **Expected:**
    - stderr contains exactly 2 progress logs
    - First log: "Progress: 5000/10000 entries"
    - Second log: "Progress: 10000/10000 entries"
    - No log at i=0
  - **NO MOCKS:** Uses real console.error interception, real loop iteration

**Manual Verification:**
- [ ] Real YouTube video with ~10k entries, observe stderr for correct timing
  - Test URL: (TBD - any 10-15 minute video)
  - Expected: Progress logs appear at 5000 and 10000 entries
  - Evidence: Terminal screenshot showing stderr output

#### Affected Feature 2: Streaming Transcript Processing

**Blast Radius:** src/index.ts:187-208 (progress logging happens inside streaming loop)
**Regression Risk:** Loop iteration logic could be accidentally modified, breaking chunking

**Unit Tests (Existing - Verify Pass):**
- [ ] `should process 1000 entries in single chunk` (lines 26-41) - MUST PASS
- [ ] `should process 10000 entries in 10 chunks` (lines 43-58) - MUST PASS
- [ ] `should handle partial final chunk` (lines 60-75) - MUST PASS

**Manual Verification:**
- [ ] 30min YouTube video (baseline performance test per spec note)
  - Test URL: (TBD - 30 minute video)
  - Expected: Complete within reasonable time, no memory issues
  - Evidence: Successful completion message in MCP response

#### Affected Feature 3: HTML Entity Decoding

**Blast Radius:** src/index.ts:191-198 (happens in same loop iteration as progress logging)
**Regression Risk:** Minimal (no shared state), but verify no accidental changes

**Unit Tests (Existing - Verify Pass):**
- [ ] `should decode numeric apostrophe entity` (lines 79-83) - MUST PASS
- [ ] `should decode named apostrophe entity` (lines 85-89) - MUST PASS
- [ ] `should decode all HTML entities via he.decode` (lines 91-96) - MUST PASS

**Manual Verification:**
- None required (covered by unit tests)

#### Affected Feature 4: Memory Monitoring (DEBUG mode)

**Blast Radius:** src/index.ts:139-143 (pre-loop), 236-240 (post-loop)
**Regression Risk:** None (no shared variables with progress logging)

**Unit Tests (Existing - Verify Pass):**
- [ ] `should maintain <100MB peak for 60k entries` (lines 99-131) - MUST PASS

**Manual Verification:**
- Optional: DEBUG=memory with 5hr video (only if memory test fails)

#### Affected Feature 5: Stream Error Handling

**Blast Radius:** src/index.ts:217-233 (error listener registered before streaming loop)
**Regression Risk:** None (progress logging doesn't touch error listeners)

**Unit Tests (Existing - Verify Pass):**
- [ ] `should cleanup partial file on stream error` (lines 224-261) - MUST PASS
- [ ] `should propagate McpError after cleanup completes` (lines 263-292) - MUST PASS
- [ ] `should handle cleanup failure gracefully` (lines 294-317) - MUST PASS
- [ ] `should execute only one error handler on stream error` (lines 319-352) - MUST PASS
- [ ] `should complete success path without error handler execution` (lines 354-381) - MUST PASS

**Manual Verification:**
- [ ] Write to read-only directory (verify error cleanup still works)
  - Command: `chmod 444 /path/to/test-dir && [run MCP tool]`
  - Expected: Error thrown, partial file cleaned up
  - Evidence: Error message in response, no partial file remains

---

### Regression Test Execution Plan

**Before PR Creation:**
```bash
# Execute comprehensive regression verification
/sop-regression-verification 8

# ALL 4 GATES MUST PASS:
# ✅ Gate 1: Unit Tests → ALL PASS (including 2 new + 12 existing)
# ✅ Gate 2: Integration Tests → ALL PASS (1 new MCP integration test)
# ✅ Gate 3: E2E Tests → SKIP (no critical path E2E tests for this fix)
# ✅ Gate 4: Manual Verification → ALL CHECKS PASS with evidence
```

**Zero Tolerance Policy:**
- No PR creation without 100% regression verification PASS
- No shortcuts ("it's a small change" is not acceptable)
- No exceptions ("we'll fix it later" is not acceptable)
- Evidence required (test logs, screenshots for manual verification)

---

### Regression Test Coverage Summary

**Total Affected Features:** 5
**Total Unit Tests Required:** 14 (2 new + 12 existing must pass)
**Total Integration Tests Required:** 1 (new)
**Total E2E Tests Required:** 0
**Total Manual Checks Required:** 3

**Coverage Percentage:** 100% (ALL affected features have regression tests)

**Verification Command:** `/sop-regression-verification 8`

---

## Implementation Checklist

**Status Legend:** `[ ]` not started, `[→]` in progress, `[✓]` done, `[!]` blocked

### Setup
- [ ] Create feature branch: `git checkout -b issue-8-fix-progress-logging-modulo`
- [ ] Navigate to server directory: `cd servers/binaries/youtube-mcp-server`
- [ ] Run existing tests → ALL PASS (baseline): `npm test`
- [ ] Verify current test output shows buggy behavior (logs at i=4000, 9000)

### Production Fix: src/index.ts
- [ ] Open `src/index.ts`
- [ ] Locate line 204 (progress logging condition)
- [ ] Change condition from `(i + CHUNK_SIZE) % 5000 === 0` to `i > 0 && i % 5000 === 0`
- [ ] Locate line 205-206 (progress message)
- [ ] Remove `const processed = Math.min(i + CHUNK_SIZE, transcriptEntries.length);`
- [ ] Change message from `Progress: ${processed}/${transcriptEntries.length}` to `Progress: ${i}/${transcriptEntries.length}`
- [ ] Save file
- [ ] Verify syntax: `npm run build` → SUCCESS

### Test Update: Existing Test 1 (lines 135-156)
- [ ] Open `tests/streaming.test.ts`
- [ ] Locate line 147 (test condition)
- [ ] Change condition from `(i + CHUNK_SIZE) % 5000 === 0` to `i > 0 && i % 5000 === 0`
- [ ] Locate line 148-149 (test message)
- [ ] Remove `const processed = Math.min(i + CHUNK_SIZE, entries.length);`
- [ ] Change message from `Progress: ${processed}/${entries.length}` to `Progress: ${i}/${entries.length}`
- [ ] Save file

### Test Update: Existing Test 2 (lines 158-177)
- [ ] Locate line 170 (test condition)
- [ ] Change condition from `(i + CHUNK_SIZE) % 5000 === 0` to `i > 0 && i % 5000 === 0`
- [ ] Locate line 171-172 (test message)
- [ ] Remove `const processed = Math.min(i + CHUNK_SIZE, entries.length);`
- [ ] Change message from `Progress: ${processed}/${entries.length}` to `Progress: ${i}/${entries.length}`
- [ ] Save file
- [ ] Run tests: `npm test` → Expect tests/streaming.test.ts:135-177 PASS

### New Test: Boundary Validation (AC2)
- [ ] After line 177 in `tests/streaming.test.ts`, add new test
- [ ] Test name: `should skip progress log at i=0 position`
- [ ] Create fixture: 10000 entries, CHUNK_SIZE=1000
- [ ] Implement loop with corrected condition: `i > 0 && i % 5000 === 0`
- [ ] Assert: `expect(progressLogs.every(log => !log.includes('Progress: 0/'))).toBe(true)`
- [ ] Save file
- [ ] Run test: `npm test -- --grep "should skip progress log at i=0"` → PASS

### New Test: CHUNK_SIZE Stability (AC3)
- [ ] After boundary test, add new test
- [ ] Test name: `should trigger progress logs correctly with CHUNK_SIZE=500`
- [ ] Create fixture: 10000 entries, CHUNK_SIZE=500 (different from default 1000)
- [ ] Implement loop with corrected condition: `i > 0 && i % 5000 === 0`
- [ ] Assert:
  - `expect(progressLogs).toContain('Progress: 5000/10000 entries')`
  - `expect(progressLogs).toContain('Progress: 10000/10000 entries')`
  - `expect(progressLogs.every(log => !log.match(/Progress: (4500|5500|9500)/))).toBe(true)`
- [ ] Save file
- [ ] Run test: `npm test -- --grep "CHUNK_SIZE=500"` → PASS

### New Test: MCP Integration with stderr Capture
- [ ] Create new describe block after line 206: `describe('MCP Integration', () => {...})`
- [ ] Test name: `should log progress to stderr during MCP tool execution`
- [ ] Create fixture: 10000 mock transcript entries
- [ ] Intercept console.error: `const originalError = console.error; const logs: string[] = []; console.error = (msg) => logs.push(msg);`
- [ ] Simulate streaming loop (match production code exactly)
- [ ] Restore console.error: `console.error = originalError;`
- [ ] Filter progress logs: `const progressLogs = logs.filter(log => log.includes('Progress:'));`
- [ ] Assert:
  - `expect(progressLogs.length).toBe(2)`
  - `expect(progressLogs[0]).toBe('Progress: 5000/10000 entries')`
  - `expect(progressLogs[1]).toBe('Progress: 10000/10000 entries')`
- [ ] Save file
- [ ] Run test: `npm test -- --grep "MCP Integration"` → PASS

### Regression Verification: All Tests
- [ ] Run full test suite: `npm test`
- [ ] Verify ALL 17 tests PASS:
  - 3 chunk processing tests (existing) → PASS
  - 3 entity decoding tests (existing) → PASS
  - 1 memory test (existing) → PASS
  - 2 progress logging tests (updated) → PASS
  - 2 filename generation tests (existing) → PASS
  - 1 stream error test (existing) → PASS
  - 5 consolidated error handler tests (existing) → PASS
  - 2 new progress tests (boundary + stability) → PASS
  - 1 new MCP integration test → PASS
- [ ] Generate coverage report: `npm run test:coverage`
- [ ] Verify src/index.ts lines 204-206 marked as covered

### Build & Manual Verification
- [ ] Build production: `npm run build` → SUCCESS
- [ ] Manual test 1: Run MCP server with 10k entry video
  - Start server: `node build/index.js`
  - Observe stderr: Expect "Progress: 5000/..." and "Progress: 10000/..." messages
  - Document: Screenshot of terminal output
- [ ] Manual test 2: Run MCP server with 30min video (performance baseline)
  - Start server, process video
  - Verify completion within reasonable time
  - Document: Success message in MCP response
- [ ] Manual test 3: Error handling regression
  - Attempt write to read-only directory
  - Verify error thrown and partial file cleaned up
  - Document: Error message + no partial file remains

### Final Checks
- [ ] All spec requirements met:
  - AC1: Progress logs at exact 5000-entry intervals ✓
  - AC2: No log at i=0 ✓
  - AC3: Stable with different CHUNK_SIZE values ✓
- [ ] No regressions:
  - Streaming processing works (chunk tests pass) ✓
  - Entity decoding works (entity tests pass) ✓
  - Memory usage <100MB (memory test passes) ✓
  - Error handling works (error tests pass) ✓
- [ ] Code follows existing patterns:
  - console.error() for stderr ✓
  - Boolean short-circuit in conditions ✓
  - Test structure matches existing patterns ✓
- [ ] Ready for review:
  - All tests passing ✓
  - Manual verification complete ✓
  - Regression verification complete ✓

---

## Definition of Done

### Core Requirements
- [ ] All spec requirements met (AC1, AC2, AC3 verified by tests)
- [ ] All tests passing (17 total: 14 existing + 3 new)
- [ ] No regressions (5 affected features verified)
- [ ] Code follows existing patterns (MCP conventions, test structure)
- [ ] Ready for review (all checklist items complete)

### Regression Testing
- [ ] Regression Test Strategy section complete with ALL affected features from research
- [ ] ALL 5 affected features have Unit + Integration + Manual test plans
- [ ] Critical path features have E2E tests mapped (N/A for this fix)
- [ ] Regression test execution plan references `/sop-regression-verification`
- [ ] 100% blast radius coverage documented (5/5 features)

### Quality Gates
- [ ] Build succeeds: `npm run build` → SUCCESS
- [ ] Test suite passes: `npm test` → 17/17 PASS
- [ ] Manual verification complete with evidence (3 checks)
- [ ] No TODOs, FIXMEs, or placeholder code in implementation
- [ ] Commit message follows repository conventions
