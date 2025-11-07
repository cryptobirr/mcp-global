# Research Report: Fix Progress Logging Modulo Arithmetic

**Spec Reference:** `.dev/issues/008-progress-logging-modulo-bug/01-spec/spec.md`
**Research Date:** 2025-11-06T19:50:00Z
**Issue:** #8
**Codebase:** mcp-global/servers/binaries/youtube-mcp-server

---

## Executive Summary

**Project Type:** TypeScript MCP Server (Model Context Protocol)
**Complexity:** Simple
**Brownfield/Greenfield:** Brownfield (bug fix in existing streaming implementation)
**Feasibility:** High

**Key Findings:**
- Single-file TypeScript server with monolithic handler design at src/index.ts:82-281
- Bug located at src/index.ts:204 using incorrect modulo condition `(i + CHUNK_SIZE) % 5000 === 0`
- Test suite at tests/streaming.test.ts replicates buggy logic, requiring synchronized updates
- Impact radius is minimal: cosmetic logging fix with zero functional changes to transcript processing
- No external dependencies on progress log timing

---

## Architecture Overview

**Project Type:** Standalone MCP Server
**Language(s):** TypeScript 5.x, Node.js
**Framework(s):** @modelcontextprotocol/sdk (MCP), youtube-transcript library

**Directory Structure:**
- `src/index.ts` - Single-file implementation (292 lines)
- `tests/streaming.test.ts` - Vitest test suite (223 lines)
- `build/index.js` - Compiled executable (chmod 755)
- `vitest.config.ts` - Test framework configuration
- `package.json` - Dependencies and scripts

**Key Patterns:**
- **MCP Server Setup:** Server initialization at src/index.ts:27-50 using StdioServerTransport
- **Tool Registration:** ListToolsRequestSchema handler at src/index.ts:54-79, CallToolRequestSchema at src/index.ts:82-281
- **Streaming Implementation:** Five-phase execution at src/index.ts:82-281:
  1. URL preprocessing (lines 101-109)
  2. Fetch & setup (lines 115-176)
  3. Streaming write loop (lines 187-208) - **BUG LOCATION**
  4. Error handling (lines 217-233)
  5. Memory monitoring (lines 236-240, DEBUG-gated)
- **Constants:** CHUNK_SIZE=1000, PROGRESS_THRESHOLD=5000 defined at src/index.ts:135-136
- **Error Handling:** McpError with ErrorCode.InternalError at multiple locations
- **Diagnostic Output:** console.error() for stderr (17 total calls) - MCP protocol contract

---

## Similar Patterns Found

### Pattern: Modulo Loop Progress Logging (Standard)
**Location:** NOT FOUND in codebase (greenfield pattern needed)
**Purpose:** Log progress at fixed intervals during batch processing
**Relevant because:** Spec requires fixing to standard pattern `i % interval === 0`

**Expected Pattern (not in codebase):**
```typescript
for (let i = 0; i < total; i += CHUNK_SIZE) {
  // Process chunk

  if (total > THRESHOLD && i > 0 && i % INTERVAL === 0) {
    console.error(`Progress: ${i}/${total} entries`);
  }
}
```

**Why not in codebase:** Current implementation uses buggy variant `(i + CHUNK_SIZE) % 5000 === 0`

### Pattern: Chunked Streaming with Progress Feedback
**Location:** `src/index.ts:187-208`
**Purpose:** Process large transcript arrays in batches with user-visible progress
**Relevant because:** Demonstrates existing streaming loop structure

**Code example:**
```typescript
// Lines 187-208
for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
  const chunk = transcriptEntries.slice(i, Math.min(i + CHUNK_SIZE, transcriptEntries.length));

  for (const entry of chunk) {
    const decodedText = he
      .decode(entry.text)
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    fileStream.write(`${decodedText} `);
  }

  // BUGGY PROGRESS LOGGING CONDITION:
  if (transcriptEntries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
    const processed = Math.min(i + CHUNK_SIZE, transcriptEntries.length);
    console.error(`Progress: ${processed}/${transcriptEntries.length} entries`);
  }
}
```

**Test coverage:** `tests/streaming.test.ts:134-177`
- Test 1 (lines 135-156): Replicates buggy condition, expects logs at i=5000, i=10000
- Test 2 (lines 158-177): Verifies no logs for ≤5000 entries
**Dependencies:** he (HTML entity decoder), fs.createWriteStream

