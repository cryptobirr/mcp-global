#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ $# -ne 1 ]; then
    echo "Usage: $0 <research-file>"
    exit 2
fi

RESEARCH_FILE="${1}"

if [ ! -f "$RESEARCH_FILE" ]; then
    echo -e "${RED}❌ ERROR: Research file not found: $RESEARCH_FILE${NC}"
    exit 2
fi

echo "=================================================="
echo "Research DoD Validation"
echo "=================================================="
echo "File: $RESEARCH_FILE"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

FAIL_COUNT=0
PASS_COUNT=0

check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    echo "  → $2"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo "=== CRITICAL CRITERIA ==="
echo ""

# Check 1: Architecture overview
echo "[1/10] Checking for Architecture overview..."
if grep -q "## Architecture Overview\|# Architecture Overview" "$RESEARCH_FILE"; then
    check_pass "Architecture overview section exists"
else
    check_fail "Architecture overview section missing" \
        "Research must have '## Architecture Overview' section"
fi
echo ""

# Check 2: Similar patterns
echo "[2/10] Checking for similar patterns..."
if grep -q "## Similar Patterns Found\|## Similar Patterns\|# Similar Patterns" "$RESEARCH_FILE"; then
    PATTERN_COUNT=$(grep -c "### Pattern:\|### Pattern [0-9]" "$RESEARCH_FILE" || echo 0)
    if [ "$PATTERN_COUNT" -ge 2 ]; then
        check_pass "Found $PATTERN_COUNT similar patterns (requirement: 2+)"
    elif grep -qi "no patterns exist\|greenfield.*no existing" "$RESEARCH_FILE"; then
        check_pass "Greenfield project - explicitly stated no patterns exist"
    else
        check_fail "Insufficient patterns documented" \
            "Found $PATTERN_COUNT patterns, need 2+ OR explicit 'no patterns exist' statement"
    fi
else
    check_fail "Similar Patterns section missing" \
        "Research must have '## Similar Patterns Found' section"
fi
echo ""

# Check 3: Integration points
echo "[3/10] Checking for integration points..."
if grep -q "## Integration Points\|# Integration Points" "$RESEARCH_FILE"; then
    check_pass "Integration points section exists"
else
    check_fail "Integration points section missing" \
        "Research must have '## Integration Points' section"
fi
echo ""

# Check 4: Testing infrastructure
echo "[4/10] Checking for testing infrastructure..."
if grep -q "## Testing Infrastructure\|# Testing Infrastructure" "$RESEARCH_FILE"; then
    check_pass "Testing infrastructure section exists"
else
    check_fail "Testing infrastructure section missing" \
        "Research must have '## Testing Infrastructure' section"
fi
echo ""

# Check 5: Risks and constraints
echo "[5/10] Checking for risks and constraints..."
if grep -q "## Risks & Constraints\|## Risks and Constraints\|# Risks" "$RESEARCH_FILE"; then
    check_pass "Risks & constraints section exists"
else
    check_fail "Risks & constraints section missing" \
        "Research must have '## Risks & Constraints' section"
fi
echo ""

# Check 6: Blocking decisions section exists
echo "[6/10] Checking for blocking decisions section..."
if grep -q "## Blocking Decisions\|# Blocking Decisions" "$RESEARCH_FILE"; then
    BLOCKING_COUNT=$(grep -c "🚨\|BLOCKING DECISION" "$RESEARCH_FILE" || echo 0)
    if [ "$BLOCKING_COUNT" -eq 0 ]; then
        check_pass "Blocking Decisions section exists (none identified)"
    else
        check_pass "Found $BLOCKING_COUNT blocking decision(s)"
    fi
else
    check_fail "Blocking Decisions section missing" \
        "Research must have '## Blocking Decisions' section (can state 'None' if no decisions needed)"
fi
echo ""

