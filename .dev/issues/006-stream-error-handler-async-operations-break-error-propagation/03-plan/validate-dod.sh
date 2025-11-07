#!/bin/bash
set -euo pipefail

PLAN_FILE="${1}"

if [ ! -f "$PLAN_FILE" ]; then
    echo "❌ ERROR: Plan file not found: $PLAN_FILE"
    exit 2
fi

FAIL_COUNT=0

echo "=== Bug Fix Plan DoD Validation ==="
echo "File: $PLAN_FILE"
echo ""

# Check 1: Fix approach is minimal
echo "[1/7] Checking fix approach is minimal..."
LINES_CHANGED=$(grep "Lines Changed:" "$PLAN_FILE" | grep -o "[0-9]\+" | head -1 || echo 999)
if [ "$LINES_CHANGED" -le 10 ]; then
    echo "✅ PASS: Fix is minimal ($LINES_CHANGED lines changed)"
else
    echo "❌ FAIL: Fix changes too many lines ($LINES_CHANGED > 10)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Check 2: Regression tests cover blast radius
echo "[2/7] Checking regression test coverage..."
REGRESSION_TEST_COUNT=$(grep -c "\- \[ \] \*\*Test:" "$PLAN_FILE" || echo 0)
INTEGRATION_TEST_COUNT=$(grep -c "\- \[ \] \*\*Integration Test:" "$PLAN_FILE" || echo 0)
TOTAL_NEW_TESTS=$((REGRESSION_TEST_COUNT + INTEGRATION_TEST_COUNT))
if [ "$TOTAL_NEW_TESTS" -ge 3 ]; then
    echo "✅ PASS: Found $TOTAL_NEW_TESTS new tests (requirement: 3+)"
else
    echo "❌ FAIL: Insufficient tests ($TOTAL_NEW_TESTS, need 3+)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Check 3: Manual verification checklist exists
echo "[3/7] Checking manual verification checklist..."
if grep -q "## Manual Verification Checklist" "$PLAN_FILE"; then
    VERIFY_STEPS=$(grep -c "\- \[ \] \*\*Verify:" "$PLAN_FILE" || echo 0)
    if [ "$VERIFY_STEPS" -ge 3 ]; then
        echo "✅ PASS: Manual verification checklist with $VERIFY_STEPS steps"
    else
        echo "❌ FAIL: Manual verification checklist has only $VERIFY_STEPS steps (need 3+)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
else
    echo "❌ FAIL: Manual verification checklist missing"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Check 4: Rollback plan exists
echo "[4/7] Checking rollback plan..."
if grep -q "## Rollback Plan" "$PLAN_FILE" && \
   grep -q "Rollback Procedure:" "$PLAN_FILE"; then
    echo "✅ PASS: Rollback plan documented"
else
    echo "❌ FAIL: Rollback plan missing or incomplete"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Check 5: Each test has expected outcome
echo "[5/7] Checking test details..."
TESTS_WITH_EXPECTED=$(grep -c "\*\*Expected:\*\*" "$PLAN_FILE" || echo 0)
if [ "$TESTS_WITH_EXPECTED" -ge "$TOTAL_NEW_TESTS" ]; then
    echo "✅ PASS: All tests have expected outcomes"
else
    echo "❌ FAIL: Some tests missing expected outcomes"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Check 6: Implementation checklist exists
echo "[6/7] Checking implementation checklist..."
if grep -q "## Implementation Checklist" "$PLAN_FILE"; then
    echo "✅ PASS: Implementation checklist exists"
else
    echo "❌ FAIL: Implementation checklist missing"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Check 7: File location correct
echo "[7/7] Checking file location..."
if [[ "$PLAN_FILE" =~ \.dev/issues/[0-9]+-[^/]+/03-plan/plan\.md$ ]] || \
   [[ "$PLAN_FILE" =~ \.dev/issues/[0-9]+-[^/]+/03-plan/plan-v[0-9]+-.*\.md$ ]]; then
    echo "✅ PASS: File saved to correct location"
else
    echo "❌ FAIL: File not in correct location"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

echo "==================================="
if [ "$FAIL_COUNT" -eq 0 ]; then
    echo "✅ DoD PASS: All criteria met"
    exit 0
else
    echo "❌ DoD FAIL: $FAIL_COUNT criteria not met"
    exit 1
fi
