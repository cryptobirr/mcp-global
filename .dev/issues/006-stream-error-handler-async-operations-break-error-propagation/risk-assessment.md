# Risk Assessment: Stream Error Handler Bug Fix (Issue #6)

**Created:** 2025-11-05T20:00:00Z  
**Project:** youtube-mcp-server  
**Issue:** #6 - Stream error handler async operations break error propagation  
**Status:** Pre-implementation analysis

---

## Executive Summary

The stream error handler in YouTube MCP server (lines 184-235 of index.ts) has a **critical async/await bug** where thrown errors inside event handler callbacks are lost, causing silent failures during transcript processing. This analysis identifies:

- **2 TODO/FIXME comments** indicating known debt
- **3 performance constraints** from streaming implementation
- **5 breaking change risks** related to error propagation
- **3 migration needs** for error handling consistency
- **4 edge cases** in error lifecycle handling

---

## 1. TODO/FIXME/HACK Comments Found

### Comment 1: Stream Error Handler Incomplete
**Location:** `/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/src/index.ts:183`

```typescript
// Error handling: cleanup partial file on stream errors
writeStream.on('error', async (err: Error) => {
  console.error('Stream write error:', err);
  
  // Cleanup partial file
  try {
    await fs.unlink(absoluteOutputPath);
    console.error(`Cleaned up partial file: ${absoluteOutputPath}`);
  } catch (unlinkErr) {
    console.error('Failed to cleanup partial file:', unlinkErr);
  }
  
  throw new McpError(  // BUG: This throw is LOST
    ErrorCode.InternalError,
    `Failed to write transcript: ${err.message}`
  );
});
```

**Status:** CRITICAL BUG (implicit TODO)  
**Impact:** Error thrown inside event callback is never propagated to caller  
**Root Cause:** Errors thrown in event handlers are not connected to Promise wrapper  

---

### Comment 2: Duplicate Error Listener
**Location:** `/Users/mekonen/.mcp-global/servers/binaries/youtube-mcp-server/src/index.ts:234`

```typescript
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => {
    console.error(`Transcript saved to: ${absoluteOutputPath}`);
    resolve();
  });
  writeStream.on('error', reject);  // Second error handler - overlaps with line 184
});
```

**Status:** Code smell (overlapping handlers)  
**Impact:** Two competing error handlers for same event - potential for conflict  
**Expected Fix:** Remove duplicate, use single unified error handler  

---

## 2. Performance Constraints & Limits

### Constraint 1: Memory Usage Hard Limit
**File:** `plan-v1-2025-11-06-004624.md:10-12`

```
Requirement: Stream transcript to disk in 1000-entry chunks with <100MB peak memory
Current implementation: 13-17MB peak for 6-hour videos (acceptable)
Target: <100MB peak regardless of transcript length
```

**Impact on Error Handling:**
- Stream errors must be handled WITHOUT buffering entire transcript in memory
- Cannot load all entries to validate or retry on error
- Partial file cleanup MUST be synchronous or use Promise to avoid memory bloat

**Test Coverage:**
- Memory test validates 60,000 entries process with <100MB peak delta
- Progress logging enables monitoring of memory-intensive sections

---

### Constraint 2: Chunk Size Fixed at 1000 Entries
**File:** `src/index.ts:135, tests/streaming.test.ts:33-57`

```typescript
const CHUNK_SIZE = 1000; // Hardcoded - affects error boundary granularity
```

