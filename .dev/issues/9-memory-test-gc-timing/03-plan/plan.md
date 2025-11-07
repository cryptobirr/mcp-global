# Implementation Plan: Strengthen Memory Test with GC Control and Edge Case Handling

**Issue:** #9
**Approach:** BROWNFIELD
**Created:** 2025-11-07T02:34:48Z
**Version:** v1

## Summary

Add garbage collection control and defensive delta calculation to the memory usage test in streaming.test.ts. Force GC before baseline and final memory measurements to eliminate timing variance, and wrap delta calculation in Math.max(0, ...) to handle negative values when GC releases more memory than was allocated. Update package.json test script to enable --expose-gc flag.

## Architectural Decisions

### AD-1: Use Silent Fallback for Missing global.gc

**Decision:** Implement conditional GC calls using `if (global.gc) global.gc();` without warnings or test failures when GC is unavailable.

**Context:** The spec requires forcing garbage collection via `global.gc()`, which is only available when Node.js runs with `--expose-gc` flag. Need to determine fallback behavior when flag is missing or GC is unavailable.

**Options Considered:**
1. **Silent Fallback (Conditional GC Only)** - Use `if (global.gc) global.gc();` without warnings
2. **Warning on Missing GC** - Check availability at test start, log warning if missing, continue with test
3. **Fail Test if GC Unavailable** - Throw error or skip test if `global.gc` is undefined

**Rationale for Selection:**
- Spec explicitly recommends "Conditional GC calls that only execute when `global.gc` is available (graceful degradation)" in Should Have requirements
- Package.json script will be updated with --expose-gc flag, making GC available by default for `npm test`
- Silent fallback prevents test failures while still improving reliability when flag present
- Aligns with existing codebase pattern: conditional `DEBUG=memory` logging at src/index.ts:140 (no warnings when disabled)
- Implementation simplicity reduces review burden and merge risk
- If variance remains high after implementation, developer will investigate and discover GC unavailable

**Trade-offs:**
- **Pro:** No test failures if --expose-gc missing, graceful degradation to current behavior, simplest implementation (2 lines)
- **Con:** Silent failure mode - developer may not notice GC unavailable, harder to debug variance issues in future
- **Accepted Risk:** Developer running tests manually without npm script may not get GC benefits, but test won't break

**Implementation:**
```typescript
// streaming.test.ts:109
if (global.gc) global.gc();  // Force GC before baseline measurement
const memBefore = process.memoryUsage();

// streaming.test.ts:127
if (global.gc) global.gc();  // Force GC before final measurement
const memAfter = process.memoryUsage();
```

**Validation Criteria:**
- Test passes with --expose-gc flag (GC available)
- Test passes without --expose-gc flag (GC unavailable, graceful degradation)
- Variance <5MB across 10 runs when GC available
- No warnings or errors logged when GC unavailable

---

## Files to Modify

### File 1: `servers/binaries/youtube-mcp-server/tests/streaming.test.ts`

**Current responsibility:** Test suite for YouTube transcript streaming functionality (15 tests across 6 suites: chunk processing, HTML decoding, memory usage, progress logging, filename generation, stream error handling)

**Lines to modify:** 109, 127, 128

**Changes needed:**
1. Line 109: Add conditional GC call before baseline memory measurement
2. Line 127: Add conditional GC call before final memory measurement
3. Line 128: Wrap delta calculation in Math.max(0, ...) to handle negative values

**Existing patterns to follow:**
- Conditional feature execution pattern from src/index.ts:140 (`if (process.env.DEBUG?.includes('memory'))`)
- Memory measurement pattern from src/index.ts:138-143, 235-240 (process.memoryUsage() without GC control)

**Current Code (lines 98-132):**
```typescript
describe('Memory Usage', () => {
  it('should maintain <100MB peak for 60k entries', async () => {
    const entries: TranscriptEntry[] = Array.from({ length: 60000 }, (_, i) => ({
      text: `word${i} test content with some length to simulate real transcript`,
      duration: 1,
      offset: i
    }));

    const outputPath = path.join(TEST_OUTPUT_DIR, 'memory-test.md');
    const CHUNK_SIZE = 1000;

    const memBefore = process.memoryUsage();

    const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
    writeStream.write('# Test Transcript\n\n');

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const chunkText = chunk
        .map(entry => he.decode(entry.text.replace(/&#39;/g, "'")))
        .join(' ');
      writeStream.write(chunkText + ' ');
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    const memAfter = process.memoryUsage();
    const peakDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

    expect(peakDelta).toBeLessThan(100);
  });
});
```

