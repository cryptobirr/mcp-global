# Implementation Plan: Request Throttling for YouTube MCP Server

**Issue**: #3  
**Feature**: Request throttling and rate limiting  
**Created**: 2025-11-09T02:24:33Z  
**Status**: plan-in-progress  
**Estimated Time**: 6-8 hours  
**Risk Level**: Low  
**Complexity**: Medium

---

## Executive Summary

Implement configurable request throttling mechanism to prevent YouTube from blocking or rate-limiting transcript fetch requests during batch operations. This introduces a `RequestThrottler` singleton class that enforces minimum delays between requests, handles exponential backoff retries on rate limit errors, and provides comprehensive observability via stderr logging.

**Key Changes**:
- New `src/throttle.ts` module with `RequestThrottler` class
- Wrapper integration in `src/index.ts:189` around `YoutubeTranscript.fetchTranscript()`
- Configuration via 4 environment variables (minDelay, maxRetries, backoffMultiplier, jitter)
- Comprehensive test suite (unit + integration)

**Impact**:
- Batch processing time increases by ~2 seconds per video (acceptable trade-off for reliability)
- No breaking changes to MCP tool interface
- Zero new dependencies (uses built-in `setTimeout`)

---

## Implementation Checklist

### Phase 1: Core Throttle Implementation (3-4 hours)

#### 1.1 Create Throttle Module
- [ ] Create `src/throttle.ts` file
- [ ] Define `ThrottleConfig` interface with 4 properties:
  - `minDelay: number` (ms between requests)
  - `maxRetries: number` (max retry attempts)
  - `backoffMultiplier: number` (exponential backoff factor)
  - `jitter: boolean` (enable ±20% randomness)
- [ ] Define `DEFAULT_THROTTLE_CONFIG` constant:
  ```typescript
  {
    minDelay: 2000,
    maxRetries: 3,
    backoffMultiplier: 2,
    jitter: true
  }
  ```
- [ ] Implement `RequestThrottler` class with:
  - Private `lastRequestTime: number = 0` (timestamp in ms)
  - Private `config: ThrottleConfig` (loaded from env vars)
  - Constructor loads config from environment variables
  - Public `throttle<T>(fn: () => Promise<T>): Promise<T>` method
  - Private `withRetry<T>(fn, attempt)` method for exponential backoff
  - Private `isRateLimitError(error)` method for error detection
  - Private `calculateDelay()` method with jitter logic
- [ ] Add JSDoc comments for all public methods
- [ ] Export `RequestThrottler` and `ThrottleConfig` interface

**Acceptance Criteria**: 
- Module compiles with TypeScript without errors
- All methods properly typed with generics
- Config validation throws descriptive errors for invalid values

**Files Modified**:
- `src/throttle.ts` (NEW FILE - ~150 lines)

---

#### 1.2 Environment Configuration Loading
- [ ] Add config loading in `RequestThrottler` constructor:
  - Parse `YOUTUBE_MIN_DELAY` (default: 2000, range: 0-60000)
  - Parse `YOUTUBE_MAX_RETRIES` (default: 3, range: 0-10)
  - Parse `YOUTUBE_BACKOFF_MULTIPLIER` (default: 2.0, range: 1.0-5.0)
  - Parse `YOUTUBE_JITTER` (default: true, values: true/false)
- [ ] Implement validation logic:
  - Check numeric ranges
  - Fall back to defaults on invalid values
  - Log warnings to stderr for invalid config
- [ ] Add config logging on startup:
  ```typescript
  console.error(`Throttle config loaded: ${JSON.stringify(this.config)}`);
  ```

**Acceptance Criteria**:
- Invalid env vars fall back to defaults
- Warning logged to stderr: "Invalid throttle config detected, using defaults"
- Config logged on first throttle call

**Files Modified**:
- `src/throttle.ts` (extend constructor ~30 lines)

---

#### 1.3 Throttle Logic Implementation
- [ ] Implement `throttle<T>()` method:
  - Calculate time since last request: `now - lastRequestTime`
  - Calculate required delay: `max(0, minDelay - elapsed)`
  - Apply jitter if enabled: `delay * (0.8 + Math.random() * 0.4)`
  - Sleep asynchronously if delay > 0: `await new Promise(resolve => setTimeout(resolve, delay))`
  - Log to stderr: `Throttling: waiting ${delay}ms before next request`
  - Update `lastRequestTime = Date.now()`
  - Delegate to `withRetry(fn)`
