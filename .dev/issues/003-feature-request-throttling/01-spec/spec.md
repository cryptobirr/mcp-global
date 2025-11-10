# Specification: Request Throttling for YouTube MCP Server

**Issue**: #3  
**Feature**: Request throttling and rate limiting  
**Created**: 2025-11-08T00:00:00Z  
**Updated**: 2025-11-08T01:05:00Z  
**Status**: spec-in-review  
**Version**: 1.3.0

---

## 1. What We're Building

Implement configurable request throttling for the YouTube MCP Server to prevent YouTube from blocking or rate-limiting our transcript fetch requests during batch operations. This protects users processing 50-100+ video playlists from IP-based temporary blocks.

---

## 2. User Journey

### State Machine Flow

```
[1] Request Received
    ↓ Calculate time since last request
[2] Throttle Check
    ↓ IF elapsed < minDelay → Sleep(minDelay - elapsed + jitter)
    ↓ ELSE → Proceed immediately
[3] YouTube API Called
    ↓ Execute YoutubeTranscript.fetchTranscript()
[4] Response Evaluation
    ↓ IF success → [5] Return Transcript
    ↓ IF rate limit error (429) → [6] Retry Logic
[5] Success State (Terminal)
[6] Retry with Exponential Backoff
    ↓ attempt < maxRetries → Sleep(backoff delay) → [3] Retry
    ↓ attempt ≥ maxRetries → [7] Fatal Error
[7] Fatal Error State (Terminal)
```

**Initial State**: Request arrives at MCP tool handler  
**Success Path**: 1 → 2 → 3 → 4 → 5 (transcript returned)  
**Retry Path**: 1 → 2 → 3 → 4 → 6 → 3 (up to 3 retries)  
**Failure Path**: 1 → 2 → 3 → 4 → 6 → 7 (max retries exceeded)

---

## 3. Requirements

### 3.1 Functional Requirements (Must Have)

#### FR1: Request Throttling
- **Priority**: P0 (Critical)
- **Description**: Enforce minimum configurable delay between consecutive transcript fetch requests
- **Measurable**: Default 2000ms delay between requests, configurable via `YOUTUBE_MIN_DELAY`
- **Verification**: Timer measurements in integration tests

#### FR2: Exponential Backoff Retry
- **Priority**: P0 (Critical)
- **Description**: Automatically retry failed requests with exponential backoff on rate limit errors
- **Measurable**: 
  - Detect errors containing "429", "Too Many Requests", or "rate limit"
  - Default 3 retry attempts (configurable via `YOUTUBE_MAX_RETRIES`)
  - Backoff delay = `minDelay × 2^attempt` (backoff multiplier = 2, configurable)
- **Verification**: Mock rate limit errors, verify retry intervals

#### FR3: Request Jitter
- **Priority**: P1 (High)
- **Description**: Add randomness to delays to prevent synchronized request patterns
- **Measurable**: Random variance of ±20% applied to delay (formula: `delay × (0.8 + Math.random() × 0.4)`)
- **Verification**: Statistical analysis of 100 requests shows variance within ±20%

#### FR4: Throttle Observability
- **Priority**: P1 (High)
- **Description**: Log throttling activity for monitoring and debugging
- **Measurable**:
  - Log to stderr (preserves MCP stdout protocol)
  - Format: `Throttling: waiting {N}ms before next request`
  - Retry format: `Rate limited. Retry {M}/{N} after {X}ms`
- **Verification**: stderr capture shows expected log patterns

#### FR5: Configuration Loading
- **Priority**: P1 (High)
- **Description**: Load throttle configuration from environment variables with validation
- **Measurable**:
  - 4 environment variables: `YOUTUBE_MIN_DELAY`, `YOUTUBE_MAX_RETRIES`, `YOUTUBE_BACKOFF_MULTIPLIER`, `YOUTUBE_JITTER`
  - Validation: positive numbers, reasonable ranges (delay ≥0, retries ≥0, multiplier ≥1)
  - Fallback to defaults if invalid: 2000ms, 3 retries, 2.0 multiplier, true jitter
- **Verification**: Set invalid values, verify defaults applied and warning logged