**Target Code (lines 98-132):**
```typescript
describe('Memory Usage', () => {
  it('should maintain <100MB peak for 60k entries', async () => {
    const entries: TranscriptEntry[] = Array.from({ length: 60000 }, (_, i) => ({
      text: `word${i} test content with some length to simulate real transcript`,
      duration: 1,
      offset: i
    }));

    const outputPath = path.join(TEST_OUTPUT_DIR, 'memory-test.md');
    const CHUNK_SIZE = 1000;

    // Force GC before baseline to establish consistent starting point (if available)
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
    writeStream.write('# Test Transcript\n\n');

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const chunkText = chunk
        .map(entry => he.decode(entry.text.replace(/&#39;/g, "'")))
        .join(' ');
      writeStream.write(chunkText + ' ');
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    // Force GC before final measurement to measure actual retained memory (if available)
    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();
    const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);

    expect(peakDelta).toBeLessThan(100);
  });
});
```

**Pattern Adherence:**
- Follows conditional execution pattern from production code (if guard for optional feature)
- Uses existing memory measurement approach (process.memoryUsage().heapUsed)
- Maintains test structure and naming conventions
- Adds inline comments explaining GC purpose (following test suite documentation style)

---

### File 2: `servers/binaries/youtube-mcp-server/package.json`

**Current responsibility:** NPM package configuration for youtube-mcp-server (scripts, dependencies, metadata)

**Lines to modify:** 18

**Changes needed:** Update test script from `vitest run` to `node --expose-gc ./node_modules/.bin/vitest run` to enable global.gc()

**Existing patterns to follow:**
- Build script pattern at line 14: uses node -e for post-build command
- Existing script structure: all test scripts use vitest directly (test, test:watch, test:coverage)

**Current Code (line 18):**
```json
"test": "vitest run",
```

**Target Code (line 18):**
```json
"test": "node --expose-gc ./node_modules/.bin/vitest run",
```

**Pattern Adherence:**
- Consistent with Node.js CLI flag pattern used in build script (line 14)
- Maintains compatibility with other test scripts (test:watch, test:coverage remain unchanged for developer convenience)
- Standard approach for enabling --expose-gc in npm scripts across Node.js ecosystem

---

## Test Strategy

### AC Coverage Map

| AC | Test Type | Test Location | Test Method | Existing/New |
|----|-----------|---------------|-------------|--------------|
| AC1 | Integration | streaming.test.ts:98-132 | Run memory test, verify GC is called before memBefore and memAfter snapshots (conditional check works) | Existing (modified) |
| AC2 | Integration | streaming.test.ts:98-132 | Run memory test, verify Math.max(0, delta) prevents negative values when GC releases memory | Existing (modified) |
| AC3 | Manual | package.json:18 | Run `npm test` and verify Node.js process starts with --expose-gc flag (check process.execArgv or global.gc availability) | Existing (modified) |
| AC4 | Integration | streaming.test.ts:98-132 | Run memory test 10 times consecutively, measure variance, verify <5MB (vs. current 15-45MB range) | Existing (modified) |

### Test Infrastructure

**Framework:** Vitest 4.0.7 with Node environment (already configured at vitest.config.ts:4-10)

**Test Execution:**
- Primary: `npm test` (will include --expose-gc flag after modification)
- Watch mode: `npm run test:watch` (no --expose-gc, graceful degradation)
- Coverage: `npm run test:coverage` (no --expose-gc, graceful degradation)

**Test Data:** Synthetic TranscriptEntry arrays (60,000 entries for memory test, no external dependencies)

**NO MOCKS:** Test uses real file system operations with actual temp files (TEST_OUTPUT_DIR created/cleaned in beforeEach/afterEach)

**Validation Approach:**
1. Single test run: Verify test passes with <100MB assertion
2. Variance test: Run test 10 times consecutively, calculate standard deviation of peakDelta values
3. Success criteria: Standard deviation <5MB (demonstrates GC timing control vs. current 15-45MB variance)

**Regression Testing:**
- Run all 15 tests in streaming.test.ts to verify --expose-gc flag doesn't break other tests
- Verify test suite completes successfully without errors
- No new test files required (changes are to existing test code)

---

## Regression Test Strategy

### Purpose
Verify that adding GC control and edge case handling to memory test doesn't regress existing test functionality or introduce side effects from --expose-gc flag.

### Affected Features from Research Impact Analysis

#### Affected Feature 1: Memory Usage Test
**Blast Radius:** streaming.test.ts:109 (baseline measurement), streaming.test.ts:127 (final measurement), streaming.test.ts:128 (delta calculation)
**Regression Risk:** Test could fail if GC calls break measurement or Math.max hides issues

