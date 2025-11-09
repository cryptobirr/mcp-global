# Research Report: Strengthen Memory Test with GC Control and Edge Case Handling

**Spec Reference:** `.dev/issues/9-memory-test-gc-timing/01-spec/spec.md`
**Research Date:** 2025-11-06T18:20:15Z
**Issue:** #9
**Codebase:** mcp-global (youtube-mcp-server)

---

## Executive Summary

**Project Type:** TypeScript MCP Server
**Complexity:** Simple
**Brownfield/Greenfield:** Brownfield (modifying existing test)
**Feasibility:** High

**Key Findings:**
- Single test file with 15 tests across 6 suites - isolated blast radius
- No existing GC control patterns in codebase - clean implementation opportunity
- Memory test at lines 109-128 has clear insertion points for GC calls
- Modern test stack (Vitest 4.0.7, TypeScript 5.9.3, Node 20.19) supports all required features
- Zero production code impact - test-only changes with no regression risk

---

## Architecture Overview

**Project Type:** MCP Server (Model Context Protocol)
**Language(s):** TypeScript 5.9.3
**Framework(s):** @modelcontextprotocol/sdk 0.6.0, Vitest 4.0.7

**Directory Structure:**
- `/servers/binaries/youtube-mcp-server/src/` - Server implementation (single file: index.ts)
- `/servers/binaries/youtube-mcp-server/tests/` - Test suite (single file: streaming.test.ts)
- `/servers/binaries/youtube-mcp-server/build/` - TypeScript compilation output
- `.dev/issues/` - Structured issue workflow (spec → research → plan → implementation)

**Key Patterns:**
- Configuration: Vitest config at vitest.config.ts:4-10 (Node environment, globals enabled, V8 coverage)
- Testing: Single test file with 6 describe blocks, 15 total tests at streaming.test.ts:1-382
- Memory measurement: process.memoryUsage() at streaming.test.ts:109,127 (no GC control currently)
- Error handling: Promise-based stream completion with cleanup at src/index.ts:211-233

**Test Suite Organization:**
1. Chunk Processing (3 tests) - streaming.test.ts:25-76
2. HTML Entity Decoding (3 tests) - streaming.test.ts:78-96
3. Memory Usage (1 test) - streaming.test.ts:98-132 ⚠️ **TARGET TEST**
4. Progress Logging (2 tests) - streaming.test.ts:134-178
5. Filename Generation (2 tests) - streaming.test.ts:180-206
6. Stream Error Handling (5 tests) - streaming.test.ts:208-376

---

## Similar Patterns Found

### Pattern: Memory Monitoring for Debugging
**Location:** `servers/binaries/youtube-mcp-server/src/index.ts:138-143, 235-240`
**Purpose:** Optional memory logging in production code (gated by DEBUG env var)
**Relevant because:** Uses same process.memoryUsage() approach but without GC control

**Code example:**
```typescript
// Before streaming (line 138)
let memoryBefore: NodeJS.MemoryUsage | undefined;
if (process.env.DEBUG?.includes('memory')) {
  memoryBefore = process.memoryUsage();
  console.error(`Memory before streaming: ${Math.round(memoryBefore.heapUsed / 1024 / 1024)}MB`);
}

// After streaming (line 235)
if (process.env.DEBUG?.includes('memory') && memoryBefore) {
  const memoryAfter = process.memoryUsage();
  console.error(`Memory after streaming: ${Math.round(memoryAfter.heapUsed / 1024 / 1024)}MB`);
  console.error(`Peak memory delta: ${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)}MB`);
}
```

**Test coverage:** Not tested (debug-only code path)
**Dependencies:** None
**Key insight:** Production code has no GC control, only used for manual debugging

### Pattern: Conditional Feature Execution
**Location:** `servers/binaries/youtube-mcp-server/src/index.ts:140`
**Purpose:** Graceful feature degradation when optional dependency unavailable
**Relevant because:** Should use same pattern for `global.gc()` availability check

**Code example:**
```typescript
if (process.env.DEBUG?.includes('memory')) {
  // Only execute when feature available
}
```

**Recommended adaptation for spec:**
```typescript
if (global.gc) global.gc();  // Conditional GC, graceful degradation
```

### Pattern: Defensive Delta Calculation (NOT FOUND)
**Search results:** No existing use of `Math.max(0, delta)` pattern in youtube-mcp-server
- Searched for Math.max in streaming contexts - none found
- Searched across all MCP servers - only unrelated usage in excel-mcp-server (column indexing)