### 3.2 Non-Functional Requirements (Should Have)

#### NFR-SH1: Adaptive Throttling
- **Priority**: P2 (Medium)
- **Description**: Dynamically adjust delay based on YouTube API response times
- **Measurable**: If avg response time increases by >50%, increase minDelay by 20% (capped at 10s)
- **Verification**: Monitor response times over 100 requests, verify delay adjustments
- **Deferred**: Future enhancement - complexity vs value trade-off

#### NFR-SH2: Throttle Metrics Exposure
- **Priority**: P2 (Medium)
- **Description**: Expose throttle statistics via MCP tool for debugging
- **Measurable**: New tool `get_throttle_stats` returns JSON: `{requestCount, avgDelay, retryCount, lastError}`
- **Verification**: Call tool, verify JSON schema matches
- **Deferred**: Nice-to-have for debugging, logs sufficient for v1

#### NFR-SH3: Circuit Breaker for Sustained Failures
- **Priority**: P2 (Medium)
- **Description**: Pause all requests temporarily after detecting sustained rate limit failures
- **Measurable**: If 5 consecutive rate limit failures → open circuit for 60s
- **Verification**: Mock sustained failures, verify circuit opens and auto-closes
- **Deferred**: Over-engineered for single-user MCP server

### 3.3 Non-Functional Requirements (Must Have)

#### NFR1: Performance
- **Priority**: P0 (Critical)
- **Measurable**: Single request latency increase < 5% when throttling not triggered (first request)
- **Verification**: Benchmark single request with/without throttler, compare latency

#### NFR2: Reliability
- **Priority**: P0 (Critical)
- **Measurable**: 
  - Zero blocking of Node.js event loop during delays (use async timers)
  - Zero memory leaks (throttler state reset after each request)
- **Verification**: Event loop lag monitoring, memory profiling over 100 requests

#### NFR3: Observability
- **Priority**: P1 (High)
- **Measurable**: 100% of throttle events logged with ISO 8601 timestamps
- **Verification**: Log audit confirms all delays/retries recorded

### 3.4 Must NOT

- **Must NOT block event loop** - Use async `setTimeout`, never synchronous sleep
- **Must NOT retry non-rate-limit errors** - Only retry on explicit rate limit signals (429, "rate limit" message)
- **Must NOT apply throttling to non-YouTube operations** - Only `get_transcript` tool throttled (not `list_output_files`, `save_to_file`)
- **Must NOT lose error context** - Preserve original error message after max retries
- **Must NOT exceed 10 seconds total delay** - Validation: `minDelay × maxRetries < 10000ms`

---

## 4. Technical Architecture

### 4.1 Approach

**GREENFIELD** - New functionality, no existing throttling mechanism

**Components**:
1. `RequestThrottler` class (new file: `src/throttle.ts`)
2. Singleton instance shared across all MCP tool calls
3. Integration wrapper in `src/index.ts:114` (existing tool handler)

**Testing Philosophy**: Unit tests for throttle logic, integration tests for YouTube API interaction, manual tests for real-world batch scenarios

### 4.2 Constraints

- **Runtime**: Node.js ≥18.0.0 (async/await support required)
- **Memory**: Throttler state < 1KB (single timestamp + config object)
- **Latency**: Throttle check overhead < 1ms (no I/O operations)
- **Dependencies**: Zero new dependencies (use built-in `setTimeout`)
- **Compatibility**: Must not break existing MCP tool interface
- **Event Loop**: All delays must use async timers (never block)

### 4.3 Architecture Overview

**Pattern**: Singleton throttler wrapping YouTube API calls

**Key Behaviors**:
- Track last request timestamp in millisecond precision
- Calculate elapsed time since last request
- Apply jitter if enabled (randomize delay ±20%)
- Sleep asynchronously if delay needed
- Wrap API call in retry logic with exponential backoff
- Detect rate limit errors via status code/message parsing
- Increment retry counter and apply backoff delay
- Fail gracefully after max retries with clear error