**Impact on Error Handling:**
- Errors can occur mid-chunk during `writeStream.write(chunkText + ' ')`
- Cleanup cannot be selective (can't "un-write" partial chunk)
- All-or-nothing approach: entire file must be deleted on any write error

**Implications:**
- Users lose entire transcript on single write error (acceptable per spec)
- Cannot implement partial-recovery or resume mechanisms
- Error handler must delete ALL content, not attempt to salvage valid chunks

---

### Constraint 3: Progress Logging Threshold (5000 Entries)
**File:** `src/index.ts:222, plan-v1-2025-11-06-004624.md:59-91`

```typescript
const PROGRESS_THRESHOLD = 5000;
if (transcriptEntries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0)
```

**Impact on Error Handling:**
- Progress logs allow observing which chunk failed (via stderr)
- Helps correlate errors with specific entry ranges
- Performance-gated: logging disabled for <5000 entry transcripts

**Implications:**
- Error context in stderr: "Progress: 5000/10000" followed by "Stream write error"
- Helps users identify which part of transcript failed to save

---

## 3. Breaking Change Risks

### Risk 1: Error Propagation Changes Caller Behavior
**Severity:** MEDIUM  
**Current State:** Silent failure (error thrown in handler, lost)  
**Proposed State:** Error propagates to Promise, caught by outer catch block  

**Breaking for:**
- Any code relying on error-in-handler being silently swallowed
- Monitoring that expects success response on write errors
- Clients that don't handle `isError: true` response

**Migration Impact:**
- MCP clients MUST check `isError` flag in response
- Servers must handle `InternalError` codes for write failures
- Error messages will change: "Failed to write transcript: ENOENT" instead of success

---

### Risk 2: Cleanup Timing Changes
**Severity:** LOW  
**Current State:** Async cleanup inside event handler, error thrown afterward  
**Proposed State:** Await cleanup completion before rejecting Promise  

**Breaking for:**
- Monitoring that expects cleanup logs in specific order
- Timing-dependent tests (unlikely but possible)
- Clients with strict timeout requirements

**Migration Impact:**
- Cleanup now MUST complete before client sees error
- Adds ~10-50ms latency to error response (fs.unlink overhead)
- May timeout if disk is extremely slow (rare)

---

### Risk 3: Overlapping Error Handlers Removed
**Severity:** LOW  
**Current State:** Line 184 + Line 234 both listen to 'error' event  
**Proposed State:** Single unified handler at line 184 captures error, checked at line 234  

**Breaking for:**
- Code that depends on dual-handler behavior (edge case)
- Monitoring that counts error events (now fires once, not twice)
- Stream state machine tests expecting specific event sequence

**Migration Impact:**
- Error event fires ONCE (not multiple times)
- Simpler error flow makes debugging easier
- Less noisy stderr output (one error message, not duplicated)

---

### Risk 4: File Cleanup Becomes Mandatory
**Severity:** MEDIUM  
**Current State:** File cleanup failures logged but not blocking  
**Proposed State:** Cleanup completion checked before Promise resolution  

**Breaking for:**
- Read-only filesystems where cleanup fails
- Containers with immutable filesystem policies
- Monitoring that expects cleanup failures to be ignored

**Migration Impact:**
- Cleanup failure now blocks error propagation (must fix cleanup code)
- Cannot ignore permission errors on fs.unlink
- May need directory permissions adjustment in containers

---

### Risk 5: Promise Rejection vs. Success Response
**Severity:** CRITICAL  
**Current State:** Stream errors → McpError thrown in handler → lost → success returned  
**Proposed State:** Stream errors → Promise rejected → caught in outer catch → error response  

**Breaking for:**
- Any monitoring expecting successful responses for write errors
- Load balancers that interpret success status as health
- Clients that don't differentiate error vs. success responses

**Migration Impact:**
- HTTP/RPC status will change from 200/OK to error status
- Client error handling logic MUST activate
- Logging will show failures instead of successes

---

## 4. Migration Needs

### Migration 1: Error Handler Pattern Refactoring
**Files Affected:** `src/index.ts:184-235`  
**Current Pattern:** Throw inside event handler  
**New Pattern:** Capture in variable, check before resolve  

**Code Changes Required:**
```typescript
// NEW: Outer scope variable
let streamError: Error | null = null;

// Line 184: Change from throw to capture
writeStream.on('error', async (err: Error) => {
  streamError = err;  // Capture instead of throw
  // ... cleanup ...
});

// Line 229-235: Check captured error before resolve
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => {
    if (streamError) {
      reject(new McpError(...));  // Now properly rejected
    } else {
      resolve();
    }
  });
  // Remove line 234: writeStream.on('error', reject);
});
```

**Testing Required:**
- Error handler receives stream error event
- Cleanup completes before Promise rejection
- Error variable persists across event handler
- Promise properly rejects with McpError

---

### Migration 2: Test Suite Update for Error Propagation
**Files Affected:** `tests/streaming.test.ts:208-221`  
**Current Test:** Basic error event test (line 209-220)  
**New Requirements:** Test Promise rejection, cleanup order, McpError format  

**Test Changes:**
```typescript
describe('Stream Error Handling', () => {
  // NEW: Test Promise rejection
  it('should reject Promise on stream error', async () => {
    // Write to invalid path
    // Verify Promise rejects (not resolves)
    // Verify error includes original message
  });
  
  // NEW: Test cleanup before rejection
  it('should cleanup partial file before rejecting', async () => {
    // Write to valid path initially
    // Trigger write error mid-operation
    // Verify file deleted BEFORE Promise rejects
  });
  
  // EXISTING: Update to verify rejection (not silent success)
  it('should handle write stream errors gracefully', async () => {
    // Verify error event fires AND Promise rejects
  });
});
```

**Dependencies:**
- All existing tests must pass
- New tests must verify async cleanup completion
- Integration tests must verify error response structure

---

### Migration 3: Outer Catch Block Verification
**Files Affected:** `src/index.ts:254-281` (outer catch)  
**Current State:** Already exists, expects to catch streaming errors  
**New Requirement:** Verify catches McpError from Promise rejection  

**Verification Needed:**
```typescript
} catch (error: any) {  // Line 254
  console.error('Error during transcript processing:', error);
  
  // Line 258: Must now receive McpError from Promise rejection
  if (error instanceof Error) {
    errorMessage += ` Error: ${error.message}`;
  }
  
  // Return isError: true
  return {
    content: [{ type: 'text', text: errorMessage }],
    isError: true,
  };
}
```

**Test Verification:**
- Error from Promise rejection reaches outer catch
- `error instanceof Error` check still works for McpError
- `isError: true` returned to client
- Client error response properly formatted

---

## 5. Known Edge Cases & Warnings

### Edge Case 1: Error During Stream.end() Callback
**Risk Level:** MEDIUM  
**Scenario:** Stream error fires WHILE writeStream.end() callback executing  

```
Timeline:
1. writeStream.end(() => { console.log('...'); }) called
2. Stream internally processes end signal
3. BEFORE callback executes: error event fires → streamError set
4. Stream calls callback
5. Callback checks: if (streamError) → reject()
```

**Issue:** Callback might resolve before error fires (race condition)  
**Solution:** Spec uses reject callback pattern at line 234 as fallback  
**Test:** Need race condition test with artificial delay  

---

### Edge Case 2: Multiple Errors on Same Stream
**Risk Level:** LOW  
**Scenario:** Stream emits 'error' event multiple times  

```
writeStream.write() → error
writeStream.on('error', ...) → first handler executes, sets streamError
writeStream.write() → another error
writeStream.on('error', ...) → handler executes AGAIN, overwrites streamError
```

**Issue:** Last error wins (but Promise only rejects once)  
**Solution:** Check `if (!streamError)` before overwriting  
**Spec Status:** Not mentioned - may need additional safeguard  

---

### Edge Case 3: Error After Stream Already Closed
**Risk Level:** LOW  
**Scenario:** writeStream.end() completes, then error event fires  

```
Timeline:
1. writeStream.end(() => { resolve(); })
2. Stream closes successfully
3. Promise resolves
4. THEN error event fires (buffered or delayed)
5. Handler executes on closed stream
```

**Issue:** Handler tries to cleanup already-closed file  
**Solution:** fs.unlink already handles "file not found" gracefully  
**Mitigation:** Wrap cleanup in try-catch (already done, line 188-193)  

---

### Edge Case 4: Cleanup Fails Due to Permissions
**Risk Level:** MEDIUM  
**Scenario:** fs.unlink throws EACCES or EPERM  

```typescript
try {
  await fs.unlink(absoluteOutputPath);
} catch (unlinkErr) {
  console.error('Failed to cleanup partial file:', unlinkErr);
  // Currently swallows error and continues
  // After fix: Promise still rejects with ORIGINAL stream error
  // Cleanup failure logged but not blocking
}
```

**Issue:** Partial file left on disk if cleanup fails  
**Spec Status:** "Cleanup failures should be logged but not block error propagation" (plan.md line 40)  
**Testing:** Need permission-denied scenario test  

---

## 6. Dependency-Related Risks

### Dependency Risk 1: youtube-transcript Library Version
**Library:** `youtube-transcript@^1.2.1` (package.json line 25)  
**Risk:** Changes to library error types or fetch behavior  

**Impact on Error Handling:**
- Line 115: `YoutubeTranscript.fetchTranscript()` may throw new error types
- Line 265-268: Error message matching dependent on specific error format
- Spec requires: "TranscriptsDisabled" and "Could not find transcript" handling

**Constraint:** 
- Caret version allows minor updates: 1.2.x to 1.3.x
- Could introduce new error types not handled
- Must maintain backward compatibility with error message matching

---

### Dependency Risk 2: Node.js Stream API Stability
**API:** `fs.createWriteStream()` from Node.js core  
**Risk:** Stream behavior changes across Node.js versions  

**Impact on Error Handling:**
- Error event timing may vary across Node versions
- Promise wrapper assumes specific event ordering
- Backup error handler (line 234) assumes event fires during Promise pending

**Constraint:**
- Target Node.js 18+ (typical MCP server requirement)
- Stream API stable since Node.js 10
- But error/end event ordering may vary

---

### Dependency Risk 3: MCP SDK Error Classes
**Library:** `@modelcontextprotocol/sdk@0.6.0` (package.json line 23)  
**Risk:** McpError constructor signature or behavior changes  

**Impact on Error Handling:**
- Lines 86, 93, 195: McpError instantiation must remain compatible
- ErrorCode.InternalError must remain available
- Response structure: `{ content: [...], isError: true }`

**Constraint:**
- Exact version pinned: 0.6.0 (no semver flexibility)
- BREAKING: Cannot update SDK without verifying error classes

---

## 7. Integration Dependencies

### Integration Point 1: Outer Try-Catch Block (lines 112-281)
**Current State:** Lines 254-281 expect to catch all transcript processing errors  
**New State:** Must handle Promise rejections from stream error handler  

**Verification:**
```typescript
try {
  // ... lines 113-253: Including NEW Promise wrapper that may reject ...
} catch (error: any) {  // Line 254
  // Must catch McpError from Promise.reject()
}
```

**Risk:** If Promise rejection not caught, error becomes unhandled rejection  
**Mitigation:** Outer try-catch already present - no changes needed  
**Test:** Verify McpError reaches outer catch block via Promise rejection  

---

### Integration Point 2: MCP Server Request Handler (lines 82-283)
**Current State:** Async request handler returns `{ content, isError? }`  
**Interaction:** Error propagation changes will affect response structure  

**Response Format:**
```typescript
// Line 272-280: Current success response structure
return {
  content: [{ type: 'text', text: errorMessage }],
  isError: true,  // Must be set for error responses
};
```

**Risk:** If error handling broken, `isError` might not be set  
**Validation:** Integration tests must verify MCP protocol compliance  

---

### Integration Point 3: fs/promises Module (lines 11, 176, 189, 253)
**Mixing Patterns:** Uses both `fs/promises` AND `fs.createWriteStream()`  
**Risk:** Inconsistent error handling between stream and promise APIs  

**Current Usage:**
- Line 11: `import fs from 'fs/promises'` (promise-based)
- Line 12: `import { createWriteStream } from 'fs'` (callback-based)
- Line 176: `await fs.mkdir(...)` (promise-based)
- Line 189: `await fs.unlink(...)` (promise-based in stream error handler)

**Edge Case:** fs.unlink (promise) called from stream error handler (callback)  
**Solution:** Already wrapped in try-catch (line 188-193)  
**Risk:** Low - async cleanup within event handler is already spec'd pattern  

---

## 8. Test Coverage Gaps

### Gap 1: No Explicit Test for Promise Rejection Path
**Current Test:** `tests/streaming.test.ts:208-221` (stream error event)  
**Missing:** Verify Promise wrapper properly rejects  

**Required Test:**
```typescript
it('should reject Promise on stream write error', async () => {
  const outputPath = '/invalid/path/test.md';
  const writeStream = createWriteStream(outputPath);
  
  let promiseRejected = false;
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  }).catch(() => {
    promiseRejected = true;
  });
  
  expect(promiseRejected).toBe(true);  // MISSING TEST
});
```

---

### Gap 2: No Test for Cleanup Completion Before Rejection
**Current Test:** None explicitly verify cleanup happens BEFORE Promise rejects  
**Spec Requirement:** AC2 states "Cleanup happens before error propagation"  

**Required Test:**
```typescript
it('should cleanup partial file before rejecting Promise', async () => {
  let cleanupCompleted = false;
  let promiseRejected = false;
  
  // Trigger write error with cleanup tracking
  // Verify: cleanupCompleted = true AND promiseRejected = true
  // AND cleanup happened first
});
```

---

### Gap 3: No Race Condition Test
**Current Test:** None test timing of error event vs. stream.end() callback  
**Edge Case:** Error fires while callback executing  

**Required Test:**
```typescript
it('should handle error fired during stream.end() callback', async () => {
  // Artificially delay callback execution
  // Fire error event during callback
  // Verify Promise rejects properly
});
```

---

## 9. Recommendations & Mitigation Strategies

### Critical Mitigations
1. **Remove duplicate error listener** (line 234 becomes redundant after fix)
2. **Add variable initialization** before writeStream creation to scope error
3. **Update test suite** with Promise rejection verification tests
4. **Add integration test** for real stream write failures (invalid path, permission denied)
5. **Verify outer catch block** properly receives McpError via Promise rejection

### Performance Safeguards
1. **Preserve chunk size** at 1000 entries - changing affects all error boundaries
2. **Keep progress threshold** at 5000 - helps diagnose which chunk failed
3. **Monitor cleanup latency** - fs.unlink should complete in <50ms typical
4. **Test with DEBUG=memory** - verify no memory regressions from new pattern

### Breaking Change Mitigation
1. **Document error response change** - clients must handle `isError: true`
2. **Add deprecation notice** if applicable - old clients expecting silent failures
3. **Gradual rollout** - consider feature flag or version check
4. **Monitor error rates** - track increase in error responses (expected improvement)

---

## 10. Files Requiring Changes

| File | Lines | Change Type | Risk |
|------|-------|------------|------|
| `src/index.ts` | 184-235 | Critical refactor | HIGH |
| `src/index.ts` | 254-281 | Verification only | LOW |
| `tests/streaming.test.ts` | 208-221 | Enhancement | MEDIUM |
| `tests/streaming.test.ts` | NEW | Add Promise rejection tests | MEDIUM |
| `package.json` | 18-20 | Verification only | LOW |

---

## Conclusion

Fixing the stream error handler requires careful refactoring to ensure:

1. **Errors captured, not thrown** in event handlers
2. **Cleanup completes** before Promise rejection
3. **Promise rejection caught** by outer try-catch
4. **No overlapping error handlers** (remove line 234)
5. **Comprehensive testing** of error propagation paths

The fix is **technically sound** per spec, but introduces **BREAKING CHANGES** for clients expecting silent failures on write errors. Expect increased error responses in monitoring - this is the **correct behavior**.

**Highest Risk:** Edge case where error fires during stream.end() callback (low probability, mitigated by spec'd pattern).

**Timeline:** Implementation 1-2 hours + regression testing 2-3 hours.