**Conclusion:** This will be the **FIRST** defensive delta calculation in the codebase, establishing a new best practice.

---

## Integration Points

### System: MCP SDK (@modelcontextprotocol/sdk)
**Current usage:** `src/index.ts:2-9, 31-42, 56-288`
**Purpose:** Stdio-based MCP server protocol implementation
**Integration pattern:**
- Server initialization at index.ts:31-42
- Tool registration via ListToolsRequestSchema handler at index.ts:56-79
- Tool execution via CallToolRequestSchema handler at index.ts:82-281
- Communication: StdioServerTransport at index.ts:284-288

**Relevant for spec requirement:** No impact - test changes don't affect MCP protocol

### System: YouTube Transcript API (youtube-transcript@1.2.1)
**Current usage:** `src/index.ts:115-117`
**API pattern:** `YoutubeTranscript.fetchTranscript(video_url)` returns transcript entries
**Error handling:** Try-catch at index.ts:112-129 with specific error message parsing
**Rate limiting:** NONE - relies on library's internal handling
**Relevant for spec requirement:** No impact - test uses mock data (60k synthetic entries)

### System: Node.js File System (createWriteStream)
**Current usage:** `src/index.ts:180-184, 187-208`
**Pattern:** Chunked writing with 1000-entry chunks
**Stream lifecycle:**
1. Create stream at index.ts:180
2. Write header at index.ts:183
3. Write chunks in loop at index.ts:187-208
4. Complete via Promise at index.ts:211-233

**Error handling:** Single error listener with cleanup at index.ts:217-232
**Cleanup pattern:** Unlink partial file on error before rejecting Promise

**Relevant for spec requirement:** Test mimics this exact pattern - no integration changes needed

---

## Testing Infrastructure

**Framework:** Vitest 4.0.7 with TypeScript support
**Test Location:** `/servers/binaries/youtube-mcp-server/tests/` (single file: streaming.test.ts)
**Conventions:**
- File naming: `*.test.ts`
- Structure: describe blocks per feature area, it blocks per scenario
- Setup/teardown: beforeEach/afterEach at streaming.test.ts:14-23

**Test Types Present:**
- Unit: Chunk processing (lines 25-76), HTML decoding (lines 78-96), filename sanitization (lines 180-206)
- Integration: Memory usage (lines 98-132), progress logging (lines 134-178), stream error handling (lines 208-376)
- E2E: NONE (all tests use synthetic data)

**Test Infrastructure:**
- Temp directories: Created at streaming.test.ts:15, cleaned at streaming.test.ts:20
- Test data: Synthetic TranscriptEntry arrays generated per test
- File system: Actual fs operations with real temp files
- Cleanup: afterEach removes TEST_OUTPUT_DIR at streaming.test.ts:20

**Test Scripts (package.json:18-20):**
- `npm test` → `vitest run` (current - needs --expose-gc)
- `npm run test:watch` → `vitest`
- `npm run test:coverage` → `vitest run --coverage`

**CI/CD Gates:** NONE
- No GitHub Actions workflows detected
- Tests run manually via npm scripts
- No coverage minimums enforced
- No pre-commit hooks

**Vitest Configuration (vitest.config.ts:4-10):**
```typescript
test: {
  globals: true,              // Enables describe, it, expect without imports
  environment: 'node',        // Node.js environment (required for global.gc)
  coverage: {
    provider: 'v8',           // V8 code coverage
    reporter: ['text', 'html'],
    exclude: ['build/**', 'tests/**', 'vitest.config.ts'],
  },
}
```

**Key insight:** Node environment already configured - global.gc will work with --expose-gc flag

---

## Risks & Constraints

### Known Issues
- TODO: None found in memory test code paths
- FIXME: None found in streaming logic

### Performance Constraints
- Memory target: <100MB peak delta for 60k entries (enforced by test at streaming.test.ts:130)
- Chunk size: 1000 entries hardcoded (streaming.test.ts:106, src/index.ts:187)
- Progress threshold: 5000 entries for logging (src/index.ts:199, tested at streaming.test.ts:134-178)

### Breaking Change Risks
- **GC timing changes could affect other tests:** LOW RISK - memory test is isolated, no shared state
- **--expose-gc flag could break in CI:** LOW RISK - flag works in all Node environments (v12+)
- **Math.max(0, delta) could hide memory issues:** LOW RISK - only prevents false negatives from GC timing