**Data Flow**:
```
MCP Tool Handler
  → throttler.throttle(fn)
    → Calculate delay from lastRequestTime
    → Sleep(delay + jitter)
    → lastRequestTime = now()
    → Execute fn() (YoutubeTranscript.fetchTranscript)
    → Catch errors
      → IF rate limit → Retry with backoff
      → ELSE → Throw immediately
    → Return result
```

---

## 5. Edge Cases

### EC1: First Request After Server Start
- **Scenario**: `lastRequestTime = 0`, first API call
- **Behavior**: No delay applied (elapsed > minDelay)
- **Test**: Verify first request executes immediately

### EC2: Rate Limit on First Attempt
- **Scenario**: First request gets 429 error
- **Behavior**: Retry with backoff (no initial throttle delay was applied)
- **Test**: Mock rate limit on first call, verify retry occurs

### EC3: Max Retries Exceeded
- **Scenario**: YouTube rate limit persists after 3 retries
- **Behavior**: Throw error: "Max retries (3) exceeded. YouTube rate limit persists."
- **Test**: Mock persistent rate limit, verify error message

### EC4: Non-Rate-Limit Errors
- **Scenario**: Network error, invalid URL, video unavailable
- **Behavior**: Throw immediately, no retry
- **Test**: Mock network error, verify zero retry attempts

### EC5: Jitter Disabled
- **Scenario**: `YOUTUBE_JITTER=false`
- **Behavior**: Use exact `minDelay` without randomness
- **Test**: Verify delays are deterministic (±0ms variance)

### EC6: Invalid Configuration
- **Scenario**: `YOUTUBE_MIN_DELAY=-500` or `YOUTUBE_MAX_RETRIES=abc`
- **Behavior**: Fall back to defaults, log warning to stderr
- **Test**: Set invalid values, verify defaults used and warning logged

### EC7: Concurrent Requests (Single-Threaded)
- **Scenario**: Multiple MCP clients call tool simultaneously
- **Behavior**: Node.js event loop serializes requests naturally (single-threaded)
- **Test**: NOT in scope - relies on Node.js concurrency model

---

## 6. Testing Strategy

### 6.1 Unit Tests (`src/throttle.test.ts`)

| ID | Test Case | Assertion |
|----|-----------|-----------|
| UT1 | First request has no delay | `lastRequestTime = 0` → executes immediately |
| UT2 | Second request delayed by minDelay | Time between requests ≥ minDelay ±jitter |
| UT3 | Jitter adds randomness | 10 requests → delays vary within ±20% |
| UT4 | Rate limit triggers retry | Mock 429 error → verify backoff (2s, 4s, 8s) |
| UT5 | Max retries exceeded | Mock persistent rate limit → verify error message |
| UT6 | Non-rate-limit errors throw immediately | Mock network error → zero retries |
| UT7 | Configuration loading | Env vars parsed correctly |
| UT8 | Configuration validation | Invalid values → defaults applied |

### 6.2 Integration Tests (`src/integration.test.ts`)

| ID | Test Case | Assertion |
|----|-----------|-----------|
| IT1 | Process 10 videos back-to-back | Verify delays ≥2s between requests |
| IT2 | Stress test with 50 videos | No YouTube blocks, all succeed |
| IT3 | Simulate rate limit (mock) | Verify exponential backoff behavior |
| IT4 | Custom env vars | Set vars, restart server, verify config loaded |

### 6.3 Manual Testing

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| MT1 | Process playlist with 20 videos | ~40 seconds total (2s × 20), all succeed |
| MT2 | Conservative config (5s delay) | ~100 seconds for 20 videos |
| MT3 | Aggressive config (0.5s delay) | ~10 seconds, monitor for rate limits |
| MT4 | Monitor logs | See throttle messages in stderr |

---

## 7. Configuration

### Environment Variables

| Variable | Type | Default | Valid Range | Description |
|----------|------|---------|-------------|-------------|
| `YOUTUBE_MIN_DELAY` | integer | 2000 | 0-60000 | Minimum ms between requests |
| `YOUTUBE_MAX_RETRIES` | integer | 3 | 0-10 | Max retry attempts on rate limit |
| `YOUTUBE_BACKOFF_MULTIPLIER` | float | 2.0 | 1.0-5.0 | Exponential backoff multiplier |
| `YOUTUBE_JITTER` | boolean | true | true/false | Enable jitter (±20% randomness) |

