## 📋 SPEC: Strengthen Memory Test with GC Control and Edge Case Handling

**Approach:** BROWNFIELD
**Tech Stack:** TypeScript, Vitest, Node.js (--expose-gc)
**Feature Type:** BACKEND

---

### What We're Building

Strengthen the memory usage test in streaming.test.ts by forcing garbage collection before measurements and handling negative delta edge cases, ensuring reliable verification of the <100MB memory efficiency claim for 60k entry transcript processing.

---

### User Flow

1. Developer runs `npm test` to execute test suite
2. Memory test forces GC before baseline measurement to establish consistent starting point
3. Test executes streaming write operations for 60k entries
4. Test forces GC after operations to measure actual retained memory (not transient allocations)
5. Test calculates peak delta using Math.max(0, delta) to handle negative values gracefully
6. Test assertion validates <100MB memory constraint with reliable, repeatable results

---

### Requirements

**Must Have:**
- Force garbage collection before baseline memory measurement using `global.gc()`
- Force garbage collection after streaming operations before final measurement
- Handle negative delta edge cases using `Math.max(0, delta)` wrapper
- Enable `--expose-gc` flag in test script to make `global.gc()` available
- Maintain existing <100MB memory constraint assertion
- Produce consistent test results across multiple runs (variance <5MB)

**Should Have:**
- Conditional GC calls that only execute when `global.gc` is available (graceful degradation)
- Documentation comment explaining why GC is forced and why Math.max is used

**Must NOT:**
- ❌ Remove or weaken the <100MB memory assertion
- ❌ Change test behavior in ways that invalidate existing memory efficiency claims
- ❌ Break other streaming tests or modify test infrastructure beyond package.json script

---

### Acceptance Criteria

**AC1:** GC is forced before and after memory measurements
- Given: Memory test executes with `global.gc()` available
- When: Test runs to measure memory usage
- Then: `global.gc()` is called immediately before `memBefore` snapshot AND immediately before `memAfter` snapshot

**AC2:** Negative delta edge case is handled gracefully
- Given: GC runs between measurements, releasing more memory than was allocated
- When: Delta calculation executes as `(memAfter.heapUsed - memBefore.heapUsed)`
- Then: Result is wrapped in `Math.max(0, delta)` to ensure non-negative value, preventing assertion failure on memory improvement

**AC3:** Test script enables GC control
- Given: package.json test script configuration
- When: Developer runs `npm test`
- Then: Node.js process starts with `--expose-gc` flag, making `global.gc()` available to test code

**AC4:** Test produces consistent results
- Given: Test runs multiple times consecutively without code changes
- When: Memory delta is measured across runs
- Then: Variance is <5MB between runs (vs. current 15-45MB range), demonstrating GC timing is controlled

---

### Implementation Notes

**[For BROWNFIELD Projects]:**
- Files to modify:
  - `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:109` - Add `if (global.gc) global.gc();` before `memBefore`
  - `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:127` - Add `if (global.gc) global.gc();` before `memAfter`
  - `servers/binaries/youtube-mcp-server/tests/streaming.test.ts:128` - Wrap delta calculation in `Math.max(0, ...)`
  - `servers/binaries/youtube-mcp-server/package.json:18` - Update test script from `"vitest run"` to `"node --expose-gc ./node_modules/.bin/vitest run"`

- Pattern to follow:
  - Similar GC patterns exist in Node.js testing best practices for memory-sensitive tests
  - Math.max(0, x) is standard defensive programming for delta calculations

- Integration points:
  - Test integrates with existing Vitest test runner
  - No changes to test data generation or streaming logic
  - Only changes are measurement hygiene improvements

- Testing approach:
  - Run test 10 times consecutively and verify variance <5MB
  - Verify test still passes with <100MB assertion
  - Verify all other streaming tests continue to pass (no regression)

- Migration strategy:
  - No database or API changes needed
  - Change is purely test-side, no production code impact
  - Safe to merge immediately after validation

---

### Open Questions

- [ ] Should we add a fallback warning if `global.gc` is unavailable despite --expose-gc flag?

### Out of Scope

- Adding memory profiling or heap snapshots (beyond scope of bug fix)
- Changing the 100MB threshold (acceptance criterion, not implementation detail)
- Refactoring test structure or data generation (separate improvement)