### Pattern: MCP Tool Handler with Error Propagation
**Location:** `src/index.ts:82-281`
**Purpose:** Async request handler with McpError exceptions
**Relevant because:** Shows error handling context for fix

**Code example:**
```typescript
// Lines 82-94
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_transcript_and_save") {
    if (!isValidGetTranscriptArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Missing required arguments: video_url and output_path"
      );
    }

    // ... streaming implementation with progress logging
  }
});
```

**Test coverage:** tests/streaming.test.ts:223-382 (Consolidated Error Handler tests)
**Dependencies:** @modelcontextprotocol/sdk

---

## Integration Points

### System: MCP Protocol (Model Context Protocol)
**Current usage:** `src/index.ts:27-292` (entire file is MCP server implementation)
**Auth pattern:** No authentication (local stdio transport)
**Error handling:** McpError exceptions with specific ErrorCode enums at lines 88-91, 120-125, 228-231
**Rate limiting:** None (local process)

**Relevant for spec requirement:** Progress logs use console.error() which outputs to stderr, not MCP response. MCP clients never see progress logs - they're for human monitoring only.

**Response Schema (lines 244-250):**
```typescript
return {
  content: [
    {
      type: "text",
      text: successMessage,
    },
  ],
};
```

**Transport:** StdioServerTransport at lines 285-288

### System: youtube-transcript Library
**Current usage:** `src/index.ts:115-117`
**Integration point:**
```typescript
const transcript = await YoutubeTranscript.fetchTranscript(cleanVideoUrl);
const transcriptEntries = transcript || [];
```
**Error handling:** Try/catch at lines 117-129 wraps fetch + MCP error conversion
**Relevant for spec requirement:** Library returns full transcript array before streaming loop begins, so no interaction with progress logging

### System: File System (Node.js fs/promises + streams)
**Current usage:**
- Directory creation: `fs.mkdir(recursive: true)` at src/index.ts:175-176
- Streaming write: `fs.createWriteStream()` at src/index.ts:180-184
- Error cleanup: `fs.unlink()` at src/index.ts:218-233

**Error handling pattern:**
```typescript
// Lines 217-233
fileStream.on('error', async (streamError) => {
  console.error('Stream write error:', streamError);

  try {
    await fs.unlink(outputPath);
    console.error('Cleaned up partial file after stream error');
  } catch (cleanupError) {
    console.error('Failed to cleanup partial file:', cleanupError);
  }

  throw new McpError(
    ErrorCode.InternalError,
    `Failed to write transcript: ${streamError.message}`
  );
});
```

**Relevant for spec requirement:** Progress logging happens during stream writes, but is independent of stream state

---

## Testing Infrastructure