- [ ] Implement `withRetry<T>()` method:
  - Try executing `fn()`
  - Catch errors and check `isRateLimitError(error)`
  - If rate limit AND attempts < maxRetries:
    - Calculate backoff: `minDelay * Math.pow(backoffMultiplier, attempt)`
    - Log to stderr: `Rate limited. Retry ${attempt}/${maxRetries} after ${backoff}ms`
    - Sleep for backoff duration
    - Recursively retry: `withRetry(fn, attempt + 1)`
  - If max retries exceeded:
    - Throw error: `Max retries (${maxRetries}) exceeded. YouTube rate limit persists.`
  - If non-rate-limit error:
    - Throw immediately (no retry)

**Acceptance Criteria**:
- First request executes immediately (lastRequestTime = 0)
- Subsequent requests delayed by minDelay ± jitter
- Rate limit errors trigger exponential backoff
- Non-rate-limit errors throw immediately

**Files Modified**:
- `src/throttle.ts` (add methods ~50 lines)

---

#### 1.4 Rate Limit Error Detection
- [ ] Implement `isRateLimitError(error)` method:
  - Check `error.message?.includes('429')`
  - Check `error.message?.includes('Too Many Requests')`
  - Check `error.message?.includes('rate limit')` (case-insensitive)
  - Return boolean
- [ ] Handle different error formats from `youtube-transcript` library:
  - HTTP status code errors
  - Generic API errors with message strings
  - Network errors (should NOT trigger retry)

**Acceptance Criteria**:
- Correctly identifies 429 errors from YouTube API
- Does NOT trigger retry for network errors
- Case-insensitive error message matching

**Files Modified**:
- `src/throttle.ts` (add method ~15 lines)

---

### Phase 2: Integration with MCP Tool (1-2 hours)

#### 2.1 Integrate Throttler in index.ts
- [ ] Import `RequestThrottler` at top of `src/index.ts`:
  ```typescript
  import { RequestThrottler } from './throttle.js';
  ```
- [ ] Create singleton instance in `YouTubeMCPServer` class:
  ```typescript
  private throttler = new RequestThrottler();
  ```
- [ ] Wrap YouTube API call at line 189:
  ```typescript
  // BEFORE:
  const transcriptEntries = await YoutubeTranscript.fetchTranscript(video_url);
  
  // AFTER:
  const transcriptEntries = await this.throttler.throttle(
    () => YoutubeTranscript.fetchTranscript(video_url)
  );
  ```
- [ ] Verify error handling still works (errors propagate correctly)
- [ ] Test that throttler logs appear in stderr (not stdout - MCP protocol)

**Acceptance Criteria**:
- TypeScript compiles without errors
- MCP tool behavior unchanged except for throttling
- Stderr shows throttle logs
- Stdout remains clean (MCP JSON protocol preserved)

**Files Modified**:
- `src/index.ts` (~5 lines changed, import + wrapper)

---

#### 2.2 Build & Manual Testing
- [ ] Run `npm run build` - verify no compilation errors
- [ ] Start MCP server with default config
- [ ] Test single transcript fetch - verify no delay on first request
- [ ] Test 3 consecutive requests - verify ~2s delays between requests
- [ ] Check stderr logs for throttle messages
- [ ] Test with custom env vars:
  ```bash
  YOUTUBE_MIN_DELAY=5000 npm run inspector
  ```
- [ ] Verify config loaded correctly from env vars

**Acceptance Criteria**:
- Build succeeds without errors
- Single request completes in <5 seconds
- Multiple requests show delays in logs
- Custom config applied correctly

**Files Modified**:
- None (testing only)

---

### Phase 3: Unit Tests (2-3 hours)

#### 3.1 Create Unit Test File
- [ ] Create `tests/unit/throttle.test.ts`
- [ ] Set up Vitest test suite structure
- [ ] Import `RequestThrottler` and mock timer utilities

**Files Modified**:
- `tests/unit/throttle.test.ts` (NEW FILE - ~300 lines)

---

