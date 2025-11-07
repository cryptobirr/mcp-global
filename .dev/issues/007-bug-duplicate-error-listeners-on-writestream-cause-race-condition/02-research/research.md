# Research Report: Fix Duplicate Error Listeners on WriteStream Race Condition

**Spec Reference:** `.dev/issues/007-bug-duplicate-error-listeners-on-writestream-cause-race-condition/01-spec/spec.md`
**Research Date:** 2025-11-06T18:00:00Z
**Issue:** #7
**Codebase:** mcp-global (youtube-mcp-server)

---

## Executive Summary

**Project Type:** Node.js MCP Server (TypeScript)
**Complexity:** Simple (single-file implementation, isolated bug fix)
**Brownfield/Greenfield:** Brownfield (modifying existing error handling)
**Feasibility:** High (fix already implemented in commit 1559dc0)

**Key Findings:**
- Fix already deployed (commit 1559dc0) with error capture pattern replacing async throw
- Duplicate error listeners consolidated: first listener captures error, second listener removed from implementation (but spec requires full removal)
- All 12 existing tests passing, but 5 regression tests still needed per planning phase
- Breaking change: Silent failures now properly return errors to MCP clients (intentional bug fix)
- Zero external dependencies affected - isolated MCP server with single tool

---

## Architecture Overview

**Project Type:** MCP Server (Model Context Protocol)
**Language:** TypeScript 5.9.3
**Framework:** @modelcontextprotocol/sdk 0.6.0
**Runtime:** Node.js 20.x

**Directory Structure:**
```
/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/
├── build/              # Compiled JavaScript output
│   └── index.js        # Main executable
├── src/                # TypeScript source code
│   └── index.ts        # Single main file (301 lines)
├── tests/              # Test suite
│   └── streaming.test.ts  # 12 tests (all passing)
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
└── vitest.config.ts    # Test configuration
```

**Key Patterns:**
- **Configuration:** Single-file MCP server with no external config
- **Database:** None (file-based output only)
- **Error handling:** McpError from SDK at src/index.ts:8, multi-layer error handling (stream events → Promise wrapper → try/catch → MCP response)
- **Stream handling:** Node.js native createWriteStream at src/index.ts:181
- **Testing:** Vitest 4.0.7 with integration-style tests (no mocking)

**Server Entry Point:**
- `src/index.ts:27-297` - YoutubeMcpServer class
- `src/index.ts:82-289` - get_transcript_and_save tool handler
- `src/index.ts:181-241` - Stream-based transcript writing with duplicate error listeners

---

## Similar Patterns Found

### Pattern 1: Error Capture Pattern (CURRENT IMPLEMENTATION)

**Location:** `src/index.ts:184-241`
**Purpose:** Capture stream errors for propagation after async cleanup
**Relevant because:** Spec requires consolidating duplicate error listeners using this pattern

**Code example:**
```typescript
// Line 184: Error capture variable
let streamError: Error | null = null;

// Lines 187-198: First error listener - captures error and cleans up
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

// Lines 228-241: Promise wrapper checks captured error
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
  writeStream.on('error', reject);  // Line 240: DUPLICATE LISTENER - needs removal per spec
});
```

