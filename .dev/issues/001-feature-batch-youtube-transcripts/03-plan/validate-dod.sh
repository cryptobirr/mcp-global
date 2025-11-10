#!/bin/bash

# DoD Validation Script for Implementation Plan
# Issue: #1 - Batch YouTube Transcript Processing
# Phase: plan
# Generated: 2025-11-09T16:58:45Z

PLAN_FILE="/Users/mekonen/.mcp-global/.dev/issues/001-feature-batch-youtube-transcripts/03-plan/plan.md"
GRADE_FILE="/Users/mekonen/.mcp-global/.dev/issues/001-feature-batch-youtube-transcripts/03-plan/dod-grade.md"

echo "=== DoD Validation: Implementation Plan ==="
echo "Issue: #1"
echo "Phase: plan"
echo ""

SCORE=0
MAX_SCORE=100
CRITICAL_FAILURES=0

# Critical Gate: Plan file exists
if [ ! -f "$PLAN_FILE" ]; then
  echo "❌ CRITICAL: Plan file not found"
  CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
else
  echo "✓ Plan file exists"
  SCORE=$((SCORE + 10))
fi

# 1. Executive Summary (10 points)
if grep -q "## Executive Summary" "$PLAN_FILE" && \
   grep -q "Total Estimated Time" "$PLAN_FILE" && \
   grep -q "Risk Level" "$PLAN_FILE"; then
  echo "✓ Executive summary present with timeline and risk"
  SCORE=$((SCORE + 10))
else
  echo "✗ Executive summary incomplete"
fi

# 2. Phased Implementation (15 points)
PHASE_COUNT=$(grep -c "^## Phase [0-9]" "$PLAN_FILE")
if [ "$PHASE_COUNT" -ge 5 ]; then
  echo "✓ Implementation broken into $PHASE_COUNT phases"
  SCORE=$((SCORE + 15))
else
  echo "✗ Insufficient phases ($PHASE_COUNT < 5)"
fi

# 3. Acceptance Criteria (15 points)
AC_COUNT=$(grep -c "^#### [0-9]\.[0-9] " "$PLAN_FILE")
if [ "$AC_COUNT" -ge 10 ]; then
  echo "✓ $AC_COUNT tasks with acceptance criteria"
  SCORE=$((SCORE + 15))
else
  echo "✗ Insufficient task breakdown ($AC_COUNT < 10)"
fi

# 4. Code Examples (10 points)
CODE_BLOCK_COUNT=$(grep -c '```typescript' "$PLAN_FILE")
if [ "$CODE_BLOCK_COUNT" -ge 5 ]; then
  echo "✓ $CODE_BLOCK_COUNT code examples provided"
  SCORE=$((SCORE + 10))
else
  echo "✗ Insufficient code examples ($CODE_BLOCK_COUNT < 5)"
fi

# 5. Testing Strategy (15 points)
if grep -q "## Testing Summary" "$PLAN_FILE" || grep -q "### Phase [0-9] Testing" "$PLAN_FILE"; then
  if grep -q "Unit Tests" "$PLAN_FILE" && \
     grep -q "Integration Tests" "$PLAN_FILE" && \
     grep -q "Security Tests" "$PLAN_FILE"; then
    echo "✓ Comprehensive testing strategy (unit + integration + security)"
    SCORE=$((SCORE + 15))
  else
    echo "✗ Testing strategy incomplete"
    SCORE=$((SCORE + 5))
  fi
else
  echo "✗ No testing strategy"
fi

# 6. Risk Assessment (10 points)
if grep -q "## Risk Assessment" "$PLAN_FILE" && \
   grep -q "Mitigation" "$PLAN_FILE"; then
  echo "✓ Risk assessment with mitigation strategies"
  SCORE=$((SCORE + 10))
else
  echo "✗ Risk assessment missing or incomplete"
fi

# 7. Files to Modify (5 points)
if grep -q "## Files Modified" "$PLAN_FILE" || grep -q "### Modified Files" "$PLAN_FILE"; then
  echo "✓ Files to modify identified"
  SCORE=$((SCORE + 5))
else
  echo "✗ Files to modify not specified"
fi

# 8. Dependencies (5 points)
if grep -q "## Dependencies" "$PLAN_FILE" || grep -q "### Blocking Dependencies" "$PLAN_FILE"; then
  echo "✓ Dependencies documented"
  SCORE=$((SCORE + 5))
else
  echo "✗ Dependencies not documented"
fi