**Unit Tests (New):**
- [ ] **Test:** Verify conditional GC execution
  - **File:** streaming.test.ts:98-132 (inline validation)
  - **Test Name:** `should maintain <100MB peak for 60k entries` (existing test verifies behavior)
  - **Input:** 60,000 synthetic TranscriptEntry objects
  - **Expected:** Test passes with <100MB assertion, no errors if global.gc unavailable
  - **Why:** Prevents regression where missing global.gc breaks test execution

**Integration Tests (New):**
- [ ] **Test:** Variance reduction verification
  - **File:** Manual execution (run streaming.test.ts 10 times)
  - **Scenario:** Execute memory test 10 times consecutively, measure peakDelta variance
  - **Expected:** Standard deviation <5MB (vs. current 15-45MB), demonstrating GC timing control
  - **NO MOCKS:** Uses real file system operations, actual process.memoryUsage() API

- [ ] **Test:** Negative delta edge case
  - **File:** streaming.test.ts:98-132 (inline validation via Math.max)
  - **Scenario:** GC releases more memory than allocated during test execution
  - **Expected:** Math.max(0, delta) prevents negative value, test passes without false failure
  - **NO MOCKS:** Real GC behavior, no simulation needed

**Manual Verification:**
- [ ] Run `npm test` and verify <100MB assertion passes (baseline functionality preserved)
- [ ] Run `npm test` 10 times, record peakDelta values, calculate variance (<5MB target)
- [ ] Run `node ./node_modules/.bin/vitest run` (without --expose-gc) and verify test still passes (graceful degradation)

#### Affected Feature 2: Other Streaming Tests (14 tests)
**Blast Radius:** All tests in streaming.test.ts use modified test runner (package.json:18 script)
**Regression Risk:** --expose-gc flag could break test execution or cause unexpected side effects

**Integration Tests (New):**
- [ ] **Test:** Full test suite execution
  - **File:** streaming.test.ts (all 15 tests)
  - **Test Name:** Run `npm test` and verify all 15 tests pass
  - **Expected:** 0 failures, all test suites complete successfully (chunk processing, HTML decoding, memory usage, progress logging, filename generation, stream error handling)
  - **NO MOCKS:** All existing tests use real file system operations

**Manual Verification:**
- [ ] Run `npm run test:watch` and verify watch mode works correctly (no --expose-gc in watch script)
- [ ] Verify test output shows 15 passing tests with no errors or warnings

#### Affected Feature 3: Production Memory Monitoring
**Blast Radius:** src/index.ts:138-143, 235-240 (uses same process.memoryUsage() pattern)
**Regression Risk:** NONE - production code unchanged, no GC calls added to src/

**Manual Verification (Optional - Not Blocking):**
- [ ] Run server with DEBUG=memory environment variable and verify logging still works
- [ ] Verify no GC calls execute in production code (grep confirms no global.gc in src/)

### Regression Test Coverage Matrix

| Feature | Unit Tests Needed | Integration Tests Needed | Manual Verification Needed |
|---------|-------------------|--------------------------|----------------------------|
| Memory Usage Test | 1 test (conditional GC) | 2 tests (variance reduction, negative delta handling) | 3 checks (baseline pass, variance <5MB, graceful degradation) |
| Other Streaming Tests | 0 tests | 1 test (full suite passes) | 1 check (watch mode works) |
| Production Memory Monitoring | 0 tests | 0 tests | Optional (DEBUG=memory logging works) |

**Total Regression Tests Required:** 4 integration tests + 4 manual verification checks
**Features Requiring Verification:** 2 features (memory test itself, other streaming tests)
**Coverage Target:** 100% (all affected features tested)

### Regression Test Execution Plan

**Before PR Creation:**
```bash
# Execute comprehensive regression verification
cd /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server

# Gate 1: Unit Tests → Run memory test once, verify GC conditional works
npm test -- tests/streaming.test.ts -t "should maintain <100MB peak"
# Expected: 1 test passes, no errors

# Gate 2: Integration Tests → Run full test suite, verify no --expose-gc side effects
npm test
# Expected: 15 tests pass, 0 failures

# Gate 3: Integration Test → Variance reduction verification
for i in {1..10}; do npm test -- tests/streaming.test.ts -t "should maintain <100MB peak"; done
# Expected: All 10 runs pass, manual inspection shows consistent peakDelta values

# Gate 4: Manual Verification → Graceful degradation without --expose-gc
node ./node_modules/.bin/vitest run tests/streaming.test.ts -t "should maintain <100MB peak"
# Expected: Test passes even without --expose-gc flag

# ALL 4 GATES MUST PASS before PR creation
```

**Zero Tolerance Policy:**
- No PR creation without 100% regression verification PASS
- ANY test failure = implementation blocked until fixed
- Evidence required: Copy test output showing all 15 tests passing + variance calculation <5MB

### Regression Test Coverage Summary

