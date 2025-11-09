#!/bin/bash
# DoD Validation Script for Implementation Plan
# Issue #3: Request Throttling for YouTube MCP Server
# Generated: 2025-11-09T02:24:33Z

PLAN_FILE="/Users/mekonen/.mcp-global/.dev/issues/003-feature-request-throttling/03-plan/plan.md"
SCORE=0
MAX_SCORE=100
ISSUES=()

echo "═══════════════════════════════════════════════════════════"
echo "DoD Validation: Implementation Plan (code-plan agent)"
echo "Issue #3: Request Throttling for YouTube MCP Server"
echo "═══════════════════════════════════════════════════════════"
echo ""

# CR1: Clear implementation checklist (20 points)
echo "[CR1] Implementation Checklist..."
if grep -q "## Implementation Checklist" "$PLAN_FILE" && \
   grep -q "\- \[ \]" "$PLAN_FILE"; then
    CHECKLIST_COUNT=$(grep -c "\- \[ \]" "$PLAN_FILE")
    if [ "$CHECKLIST_COUNT" -ge 20 ]; then
        echo "  ✅ PASS - $CHECKLIST_COUNT checklist items found (minimum 20)"
        SCORE=$((SCORE + 20))
    else
        echo "  ❌ FAIL - Only $CHECKLIST_COUNT items (need 20+)"
        ISSUES+=("CR1: Insufficient checklist items ($CHECKLIST_COUNT < 20)")
    fi
else
    echo "  ❌ FAIL - No implementation checklist found"
    ISSUES+=("CR1: Missing implementation checklist")
fi

# CR2: File modification plan (15 points)
echo "[CR2] File Modification Plan..."
if grep -q "## File Modification Plan" "$PLAN_FILE" && \
   grep -q "Files to Create" "$PLAN_FILE" && \
   grep -q "Files to Modify" "$PLAN_FILE"; then
    echo "  ✅ PASS - File modification plan present"
    SCORE=$((SCORE + 15))
else
    echo "  ❌ FAIL - Missing file modification plan"
    ISSUES+=("CR2: Missing file modification plan section")
fi

# CR3: Test strategy with specific test cases (20 points)
echo "[CR3] Test Strategy..."
if grep -q "## Test Strategy" "$PLAN_FILE"; then
    UNIT_TESTS=$(grep -c "UT[0-9]" "$PLAN_FILE" || echo "0")
    INTEGRATION_TESTS=$(grep -c "IT[0-9]" "$PLAN_FILE" || echo "0")
    TOTAL_TESTS=$((UNIT_TESTS + INTEGRATION_TESTS))
    
    if [ "$TOTAL_TESTS" -ge 10 ]; then
        echo "  ✅ PASS - $TOTAL_TESTS test cases defined (UT: $UNIT_TESTS, IT: $INTEGRATION_TESTS)"
        SCORE=$((SCORE + 20))
    else
        echo "  ❌ FAIL - Only $TOTAL_TESTS test cases (need 10+)"
        ISSUES+=("CR3: Insufficient test cases ($TOTAL_TESTS < 10)")
    fi
else
    echo "  ❌ FAIL - Missing test strategy section"
    ISSUES+=("CR3: Missing test strategy")
fi

# CR4: Architectural decisions documented (10 points)
echo "[CR4] Architectural Decisions..."
if grep -q "## Architectural Decisions" "$PLAN_FILE"; then
    AD_COUNT=$(grep -c "^### AD[0-9]" "$PLAN_FILE" || echo "0")
    if [ "$AD_COUNT" -ge 3 ]; then
        echo "  ✅ PASS - $AD_COUNT architectural decisions documented"
        SCORE=$((SCORE + 10))
    else
        echo "  ❌ FAIL - Only $AD_COUNT decisions (need 3+)"
        ISSUES+=("CR4: Insufficient architectural decisions ($AD_COUNT < 3)")
    fi
else
    echo "  ❌ FAIL - Missing architectural decisions section"
    ISSUES+=("CR4: Missing architectural decisions")
fi

# CR5: Risk assessment (10 points)
echo "[CR5] Risk Assessment..."
if grep -q "## Risk Assessment" "$PLAN_FILE" && \
   grep -q "Likelihood" "$PLAN_FILE" && \
   grep -q "Mitigation" "$PLAN_FILE"; then
    RISK_COUNT=$(grep -c "^### Risk [0-9]" "$PLAN_FILE" || echo "0")
    if [ "$RISK_COUNT" -ge 3 ]; then
        echo "  ✅ PASS - $RISK_COUNT risks identified with mitigations"
        SCORE=$((SCORE + 10))
    else
        echo "  ❌ FAIL - Only $RISK_COUNT risks (need 3+)"
        ISSUES+=("CR5: Insufficient risk analysis ($RISK_COUNT < 3)")
    fi