#### 3.2 Core Throttle Tests
- [ ] **UT1: First request has no delay**
  - Given: `lastRequestTime = 0` (server just started)
  - When: First request arrives
  - Then: Execute immediately (no delay)
  - Assertion: Execution time < 10ms

- [ ] **UT2: Second request delayed by minDelay**
  - Given: First request completed 1 second ago
  - When: Second request arrives
  - Then: Delay by 1 second (to reach 2s total)
  - Assertion: Time between requests ≥ 2000ms

- [ ] **UT3: Jitter adds randomness**
  - Given: Jitter enabled, 10 consecutive requests
  - When: Processing all requests
  - Then: Delays vary within ±20% of minDelay
  - Assertion: Standard deviation > 0, all delays in range [1600ms, 2400ms]

- [ ] **UT4: Jitter disabled gives deterministic delays**
  - Given: `YOUTUBE_JITTER=false`, 10 requests
  - When: Processing all requests
  - Then: All delays exactly 2000ms
  - Assertion: Standard deviation = 0

**Acceptance Criteria**:
- All tests pass with `npm run test:unit`
- Tests use mocked timers for speed (no real delays)
- Coverage > 80% for `throttle.ts`

**Files Modified**:
- `tests/unit/throttle.test.ts` (add tests ~100 lines)

---

#### 3.3 Retry & Backoff Tests
- [ ] **UT5: Rate limit triggers retry with exponential backoff**
  - Given: Mock function that throws 429 error 2 times, succeeds on 3rd
  - When: Call `throttle(mockFn)`
  - Then: Retries with delays: 2s, 4s, 8s
  - Assertion: Total retries = 2, final result = success

- [ ] **UT6: Max retries exceeded throws error**
  - Given: Mock function always throws 429 error
  - When: Call `throttle(mockFn)`
  - Then: Retry 3 times, then throw "Max retries (3) exceeded"
  - Assertion: Error message matches, retry count = 3

- [ ] **UT7: Non-rate-limit errors throw immediately**
  - Given: Mock function throws network error
  - When: Call `throttle(mockFn)`
  - Then: Throw immediately without retry
  - Assertion: Retry count = 0, error message preserved

- [ ] **UT8: Rate limit error detection**
  - Test `isRateLimitError()` with various error formats:
    - Error with message "429"
    - Error with message "Too Many Requests"
    - Error with message "rate limit exceeded"
    - Network error (should return false)

**Acceptance Criteria**:
- All retry tests pass
- Error detection covers all rate limit formats
- Non-rate-limit errors not retried

**Files Modified**:
- `tests/unit/throttle.test.ts` (add tests ~100 lines)

---

#### 3.4 Configuration Tests
- [ ] **UT9: Configuration loading from env vars**
  - Given: Env vars set: `YOUTUBE_MIN_DELAY=5000`, `YOUTUBE_MAX_RETRIES=5`
  - When: Instantiate `RequestThrottler`
  - Then: Config loaded correctly
  - Assertion: `throttler.config.minDelay === 5000`

- [ ] **UT10: Invalid configuration falls back to defaults**
  - Given: Invalid env vars: `YOUTUBE_MIN_DELAY=-500`, `YOUTUBE_MAX_RETRIES=abc`
  - When: Instantiate `RequestThrottler`
  - Then: Use defaults (2000ms, 3 retries)
  - Assertion: Config equals `DEFAULT_THROTTLE_CONFIG`

- [ ] **UT11: Configuration validation warnings**
  - Given: Invalid config values
  - When: Instantiate `RequestThrottler`
  - Then: Log warning to stderr
  - Assertion: stderr contains "Invalid throttle config detected"

**Acceptance Criteria**:
- All config tests pass
- Env var parsing handles edge cases
- Warnings logged for invalid values

**Files Modified**:
- `tests/unit/throttle.test.ts` (add tests ~50 lines)

---

### Phase 4: Integration Tests (1-2 hours)

#### 4.1 Create Integration Test File
- [ ] Create `tests/integration/throttle.test.ts`
- [ ] Set up integration test environment with real YouTube API (if safe) or mocks

**Files Modified**:
- `tests/integration/throttle.test.ts` (NEW FILE - ~200 lines)

---

#### 4.2 Batch Processing Tests
- [ ] **IT1: Process 10 videos back-to-back**
  - Given: 10 mock video URLs
  - When: Fetch transcripts sequentially
  - Then: Total time ≥ 18 seconds (9 delays × 2s)
  - Assertion: Measure total elapsed time