**Test coverage:** tests/streaming.test.ts:208-221 (basic error test, doesn't verify cleanup)
**Dependencies:** fs.promises.unlink, McpError, ErrorCode
**Gap:** Second listener at line 240 still present - spec requires full consolidation

### Pattern 2: Promise Wrapper for Stream Lifecycle

**Location:** `tests/streaming.test.ts:122-125`
**Purpose:** Simplified Promise wrapper for stream completion in tests
**Relevant because:** Shows target pattern without duplicate listener

**Code example:**
```typescript
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => resolve());
  writeStream.on('error', reject);
});
```

**Pattern:** Single error listener in Promise wrapper, no error state checking
**Usage:** Test scenarios only
**Difference from production:** Production needs cleanup logic, tests don't

### Pattern 3: Silent Cleanup Failures

**Location:** `src/index.ts:192-197`
**Purpose:** Cleanup partial files on error without blocking error propagation
**Relevant because:** Pattern to preserve when consolidating error handlers

**Code example:**
```typescript
try {
  await fs.unlink(absoluteOutputPath);
  console.error(`Cleaned up partial file: ${absoluteOutputPath}`);
} catch (unlinkErr) {
  console.error('Failed to cleanup partial file:', unlinkErr);
}
```

**Pattern:** try/catch around cleanup, log both success and failure, don't rethrow
**Test coverage:** NOT TESTED (tests don't verify cleanup execution)
**Dependencies:** fs.promises.unlink

### Pattern 4: McpError Wrapping for API Consistency

**Location:** `src/index.ts:86-96, 231-234`
**Purpose:** Consistent error response format for MCP protocol
**Relevant because:** Error consolidation must preserve McpError wrapping

**Code example:**
```typescript
// Tool not found
throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);

// Invalid arguments
throw new McpError(ErrorCode.InvalidParams, 'Missing required argument: video_url');

// Stream errors (after fix)
reject(new McpError(ErrorCode.InternalError, `Failed to write transcript: ${err.message}`));
```

**Pattern:** Wrap all errors in McpError with appropriate ErrorCode
**Error codes used:** MethodNotFound, InvalidParams, InternalError
**Integration point:** Outer catch block at src/index.ts:260-287 handles all errors

---

## Integration Points

### System: MCP Protocol (Model Context Protocol)

**Current usage:** `src/index.ts:27-297` (YoutubeMcpServer class)
**Auth pattern:** No authentication (local server only)
**Error handling:** McpError instances with error codes at src/index.ts:8
**Client communication:** StdioServerTransport at src/index.ts:35

**Relevant for spec requirement:** Error consolidation must maintain MCP error response contract
**Integration points:**
- Line 27: Server initialization with stdio transport
- Line 47: Server-level error handler (console.error only)
- Lines 82-289: Tool request handler (CallToolRequestSchema)
- Lines 260-287: Outer catch block returning error responses

**Error response format:**
```typescript
{
  content: [{ type: 'text', text: 'error message' }],
  isError: true
}
```

### System: Node.js File System

**Current usage:** `src/index.ts:176,181,193`
**Operations:** mkdir (recursive), createWriteStream, unlink
**Error scenarios:** ENOENT (invalid path), EACCES (permission denied), ENOSPC (disk full)

**Relevant for spec requirement:** Cleanup logic must handle fs errors gracefully
**Integration points:**
- Line 176: `await fs.mkdir(outputDir, { recursive: true })` - directory creation
- Line 181: `createWriteStream(absoluteOutputPath, { encoding: 'utf-8' })` - stream creation
- Line 193: `await fs.unlink(absoluteOutputPath)` - cleanup on error

**Current pattern:** No try/catch around mkdir (relies on outer catch), try/catch around unlink (silent failure)

### System: YouTube Transcript Library

**Current usage:** `src/index.ts:106-111`
**Library:** youtube-transcript 1.2.1
**Error types:** TranscriptsDisabled, "Could not find transcript"
**Special handling:** Lines 271-275 (custom error messages for YouTube errors)

**Relevant for spec requirement:** NOT AFFECTED by error listener consolidation
**Integration point:** Outer try/catch handles YouTube errors separately from stream errors

---

## Testing Infrastructure

**Framework:** Vitest 4.0.7 with Node.js environment
**Test Location:** `/tests/streaming.test.ts` (single test file)
**Conventions:** describe blocks per feature area, it blocks per test case

**Test Types Present:**
- Unit: Stream operations, chunk processing, HTML decoding (12 tests)
- Integration: End-to-end streaming with file I/O (within unit tests)
- E2E: None (MCP protocol testing not implemented)

**Test Infrastructure:**
- Test directory: `tests/` (created in beforeEach, deleted in afterEach)
- Test data: Inline generation via `Array.from()` (no fixtures)
- Mocking: None (uses real Node.js APIs)
- Coverage: v8 provider configured but not installed (@vitest/coverage-v8 missing)

**Test Suite Breakdown:**

**File:** `tests/streaming.test.ts:1-221`

1. **Chunk Processing** (3 tests, lines 25-76)
   - 1000 entries → 1 chunk
   - 10000 entries → 10 chunks
   - 60001 entries → 61 chunks (partial final chunk)

2. **HTML Entity Decoding** (3 tests, lines 78-96)
   - Numeric apostrophe (`&#39;` → `'`)
   - Named apostrophe (`'` → `'`)
   - Full HTML entities via `he.decode`

3. **Memory Usage** (1 test, lines 98-132)
   - 60k entries → <100MB peak memory

4. **Progress Logging** (2 tests, lines 134-177)
   - >5000 entries → logs every 5000 entries
   - ≤5000 entries → no progress logs

5. **Filename Sanitization** (2 tests, lines 180-206)
   - Special characters removed
   - Empty/invalid → timestamp fallback

6. **Stream Error Handling** (1 test, lines 208-221)
   - Invalid path → error event fires
   - **GAP:** Doesn't verify cleanup execution
   - **GAP:** Doesn't verify error propagation to Promise
   - **GAP:** Doesn't verify McpError wrapping

**CI/CD Gates:**
- `npm test` must pass (runs vitest)
- No coverage minimum enforced (coverage tool not installed)
- Build step: `npm run build` (TypeScript compilation)

**Test Execution:**
```bash
✓ tests/streaming.test.ts (12 tests) 51ms
  Test Files  1 passed (1)
  Tests      12 passed (12)
```

**Coverage Gaps (Regression Test Requirements):**
1. Stream error cleanup verification (partial file deletion)
2. Stream error propagation to Promise rejection
3. McpError wrapping in error responses
4. Cleanup failure handling (fs.unlink throws)
5. End-to-end MCP tool error responses

---

## Risks & Constraints

### Known Issues

**Issue:** Duplicate error listeners on writeStream (THIS BUG)
- **Location:** src/index.ts:187 and src/index.ts:240
- **Impact:** Race condition in error handling
- **Status:** PARTIALLY FIXED (error capture pattern added, but duplicate listener at line 240 remains)
- **Spec requirement:** Remove line 240 duplicate listener entirely

**Issue:** Missing regression tests
- **Location:** tests/streaming.test.ts (only 1 basic error test)
- **Impact:** Error handling changes not verified
- **Mitigation:** 5 regression tests required per planning phase

### Performance Constraints

**Memory:** <100MB peak for large transcripts (60k+ entries)
- **Verified:** tests/streaming.test.ts:98-132
- **Pattern:** Streaming in 1000-entry chunks prevents memory buildup
- **Impact on fix:** No impact (error handling doesn't affect chunking)

**Streaming buffer:** Node.js default stream buffer size
- **Current:** No custom buffer size specified
- **Risk:** Large transcripts may buffer in memory if stream backpressure not handled
- **Mitigation:** Chunking pattern at src/index.ts:204-225

### Breaking Change Risks

**Error response format change:** Silent failures now return errors
- **Before fix:** Stream errors were LOST (async throw in callback), clients got false success
- **After fix:** Stream errors properly return `{ isError: true }` responses
- **Impact:** MCP clients may not have tested error handling paths
- **Severity:** INTENTIONAL breaking change (bug fix behavior)
- **Mitigation:** This is CORRECT - clients SHOULD handle errors

**Error message format:** Consistent with other server errors
- **Format:** `"Failed to write transcript: {originalError.message}"`
- **Risk:** Clients parsing error messages may break
- **Mitigation:** Use `isError: true` flag, not message parsing

### Migration Needs

**Data migration required?** NO - no persistent data
**Schema changes needed?** NO - no database
**Configuration changes needed?** NO - no config files

**Code migration:**
- Remove duplicate error listener at src/index.ts:240
- Consolidate all error handling into Promise wrapper error handler
- Preserve cleanup logic (fs.unlink) in consolidated handler
- Maintain McpError wrapping for API consistency

**Rollback procedure:**
```bash
git -C /Users/mekonen/.mcp-global revert 1559dc0 --no-edit
npm --prefix /Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server run build
```
**Rollback time:** <5 minutes
**Dependencies:** None (isolated server)

---

## Impact Analysis & Regression Risks

**Purpose:** Identify ALL features that could break when consolidating error listeners

### Affected Features (Regression Test Candidates)

**Feature 1: get_transcript_and_save Tool**
- **Why Affected:** This is the ONLY tool in the server, all error handling changes affect it
- **Integration Points:**
  - src/index.ts:181 - writeStream creation
  - src/index.ts:187-198 - First error listener (capture + cleanup)
  - src/index.ts:240 - Second error listener (Promise reject) - TO BE REMOVED
  - src/index.ts:260-287 - Outer catch block (error response formatting)
- **Regression Risk:** Error propagation could break if cleanup doesn't complete before rejection
- **Regression Tests Needed:**
  - Unit: Verify stream error captured in streamError variable
  - Unit: Verify cleanup executes before Promise rejection
  - Unit: Verify cleanup failure doesn't block error propagation
  - Integration: Verify error reaches outer catch block with correct McpError
  - Integration: Verify MCP response contains `isError: true` and error message

**Feature 2: MCP Client Error Handling**
- **Why Affected:** Error response format changes from silent failure to explicit error
- **Integration Points:** MCP clients consuming this server via global registry
- **Regression Risk:** Clients may not have tested error paths (due to silent failures before fix)
- **Regression Tests Needed:**
  - Manual: Test with Claude Desktop consuming server
  - Manual: Verify error responses display correctly to user
  - Manual: Verify success path unchanged

**Feature 3: Stream Cleanup on Error**
- **Why Affected:** Cleanup logic preserved but moved to consolidated error handler
- **Integration Points:**
  - src/index.ts:192-197 - fs.unlink for partial file removal
  - File system - expects partial files deleted on error
- **Regression Risk:** Cleanup could be skipped if error handler doesn't execute
- **Regression Tests Needed:**
  - Unit: Verify partial file deleted after stream error
  - Unit: Verify cleanup logs appear in console.error
  - Manual: Trigger stream error, verify file doesn't exist on disk

### Regression Test Coverage Matrix

| Feature | Unit Tests Needed | Integration Tests Needed | Manual Verification Needed |
|---------|-------------------|--------------------------|----------------------------|
| Error capture & propagation | 1 test (error captured in streamError variable) | 1 test (error reaches outer catch) | Stream error with invalid path |
| Cleanup execution | 2 tests (cleanup before rejection, cleanup on failure) | - | Verify file deleted on error |
| MCP error response | - | 1 test (response contains isError: true) | Test with Claude Desktop |
| Success path preservation | - | - | Large transcript (60k entries) |

**Total Regression Tests Required:** 5
- **Unit tests:** 3 (error capture, cleanup order, cleanup robustness)
- **Integration tests:** 2 (error propagation, MCP response)
- **Manual verification:** 4 steps (stream error, cleanup, success path, large transcript)

### Blast Radius Summary

**Direct Impact:** 1 file modified (src/index.ts) → 1 feature affected (get_transcript_and_save)
**Indirect Impact:** 0 features (server has single tool, no shared state)
**Total Affected Features:** 1

**Verification Strategy:**
- ALL affected features MUST have regression tests (5 new tests required)
- Execute `/sop-regression-verification` after implementation
- Zero tolerance for test failures

**Blast Radius:** MINIMAL
- **Scope:** Single tool in isolated server
- **Dependencies:** No shared state, no database, no external services
- **Isolation:** MCP server runs in dedicated process

---

## Blocking Decisions

### 🚨 Decision Required: Consolidation Approach for Error Handling

**Context:** Spec requires consolidating duplicate error listeners at lines 187-198 and 240. Current implementation (commit 1559dc0) uses error capture pattern but retains duplicate listener at line 240. Two approaches exist for full consolidation.

**Options:**

#### Option A: Move Cleanup into Promise Wrapper Error Handler (Spec Recommendation)

**Description:** Remove lines 187-198 entirely, move cleanup logic into Promise wrapper error handler at line 240

**Pros:**
- Matches spec's suggested implementation exactly
- Single error handler = no race condition
- Cleanup and rejection happen in same callback (easier to verify order)
- Simpler code path (no error state variable needed)

**Cons:**
- Requires moving 11 lines of cleanup logic
- Changes location of cleanup code (was near stream creation, now in Promise)
- Slightly harder to find cleanup logic when reading code top-to-bottom

**Complexity:** Low (straightforward code move)

**Implementation Impact:**
- Delete lines 184, 187-198 (error capture variable and first handler)
- Expand line 240 error handler to include cleanup logic
- No other changes needed

**Code example:**
```typescript
// DELETE lines 184, 187-198

// MODIFY line 240 handler:
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

#### Option B: Keep Error Capture Pattern, Remove Duplicate Listener

**Description:** Keep error capture pattern (current implementation), but remove duplicate listener at line 240 since error already propagated via streamError check

**Pros:**
- Minimal change from current implementation (only remove 1 line)
- Cleanup logic stays near stream creation (easier to find)
- Error capture pattern explicit (streamError variable documents intent)

**Cons:**
- More complex code flow (error → capture → check → reject)
- Requires error state variable (`streamError`)
- End callback must check for captured error (extra conditional)
- Doesn't match spec's recommended approach

**Complexity:** Low (single line deletion)

**Implementation Impact:**
- Delete line 240: `writeStream.on('error', reject);`
- Keep all other changes from commit 1559dc0
- Error propagation relies solely on streamError check in end callback

**Code example:**
```typescript
// KEEP current implementation (commit 1559dc0)
let streamError: Error | null = null;

writeStream.on('error', async (err: Error) => {
  streamError = err;
  // ... cleanup logic ...
});

await new Promise<void>((resolve, reject) => {
  writeStream.end(() => {
    if (streamError) {
      reject(new McpError(ErrorCode.InternalError, `Failed to write: ${streamError.message}`));
    } else {
      console.error(`Transcript saved to: ${absoluteOutputPath}`);
      resolve();
    }
  });
  // DELETE this line:
  // writeStream.on('error', reject);
});
```

**Recommendation:** Option A (Move Cleanup into Promise Wrapper)

**Rationale:**
- Matches spec's suggested implementation exactly (lines 81-106 in spec.md)
- Eliminates error state variable (simpler mental model)
- Single error handler = guaranteed no race condition
- Cleanup and rejection in same callback = easier to verify execution order in tests
- Aligns with test pattern (tests/streaming.test.ts:122-125 shows single listener in Promise wrapper)
- Future-proof: If more cleanup logic added, it's all in one place

**Defer to Planning:** NO - this decision blocks implementation approach

---

## Recommendations for Planning Phase

**Approach:** Brownfield modification (single file, targeted bug fix)

**Files to Modify:**
- `src/index.ts:184` - Delete error capture variable (no longer needed)
- `src/index.ts:187-198` - Delete first error listener and cleanup logic
- `src/index.ts:240` - Expand Promise wrapper error listener to include cleanup logic
- `tests/streaming.test.ts` - Add 5 regression tests for error handling

**New Files Needed:**
- None (all changes in existing files)

**Test Strategy:**
- **Unit tests (3 new):** Error capture & propagation, cleanup execution order, cleanup failure handling
- **Integration tests (2 new):** Error reaches outer catch, MCP response format
- **Manual verification (4 steps):** Stream error with invalid path, cleanup verification, success path unchanged, large transcript processing

**Dependencies:**
- **Existing:** @modelcontextprotocol/sdk 0.6.0, youtube-transcript 1.2.1, he 1.2.0
- **New:** None
- **Dev dependencies:** Consider adding @vitest/coverage-v8 for coverage reports (optional)

**Open Questions for Planning:**
- [ ] Should we add retry logic for cleanup failures? (Defer to future enhancement per spec line 119)
- [ ] Should we add coverage minimum enforcement? (Not in spec, optional improvement)

---

## References

**Key Files (with line numbers):**
- src/index.ts:27-297 - YoutubeMcpServer class and tool handler
- src/index.ts:184 - Error capture variable (to be deleted)
- src/index.ts:187-198 - First error listener with cleanup (to be moved)
- src/index.ts:240 - Second error listener (to be expanded with cleanup)
- src/index.ts:260-287 - Outer catch block (error response formatting)
- tests/streaming.test.ts:208-221 - Stream error test (needs expansion)

**External Documentation:**
- [MCP SDK Documentation](https://modelcontextprotocol.io/docs)
- [Node.js Streams Guide](https://nodejs.org/api/stream.html)
- [Vitest API Reference](https://vitest.dev/api/)