# 9. Backward Compatibility (5 points)
if grep -q "## Backward Compatibility" "$PLAN_FILE" || grep -q "Backward Compatibility" "$PLAN_FILE"; then
  echo "✓ Backward compatibility addressed"
  SCORE=$((SCORE + 5))
else
  echo "✗ Backward compatibility not addressed"
fi

# 10. Success Criteria (10 points)
if grep -q "## Success Criteria" "$PLAN_FILE"; then
  CHECKLIST_COUNT=$(grep -c "^- \[ \]" "$PLAN_FILE")
  if [ "$CHECKLIST_COUNT" -ge 15 ]; then
    echo "✓ Success criteria with $CHECKLIST_COUNT checklist items"
    SCORE=$((SCORE + 10))
  else
    echo "✗ Insufficient success criteria ($CHECKLIST_COUNT < 15)"
    SCORE=$((SCORE + 5))
  fi
else
  echo "✗ Success criteria missing"
fi

# Critical Gate Check
if [ "$CRITICAL_FAILURES" -gt 0 ]; then
  echo ""
  echo "❌ CRITICAL GATE FAILED"
  echo "Score: 0% (critical failures prevent grading)"
  echo "Result: FAIL"
  
  cat > "$GRADE_FILE" << GRADE_END
# DoD Grade Report: Implementation Plan

**Issue:** #1  
**Phase:** plan  
**Generated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)  
**Result:** FAIL

## Critical Gate: FAILED

Critical failures detected:
- Plan file not found or unreadable

**Score:** 0%

**Action Required:** Create plan file at expected location.
GRADE_END
  
  exit 1
fi

# Calculate percentage
PERCENTAGE=$((SCORE * 100 / MAX_SCORE))

echo ""
echo "=== DoD Validation Complete ==="
echo "Score: $SCORE / $MAX_SCORE ($PERCENTAGE%)"

# Determine result
if [ "$PERCENTAGE" -ge 100 ]; then
  RESULT="PASS"
  echo "Result: ✓ PASS"
elif [ "$PERCENTAGE" -ge 80 ]; then
  RESULT="FAIL"
  echo "Result: ✗ FAIL (score $PERCENTAGE% < 100% required)"
else
  RESULT="FAIL"
  echo "Result: ✗ FAIL (score $PERCENTAGE% << 100% required)"
fi

# Generate grade report
cat > "$GRADE_FILE" << GRADE_END
# DoD Grade Report: Implementation Plan

**Issue:** #1  
**Phase:** plan  
**Generated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)  
**Result:** $RESULT

## Score: $PERCENTAGE% ($SCORE / $MAX_SCORE)

## Criteria Breakdown

### Critical Gate: PASS
- [x] Plan file exists and is readable

### Content Requirements ($SCORE / $MAX_SCORE points)

1. **Executive Summary** (10 pts)
   - Timeline and risk level documented

2. **Phased Implementation** (15 pts)
   - $PHASE_COUNT phases identified

3. **Acceptance Criteria** (15 pts)
   - $AC_COUNT tasks with clear acceptance criteria

4. **Code Examples** (10 pts)
   - $CODE_BLOCK_COUNT TypeScript code examples

5. **Testing Strategy** (15 pts)
   - Unit, integration, and security tests planned

6. **Risk Assessment** (10 pts)
   - Risks identified with mitigation strategies

7. **Files to Modify** (5 pts)
   - Modified files clearly listed

8. **Dependencies** (5 pts)
   - Blocking and external dependencies documented

9. **Backward Compatibility** (5 pts)
   - Compatibility guarantees stated

10. **Success Criteria** (10 pts)
    - $CHECKLIST_COUNT actionable checklist items

## Gaps Analysis

$(if [ "$PERCENTAGE" -lt 100 ]; then
  echo "### Areas for Improvement"
  echo ""
  grep "^✗" /dev/stdin <<< "$(bash $0 2>&1)" | head -5
else
  echo "No gaps - all criteria met!"
fi)

## Recommendation

$(if [ "$RESULT" = "PASS" ]; then
  echo "**APPROVED** - Plan meets DoD requirements. Proceed to implementation phase."
else
  echo "**REVISION REQUIRED** - Address gaps above to meet 100% threshold."
fi)

---

**Validation Script:** $(basename $0)  
**Plan File:** $PLAN_FILE
GRADE_END

echo ""
echo "Grade report: $GRADE_FILE"

if [ "$RESULT" = "PASS" ]; then
  exit 0
else
  exit 1
fi
