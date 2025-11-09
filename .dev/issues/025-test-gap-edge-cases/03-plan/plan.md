# Implementation Plan: Edge Case Test Coverage

**Issue:** #25  
**Phase:** Planning  
**Created:** 2025-11-09T23:46:00Z  
**Estimated Duration:** 3-4 hours

---

## Implementation Checklist

### Phase 1: Setup (15 minutes)
- [ ] **TASK-001:** Read existing test file to understand structure
- [ ] **TASK-002:** Identify insertion point (after line ~300)
- [ ] **TASK-003:** Create test suite skeleton with describe blocks
- [ ] **TASK-004:** Add beforeEach and afterEach hooks

### Phase 2: All-Fail Scenario Tests (1 hour)
- [ ] **TASK-005:** Implement test: "should handle batch where all videos fail"
  - Mock `processSingleTranscript` to always return failure
  - Call `processIndividualMode` with 3 URLs
  - Assert: successfulVideos === 0
  - Assert: failedVideos === 3
  - Assert: all results have success: false
  
- [ ] **TASK-006:** Implement test: "should return accurate summary when 100% failure rate"
  - Mock same as TASK-005
  - Call `processIndividualMode` with 5 URLs
  - Assert: summary report formatted correctly
  - Assert: no exceptions thrown

- [ ] **TASK-007:** Run tests: `npm test` (verify both pass)

### Phase 3: Network Timeout Tests (1 hour)
- [ ] **TASK-008:** Implement test: "should categorize timeout errors correctly"
  - Create error with code: 'ETIMEDOUT'
  - Mock `processSingleTranscript` to throw timeout error
  - Assert: error.code === 'ETIMEDOUT'
  - Assert: error message captured
  
- [ ] **TASK-009:** Implement test: "should handle partial success before timeout"
  - Mock sequence: success, success, timeout, success
  - Call `processIndividualMode` with 4 URLs
  - Assert: successfulVideos === 3
  - Assert: failedVideos === 1
  - Assert: timeout error in results[2]
  - Assert: processing continued after timeout

- [ ] **TASK-010:** Run tests: `npm test` (verify both pass)

### Phase 4: Disk Full Error Tests (1 hour)
- [ ] **TASK-011:** Implement test: "should handle disk full during file write"
  - Create error with code: 'ENOSPC'
  - Mock fs.promises.mkdir to throw disk error
  - Call `processIndividualMode` and expect error
  - Assert: error.code === 'ENOSPC'
  - Assert: error message contains "no space"
  
- [ ] **TASK-012:** Implement test: "should categorize disk errors properly"
  - Mock fs operations to fail with ENOSPC
  - Verify error categorization behavior
  - Assert: graceful failure (no crash)
  - Assert: error details captured

- [ ] **TASK-013:** Run tests: `npm test` (verify both pass)

### Phase 5: Integration & Validation (30 minutes)
- [ ] **TASK-014:** Run full test suite: `npm test`
- [ ] **TASK-015:** Verify all 6 new tests pass
- [ ] **TASK-016:** Verify existing 113 tests still pass
- [ ] **TASK-017:** Run coverage: `npm run test:coverage`
- [ ] **TASK-018:** Verify coverage ≥97%
- [ ] **TASK-019:** Run tests 10 times: `for i in {1..10}; do npm test; done`
- [ ] **TASK-020:** Verify 100% pass rate (no flaky tests)

### Phase 6: Code Quality (30 minutes)
- [ ] **TASK-021:** Run linter: `npm run lint`
- [ ] **TASK-022:** Fix any ESLint warnings
- [ ] **TASK-023:** Add inline comments explaining edge case simulation
- [ ] **TASK-024:** Review code for mock cleanup (afterEach)
- [ ] **TASK-025:** Verify TypeScript types compile correctly

### Phase 7: Documentation (15 minutes)
- [ ] **TASK-026:** Update test suite documentation in spec
- [ ] **TASK-027:** Add comments explaining ETIMEDOUT and ENOSPC codes
- [ ] **TASK-028:** Document mock cleanup strategy
- [ ] **TASK-029:** Verify all acceptance criteria met

### Phase 8: Final Validation (15 minutes)
- [ ] **TASK-030:** Build project: `npm run build`
- [ ] **TASK-031:** Run full test suite one final time
- [ ] **TASK-032:** Generate coverage report
- [ ] **TASK-033:** Screenshot coverage showing ≥97%
- [ ] **TASK-034:** Mark all DoD checklist items complete

---

## Implementation Details

### File Modified
```
servers/binaries/youtube-mcp-server/tests/unit/youtube-mcp-server.test.ts
```

### Lines Added (Estimated)
- Test suite structure: ~20 lines
- All-fail tests (2): ~60 lines
- Network timeout tests (2): ~70 lines
- Disk full tests (2): ~60 lines
- Total: ~210 lines

### Code Structure
```typescript
// Add after line ~300 in existing test file

describe('Batch Processing - Edge Cases', () => {
  let server: YoutubeMcpServer;

  beforeEach(() => {
    server = new YoutubeMcpServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('All-Fail Scenario', () => {
    it('should handle batch where all videos fail', async () => {
      // TASK-005 implementation
    });

    it('should return accurate summary when 100% failure rate', () => {
      // TASK-006 implementation
    });
  });

  describe('Network Timeout', () => {
    it('should categorize timeout errors correctly', () => {
      // TASK-008 implementation
    });

    it('should handle partial success before timeout', async () => {
      // TASK-009 implementation
    });
  });

  describe('Disk Full Error', () => {
    it('should handle disk full during file write', async () => {
      // TASK-011 implementation
    });

    it('should categorize disk errors properly', () => {
      // TASK-012 implementation
    });
  });
});
```

---

## Risk Mitigation

### Risk 1: Mock Pollution
**Mitigation:** Use `vi.restoreAllMocks()` in afterEach (TASK-003)

### Risk 2: Coverage Below 97%
**Mitigation:** Add more edge case tests in Phase 5 if needed (TASK-018)

### Risk 3: Flaky Tests
**Mitigation:** Run 10x validation loop (TASK-019)

### Risk 4: TypeScript Errors
**Mitigation:** Use proper type assertions (TASK-025)

---

## Dependencies

### Required Files
- ✅ `src/index.ts` (batch processing implementation)
- ✅ `tests/unit/youtube-mcp-server.test.ts` (existing test file)

### Required Tools
- ✅ Node.js v20.11.24+
- ✅ npm (package manager)
- ✅ Vitest (test framework)

### No New Dependencies
- All tools already installed
- No npm install required

---

## Success Metrics

### Coverage Target
- Current: 92%
- Target: ≥97%
- Increase: +5%

### Test Count
- Current: 113 tests
- New: +6 tests
- Total: 119 tests

### Pass Rate
- Requirement: 100% (all tests pass)
- Validation: 10 consecutive runs

### Execution Time
- Current: ~X seconds
- Budget: +5 seconds max
- Each new test: <2 seconds

---

## Rollback Plan

If tests fail or coverage insufficient:
1. Revert changes to test file
2. Analyze coverage gaps
3. Add more targeted edge case tests
4. Re-run validation

---

## Next Steps After Completion

1. ✅ Create PR with test changes
2. ✅ Link PR to issue #25
3. ✅ Request code review
4. ✅ Merge after approval

---

**Plan Created:** 2025-11-09T23:46:00Z  
**Estimated Completion:** 2025-11-10T03:00:00Z (3-4 hours from start)  
**Next Phase:** Implementation (Phase 4)
