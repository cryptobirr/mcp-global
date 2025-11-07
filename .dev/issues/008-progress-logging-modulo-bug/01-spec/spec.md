## 📋 SPEC: Fix Progress Logging Modulo Arithmetic

**Approach:** BROWNFIELD
**Tech Stack:** TypeScript, Node.js
**Feature Type:** BACKEND

---

### What We're Building

Correcting the progress logging condition in youtube-mcp-server's streaming transcript processor to use semantically correct modulo arithmetic that remains stable across different CHUNK_SIZE values.

---

### User Flow

1. User requests transcript for video with >5000 entries
2. System begins streaming transcript processing in chunks
3. System logs progress at 5000-entry intervals (5000, 10000, 15000...)
4. System completes processing with final entry count
5. User sees progress updates throughout processing

---

### Requirements

**Must Have:**
- Progress logging condition must trigger at exact 5000-entry intervals
- Logic must work correctly regardless of CHUNK_SIZE value (500, 1000, 2000, etc.)
- Condition must use loop index `i` for modulo check, not derived position `i + CHUNK_SIZE`
- Existing progress message format must remain unchanged

**Should Have:**
- Skip logging at i=0 to avoid "Progress: 0/N entries" message
- Maintain current console.error() output for stderr visibility

**Must NOT:**
- ❌ Rely on coincidental alignment between CHUNK_SIZE and progress threshold
- ❌ Use chunk end position `i + CHUNK_SIZE` for modulo arithmetic
- ❌ Break existing functionality for transcripts ≤5000 entries

---

### Acceptance Criteria

**AC1:** Progress logs trigger at exact 5000-entry intervals for any CHUNK_SIZE
- Given: Transcript with 10000 entries, CHUNK_SIZE = 1000
- When: Processing loop iterates with i = 0, 1000, 2000, 3000, 4000, 5000...
- Then: Progress logs appear at i = 5000 and i = 10000 only

**AC2:** Progress logging skips initial zero position
- Given: Transcript with 10000 entries
- When: Processing starts at i = 0
- Then: No "Progress: 0/10000 entries" message appears

**AC3:** Logic remains stable with different CHUNK_SIZE values
- Given: Transcript with 10000 entries, CHUNK_SIZE = 500
- When: Processing loop iterates with i = 0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000...
- Then: Progress logs appear at i = 5000 and i = 10000 (not at 4500 or other positions)

---

### Implementation Notes

**[For BROWNFIELD Projects]:**
- Files to modify: `servers/binaries/youtube-mcp-server/src/index.ts:221-224`
- Pattern to follow: Standard modulo loop progress logging pattern
- Integration points: Existing streaming transcript handler
- Testing approach: Update `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:134-177` to validate correct behavior
- Migration strategy: None required (in-place bug fix)

**Current Implementation (BUGGY):**
```typescript
// Line 221-224
if (transcriptEntries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
  const processed = Math.min(i + CHUNK_SIZE, transcriptEntries.length);
  console.error(`Progress: ${processed}/${transcriptEntries.length} entries`);
}
```

**Correct Implementation (RECOMMENDED):**
```typescript
if (transcriptEntries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
  console.error(`Progress: ${i}/${transcriptEntries.length} entries`);
}
```

**Why This Fix Works:**
1. `i % 5000 === 0` triggers at exactly 5000, 10000, 15000... regardless of CHUNK_SIZE
2. `i > 0` prevents logging "Progress: 0/N entries" at loop start
3. Using `i` instead of `Math.min(i + CHUNK_SIZE, ...)` simplifies logic and removes fragility
4. Works correctly with CHUNK_SIZE = 500, 1000, 2000, or any value

**Test Updates Required:**
File: `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:134-177`
- Update test logic to use `i % 5000 === 0 && i > 0` instead of `(i + CHUNK_SIZE) % 5000 === 0`
- Verify test expectations match corrected behavior:
  - Expect progress logs at 5000 and 10000 entries
  - Expect NO progress log at i=0
  - Add new test case with CHUNK_SIZE=500 to verify stability

---

### Open Questions

None - bug root cause confirmed, fix approach validated.

### Out of Scope

- Configurable progress interval (hardcoded 5000 is acceptable)
- Alternative progress reporting mechanisms (stderr logging is sufficient)
- Refactoring CHUNK_SIZE or PROGRESS_THRESHOLD constants
