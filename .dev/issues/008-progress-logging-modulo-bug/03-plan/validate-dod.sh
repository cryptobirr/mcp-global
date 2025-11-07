#!/bin/bash
# Plan DoD Validation - Auto-generated
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ $# -ne 3 ]; then
    echo "Usage: $0 <plan-file> <research-file> <spec-file>"
    exit 2
fi

PLAN_FILE="${1}"
RESEARCH_FILE="${2}"
SPEC_FILE="${3}"

for file in "$PLAN_FILE" "$RESEARCH_FILE" "$SPEC_FILE"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ ERROR: File not found: $file${NC}"
        exit 2
    fi
done

echo "=================================================="
echo "Plan DoD Validation"
echo "=================================================="
echo "Plan: $PLAN_FILE"
echo "Research: $RESEARCH_FILE"
echo "Spec: $SPEC_FILE"
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

# Check 1: Approach identified
echo "[1/8] Checking approach identification..."
if grep -qi "greenfield\|brownfield" "$PLAN_FILE"; then
    check_pass "Approach identified"
else
    check_fail "Approach not identified" "Plan must state GREENFIELD or BROWNFIELD"
fi
echo ""

# Check 2: Architectural Decisions (if blocking decisions in research)
echo "[2/8] Checking Architectural Decisions..."
BLOCKING_IN_RESEARCH=$(grep -E "🚨|BLOCKING DECISION" "$RESEARCH_FILE" | wc -l | tr -d ' ')
echo "ℹ Blocking decisions in research: $BLOCKING_IN_RESEARCH"

if [ "$BLOCKING_IN_RESEARCH" -eq 0 ]; then
    check_pass "No blocking decisions in research (AD section not required)"
else
    if grep -q "## Architectural Decisions\|# Architectural Decisions" "$PLAN_FILE"; then
        AD_COUNT=$(grep -E "### AD-[0-9]" "$PLAN_FILE" | wc -l | tr -d ' ')
        if [ "$AD_COUNT" -ge "$BLOCKING_IN_RESEARCH" ]; then
            check_pass "All $BLOCKING_IN_RESEARCH blocking decisions resolved"
        else
            check_fail "Incomplete architectural decisions" \
                "Research has $BLOCKING_IN_RESEARCH decisions, plan has $AD_COUNT ADs"
        fi
    else
        check_fail "Architectural Decisions section missing" \
            "Research has $BLOCKING_IN_RESEARCH blocking decisions but plan has no AD section"
    fi
fi
echo ""

# Check 3: No unresolved decisions
echo "[3/8] Checking for unresolved decisions..."
if grep -qE "🚨|DECISION REQUIRED|TODO.*decision" "$PLAN_FILE" 2>/dev/null; then
    UNRESOLVED=$(grep -cE "🚨|DECISION REQUIRED|TODO.*decision" "$PLAN_FILE" 2>/dev/null || echo 0)
    check_fail "Unresolved decisions found" \
        "Found $UNRESOLVED unresolved markers - all must be resolved"
else
    check_pass "No unresolved decisions in plan"
fi
echo ""

# Check 4: No placeholder code
echo "[4/8] Checking for placeholder code..."
PLACEHOLDER_FOUND=0

if grep -n "TODO:" "$PLAN_FILE" | grep -v "# ❌ FORBIDDEN" | grep -v "\*\*❌" > /dev/null 2>&1; then
    PLACEHOLDER_FOUND=1
fi

if grep -n "FIXME:\|NotImplementedError\|not implemented" "$PLAN_FILE" | grep -v "# ❌ FORBIDDEN" | grep -v "\*\*❌" > /dev/null 2>&1; then
    PLACEHOLDER_FOUND=1
fi

if [ "$PLACEHOLDER_FOUND" -eq 0 ]; then
    check_pass "No placeholder code found"
else
    check_fail "Placeholder code found" \
        "Implementation contains TODO/FIXME/NotImplementedError - all code must be complete"
fi
echo ""

# Check 5: AC Coverage Map
echo "[5/8] Checking AC Coverage Map..."
SPEC_ACS=$(grep -oE "AC[0-9]+" "$SPEC_FILE" | sort -u || echo "")
SPEC_AC_COUNT=$(echo "$SPEC_ACS" | grep -c "AC" || echo 0)
echo "ℹ Found $SPEC_AC_COUNT acceptance criteria in spec"

if [ "$SPEC_AC_COUNT" -eq 0 ]; then
    check_pass "No ACs in spec to validate"
elif grep -q "AC Coverage Map\|AC.*Coverage" "$PLAN_FILE"; then
    MISSING_ACS=""
    for ac in $SPEC_ACS; do
        if ! grep -q "| *$ac *|" "$PLAN_FILE"; then
            MISSING_ACS="$MISSING_ACS $ac"
        fi
    done

    if [ -z "$MISSING_ACS" ]; then
        check_pass "All $SPEC_AC_COUNT ACs mapped in coverage table"
    else
        check_fail "Missing ACs in coverage map" "Missing:$MISSING_ACS"
    fi