# Check 7: Each blocking decision has options
echo "[7/10] Checking blocking decision options..."
BLOCKING_COUNT=$(grep -c "🚨\|BLOCKING DECISION" "$RESEARCH_FILE" || echo 0)
if [ "$BLOCKING_COUNT" -eq 0 ]; then
    check_pass "No blocking decisions to validate"
else
    OPTIONS_COUNT=$(grep -c "#### Option \|**Option [A-Z]:\|### Option [A-Z]:" "$RESEARCH_FILE" || echo 0)
    REQUIRED_OPTIONS=$((BLOCKING_COUNT * 2))
    if [ "$OPTIONS_COUNT" -ge "$REQUIRED_OPTIONS" ]; then
        check_pass "All blocking decisions have 2+ options documented"
    else
        check_fail "Insufficient options for blocking decisions" \
            "Found $OPTIONS_COUNT options for $BLOCKING_COUNT decisions (need $REQUIRED_OPTIONS+ options)"
    fi
fi
echo ""

# Check 8: Each blocking decision has recommendation
echo "[8/10] Checking blocking decision recommendations..."
if [ "$BLOCKING_COUNT" -eq 0 ]; then
    check_pass "No blocking decisions to validate"
else
    REC_COUNT=$(grep -c "**Recommendation:\|Recommendation:\|**If Deferred:\|If Deferred:" "$RESEARCH_FILE" || echo 0)
    if [ "$REC_COUNT" -ge "$BLOCKING_COUNT" ]; then
        check_pass "All blocking decisions have recommendations or deferral docs"
    else
        check_fail "Missing recommendations for blocking decisions" \
            "Found $REC_COUNT recommendations/deferrals for $BLOCKING_COUNT decisions (need $BLOCKING_COUNT)"
    fi
fi
echo ""

# Check 9: File location
echo "[9/10] Checking file location..."
if [[ "$RESEARCH_FILE" =~ \.dev/issues/[0-9]+-[^/]+/02-research/research\.md$ ]] || \
   [[ "$RESEARCH_FILE" =~ \.dev/issues/[0-9]+-[^/]+/02-research/research-v[0-9]+-.*\.md$ ]]; then
    check_pass "File saved to correct location"
else
    check_fail "File not in correct location" \
        "Expected: .dev/issues/NNN-slug/02-research/research.md"
fi
echo ""

# Check 10: Impact Analysis & Regression Risks
echo "[10/10] Checking for Impact Analysis & Regression Risks..."
if grep -q "## Impact Analysis\|# Impact Analysis" "$RESEARCH_FILE"; then
    # Check for Affected Features section
    if grep -q "### Affected Features" "$RESEARCH_FILE"; then
        # Check for Regression Test Coverage Matrix
        if grep -q "### Regression Test Coverage Matrix" "$RESEARCH_FILE"; then
            # Check for Blast Radius Summary
            if grep -q "### Blast Radius Summary" "$RESEARCH_FILE"; then
                check_pass "Impact Analysis with regression test requirements documented"
            else
                check_fail "Blast Radius Summary missing" \
                    "Research must document blast radius for regression testing"
            fi
        else
            check_fail "Regression Test Coverage Matrix missing" \
                "Research must map ALL affected features to regression tests needed"
        fi
    else
        check_fail "Affected Features section missing" \
            "Research must identify all features that could be impacted"
    fi
else
    check_fail "Impact Analysis section missing" \
        "Research must have '## Impact Analysis & Regression Risks' section"
fi
echo ""

echo "=================================================="
echo "VALIDATION SUMMARY"
echo "=================================================="
echo -e "PASSED: ${GREEN}$PASS_COUNT${NC}"
echo -e "FAILED: ${RED}$FAIL_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ DoD PASS: All critical criteria met${NC}"
    exit 0
else
    echo -e "${RED}❌ DoD FAIL: $FAIL_COUNT critical criteria not met${NC}"
    echo ""
    echo "Action Required:"
    echo "1. Address all FAIL items above"
    echo "2. Update research document"
    echo "3. Re-run this validation script"
    exit 1
fi