- [ ] **IT2: Verify delays between requests**
  - Given: 5 consecutive requests
  - When: Measure time between each request
  - Then: Each delay ≥ 2000ms (with jitter ±400ms)
  - Assertion: All delays in range [1600ms, 2400ms]

- [ ] **IT3: Throttle logs appear in stderr**
  - Given: 3 consecutive requests
  - When: Capture stderr during execution
  - Then: Verify throttle messages logged
  - Assertion: stderr contains "Throttling: waiting Nms before next request"

**Acceptance Criteria**:
- Integration tests pass with `npm run test:integration`
- Real delays verified (not mocked timers)
- Logs captured correctly

**Files Modified**:
- `tests/integration/throttle.test.ts` (add tests ~100 lines)

---

#### 4.3 Custom Configuration Tests
- [ ] **IT4: Conservative config (5s delay)**
  - Given: `YOUTUBE_MIN_DELAY=5000`
  - When: Process 5 videos
  - Then: Total time ≥ 20 seconds (4 delays × 5s)
  - Assertion: Config applied correctly

- [ ] **IT5: Aggressive config (0.5s delay)**
  - Given: `YOUTUBE_MIN_DELAY=500`
  - When: Process 5 videos
  - Then: Total time ≥ 2 seconds (4 delays × 0.5s)
  - Assertion: Faster processing with lower delay

**Acceptance Criteria**:
- Custom config tests pass
- Different delay values verified

**Files Modified**:
- `tests/integration/throttle.test.ts` (add tests ~50 lines)

---

### Phase 5: Documentation & Finalization (1 hour)

#### 5.1 Update README
- [ ] Add "Request Throttling" section to README.md
- [ ] Document 4 environment variables with examples
- [ ] Include configuration presets (conservative, moderate, aggressive)
- [ ] Add troubleshooting section for rate limit errors

**Acceptance Criteria**:
- README updated with clear examples
- Configuration table added

**Files Modified**:
- `README.md` (~50 lines added)

---

#### 5.2 Add JSDoc Comments
- [ ] Add comprehensive JSDoc to `RequestThrottler` class
- [ ] Document each method with `@param`, `@returns`, `@throws`
- [ ] Add usage examples in comments

**Acceptance Criteria**:
- All public APIs documented
- TypeDoc can generate API docs

**Files Modified**:
- `src/throttle.ts` (add comments ~30 lines)

---

#### 5.3 Update package.json (if needed)
- [ ] Verify no new dependencies added
- [ ] Ensure test scripts still work
- [ ] Update version if doing release

**Acceptance Criteria**:
- No breaking changes to package.json
- All test scripts pass

**Files Modified**:
- None (verification only)

---

## File Modification Plan

### Files to Create (2 new files)
1. **src/throttle.ts** (~150 lines)
   - `ThrottleConfig` interface
   - `RequestThrottler` class
   - Configuration loading & validation
   - Throttle logic with jitter
   - Exponential backoff retry
   - Rate limit error detection

2. **tests/unit/throttle.test.ts** (~300 lines)
   - 11 unit tests covering core throttle logic
   - Configuration tests
   - Retry & backoff tests
   - Error detection tests

3. **tests/integration/throttle.test.ts** (~200 lines)
   - 5 integration tests for batch processing
   - Custom configuration tests
   - Log verification tests

### Files to Modify (2 existing files)
1. **src/index.ts** (~5 lines changed)
   - Import `RequestThrottler`
   - Create singleton instance
   - Wrap `YoutubeTranscript.fetchTranscript()` call at line 189

2. **README.md** (~50 lines added)
   - New "Request Throttling" section
   - Configuration table
   - Usage examples
   - Troubleshooting guide

**Total Impact**: 2 new files, 2 modified files, ~700 lines added

---

## Test Strategy