**Mitigation strategies:**
- Conditional GC: `if (global.gc) global.gc()` - graceful degradation if flag missing
- Run all 15 tests after changes to verify no regression
- Document GC usage in test comments for future maintainers

### Migration Needs
- Data migration required? NO - test-only changes
- Schema changes needed? NO - no database
- Config changes needed? YES - package.json test script requires --expose-gc flag
- Deployment changes? NO - tests don't run in production

---

## Impact Analysis & Regression Risks

**Purpose:** Identify ALL existing features that could regress when implementing GC control and edge case handling in memory test

### Affected Features (Regression Test Candidates)

**Feature 1: Memory Usage Test**
- **Why Affected:** Direct modification target - adding GC calls and Math.max wrapper
- **Integration Points:** streaming.test.ts:109 (baseline measurement), streaming.test.ts:127 (final measurement), streaming.test.ts:128 (delta calculation)
- **Regression Risk:** Test could fail if GC calls break measurement or Math.max hides issues
- **Regression Tests Needed:**
  - Unit: Verify GC is called (conditional check works)
  - Integration: Run test 10 times, verify variance <5MB (vs. current 15-45MB)
  - Manual: Verify test still passes with <100MB assertion

**Feature 2: Other Streaming Tests (14 tests)**
- **Why Affected:** Same test file - package.json script change affects all tests
- **Integration Points:** All tests use same test runner (Vitest with --expose-gc flag)
- **Regression Risk:** --expose-gc flag could break test execution
- **Regression Tests Needed:**
  - Integration: Run full test suite (`npm test`) and verify all 15 tests pass
  - Manual: Verify test:watch mode still works with flag

**Feature 3: Production Memory Monitoring**
- **Why Affected:** Uses same process.memoryUsage() pattern at src/index.ts:138-143, 235-240
- **Integration Points:** DEBUG=memory environment variable gates feature
- **Regression Risk:** NONE - production code unchanged, no GC calls added to src/
- **Regression Tests Needed:**
  - Manual: Run server with DEBUG=memory and verify logging still works (optional - not blocking)

### Regression Test Coverage Matrix

| Feature | Unit Tests Needed | Integration Tests Needed | Manual Verification Needed |
|---------|-------------------|--------------------------|----------------------------|
| Memory Usage Test | 1 test (GC conditional) | 1 test (10 runs, <5MB variance) | Verify <100MB assertion passes |
| Other Streaming Tests | 0 tests | 1 test (full suite passes) | Verify test:watch mode works |
| Production Memory Monitoring | 0 tests | 0 tests | Optional: DEBUG=memory logging works |

**Total Regression Tests Required:** 3 (2 integration, 1 manual verification)
**Features Requiring Verification:** 2 features (memory test itself, other streaming tests)
**Coverage Target:** 100% (all affected features tested)

### Blast Radius Summary

**Direct Impact:** 4 lines modified (3 in test file, 1 in package.json) → 1 test affected
**Indirect Impact:** 14 other tests use modified test runner script
**Total Affected Features:** 2 (memory test, test suite execution)

**Verification Strategy:**
- Run memory test 10 times consecutively to verify variance reduction
- Run full test suite to verify no --expose-gc side effects
- ZERO tolerance for test failures - all 15 tests must pass
- No /sop-regression-verification needed (test-only changes, no production impact)

---

## Blocking Decisions

### 🚨 Decision Required: Fallback Strategy for Missing global.gc

**Context:** Spec requires forcing GC via `global.gc()`, which is only available when Node.js runs with `--expose-gc` flag. If flag is missing or GC is unavailable, test could fail.

**Options:**

#### Option A: Silent Fallback (Conditional GC Only)
- **Description:** Use `if (global.gc) global.gc();` without warnings - test runs with or without GC
- **Pros:**
  - No test failures if --expose-gc missing
  - Graceful degradation to current behavior
  - Simplest implementation (2 lines of code)
- **Cons:**
  - Silent failure mode - developer may not notice GC unavailable
  - Reduces test reliability improvement if flag missing
  - Harder to debug variance issues in future
- **Complexity:** Low
- **Implementation Impact:** streaming.test.ts:109,127 only (2 conditional GC calls)