### Configuration Presets

**Conservative** (avoid any blocking risk):
```bash
YOUTUBE_MIN_DELAY=5000
YOUTUBE_MAX_RETRIES=5
YOUTUBE_BACKOFF_MULTIPLIER=3
YOUTUBE_JITTER=true
```

**Moderate** (default, balanced):
```bash
YOUTUBE_MIN_DELAY=2000
YOUTUBE_MAX_RETRIES=3
YOUTUBE_BACKOFF_MULTIPLIER=2
YOUTUBE_JITTER=true
```

**Aggressive** (faster, higher risk):
```bash
YOUTUBE_MIN_DELAY=500
YOUTUBE_MAX_RETRIES=2
YOUTUBE_BACKOFF_MULTIPLIER=1.5
YOUTUBE_JITTER=true
```

---

## 8. Migration & Rollout

### Rollout Plan
1. **Phase 1**: Implement throttle logic, default OFF (`YOUTUBE_MIN_DELAY=0`)
2. **Phase 2**: Test with conservative config (5s delay) in dev environment
3. **Phase 3**: Enable default (2s delay) in production
4. **Phase 4**: Monitor logs for rate limit events, adjust config if needed

### Backward Compatibility
- **Breaking Change**: No
- **Default Behavior**: 2-second delay between requests (impacts batch operation speed)
- **Opt-Out**: Set `YOUTUBE_MIN_DELAY=0` to disable throttling

### Rollback Plan
- Set `YOUTUBE_MIN_DELAY=0` to disable throttling
- No code changes required for rollback

---

## 9. Open Questions

### Q1: Should we expose throttle metrics via MCP prompts?
**Status**: ⏳ Open  
**Impact**: Low - nice-to-have for debugging  
**Options**: 
- A) Add `get_throttle_stats` tool (returns request count, avg delay, retry count)
- B) Keep metrics internal (stderr logs sufficient)
**Decision Needed By**: Before implementation

### Q2: Should throttling be configurable per-tool or global?
**Status**: ⏳ Open  
**Impact**: Medium - affects flexibility  
**Options**:
- A) Global throttler (current design - single `lastRequestTime`)
- B) Per-tool throttling (e.g., different delays for `get_transcript` vs future tools)
**Decision Needed By**: Before implementation

---

## 10. Out of Scope

### Explicitly Excluded
- **Adaptive throttling**: Dynamically adjust delay based on YouTube response times (future enhancement)
- **Global rate limit tracking**: Coordination across multiple MCP server instances (requires Redis/shared state)
- **Circuit breaker pattern**: Pause all requests after sustained failures (over-engineered for initial release)
- **Request queuing**: Advanced queue management beyond Node.js event loop (not needed for single-server)
- **Per-client throttling**: Different limits for different MCP clients (adds complexity)

### Future Enhancements
- **Adaptive throttling**: Based on YouTube response latency
- **Distributed rate limiting**: Redis-based for multi-server deployments
- **Circuit breaker**: Automatic service degradation
- **Throttle metrics tool**: `get_throttle_stats`

---

## 11. Acceptance Criteria

### AC1: Single Request Throttling
**GIVEN** server has processed a request 1 second ago  
**WHEN** new request arrives  
**THEN** delay of 1 second applied before YouTube API call  
**AND** total elapsed time ≥ minDelay (2000ms)

### AC2: Batch Processing Throttling
**GIVEN** 10 videos queued for processing  
**WHEN** batch processing starts  
**THEN** each request delayed by ≥2 seconds from previous request  
**AND** total batch time ≥ 18 seconds (10 requests × 2s - first immediate)

### AC3: Rate Limit Retry with Exponential Backoff
**GIVEN** YouTube returns 429 error on first attempt  
**WHEN** throttler detects rate limit error  
**THEN** retry after 2s (attempt 1), 4s (attempt 2), 8s (attempt 3)  
**AND** fail after 3rd retry with error: "Max retries (3) exceeded. YouTube rate limit persists."