### Unit Tests (tests/unit/throttle.test.ts)
**Coverage Target**: 90% for `src/throttle.ts`

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| UT1 | First request no delay | Execution time < 10ms |
| UT2 | Second request delayed | Time between ≥ 2000ms |
| UT3 | Jitter adds randomness | Std dev > 0, range [1600, 2400]ms |
| UT4 | Jitter disabled | All delays = 2000ms exactly |
| UT5 | Rate limit retry | Backoff delays: 2s, 4s, 8s |
| UT6 | Max retries exceeded | Error: "Max retries (3) exceeded" |
| UT7 | Non-rate-limit errors | Retry count = 0 |
| UT8 | Error detection | Correctly identify 429 errors |
| UT9 | Config loading | Env vars parsed correctly |
| UT10 | Invalid config | Falls back to defaults |
| UT11 | Config warnings | Stderr contains warning |

**Test Execution**: `npm run test:unit`

---

### Integration Tests (tests/integration/throttle.test.ts)
**Coverage Target**: Real-world batch scenarios

| Test ID | Description | Assertion |
|---------|-------------|-----------|
| IT1 | Process 10 videos | Total time ≥ 18 seconds |
| IT2 | Verify delays | Each delay in [1600, 2400]ms |
| IT3 | Throttle logs | Stderr contains throttle messages |
| IT4 | Conservative config | Total time ≥ 20s (5s delays) |
| IT5 | Aggressive config | Total time ≥ 2s (0.5s delays) |

**Test Execution**: `npm run test:integration`

---

### Regression Test Strategy

**Existing Tests to Verify**:
- `tests/unit/youtube-mcp-server.test.ts` - Ensure MCP tool still works
- `tests/integration/youtube-api.test.ts` - Verify YouTube API integration
- `tests/streaming.test.ts` - Check streaming functionality unchanged
- `tests/security.test.ts` - Ensure path traversal protection still works

**Regression Checks**:
1. Run full test suite: `npm run test:all`
2. Verify all existing tests still pass
3. Check no performance regression for single requests (< 5% latency increase)
4. Verify MCP protocol compliance (stdout JSON only, logs to stderr)

**Acceptance Criteria**:
- 100% of existing tests pass
- No breaking changes to MCP tool interface
- Single request latency increase < 5%

---

## Architectural Decisions

### AD1: Singleton vs Instance-per-Request
**Decision**: Use singleton `RequestThrottler` instance shared across all tool calls  
**Rationale**: 
- Throttling requires global state (`lastRequestTime`) to work across requests
- Single-threaded Node.js naturally serializes requests
- Simpler than managing multiple instances

**Alternatives Considered**:
- Instance per request: Would lose throttle state between requests (defeated purpose)
- Global queue: Over-engineered for single-server scenario

---

