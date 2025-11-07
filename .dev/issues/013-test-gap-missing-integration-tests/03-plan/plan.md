# Implementation Plan: Integration Tests for Real YouTube API Verification

**Issue:** #13
**Approach:** GREENFIELD
**Created:** 2025-11-06T20:10:00Z
**Version:** v1

## Summary

Create integration test suite to verify memory constraints (AC1, AC2), performance baseline (AC5), and error handling (AC6) with real YouTube videos. Current test coverage only uses mocked data and cannot verify actual YouTube API behavior. This implementation adds new test files in `tests/integration/` directory without modifying existing unit tests.

## Architectural Decisions

### AD-1: Environment Variable Test Gating

**Decision:** Use `RUN_INTEGRATION_TESTS=true` environment variable to gate integration tests

**Rationale:**
- Integration tests are slow (5-6 hour videos take minutes to process)
- YouTube API has rate limits
- CI/CD should not fail on missing env var (skip tests gracefully)
- Allows manual verification without breaking automated builds

**Trade-offs:**
- **PRO**: Prevents CI failures, enables opt-in testing
- **CON**: Tests may be skipped accidentally if env var not set
- **Mitigation**: Document env var requirement in test file headers and README

### AD-2: Real Video URLs as Constants

**Decision:** Define stable, public YouTube video URLs as constants in test file (not external config)

**Rationale:**
- Tests should be self-contained and reproducible
- External config files add maintenance burden
- Public videos (conference talks, podcasts) are stable and unlikely to be deleted
- Video duration/content needs to match test expectations

**Trade-offs:**
- **PRO**: Self-documenting tests, no config file parsing
- **CON**: Hardcoded URLs may break if videos deleted
- **Mitigation**: Use well-known public videos from established channels, document alternatives in comments

### AD-3: Memory Measurement Timing Strategy

**Decision:** Use forced GC before/after streaming with defensive delta calculation `Math.max(0, delta)`

**Rationale:**
- Existing unit test pattern (line 111-134 in streaming.test.ts) already uses this approach
- GC timing is non-deterministic; defensive math handles negative deltas from GC releasing more than allocated
- `--expose-gc` flag required for accurate measurement (already in package.json script)

**Trade-offs:**
- **PRO**: Consistent with existing test patterns, handles GC non-determinism
- **CON**: Requires `--expose-gc` flag (already configured)
- **Implementation**: Use exact pattern from streaming.test.ts:111-134

### AD-4: Test File Organization

**Decision:** Create `tests/integration/` directory with separate file for integration tests

**Rationale:**
- Separates fast unit tests (run always) from slow integration tests (run on-demand)
- Allows vitest configuration to target different test suites
- Follows standard testing patterns (unit vs integration separation)

**Trade-offs:**
- **PRO**: Clear separation of concerns, flexible test execution
- **CON**: Adds directory structure complexity
- **Mitigation**: Single integration test file initially, expand if needed

## Files to Modify/Create

### File: `tests/integration/youtube-api.test.ts` (NEW)

**Purpose:** Integration tests with real YouTube API calls

**Key Features:**
- Environment variable gating (`RUN_INTEGRATION_TESTS=true`)
- Real YouTube video URL constants (30min, 5hr, 6hr, disabled)
- Memory measurement with GC control (pattern from streaming.test.ts)
- Tool handler invocation simulation (MCP protocol)

**Test Structure:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript';

// Environment gate
const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';

// Stable public video URLs
const TEST_VIDEOS = {
  SHORT_30MIN: 'https://www.youtube.com/watch?v=VIDEO_ID', // ~30min conference talk
  LONG_5HR: 'https://www.youtube.com/watch?v=VIDEO_ID',    // ~5hr podcast
  LONG_6HR: 'https://www.youtube.com/watch?v=VIDEO_ID',    // ~6hr livestream
  DISABLED: 'https://www.youtube.com/watch?v=VIDEO_ID'     // Transcripts disabled
};