**Framework:** Vitest 4.0.7 with Node.js environment
**Test Location:** `tests/streaming.test.ts` (223 lines)
**Configuration:** `vitest.config.ts:1-13`
- Globals enabled (line 5)
- Coverage: v8 provider, text/html reporters (lines 8-9)
- Exclusions: build/**, tests/**, config files (line 10)

**Test Types Present:**
- **Unit:** Chunk processing (lines 26-75), entity decoding (lines 78-96), progress logging (lines 134-177), filename generation (lines 180-206)
- **Integration:** Stream error handling (lines 223-382) with real file I/O
- **Performance:** Memory usage validation (lines 99-131) - expects <100MB for 60k entries

**Test Infrastructure:**
- **Setup:** beforeEach creates temp directory at lines 17-19: `fs.mkdir(TEST_OUTPUT_DIR, {recursive: true})`
- **Teardown:** afterEach removes temp directory at lines 21-23: `fs.rm(TEST_OUTPUT_DIR, {recursive: true, force: true})`
- **Fixtures:** In-line generation using `Array.from()` patterns (no external fixture files)
- **Assertions:** Standard Vitest expect API (toContain, toBe, toBeGreaterThan, toEqual)

**Test Scripts (package.json:18-20):**
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Progress Logging Test Implementation (BUGGY - requires update):**

**Test 1:** "should trigger progress logs for >5000 entries" (lines 135-156)
```typescript
// Line 147: BUGGY CONDITION (matches production bug)
if (entries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
  const processed = Math.min(i + CHUNK_SIZE, entries.length);
  progressLogs.push(`Progress: ${processed}/${entries.length} entries`);
}

// Lines 154-155: Assertions
expect(progressLogs).toContain('Progress: 5000/10000 entries');
expect(progressLogs).toContain('Progress: 10000/10000 entries');
```

**Test 2:** "should NOT trigger progress logs for ≤5000 entries" (lines 158-177)
```typescript
// Line 170: BUGGY CONDITION (matches production bug)
if (entries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
  progressLogs.push(`Progress: ${processed}/${entries.length} entries`);
}

// Line 176: Assertion
expect(progressLogs.length).toBe(0);
```

**Why Tests Pass Despite Bug:** Tests replicate production logic exactly, including the bug. Both production and test use `(i + CHUNK_SIZE) % 5000 === 0`, so they match.

---

## Risks & Constraints

### Known Issues
- **BUG at src/index.ts:204:** Progress logging triggers at wrong iterations
  - Current: `(i + CHUNK_SIZE) % 5000 === 0` triggers at i=4000, 9000, 14000, 19000...
  - Expected: Should trigger at i=5000, 10000, 15000, 20000...
  - Root cause: Modulo checks divisibility of chunk END position, not current position
- **Test suite replicates bug** at tests/streaming.test.ts:147, 170
  - Tests pass because they use same buggy logic
  - Mitigation: Synchronize test fixes with production fix

### Performance Constraints
- **Memory limit:** <100MB peak for 60k entries (validated by tests/streaming.test.ts:99-131)
- **Chunk size:** Fixed at 1000 entries (src/index.ts:135)
- **No performance impact from fix:** Progress logging is diagnostic only, doesn't affect processing speed

### Breaking Change Risks
- **None:** Progress logs output to stderr, not consumed by any system
- **Cosmetic change only:** Users won't notice difference (logged numbers already correct, just timing shifts)
- **No API changes:** MCP response schema unchanged
- **No data changes:** Transcript processing logic unchanged

### Migration Needs
- **Data migration required?** NO
- **Schema changes needed?** NO
- **Configuration changes?** NO
- **Deployment:** Simple rebuild with `npm run build`

---

## Impact Analysis & Regression Risks

**Purpose:** Identify ALL existing features that could regress when implementing modulo arithmetic fix

### Affected Features (Regression Test Candidates)

**Feature 1: Progress Logging to stderr**
- **Why Affected:** This IS the feature being modified
- **Integration Points:** src/index.ts:204-206 (progress log condition and console.error call)
- **Regression Risk:** Logs could appear at wrong intervals or not at all if fix is incorrect
- **Regression Tests Needed:**
  - **Unit:** Update tests/streaming.test.ts:147 condition to `i % 5000 === 0 && i > 0`
  - **Unit:** Update tests/streaming.test.ts:170 condition to match fix
  - **Unit:** Add new test validating exact boundaries (i=5000, 10000, 15000, 20000 for 20k entries)
  - **Integration:** MCP tool call with 10k entry mock, capture stderr, verify logs at i=5000 and i=10000
  - **Manual:** Real YouTube video with ~10k entries, observe stderr for correct timing

**Feature 2: Streaming Transcript Processing**
- **Why Affected:** Progress logging happens inside streaming loop
- **Integration Points:** src/index.ts:187-208 (for loop with chunk slicing, entity decoding, stream writes)
- **Regression Risk:** Loop iteration logic could be accidentally modified, breaking chunking
- **Regression Tests Needed:**
  - **Unit:** Existing "should process 1000 entries in single chunk" (lines 26-41) - must still pass
  - **Unit:** Existing "should process 10000 entries in 10 chunks" (lines 43-58) - must still pass
  - **Unit:** Existing "should handle partial final chunk" (lines 60-75) - must still pass
  - **Manual:** 30min YouTube video (baseline performance test per spec AC5)

**Feature 3: HTML Entity Decoding**
- **Why Affected:** Happens in same loop iteration as progress logging
- **Integration Points:** src/index.ts:191-198 (he.decode + chained .replace calls)
- **Regression Risk:** Minimal (no shared state), but verify no accidental changes
- **Regression Tests Needed:**
  - **Unit:** Existing "should decode numeric HTML entities" (lines 79-83) - must still pass
  - **Unit:** Existing "should decode named HTML entities" (lines 85-89) - must still pass
  - **Unit:** Existing "should decode all entities via he.decode" (lines 91-96) - must still pass

**Feature 4: Memory Monitoring (DEBUG mode)**
- **Why Affected:** Runs before/after streaming loop, shares context
- **Integration Points:** src/index.ts:139-143 (pre-loop), 236-240 (post-loop)
- **Regression Risk:** None (no shared variables with progress logging)
- **Regression Tests Needed:**
  - **Unit:** Existing "should maintain <100MB peak for 60k entries" (lines 99-131) - must still pass

**Feature 5: Stream Error Handling**
- **Why Affected:** Error listener registered before streaming loop
- **Integration Points:** src/index.ts:217-233 (fileStream.on('error') with cleanup)
- **Regression Risk:** None (progress logging doesn't touch error listeners)
- **Regression Tests Needed:**
  - **Unit:** Existing "Consolidated Error Handler" tests (lines 223-382) - all must still pass
  - **Manual:** Verify error cleanup still works (write to read-only directory)

### Regression Test Coverage Matrix

| Feature | Unit Tests Needed | Integration Tests Needed | Manual Verification Needed |
|---------|-------------------|--------------------------|----------------------------|
| Progress Logging | 3 tests (2 updates + 1 new) | 1 test (MCP + stderr capture) | 10k entry video stderr observation |
| Streaming Processing | 3 existing tests | None | 30min video baseline |
| Entity Decoding | 3 existing tests | None | None |
| Memory Monitoring | 1 existing test | None | Optional: DEBUG=memory with 5hr video |
| Error Handling | 5 existing tests | None | Write to read-only path |

**Total Regression Tests Required:** 16
- **Update existing:** 2 unit tests
- **New unit:** 1 test
- **Existing unit (verify pass):** 12 tests
- **New integration:** 1 test
- **Manual:** 2-3 scenarios

**Features Requiring Verification:** 5 features
**Coverage Target:** 100% (all affected features tested)

### Blast Radius Summary

**Direct Impact:** 1 file modified (src/index.ts:204) → 1 feature affected (progress logging)
**Indirect Impact:** 5 features use same streaming loop (entity decoding, chunking, error handling, memory monitoring, MCP response)
**Total Affected Features:** 5

**Verification Strategy:**
- Fix progress logging condition in production (src/index.ts:204)
- Synchronize test suite (tests/streaming.test.ts:147, 170)
- Add boundary validation test
- Run full test suite: `npm test` (expect 12/12 PASS)
- Manual verification with real YouTube videos (10k, 20k entries)
- Execute `/sop-regression-verification` after implementation (ZERO tolerance for failures)

---

## Blocking Decisions

### 🚨 Decision Required: Progress Log Message Format

**Context:** Current implementation reports `Math.min(i + CHUNK_SIZE, total)` as processed count, which is the number of entries processed AFTER current chunk completes. With fix changing condition from `(i + CHUNK_SIZE) % 5000 === 0` to `i % 5000 === 0`, the logged number will change.

**Current Behavior (BUGGY):**
- Loop at i=4000: Condition `(4000 + 1000) % 5000 === 0` is TRUE
- Logs: `Progress: 5000/10000 entries` (reports i + CHUNK_SIZE)

**Option A: Keep Current Message Format (Report i + CHUNK_SIZE)**
- **Description:** Change condition but keep message as `Math.min(i + CHUNK_SIZE, total)`
- **Pros:**
  - Semantic consistency: Reports entries processed AFTER iteration completes
  - Numbers look natural: "Progress: 5000/10000" instead of "Progress: 4000/10000"
  - Maintains existing pattern from original implementation
- **Cons:**
  - Less intuitive: At i=5000, reports 6000 processed
  - Off-by-one appearance (though technically correct)
- **Complexity:** Low (no change to message format)
- **Implementation Impact:** src/index.ts:205 unchanged, tests/streaming.test.ts:149,172 unchanged

**Example Output:**
```
Progress: 6000/10000 entries  (triggered at i=5000, reports i+1000)
Progress: 10000/10000 entries (triggered at i=10000, reports min(11000,10000))
```

#### Option B: Change to Report Current Index (Report i)
- **Description:** Change message to report `i` instead of `i + CHUNK_SIZE`
- **Pros:**
  - Mathematically aligned: At i=5000, reports 5000
  - Matches loop variable directly
  - Simpler logic (remove Math.min)
- **Cons:**
  - Semantically odd: Reports entries processed BEFORE current chunk completes
  - Numbers less intuitive: "Progress: 5000/10000" means 5000 done, currently processing next 1000
  - Breaks existing test expectations
- **Complexity:** Low (simplify message format)
- **Implementation Impact:**
  - src/index.ts:205: Change `Math.min(i + CHUNK_SIZE, total)` to `i`
  - tests/streaming.test.ts:149: Change `Math.min(i + CHUNK_SIZE, entries.length)` to `i`
  - tests/streaming.test.ts:154-155: Update expectations to `Progress: 5000/10000` and `Progress: 10000/10000`

**Example Output:**
```
Progress: 5000/10000 entries  (triggered at i=5000, reports i)
Progress: 10000/10000 entries (triggered at i=10000, reports i)
```

#### Option C: Change to Percentage-Based Progress
- **Description:** Replace count-based logging with percentage
- **Pros:**
  - Avoids off-by-one confusion entirely
  - More user-friendly for large numbers
  - Common pattern in CLIs
- **Cons:**
  - Breaks existing test expectations significantly
  - Loses absolute count information (can't tell if 50% is 5k or 50k entries)
  - Higher complexity (percentage calculation, rounding)
- **Complexity:** Medium (new calculation logic)
- **Implementation Impact:**
  - src/index.ts:205: Replace with `console.error(`Progress: ${Math.round((i/total)*100)}%`)`
  - tests/streaming.test.ts:154-155: Update expectations to percentage strings

**Example Output:**
```
Progress: 50%  (triggered at i=5000 for 10k total)
Progress: 100% (triggered at i=10000)
```

**Recommendation:** **Option B (Report i)**

**Rationale:**
- **Alignment with fix:** Spec changes condition to `i % 5000 === 0`, so reporting `i` directly aligns with trigger logic
- **Simplicity:** Removes `Math.min()` complexity and edge case handling
- **Correctness:** Mathematically accurate (i=5000 → "5000 processed")
- **Spec guidance:** Recommended implementation in spec.md:82-86 uses simplified format: `console.error(`Progress: ${i}/${total} entries`)`
- **Test impact:** Minimal (tests already expect these exact numbers, just need variable change)

**If Deferred:**
- Planning phase can proceed with either Option A or B
- Implementation must document choice in commit message
- Tests must be updated to match chosen format

---

## Recommendations for Planning Phase

**Approach:** Brownfield modification (single-line bug fix + test synchronization)

**Files to Modify:**
- `src/index.ts:204` - Change `(i + CHUNK_SIZE) % 5000 === 0` to `i % 5000 === 0 && i > 0`
- `src/index.ts:205` - Change `Math.min(i + CHUNK_SIZE, total)` to `i` (per Decision: Option B)
- `tests/streaming.test.ts:147` - Update test condition to match production fix
- `tests/streaming.test.ts:149` - Update test message to use `i` instead of `Math.min(i + CHUNK_SIZE, ...)`
- `tests/streaming.test.ts:170` - Update test condition to match production fix
- `tests/streaming.test.ts:172` - Update test message to use `i` instead of `Math.min(i + CHUNK_SIZE, ...)`

**New Files Needed:**
None (bug fix only, no new modules)

**Test Strategy:**
- **Update existing tests:** Synchronize conditions and message formats in tests/streaming.test.ts
- **Add boundary validation test:** New unit test verifying exact 5000-entry intervals for 20k entries
- **Add integration test:** MCP tool call with 10k entry mock, capture stderr
- **Manual verification:** Real YouTube videos (10k, 20k entries) with stderr observation
- **Regression suite:** Run all 12 existing tests, expect 100% PASS rate

**Dependencies:**
- **Existing:** All dependencies remain unchanged (he, @modelcontextprotocol/sdk, youtube-transcript, fs)
- **New:** None required

**Open Questions for Planning:**
None - blocking decision resolved (use Option B: report `i`), fix approach validated by spec.

---

## References

**Key Files (with line numbers):**
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/src/index.ts:204 - Buggy progress logging condition
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/src/index.ts:135-136 - Constants (CHUNK_SIZE, PROGRESS_THRESHOLD)
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/src/index.ts:187-208 - Streaming loop with bug
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/tests/streaming.test.ts:147 - Test condition requiring update
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/tests/streaming.test.ts:170 - Test condition requiring update
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/tests/streaming.test.ts:154-155 - Test assertions
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/vitest.config.ts:1-13 - Test framework config
- /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/package.json:18-20 - Test scripts

**External Documentation:**
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP SDK integration patterns
- [youtube-transcript NPM](https://www.npmjs.com/package/youtube-transcript) - Transcript fetching library
- [Vitest Documentation](https://vitest.dev/) - Test framework API
- [he (HTML entity decoder)](https://www.npmjs.com/package/he) - Entity decoding library
