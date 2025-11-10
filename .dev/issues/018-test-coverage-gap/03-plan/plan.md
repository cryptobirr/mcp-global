# Implementation Plan: YouTube MCP Server Test Coverage Fix

**Issue:** #18
**Approach:** BROWNFIELD
**Created:** 2025-11-07T05:30:00Z
**Version:** v1

## Summary

Transform the existing test suite from 12 abstract algorithm tests with 0% actual coverage to comprehensive testing of the real `YoutubeMcpServer` implementation, achieving >80% code coverage with MCP protocol compliance and security testing.

## Architectural Decisions

### AD-1: Testing Framework Approach
**Decision:** Extend Vitest with MCP SDK Testing (Option A)
**Rationale:**
- Project already has Vitest configured and working
- Single framework reduces maintenance overhead
- Team familiarity with existing testing approach
- MCP SDK integration is straightforward with proper fixtures
**Trade-offs:** Accepting Vitest's limited process isolation in exchange for consistency

### AD-2: Mock Strategy for YouTube API
**Decision:** Mock Module Replacement using vi.mock() (Option B)
**Rationale:**
- No production code changes required (preserves existing API)
- Standard and well-documented Vitest mocking approach
- Simple to implement and maintain
- Mock granularity can be controlled per test
**Trade-offs:** Accepting global mock scope for simplicity and ease of implementation

## Files to Modify/Create

### Files to Modify

#### File: `tests/streaming.test.ts`
**Current responsibility:** Abstract algorithm testing with 0% real coverage
**Lines to modify:** Complete file refactoring (222 lines)
**Change needed:** Transform to test actual YoutubeMcpServer class methods
**Existing patterns to follow:** Current describe/it structure, beforeEach/afterEach for setup

**Current Code:**
```typescript
// Tests abstract chunk processing without real server implementation
describe('YouTube Transcript Streaming', () => {
  const TEST_OUTPUT_DIR = path.join(__dirname, '../test-output');
  // ... abstract algorithm tests
});
```

**Target Code:**
```typescript
// Import and test actual YoutubeMcpServer implementation
import { YoutubeMcpServer } from '../src/index.js';

describe('YoutubeMcpServer - Real Implementation', () => {
  let server: YoutubeMcpServer;

  beforeEach(() => {
    server = new YoutubeMcpServer();
  });
  // ... real implementation tests
});
```

**Pattern Adherence:** Maintain existing test structure and naming conventions

#### File: `vitest.config.ts`
**Current responsibility:** Test configuration with basic coverage setup
**Lines to modify:** Line 10 - coverage configuration
**Change needed:** Ensure src/ directory is included in coverage reporting
**Key file:** `src/index.ts` - Main implementation file requiring coverage

**Current Code:**
```typescript
exclude: ['build/**', 'tests/**', 'vitest.config.ts'],
```

**Target Code:**
```typescript
exclude: ['build/**', 'tests/**', 'vitest.config.ts'],
include: ['src/**'], // Ensure source files are measured for coverage
```

**Pattern Adherence:** Follow existing Vitest configuration patterns

### New Files to Create

#### File: `tests/unit/youtube-mcp-server.test.ts`
**Purpose:** Unit tests for actual YoutubeMcpServer class methods
**Content:**
- Server instantiation tests
- Tool registration validation
- URL processing and Shorts conversion
- Parameter validation logic
- Error handling scenarios
- Coverage target: >80% line coverage

#### File: `tests/integration/mcp-protocol.test.ts`
**Purpose:** MCP protocol compliance testing using real SDK
**Content:**
- MCP server startup and discovery
- Tool execution via @modelcontextprotocol/sdk
- Request/response format validation
- Error response handling via protocol
- Real client-server communication

#### File: `tests/security/input-validation.test.ts`
**Purpose:** Security testing for input validation and vulnerability prevention
**Content:**
- Malicious YouTube URL handling
- Invalid video ID format rejection
- Path traversal attempt blocking
- Input sanitization verification
- XSS prevention testing

#### File: `tests/fixtures/mcp-client.ts`
**Purpose:** MCP client testing utilities and fixtures
**Content:**
- Client connection setup helpers
- Mock transport creation
- Test data fixtures
- Connection teardown utilities

#### File: `tests/mocks/youtube-transcript.ts`
**Purpose:** YouTube API mocking utilities
**Content:**
- vi.mock() setup for youtube-transcript module
- Mock transcript data for various scenarios
- Error simulation helpers
- Test data management

## Test Strategy

### AC Coverage Map

| AC | Test Type | Test Location | Test Method | Existing/New |
|----|-----------|---------------|-------------|--------------|
| AC1 | Unit | tests/unit/youtube-mcp-server.test.ts | Import and test actual YoutubeMcpServer class methods | New |
| AC2 | Unit | tests/unit/youtube-mcp-server.test.ts | Coverage measurement with >80% target | New |
| AC3 | Integration | tests/integration/mcp-protocol.test.ts | Test MCP tool registration via SDK | New |
| AC4 | Integration | tests/integration/mcp-protocol.test.ts | Test request/response handling | New |
| AC5 | Integration | tests/integration/mcp-protocol.test.ts | Test error responses | New |
| AC6 | Security | tests/security/input-validation.test.ts | Test malicious YouTube URL handling | New |
| AC7 | Security | tests/security/input-validation.test.ts | Test invalid video ID formats | New |
| AC8 | Security | tests/security/input-validation.test.ts | Test path traversal attempts | New |
| AC9 | CI/CD | Existing CI | Execute npm test in continuous integration | Existing |