else
    check_fail "AC Coverage Map missing" \
        "Plan must have AC Coverage Map with all $SPEC_AC_COUNT ACs"
fi
echo ""

# Check 6: Test Strategy
echo "[6/8] Checking test strategy..."
if grep -q "## Test Strategy\|# Test Strategy" "$PLAN_FILE"; then
    if grep -qi "NO MOCKS\|real.*database\|real.*api" "$PLAN_FILE"; then
        check_pass "Test strategy mentions real systems"
    else
        check_fail "Test strategy unclear" "Must state 'NO MOCKS' and specify real systems"
    fi
else
    check_fail "Test Strategy section missing" "Plan must have Test Strategy section"
fi
echo ""

# Check 7: Regression Test Strategy
echo "[7/8] Checking Regression Test Strategy..."
AFFECTED_FEATURES=$(grep -c "\*\*Feature [0-9]:" "$RESEARCH_FILE" || echo 0)
echo "ℹ Affected features in research Impact Analysis: $AFFECTED_FEATURES"

if [ "$AFFECTED_FEATURES" -eq 0 ]; then
    check_pass "No affected features in research (regression section optional)"
else
    if grep -q "## Regression Test Strategy\|# Regression Test Strategy" "$PLAN_FILE"; then
        # Check if ALL affected features from research have test mappings
        FEATURES_IN_PLAN=$(grep -c "#### Affected Feature [0-9]:" "$PLAN_FILE" || echo 0)
        if [ "$FEATURES_IN_PLAN" -ge "$AFFECTED_FEATURES" ]; then
            # Check if execution plan references /sop-regression-verification
            if grep -q "/sop-regression-verification" "$PLAN_FILE"; then
                check_pass "Regression test strategy complete with $FEATURES_IN_PLAN features and verification command"
            else
                check_fail "Regression test execution plan missing" \
                    "Plan must reference /sop-regression-verification command"
            fi
        else
            check_fail "Incomplete regression test mappings" \
                "Research has $AFFECTED_FEATURES features, plan has $FEATURES_IN_PLAN"
        fi
    else
        check_fail "Regression Test Strategy section missing" \
            "Research has $AFFECTED_FEATURES affected features but plan has no regression section"
    fi
fi
echo ""

# Check 8: File location
echo "[8/8] Checking file location..."
if [[ "$PLAN_FILE" =~ \.dev/issues/[0-9]+-[^/]+/03-plan/plan\.md$ ]] || \
   [[ "$PLAN_FILE" =~ \.dev/issues/[0-9]+-[^/]+/03-plan/plan-v[0-9]+-.*\.md$ ]]; then
    check_pass "File saved to correct location"
else
    check_fail "File location incorrect" "Expected: .dev/issues/NNN-slug/03-plan/plan.md"
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

    # Save DoD grade
    DOD_GRADE_FILE="$(dirname "$PLAN_FILE")/dod-grade.md"
    TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    cat > "$DOD_GRADE_FILE" <<EOF
# DoD Validation Grade

**Timestamp:** $TIMESTAMP
**Result:** PASS
**Score:** 100%

## Critical Criteria (8/8 PASS)

1. ✅ Approach identified
2. ✅ All blocking decisions resolved
3. ✅ No unresolved decisions
4. ✅ No placeholder code
5. ✅ AC Coverage Map complete
6. ✅ Test strategy mentions real systems
7. ✅ Regression test strategy complete
8. ✅ File location correct

## Summary

All critical criteria met. Plan is ready for implementation phase.
EOF
    echo "DoD grade saved to: $DOD_GRADE_FILE"

    exit 0
else
    echo -e "${RED}❌ DoD FAIL: $FAIL_COUNT critical criteria not met${NC}"
    echo ""
    echo "Action Required:"
    echo "1. Address all FAIL items above"
    echo "2. Update plan document"
    echo "3. Re-run this validation script"

    # Save DoD grade
    DOD_GRADE_FILE="$(dirname "$PLAN_FILE")/dod-grade.md"
    TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    SCORE=$(awk "BEGIN {printf \"%.0f\", ($PASS_COUNT / ($PASS_COUNT + $FAIL_COUNT)) * 100}")
    cat > "$DOD_GRADE_FILE" <<EOF
# DoD Validation Grade

**Timestamp:** $TIMESTAMP
**Result:** FAIL
**Score:** $SCORE%

## Critical Criteria ($PASS_COUNT/8 PASS, $FAIL_COUNT FAIL)

[See validation output above for detailed PASS/FAIL status]

## Gaps Identified

$FAIL_COUNT critical criteria not met. Review validation output for specific issues.

## Action Required

1. Address all FAIL items in validation output
2. Update plan document
3. Re-run validation script
EOF
    echo "DoD grade saved to: $DOD_GRADE_FILE"

    exit 1
fi