else
    echo "  ❌ FAIL - Missing risk assessment section"
    ISSUES+=("CR5: Missing risk assessment")
fi

# CR6: All acceptance criteria mapped to tests (15 points)
echo "[CR6] Acceptance Criteria Mapping..."
if grep -q "## Acceptance Criteria Mapping" "$PLAN_FILE"; then
    AC_MAPPED=$(grep -c "AC[0-9]" "$PLAN_FILE" || echo "0")
    if [ "$AC_MAPPED" -ge 10 ]; then
        echo "  ✅ PASS - $AC_MAPPED acceptance criteria mapped to tests"
        SCORE=$((SCORE + 15))
    else
        echo "  ❌ FAIL - Only $AC_MAPPED criteria mapped (need 10)"
        ISSUES+=("CR6: Incomplete AC mapping ($AC_MAPPED < 10)")
    fi
else
    echo "  ❌ FAIL - Missing acceptance criteria mapping"
    ISSUES+=("CR6: Missing AC mapping table")
fi

# CR7: Estimated timeline (5 points)
echo "[CR7] Timeline Estimate..."
if grep -q "Timeline Estimate" "$PLAN_FILE" || \
   grep -q "Estimated Time" "$PLAN_FILE"; then
    echo "  ✅ PASS - Timeline estimate present"
    SCORE=$((SCORE + 5))
else
    echo "  ❌ FAIL - Missing timeline estimate"
    ISSUES+=("CR7: Missing timeline/effort estimate")
fi

# CR8: Regression test strategy (5 points)
echo "[CR8] Regression Test Strategy..."
if grep -q "Regression" "$PLAN_FILE"; then
    echo "  ✅ PASS - Regression test strategy documented"
    SCORE=$((SCORE + 5))
else
    echo "  ❌ FAIL - No regression test strategy"
    ISSUES+=("CR8: Missing regression test plan")
fi

# GATE: Critical gates
echo ""
echo "[CRITICAL GATES]"
GATE_PASS=true

# Gate 1: All acceptance criteria addressed
AC_IN_SPEC=10
AC_IN_PLAN=$(grep -c "AC[0-9]" "$PLAN_FILE" || echo "0")
if [ "$AC_IN_PLAN" -ge "$AC_IN_SPEC" ]; then
    echo "  ✅ PASS - All $AC_IN_SPEC acceptance criteria addressed"
else
    echo "  ❌ FAIL - Only $AC_IN_PLAN/$AC_IN_SPEC criteria addressed"
    GATE_PASS=false
fi

# Gate 2: No blocking open questions
if ! grep -q "BLOCKING" "$PLAN_FILE" && \
   ! grep -q "Decision Required" "$PLAN_FILE"; then
    echo "  ✅ PASS - No blocking open questions"
else
    echo "  ⚠️  WARN - Blocking questions found (may require resolution)"
fi

# Gate 3: File modification plan complete
FILES_CREATE=$(grep -A 20 "Files to Create" "$PLAN_FILE" | grep -c "\.ts\|\.md" || echo "0")
FILES_MODIFY=$(grep -A 20 "Files to Modify" "$PLAN_FILE" | grep -c "\.ts\|\.md" || echo "0")
if [ "$FILES_CREATE" -ge 2 ] && [ "$FILES_MODIFY" -ge 1 ]; then
    echo "  ✅ PASS - File modification plan complete ($FILES_CREATE new, $FILES_MODIFY modified)"
else
    echo "  ❌ FAIL - Incomplete file plan (create: $FILES_CREATE, modify: $FILES_MODIFY)"
    GATE_PASS=false
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Final Score: $SCORE / $MAX_SCORE"

if [ "$SCORE" -eq 100 ]; then
    echo "Result: ✅ PASS (Perfect Score)"
    echo "Status: Ready for implementation"
elif [ "$SCORE" -ge 90 ]; then
    echo "Result: ✅ PASS (Excellent)"
    echo "Status: Ready for implementation with minor improvements"
elif [ "$SCORE" -ge 80 ]; then
    echo "Result: ⚠️  CONDITIONAL PASS"
    echo "Status: Requires improvements before implementation"
else
    echo "Result: ❌ FAIL"
    echo "Status: Must revise plan"
fi

if [ "$GATE_PASS" = false ]; then
    echo "Critical Gate: ❌ FAIL - Critical requirements not met"
    SCORE=0  # Override score if critical gates fail
fi

echo "═══════════════════════════════════════════════════════════"

if [ ${#ISSUES[@]} -gt 0 ]; then
    echo ""
    echo "Issues Found:"
    for issue in "${ISSUES[@]}"; do
        echo "  • $issue"
    done
fi

echo ""
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Exit with score as percentage (0-100)
exit $((100 - SCORE))
