## 📋 SPEC: Fix Duplicate Error Listeners on WriteStream Race Condition

**Approach:** BROWNFIELD
**Tech Stack:** TypeScript, Node.js (youtube-mcp-server)
**Feature Type:** BACKEND

---

### What We're Building

Eliminate race condition in youtube-mcp-server's transcript writing by consolidating duplicate error listeners into a single, consistent error handling path with proper cleanup.

---

### User Flow

1. User requests YouTube transcript via MCP server
2. Server creates writeStream to save transcript to file
3. If stream error occurs during write operation
4. Single error handler executes cleanup (removes partial file)
5. Error is propagated to caller with proper McpError wrapping
6. No duplicate handler execution or race condition

---

### Requirements

**Must Have:**
- Remove duplicate error listener at line 187 (first handler)
- Consolidate all error handling into Promise wrapper (line 240)
- Preserve cleanup logic (unlink partial file on error)
- Maintain proper McpError wrapping for API consistency
- Ensure async cleanup completes before Promise rejection

**Should Have:**
- Log stream errors for debugging
- Log successful cleanup operations
- Log cleanup failures (but don't fail the operation)

**Must NOT:**
- ❌ Keep two error handlers on same stream (creates race condition)
- ❌ Skip cleanup of partial files on error
- ❌ Allow Promise rejection before cleanup completes

---

### Acceptance Criteria

**AC1:** Single error handler consolidates all logic
- Given: writeStream is created and error listener is attached
- When: Stream error occurs
- Then: Only one error handler executes (inside Promise wrapper at line 240)

**AC2:** Cleanup executes before Promise rejection
- Given: Stream error occurs during write operation
- When: Error handler executes
- Then: Partial file is deleted (fs.unlink), THEN Promise is rejected with McpError

**AC3:** Error propagation maintains API contract
- Given: Cleanup completes (or fails gracefully)
- When: Promise rejects
- Then: McpError with ErrorCode.InternalError is thrown with descriptive message

---

### Implementation Notes

**[For BROWNFIELD Projects]:**
- Files to modify: `servers/binaries/youtube-mcp-server/src/index.ts:187-198,240`
- Pattern to follow: Promise-based error handling with cleanup before rejection
- Integration points: Existing writeStream creation (line ~185), Promise wrapper (line ~234)
- Testing approach: Update existing tests to verify single error handler behavior, add test for cleanup on error
- Migration strategy: Remove lines 187-198 (first error handler), expand line 240 handler to include cleanup logic

**Specific Changes:**
1. **Delete lines 187-198**: Remove first error handler and `streamError` variable
2. **Expand line 240 handler**: Move cleanup logic into Promise wrapper error handler
3. **Remove line 230 check**: No longer need `if (streamError)` check since Promise will reject directly

**Code Pattern:**
```typescript
// BEFORE (two handlers - race condition)
writeStream.on('error', async (err) => { /* cleanup */ });
// ... later ...
writeStream.on('error', reject);  // second handler

// AFTER (single handler - no race)
await new Promise<void>((resolve, reject) => {
  writeStream.end(() => resolve());

  writeStream.on('error', async (err: Error) => {
    console.error('Stream write error:', err);

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

**Testing approach:**
- Create test that triggers stream write error
- Verify partial file is deleted
- Verify McpError is thrown with correct message
- Verify no duplicate error handling occurs

---

### Open Questions

- [ ] Should we add retry logic for cleanup failures, or just log and proceed?

### Out of Scope

- Implementing retry logic for failed transcript writes (defer to future enhancement)
- Adding stream progress monitoring (not related to bug fix)
- Refactoring broader error handling patterns in the MCP server