### Test Infrastructure
- **Framework:** Vitest with TypeScript support
- **Coverage:** v8 provider with HTML/text reports, target >80%
- **Mocking:** vi.mock() for youtube-transcript module
- **Environment:** Node.js for server testing
- **Isolation:** Test fixtures for MCP client setup

### Regression Test Strategy

Based on research Impact Analysis, 4 features require regression testing:

**Feature 1: Transcript Fetching Logic**
- Unit Tests (2): test_youtube_transcript_fetch_success, test_youtube_transcript_fetch_error
- Integration Tests (1): test_real_youtube_url_processing
- Manual Verification: Real YouTube URL processing with various video types

**Feature 2: File Output Generation**
- Unit Tests (3): test_file_naming_convention, test_content_formatting, test_stream_error_cleanup
- Integration Tests (2): test_large_transcript_streaming, test_file_write_permissions
- Manual Verification: Large transcript file generation and content/format verification

**Feature 3: MCP Tool Registration**
- Unit Tests (2): test_tool_registration_complete, test_tool_schema_validation
- Integration Tests (1): test_mcp_client_tool_discovery
- Manual Verification: MCP client connection and tool discovery

**Feature 4: Error Handling**
- Unit Tests (4): test_mcp_error_codes, test_transcript_disabled_error, test_invalid_params_error, test_stream_error_propagation
- Integration Tests (2): test_error_response_via_mcp, test_graceful_shutdown_scenarios
- Manual Verification: Various error condition testing with proper error responses

**Total Regression Tests Required:** 14 tests
**Verification Command:** `/sop-regression-verification 18`

## Implementation Checklist

**Status:** `[ ]` not started, `[→]` in progress, `[✓]` done, `[!]` blocked

### Setup
- [ ] Create feature branch
- [ ] Run existing tests → ALL PASS (baseline)

### Phase 1: Test Infrastructure Setup
- [ ] Create test directories (unit, integration, security, fixtures, mocks)
- [ ] Create YouTube transcript mock module
- [ ] Create MCP client testing fixtures
- [ ] Update vitest config for proper coverage reporting

### Phase 2: Unit Tests - Real Implementation
- [ ] Create tests/unit/youtube-mcp-server.test.ts
- [ ] Test YoutubeMcpServer class instantiation
- [ ] Test tool registration methods
- [ ] Test URL validation and conversion logic
- [ ] Test filename generation and sanitization
- [ ] Test stream error handling
- [ ] Verify >80% line coverage achieved

### Phase 3: Integration Tests - MCP Protocol
- [ ] Create tests/integration/mcp-protocol.test.ts
- [ ] Test MCP server startup and tool discovery
- [ ] Test tool execution via MCP SDK
- [ ] Test request/response format compliance
- [ ] Test error response handling via protocol
- [ ] Test graceful shutdown scenarios

### Phase 4: Security Tests
- [ ] Create tests/security/input-validation.test.ts
- [ ] Test malicious YouTube URL handling
- [ ] Test invalid video ID format rejection
- [ ] Test path traversal attempt blocking
- [ ] Test input sanitization for XSS prevention
- [ ] Test buffer overflow protection

### Phase 5: Performance & Memory Tests
- [ ] Enhance existing tests/streaming.test.ts
- [ ] Test large transcript processing (60k+ entries)
- [ ] Verify memory usage stays <100MB
- [ ] Test progress logging functionality
- [ ] Test concurrent request handling

### Phase 6: End-to-End Tests
- [ ] Create tests/integration/end-to-end.test.ts
- [ ] Test complete workflow from URL to file output
- [ ] Test with various YouTube URL formats
- [ ] Test Shorts URL conversion
- [ ] Verify output file format and content

### Phase 7: CI/CD Integration
- [ ] Update package.json scripts if needed
- [ ] Verify npm test command works
- [ ] Verify npm run test:coverage generates reports
- [ ] Ensure all tests pass in CI environment

### Final Verification
- [ ] Run complete test suite → ALL PASS
- [ ] Verify coverage >80% achieved
- [ ] Manual verification of real YouTube URLs
- [ ] Verify no regressions in existing functionality
- [ ] Documentation updates if needed

## Definition of Done

- [ ] All spec requirements met (AC1-AC9)
- [ ] All tests passing (NO MOCKS for critical paths)
- [ ] >80% line coverage for YoutubeMcpServer implementation
- [ ] No regressions in existing functionality
- [ ] Code follows existing patterns and conventions
- [ ] MCP protocol compliance verified
- [ ] Security tests cover all input vectors
- [ ] Regression test strategy complete with 100% blast radius coverage
- [ ] Ready for review

**Regression Testing:**
- [ ] Regression Test Strategy section complete with ALL affected features from research
- [ ] ALL affected features have Unit + Integration + Manual test plans
- [ ] Critical path features have E2E tests mapped
- [ ] Regression test execution plan references `/sop-regression-verification 18`
- [ ] 100% blast radius coverage documented