### AD2: Async Timers vs Blocking Sleep
**Decision**: Use `Promise<void>` with `setTimeout` for all delays  
**Rationale**:
- Non-blocking (doesn't freeze event loop)
- Allows other MCP operations to proceed during delays
- Required for Node.js best practices

**Alternatives Considered**:
- `Atomics.wait()`: Blocks event loop, breaks MCP protocol
- Busy-wait loop: Wastes CPU, terrible performance

---

### AD3: Error Detection Strategy
**Decision**: String matching on error messages (429, "Too Many Requests", "rate limit")  
**Rationale**:
- `youtube-transcript` library doesn't expose structured error codes
- Message matching covers all observed rate limit formats
- Fail-safe: only retries on explicit rate limit signals

**Alternatives Considered**:
- HTTP status code only: Library doesn't expose raw HTTP responses
- Retry all errors: Too aggressive, would retry network failures

---

### AD4: Configuration Validation
**Decision**: Validate env vars on startup, fall back to defaults, log warnings  
**Rationale**:
- Prevents server crashes from bad config
- Clear feedback to users via stderr
- Graceful degradation (defaults work for most cases)

**Alternatives Considered**:
- Throw errors on invalid config: Too harsh, breaks server startup
- Silent fallback: No feedback, users wouldn't know config ignored

---

### AD5: Jitter Implementation
**Decision**: Random variance of ±20% using `Math.random() * 0.4 + 0.8`  
**Rationale**:
- Prevents thundering herd problem (synchronized requests)
- 20% variance balances predictability vs randomness
- Industry standard (AWS, Google Cloud use similar ranges)

**Alternatives Considered**:
- ±50% jitter: Too much variance, hard to predict batch times
- No jitter: Risk of synchronized requests if multiple MCP clients run

---

## Risk Assessment & Mitigation

### Risk 1: YouTube Rate Limits Still Triggered
**Likelihood**: Medium  
**Impact**: High (batch operations fail)  
**Mitigation**:
- Default 2s delay is conservative (well below observed limits)
- Exponential backoff gives YouTube time to recover
- Users can configure higher delays (5s) if needed
- Monitoring via stderr logs allows tuning

### Risk 2: Performance Regression for Single Requests
**Likelihood**: Low  
**Impact**: Medium (UX degradation)  
**Mitigation**:
- First request has zero delay (lastRequestTime = 0)
- Throttle check overhead < 1ms (simple arithmetic)
- Unit tests verify < 5% latency increase

### Risk 3: Breaking MCP Protocol
**Likelihood**: Low  
**Impact**: High (server unusable)  
**Mitigation**:
- All logs to stderr (stdout reserved for MCP JSON)
- Integration tests verify MCP compliance
- Regression tests on existing test suite

### Risk 4: Memory Leaks from Timers
**Likelihood**: Low  
**Impact**: Medium (server crashes over time)  
**Mitigation**:
- Async timers auto-cleanup when promise resolves
- No global timer references stored
- Integration tests run 50+ requests to detect leaks

### Risk 5: Invalid Configuration Breaks Server
**Likelihood**: Low  
**Impact**: Medium (server won't start)  
**Mitigation**:
- Config validation on startup
- Fallback to safe defaults
- Warning logs guide users to fix config

---

## Dependencies & Blockers

### Blockers
- None (greenfield feature, no dependencies)

### Dependencies
**Package Dependencies** (no new dependencies required):
- `youtube-transcript@^1.2.1` (already installed)
- Node.js built-in `setTimeout` (no install needed)

**Related Issues**:
- **Issue #1 (Batch Processing)**: Throttling enables safe batch operations
  - Impact: Batch processing time increases by ~2s per video
  - Benefit: Prevents YouTube blocks during large batches
- **Issue #2 (Large Transcripts)**: Throttling helps with long fetches
  - Impact: Minimal (single long request still completes)
  - Benefit: Reduces risk of rate limits on heavy usage

**No Breaking Changes**: 
- MCP tool interface unchanged
- Existing code unaffected (only wraps API call)
- Opt-out available via `YOUTUBE_MIN_DELAY=0`

---

## Rollout Plan

### Phase 1: Development & Testing (Current)
- Implement throttle logic
- Write comprehensive tests
- Manual testing with real YouTube API

### Phase 2: Soft Launch (Conservative Config)
- Deploy with `YOUTUBE_MIN_DELAY=5000` (5 seconds)
- Monitor logs for rate limit events
- Gather feedback on batch operation times

### Phase 3: Production (Default Config)
- Switch to `YOUTUBE_MIN_DELAY=2000` (2 seconds)
- Monitor for any YouTube blocks
- Document optimal config in README

### Phase 4: Optimization (Future)
- Adaptive throttling based on response times
- Metrics exposure via MCP tool
- Circuit breaker for sustained failures

**Rollback Plan**:
- Set `YOUTUBE_MIN_DELAY=0` to disable throttling
- No code changes required
- Revert to pre-throttle behavior instantly

---

## Success Metrics

### Functional Metrics
- [ ] Zero YouTube blocks during batch processing (10+ videos)
- [ ] All 10 acceptance criteria pass automated tests
- [ ] 100% of existing regression tests pass

### Performance Metrics
- [ ] Single request latency increase < 5%
- [ ] Batch processing time = `(video_count - 1) × minDelay ± jitter`
- [ ] Memory usage stable over 100+ requests (no leaks)

### Quality Metrics
- [ ] Code coverage ≥ 90% for `src/throttle.ts`
- [ ] Zero TypeScript compilation errors
- [ ] Zero ESLint warnings

### Observability Metrics
- [ ] 100% of throttle events logged to stderr
- [ ] Clear error messages for rate limit failures
- [ ] Config validation warnings visible to users

---

## Open Questions & Decisions Needed

### Q1: Should we expose throttle metrics via MCP tool?
**Status**: ⏳ Open  
**Options**:
- A) Add `get_throttle_stats` tool (returns request count, avg delay, retry count)
- B) Keep metrics internal (stderr logs sufficient)