**Total Affected Features:** 2 (memory test, test suite execution)
**Total Unit Tests Required:** 1 (conditional GC validation)
**Total Integration Tests Required:** 3 (variance, negative delta, full suite)
**Total Manual Checks Required:** 4 (baseline, variance calculation, graceful degradation, watch mode)

**Coverage Percentage:** 100% (ALL affected features have regression tests)

**Verification Command:** Manual execution of regression test plan (no /sop-regression-verification needed - test-only changes, no production impact)

---

## Implementation Checklist

**Status:** `[ ]` not started, `[→]` in progress, `[✓]` done, `[!]` blocked

### Setup
- [ ] Create feature branch `issue-9-memory-test-gc-timing`
- [ ] Run existing tests → ALL PASS (baseline: 15/15 tests passing)
- [ ] Verify Node.js version supports --expose-gc (Node 12+, project uses 20.19)

### Modification 1: Add GC Control to Memory Test (streaming.test.ts:109, 127)
- [ ] Open servers/binaries/youtube-mcp-server/tests/streaming.test.ts
- [ ] Navigate to line 109 (baseline memory measurement)
- [ ] Add comment: `// Force GC before baseline to establish consistent starting point (if available)`
- [ ] Add GC call: `if (global.gc) global.gc();`
- [ ] Navigate to line 127 (final memory measurement)
- [ ] Add comment: `// Force GC before final measurement to measure actual retained memory (if available)`
- [ ] Add GC call: `if (global.gc) global.gc();`
- [ ] Save file
- [ ] Run memory test → PASS (verify conditional GC doesn't break test)

### Modification 2: Add Defensive Delta Calculation (streaming.test.ts:128)
- [ ] Navigate to line 128 (delta calculation)
- [ ] Wrap calculation: `const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);`
- [ ] Save file
- [ ] Run memory test → PASS (verify Math.max doesn't break assertion)

### Modification 3: Enable --expose-gc Flag (package.json:18)
- [ ] Open servers/binaries/youtube-mcp-server/package.json
- [ ] Navigate to line 18 (test script)
- [ ] Update script: `"test": "node --expose-gc ./node_modules/.bin/vitest run",`
- [ ] Save file
- [ ] Run `npm test` → ALL PASS (verify flag doesn't break test execution)

### Validation (AC Verification)
- [ ] **AC1:** Run memory test, verify GC is called (test passes without errors)
- [ ] **AC2:** Verify Math.max(0, delta) handles negative values (test passes if GC releases memory)
- [ ] **AC3:** Run `npm test`, verify --expose-gc flag is active (no GC unavailable errors)
- [ ] **AC4:** Run memory test 10 times, measure variance → <5MB standard deviation

### Regression Testing
- [ ] Run full test suite → ALL 15 PASS (no --expose-gc side effects)
- [ ] Run `npm run test:watch` → Works correctly (no flag required)
- [ ] Run test without npm script (node vitest run) → PASS (graceful degradation)

### Final
- [ ] All spec requirements met (GC control, Math.max, --expose-gc flag, variance <5MB)
- [ ] No regressions (all 15 tests pass, watch mode works)
- [ ] Code follows existing patterns (conditional execution, inline comments)
- [ ] Ready for review

---

## Definition of Done

**Functional Requirements:**
- [ ] GC is forced before baseline memory measurement (streaming.test.ts:109)
- [ ] GC is forced before final memory measurement (streaming.test.ts:127)
- [ ] Delta calculation uses Math.max(0, ...) wrapper (streaming.test.ts:128)
- [ ] Test script enables --expose-gc flag (package.json:18)
- [ ] Conditional GC calls only execute when global.gc is available (graceful degradation)

**Quality Requirements:**
- [ ] Memory test passes with <100MB assertion (no regression)
- [ ] Test variance <5MB across 10 consecutive runs (demonstrates GC control)
- [ ] All 15 streaming tests pass (no --expose-gc side effects)
- [ ] Test works without --expose-gc flag (graceful degradation verified)
- [ ] Code follows existing patterns (conditional execution, inline comments)

**Regression Testing:**
- [ ] Regression Test Strategy section complete with ALL affected features from research
- [ ] ALL affected features have Unit + Integration + Manual test plans
- [ ] 100% blast radius coverage documented (2 features: memory test, test suite execution)
- [ ] Regression test execution plan documented with 4 gates
- [ ] Zero tolerance policy enforced (no PR until all tests pass)

**Documentation:**
- [ ] Inline comments explain GC purpose and Math.max usage
- [ ] No external documentation needed (test-only changes)

**Review Readiness:**
- [ ] Code changes are minimal (3 lines in test, 1 line in package.json)
- [ ] No breaking changes (graceful degradation if flag missing)
- [ ] No production code impact (test-only changes)
- [ ] Implementation matches spec requirements exactly