describe.skipIf(!INTEGRATION_ENABLED)('YouTube API Integration Tests', () => {
  const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output-integration');

  beforeEach(async () => {
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  it('should process 30min video without performance regression (AC5)', async () => {
    // Fetch real transcript
    const transcriptEntries = await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.SHORT_30MIN);

    // Simulate streaming write (following src/index.ts pattern)
    const outputPath = path.join(TEST_OUTPUT_DIR, '30min-test.md');
    // ... streaming implementation ...

    // Verify success
    expect(transcriptEntries).toBeDefined();
    expect(transcriptEntries.length).toBeGreaterThan(0);

    // Verify file created
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
  });

  it('should process 5hr video with <100MB peak memory (AC1)', async () => {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    const transcriptEntries = await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.LONG_5HR);
    const outputPath = path.join(TEST_OUTPUT_DIR, '5hr-test.md');

    // Streaming write simulation (following src/index.ts:219-239)
    // ... implementation ...

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();
    const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);

    expect(peakDelta).toBeLessThan(100); // AC1: <100MB
  });

  it('should process 6hr video with <100MB peak memory (AC2)', async () => {
    // Similar to AC1 test with 6hr video
  });

  it('should handle TranscriptsDisabled error (AC6)', async () => {
    await expect(async () => {
      await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.DISABLED);
    }).rejects.toThrow(/TranscriptsDisabled|disabled/i);
  });
});
```

**Pattern Adherence:**
- Uses Vitest `describe.skipIf()` for environment gating (Vitest best practice)
- Uses `YoutubeTranscript.fetchTranscript()` directly (real API call)
- Uses GC control pattern from streaming.test.ts:111-134
- Uses `console.error()` for diagnostic output (MCP protocol contract)
- Uses same test structure as streaming.test.ts (beforeEach, afterEach)

### File: `package.json` (MODIFY)

**Lines to modify:** Scripts section (lines 13-20)

**Current Code:**
```json
"scripts": {
  "build": "tsc && node -e \"require('fs').chmodSync('build/index.js', '755')\"",
  "prepare": "npm run build",
  "watch": "tsc --watch",
  "inspector": "npx @modelcontextprotocol/inspector build/index.js",
  "test": "node --expose-gc ./node_modules/.bin/vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Target Code:**
```json
"scripts": {
  "build": "tsc && node -e \"require('fs').chmodSync('build/index.js', '755')\"",
  "prepare": "npm run build",
  "watch": "tsc --watch",
  "inspector": "npx @modelcontextprotocol/inspector build/index.js",
  "test": "node --expose-gc ./node_modules/.bin/vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:integration": "RUN_INTEGRATION_TESTS=true node --expose-gc ./node_modules/.bin/vitest run tests/integration"
}
```

**Pattern Adherence:**
- Follows existing script naming pattern (`test:*`)
- Uses `--expose-gc` flag (required for memory tests)
- Sets environment variable inline (standard Node.js pattern)
- Targets specific directory (`tests/integration`)

### File: `README.md` (MODIFY - if exists) or CREATE

**Purpose:** Document integration test execution

**Section to add:**

```markdown
## Testing

### Unit Tests (Fast)
```bash
npm test
```

### Integration Tests (Slow - requires real YouTube API calls)
```bash
npm run test:integration
```

**Requirements:**
- Stable internet connection
- YouTube API accessible (no rate limiting)
- Execution time: 5-10 minutes (processes real videos)

**Environment Variables:**
- `RUN_INTEGRATION_TESTS=true` - Enable integration tests (default: skip)
- `DEBUG=memory` - Enable memory usage logging
```

## Test Strategy

### AC Coverage Map

| AC | Test Type | Test Location | Test Method | Existing/New |
|----|-----------|---------------|-------------|--------------|
| AC1 | Integration | tests/integration/youtube-api.test.ts | Process real 5hr YouTube video, measure peak memory <100MB | New |
| AC2 | Integration | tests/integration/youtube-api.test.ts | Process real 6hr YouTube video, measure peak memory <100MB | New |
| AC5 | Integration | tests/integration/youtube-api.test.ts | Process real 30min YouTube video, verify no errors | New |
| AC6 | Integration | tests/integration/youtube-api.test.ts | Attempt to fetch disabled transcript, verify error message | New |

### Test Infrastructure

**NO MOCKS POLICY:** All integration tests use real `YoutubeTranscript.fetchTranscript()` calls

**Test Execution Flow:**
1. Check `RUN_INTEGRATION_TESTS=true` environment variable
2. If false: Skip all integration tests (Vitest `describe.skipIf()`)
3. If true: Execute tests with real YouTube API calls
4. Force GC before/after memory measurements for accuracy
5. Clean up test output directory after each test

**Test Data:**
- Real YouTube videos (public, stable URLs)
- No synthetic transcript data
- No mocked API responses

**Memory Measurement:**
- Use `node --expose-gc` flag (already in package.json)
- Force GC before baseline: `if (global.gc) global.gc()`
- Force GC after streaming: `if (global.gc) global.gc()`
- Calculate delta: `Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)`

## Regression Test Strategy

### Affected Features from Issue Context

This is a **test-gap issue** addressing missing integration tests for PR #5. The affected feature is the **streaming transcript processing** implementation.

#### Affected Feature 1: Streaming Transcript Processing
**Blast Radius:** `src/index.ts:113-302` (entire tool handler)
**Regression Risk:** Integration tests verify real YouTube API behavior not covered by unit tests

**Unit Tests (Existing - No Changes):**
- ✅ tests/streaming.test.ts:26-76 (chunk processing logic)
- ✅ tests/streaming.test.ts:99-137 (memory usage with synthetic data)
- ✅ tests/streaming.test.ts:140-224 (progress logging)
- ✅ tests/streaming.test.ts:262-288 (filename generation)
- ✅ tests/streaming.test.ts:290-303 (stream error handling)

**Integration Tests (New):**
- **Test:** AC1 - 5hr video memory constraint
  - **File:** `tests/integration/youtube-api.test.ts`
  - **Test Name:** `should process 5hr video with <100MB peak memory (AC1)`
  - **Input:** Real 5hr YouTube video URL
  - **Expected:** Peak memory delta <100MB, file created successfully
  - **Why:** Verifies memory efficiency with real API response format (not synthetic data)

- **Test:** AC2 - 6hr video memory constraint
  - **File:** `tests/integration/youtube-api.test.ts`
  - **Test Name:** `should process 6hr video with <100MB peak memory (AC2)`
  - **Input:** Real 6hr YouTube video URL
  - **Expected:** Peak memory delta <100MB, file created successfully
  - **Why:** Verifies memory efficiency at upper limit (longer than AC1)

- **Test:** AC5 - 30min video baseline (no regression)
  - **File:** `tests/integration/youtube-api.test.ts`
  - **Test Name:** `should process 30min video without performance regression (AC5)`
  - **Input:** Real 30min YouTube video URL
  - **Expected:** Successful transcript fetch, file created, no errors
  - **Why:** Verifies baseline behavior not affected by streaming changes

- **Test:** AC6 - Disabled transcript error handling
  - **File:** `tests/integration/youtube-api.test.ts`
  - **Test Name:** `should handle TranscriptsDisabled error (AC6)`
  - **Input:** YouTube video URL with disabled transcripts
  - **Expected:** Error thrown matching `TranscriptsDisabled` or "disabled" text
  - **Why:** Verifies error handling with real API error responses

**NO E2E Tests:** This is a backend MCP server with no UI/UX

**Manual Verification:**
- ✅ Run `npm run test:integration` on developer machine
- ✅ Verify all 4 integration tests pass
- ✅ Check test output for memory measurements
- ✅ Verify test files created in `test-output-integration/` directory

### Regression Test Execution Plan

**Before PR Creation:**
```bash
# Execute comprehensive regression verification
# Gate 1: Unit Tests (existing)
npm test  # ALL 12 unit tests MUST PASS

# Gate 2: Integration Tests (new)
npm run test:integration  # ALL 4 integration tests MUST PASS

# Gate 3: Build
npm run build  # TypeScript compilation MUST succeed

# ALL gates MUST PASS before PR creation
# ANY gate failure = PR BLOCKED until fixed
```

**Zero Tolerance Policy:**
- No PR creation without 100% test pass rate (unit + integration)
- No shortcuts ("it's a small change" is not acceptable)
- No exceptions ("we'll fix it later" is not acceptable)
- Evidence required: Test logs showing all tests pass

### Regression Test Coverage Summary

**Total Affected Features:** 1 (streaming transcript processing)
**Total Unit Tests Required:** 12 (existing - no changes)
**Total Integration Tests Required:** 4 (new)
**Total E2E Tests Required:** 0 (no UI/UX)
**Total Manual Checks Required:** 1 (run integration tests locally)

**Coverage Percentage:** 100% (all ACs verified with real YouTube API)

**Verification Command:** `npm run test:integration`

## Implementation Checklist

**Status:** `[ ]` not started, `[→]` in progress, `[✓]` done, `[!]` blocked

### Setup
- [ ] Create feature branch `issue-13-integration-tests`
- [ ] Run existing unit tests → ALL PASS (baseline: 12/12)
- [ ] Verify YouTube API accessible (fetch any video transcript manually)

### Layer 1: Test Infrastructure
**Implementation:**
- [ ] Create `tests/integration/` directory
- [ ] Research and document 4 stable public YouTube video URLs (30min, 5hr, 6hr, disabled)
- [ ] Verify video URLs accessible and match duration requirements

**Testing:**
- [ ] Manual verification: Fetch each video URL with `YoutubeTranscript.fetchTranscript()`
- [ ] Verify 30min video has ~3000-5000 transcript entries
- [ ] Verify 5hr video has ~40000-50000 transcript entries
- [ ] Verify 6hr video has ~50000-60000 transcript entries
- [ ] Verify disabled video throws `TranscriptsDisabled` error

**GATE:** ✅ ALL 4 video URLs verified → Proceed to Layer 2

### Layer 2: Integration Test File Structure
**Implementation:**
- [ ] Create `tests/integration/youtube-api.test.ts`
- [ ] Add imports: vitest, fs/promises, path, youtube-transcript
- [ ] Add environment gate constant: `INTEGRATION_ENABLED`
- [ ] Add video URL constants: `TEST_VIDEOS` object
- [ ] Add `describe.skipIf()` wrapper with environment check
- [ ] Add `beforeEach` and `afterEach` for test cleanup

**Testing:**
- [ ] Run `npm test` → Verify integration tests NOT executed (env var not set)
- [ ] Run `RUN_INTEGRATION_TESTS=true npm test` → Verify integration tests discovered
- [ ] Verify `test-output-integration/` directory created and cleaned up

**GATE:** ✅ Test infrastructure setup verified → Proceed to Layer 3

### Layer 3: AC5 Test (30min Baseline)
**Implementation:**
- [ ] Write test: `should process 30min video without performance regression (AC5)`
- [ ] Fetch real transcript: `YoutubeTranscript.fetchTranscript(TEST_VIDEOS.SHORT_30MIN)`
- [ ] Simulate streaming write (minimal - just verify fetch works)
- [ ] Assert: `transcriptEntries.length > 0`

**Testing:**
- [ ] Run test: `npm run test:integration`
- [ ] Verify test passes with real YouTube API call
- [ ] Verify transcript entries returned
- [ ] Execution time: <30 seconds expected

**GATE:** ✅ AC5 test passes → Proceed to Layer 4

### Layer 4: AC1 Test (5hr Memory)
**Implementation:**
- [ ] Write test: `should process 5hr video with <100MB peak memory (AC1)`
- [ ] Add GC control: `if (global.gc) global.gc()` before baseline
- [ ] Measure baseline: `const memBefore = process.memoryUsage()`
- [ ] Fetch real transcript: `YoutubeTranscript.fetchTranscript(TEST_VIDEOS.LONG_5HR)`
- [ ] Simulate streaming write (follow src/index.ts:219-239 pattern)
- [ ] Add GC control: `if (global.gc) global.gc()` after streaming
- [ ] Measure final: `const memAfter = process.memoryUsage()`
- [ ] Calculate delta: `Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)`
- [ ] Assert: `peakDelta < 100`

**Testing:**
- [ ] Run test: `npm run test:integration`
- [ ] Verify test passes
- [ ] Verify memory delta <100MB reported
- [ ] Execution time: 2-5 minutes expected

**GATE:** ✅ AC1 test passes → Proceed to Layer 5

### Layer 5: AC2 Test (6hr Memory)
**Implementation:**
- [ ] Copy AC1 test structure
- [ ] Replace video URL: `TEST_VIDEOS.LONG_6HR`
- [ ] Rename test: `should process 6hr video with <100MB peak memory (AC2)`
- [ ] Keep same memory measurement logic

**Testing:**
- [ ] Run test: `npm run test:integration`
- [ ] Verify test passes
- [ ] Verify memory delta <100MB reported
- [ ] Execution time: 3-6 minutes expected

**GATE:** ✅ AC2 test passes → Proceed to Layer 6

### Layer 6: AC6 Test (Error Handling)
**Implementation:**
- [ ] Write test: `should handle TranscriptsDisabled error (AC6)`
- [ ] Use `expect().rejects.toThrow()` pattern
- [ ] Attempt fetch: `YoutubeTranscript.fetchTranscript(TEST_VIDEOS.DISABLED)`
- [ ] Assert error message matches: `/TranscriptsDisabled|disabled/i`

**Testing:**
- [ ] Run test: `npm run test:integration`
- [ ] Verify test passes
- [ ] Verify error caught and validated
- [ ] Execution time: <10 seconds expected

**GATE:** ✅ AC6 test passes → Proceed to Layer 7

### Layer 7: Package.json Script
**Implementation:**
- [ ] Open `package.json`
- [ ] Add new script: `"test:integration": "RUN_INTEGRATION_TESTS=true node --expose-gc ./node_modules/.bin/vitest run tests/integration"`
- [ ] Save file

**Testing:**
- [ ] Run: `npm run test:integration`
- [ ] Verify all 4 integration tests execute
- [ ] Verify all tests pass
- [ ] Verify unit tests still run separately with `npm test`

**GATE:** ✅ Script works correctly → Proceed to Layer 8

### Layer 8: Documentation
**Implementation:**
- [ ] Check if `README.md` exists in project root
- [ ] If exists: Add "Testing" section with integration test instructions
- [ ] If not exists: Create minimal README.md with testing section
- [ ] Document environment variable requirement
- [ ] Document expected execution time

**Testing:**
- [ ] Read documentation for clarity
- [ ] Verify instructions match actual commands
- [ ] Verify environment variable documented

**GATE:** ✅ Documentation complete → Proceed to Final

### Final Verification
- [ ] Run full test suite: `npm test && npm run test:integration`
- [ ] Verify all 16 tests pass (12 unit + 4 integration)
- [ ] Run build: `npm run build` → SUCCESS
- [ ] Verify no TypeScript errors
- [ ] Verify no linter warnings
- [ ] All issue ACs verified with real YouTube API calls
- [ ] Ready for PR creation

## Definition of Done

### Core Requirements
- [ ] All 4 integration tests created in `tests/integration/youtube-api.test.ts`
- [ ] AC1 verified with real 5hr YouTube video
- [ ] AC2 verified with real 6hr YouTube video
- [ ] AC5 verified with real 30min YouTube video
- [ ] AC6 verified with disabled/private video error handling
- [ ] Environment variable gating implemented (`RUN_INTEGRATION_TESTS=true`)
- [ ] Package.json script added: `npm run test:integration`
- [ ] Documentation updated with integration test instructions

### Test Quality
- [ ] NO MOCKS used in integration tests (real YouTube API calls only)
- [ ] Memory measurement uses GC control pattern (matches streaming.test.ts)
- [ ] Test file follows existing patterns (Vitest, beforeEach/afterEach, console.error)
- [ ] All tests pass locally with `npm run test:integration`

### Regression Testing
- [ ] All existing unit tests still pass (`npm test` → 12/12)
- [ ] Build succeeds (`npm run build` → TypeScript compilation OK)
- [ ] No code changes to `src/index.ts` (test-only implementation)
- [ ] No changes to existing test files (preserve unit test coverage)

### Documentation
- [ ] Video URLs documented in test file comments (with alternatives)
- [ ] Environment variable requirement documented
- [ ] Expected execution time documented
- [ ] README.md updated (if exists) or created (if not)

### Production Readiness
- [ ] Integration tests can run in CI/CD (environment variable gated)
- [ ] Tests skip gracefully if `RUN_INTEGRATION_TESTS` not set
- [ ] No hardcoded credentials (uses public YouTube videos)
- [ ] Test cleanup prevents disk space buildup (`afterEach` removes output files)