**Recommendation**: **Option B** - Defer to future enhancement
**Rationale**: Stderr logs provide sufficient visibility for v1. Adding a new tool increases API surface area and testing complexity. Can add later if users request it.

**Decision Needed By**: Before Phase 5 (documentation)

---

### Q2: Should throttling be configurable per-tool or global?
**Status**: ⏳ Open  
**Options**:
- A) Global throttler (current design - single `lastRequestTime`)
- B) Per-tool throttling (e.g., different delays for future tools)

**Recommendation**: **Option A** - Global throttler
**Rationale**: Currently only one tool (`get_transcript_and_save`) makes YouTube API calls. Adding per-tool complexity is premature. Can refactor later if needed.

**Decision Needed By**: Before Phase 1.1 (core implementation)

---

### Q3: Should we add circuit breaker pattern?
**Status**: ⏳ Open  
**Options**:
- A) Add circuit breaker (pause all requests after 5 consecutive rate limit failures)
- B) Rely on exponential backoff only

**Recommendation**: **Option B** - Defer circuit breaker to future
**Rationale**: Exponential backoff is sufficient for single-user MCP server. Circuit breaker adds complexity for minimal benefit in this context. Better suited for multi-user production services.

**Decision Needed By**: Before Phase 1.3 (throttle logic)

---

## Timeline Estimate

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1.1 | Create throttle module | 1.5 hours |
| 1.2 | Environment config loading | 0.5 hours |
| 1.3 | Throttle logic implementation | 1.5 hours |
| 1.4 | Rate limit error detection | 0.5 hours |
| 2.1 | Integration in index.ts | 0.5 hours |
| 2.2 | Build & manual testing | 0.5 hours |
| 3.1-3.4 | Unit tests | 2.5 hours |
| 4.1-4.3 | Integration tests | 1.5 hours |
| 5.1-5.3 | Documentation & finalization | 1 hour |

**Total Estimated Time**: 6-8 hours (includes buffer for debugging and testing)

**Parallel Work Opportunities**:
- Unit tests can be written in parallel with integration work
- Documentation can be drafted while tests run

---

## Acceptance Criteria Mapping

| Spec AC | Implementation Checklist Item | Test Coverage |
|---------|-------------------------------|---------------|
| AC1 | Phase 1.3 - Throttle logic | UT2, IT2 |
| AC2 | Phase 1.3 - Throttle logic | IT1, IT2 |
| AC3 | Phase 1.3 - Retry logic | UT5, UT6 |
| AC4 | Phase 1.3 - Jitter logic | UT3, UT4 |
| AC5 | Phase 1.2 - Config loading | UT9, IT4, IT5 |
| AC6 | Phase 1.2 - Config validation | UT10, UT11 |
| AC7 | Phase 1.3 - Logging | IT3 |
| AC8 | Phase 1.4 - Error detection | UT7, UT8 |
| AC9 | Phase 1.3 - First request | UT1 |
| AC10 | Phase 2.2 - Performance testing | Regression tests |

**Coverage**: 100% of acceptance criteria mapped to implementation tasks and tests

---

## Notes & Assumptions

### Assumptions
1. **YouTube Rate Limits**: Assumed ~10-20 requests/minute based on community observations (no official docs)
2. **Single-Threaded**: Node.js event loop naturally serializes requests (no need for mutex/locks)
3. **Error Formats**: Assumes `youtube-transcript` library throws errors with message strings (verified in existing code)
4. **No Multi-Server**: Assumes single MCP server instance (no distributed rate limiting needed)

### Known Limitations
1. **No Adaptive Throttling**: Fixed delay, doesn't adjust based on YouTube response times (future enhancement)
2. **No Request Queue**: Relies on Node.js event loop for serialization (sufficient for single server)
3. **No Distributed Coordination**: Multiple MCP server instances won't share throttle state (out of scope)

### Future Enhancements (Out of Scope)
- Adaptive throttling based on response latency
- Circuit breaker for sustained failures
- Metrics exposure via MCP tool (`get_throttle_stats`)
- Distributed rate limiting (Redis-based)
- Per-client throttling (different limits per MCP client)

---

**Plan Status**: ✅ Complete  
**Next Step**: Begin Phase 1.1 - Create Throttle Module  
**Estimated Completion**: 2025-11-09T10:24:33Z (6-8 hours from start)