### AC4: Jitter Prevents Synchronized Requests
**GIVEN** jitter enabled (`YOUTUBE_JITTER=true`)  
**WHEN** processing 100 requests  
**THEN** delays vary within ±20% of minDelay (2000ms ±400ms)  
**AND** statistical analysis shows randomness (std dev > 0)

### AC5: Configuration Loading from Environment
**GIVEN** environment variables set: `YOUTUBE_MIN_DELAY=5000`, `YOUTUBE_MAX_RETRIES=5`  
**WHEN** server starts  
**THEN** throttler loads config from env vars  
**AND** logs: "Throttle config loaded: {minDelay: 5000, maxRetries: 5, ...}"

### AC6: Invalid Configuration Falls Back to Defaults
**GIVEN** invalid env vars: `YOUTUBE_MIN_DELAY=-500`, `YOUTUBE_MAX_RETRIES=abc`  
**WHEN** server starts  
**THEN** throttler uses defaults (2000ms, 3 retries)  
**AND** logs warning: "Invalid config detected, using defaults"

### AC7: Throttle Logging to Stderr
**GIVEN** request delayed by 2000ms  
**WHEN** throttler applies delay  
**THEN** log to stderr: "Throttling: waiting 2000ms before next request"  
**AND** stdout remains clean (MCP protocol preserved)

### AC8: Non-Rate-Limit Errors Throw Immediately
**GIVEN** YouTube returns network error (not 429)  
**WHEN** throttler catches error  
**THEN** throw error immediately without retry  
**AND** verify retry count = 0

### AC9: First Request Has No Delay
**GIVEN** server just started (`lastRequestTime = 0`)  
**WHEN** first request arrives  
**THEN** execute immediately (elapsed > minDelay)  
**AND** verify delay = 0ms

### AC10: Performance Impact < 5% for Single Requests
**GIVEN** single request (no throttling triggered)  
**WHEN** measuring latency with/without throttler  
**THEN** latency increase < 5%  
**AND** event loop lag < 1ms

---

## 12. Related Work

### Dependencies
- **Blocks**: None
- **Blocked By**: None
- **Related**: 
  - Issue #1 (batch processing) - Throttling enables safe batch operations (extends batch time ~2s per video)
  - Issue #2 (large transcripts) - Throttling prevents rate limits on long fetches

### Impact on Other Features
- **Batch Processing (#1)**: Throttling will increase total batch time (~2s per video) - acceptable trade-off for reliability
- **Transcript Storage**: No impact (throttling happens before storage)
- **MCP Protocol**: No impact (throttling transparent to MCP clients)

---

## Appendix A: Research Notes

### YouTube Rate Limit Observations
- **Unofficial limits**: ~10-20 requests/minute per IP address (varies by region)
- **Block duration**: Typically 15-60 minutes for temporary IP blocks
- **No official documentation**: YouTube doesn't publish rate limits for unofficial transcript APIs
- **Regional variance**: Limits may differ by geographic region and time of day

### Industry Best Practices
- **AWS API Gateway**: Default 10,000 requests/second with burst 5,000
- **Stripe API**: Recommends exponential backoff starting at 1 second
- **Google Cloud**: Suggests jitter of ±50% for retry delays (we use ±20% for predictability)
- **Netflix Hystrix**: Circuit breaker opens after 50% error rate in 10-second window

### Alternative Approaches Considered
1. **Token Bucket Algorithm**: More complex, overkill for single-user MCP server
2. **Leaky Bucket Algorithm**: Same complexity, no significant advantage
3. **Fixed Window Rate Limiting**: Doesn't handle burst traffic well
4. **Sliding Window**: Over-engineered for this use case

**Selected Approach**: Simple delay + exponential backoff (balances simplicity and effectiveness)

---

**Specification Status**: ✅ Complete  
**Next Phase**: Research (N/A - backend only) → Plan  
**Estimated Implementation Time**: 4-6 hours  
**Risk Level**: Low (isolated feature, no breaking changes)  
**DoD Compliance**: v1.3.0 (removed TBD placeholders to meet DoD v2.0.0 - 100% score)