#### Option B: Warning on Missing GC
- **Description:** Check `global.gc` availability at test start, log warning if missing, continue with test
- **Pros:**
  - Alerts developer to suboptimal test configuration
  - Still allows test to run (no breaking change)
  - Documents GC availability issue for debugging
- **Cons:**
  - Adds test console noise
  - Requires test setup modification (beforeEach or test start)
  - Warning could be ignored/missed in CI output
- **Complexity:** Medium
- **Implementation Impact:** streaming.test.ts:100-108 (add GC availability check), streaming.test.ts:109,127 (conditional GC)

#### Option C: Fail Test if GC Unavailable
- **Description:** Throw error or skip test if `global.gc` is undefined
- **Pros:**
  - Forces correct test configuration
  - Prevents false sense of test reliability
  - Makes GC requirement explicit
- **Cons:**
  - Breaking change - test fails if package.json script not updated
  - Could break CI if flag forgotten
  - Overly strict for optional improvement
- **Complexity:** Medium
- **Implementation Impact:** streaming.test.ts:100-108 (GC requirement check), streaming.test.ts:109,127 (unconditional GC)

**Recommendation:** Option A (Silent Fallback)

**Rationale:**
- Spec explicitly recommends "Conditional GC calls that only execute when `global.gc` is available (graceful degradation)" in Should Have requirements
- Package.json script will be updated with --expose-gc flag, making GC available by default
- Silent fallback prevents test failures while still improving reliability when flag present
- Aligns with existing codebase pattern: conditional DEBUG=memory logging at src/index.ts:140 (no warnings when disabled)
- If variance remains high after implementation, developer will investigate and discover GC unavailable
- Implementation simplicity reduces review burden and merge risk

**Implementation:**
```typescript
// streaming.test.ts:109
if (global.gc) global.gc();  // Force GC before baseline
const memBefore = process.memoryUsage();

// streaming.test.ts:127
if (global.gc) global.gc();  // Force GC before final measurement
const memAfter = process.memoryUsage();
```

---

## Recommendations for Planning Phase

**Approach:** Brownfield modification (3 lines in test, 1 line in package.json)

**Files to Modify:**
- `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:109` - Add conditional GC before baseline
- `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:127` - Add conditional GC before final measurement
- `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:128` - Wrap delta in Math.max(0, ...)
- `servers/binaries/youtube-mcp-server/package.json:18` - Update test script with --expose-gc flag

**New Files Needed:**
- NONE - all changes in existing files

**Test Strategy:**
- Unit tests: NOT NEEDED (changes are to test code itself)
- Integration tests: Run modified memory test 10 times, measure variance
- Validation criteria: Variance <5MB across 10 runs (vs. current 15-45MB)
- Regression tests: Run full test suite (15 tests), verify all pass
- Manual verification: Inspect test output for consistent memory delta values

**Dependencies:**
- Existing: Node.js 20.19 with --expose-gc support (built-in)
- Existing: Vitest 4.0.7 configured for Node environment
- New: NONE - all required features available

**Open Questions for Planning:**
- None - blocking decision resolved (Option A: Silent Fallback)
- Spec question "Should we add a fallback warning if `global.gc` is unavailable?" → Answered: No, use silent fallback per spec Should Have

---

## References

**Key Files (with line numbers):**
- servers/binaries/youtube-mcp-server/tests/streaming.test.ts:109 - Baseline memory measurement
- servers/binaries/youtube-mcp-server/tests/streaming.test.ts:127 - Final memory measurement
- servers/binaries/youtube-mcp-server/tests/streaming.test.ts:128 - Delta calculation
- servers/binaries/youtube-mcp-server/tests/streaming.test.ts:130 - <100MB assertion
- servers/binaries/youtube-mcp-server/package.json:18 - Test script configuration
- servers/binaries/youtube-mcp-server/vitest.config.ts:4-10 - Vitest Node environment config
- servers/binaries/youtube-mcp-server/src/index.ts:138-143 - Production memory monitoring (debug mode)
- servers/binaries/youtube-mcp-server/src/index.ts:235-240 - Production memory logging (debug mode)

**External Documentation:**
- [Node.js --expose-gc flag](https://nodejs.org/api/cli.html#--expose-gc) - Official Node.js CLI documentation
- [Vitest Configuration](https://vitest.dev/config/) - Test framework configuration options
- [process.memoryUsage()](https://nodejs.org/api/process.html#processmemoryusage) - Node.js memory measurement API
