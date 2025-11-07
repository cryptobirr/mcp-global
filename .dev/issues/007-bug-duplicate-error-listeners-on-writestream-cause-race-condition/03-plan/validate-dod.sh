#!/usr/bin/env bash
#
# DoD Validation Script for Plan Phase
# Based on: ~/.claude/prompts/sop-dod-validation.md
#
# Usage: bash validate-dod.sh <plan.md> <research.md> <spec.md>
#
# Exit codes:
#   0 = PASS (all criteria met)
#   1 = FAIL (one or more criteria not met)
#

set -euo pipefail

# Input validation
if [ $# -ne 3 ]; then
  echo "ERROR: Expected 3 arguments: <plan.md> <research.md> <spec.md>"
  exit 1
fi

PLAN_FILE="$1"
RESEARCH_FILE="$2"
SPEC_FILE="$3"

# Verify files exist
for file in "$PLAN_FILE" "$RESEARCH_FILE" "$SPEC_FILE"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: File not found: $file"
    exit 1
  fi
done

# Initialize scoring
TOTAL_CHECKS=8
PASSED_CHECKS=0
FAILED_CHECKS=()

echo "═══════════════════════════════════════════════════════════"
echo "DoD Validation: Plan Phase"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check 1: Architectural Decisions Section Exists (if blocking decisions in research)
echo "[1/$TOTAL_CHECKS] Checking Architectural Decisions section..."
BLOCKING_COUNT=$(grep -c "🚨" "$RESEARCH_FILE" || true)
if [ "$BLOCKING_COUNT" -gt 0 ]; then
  if grep -q "^## Architectural Decisions" "$PLAN_FILE"; then
    echo "  ✅ PASS: Architectural Decisions section found"
    ((PASSED_CHECKS++))
  else
    echo "  ❌ FAIL: Architectural Decisions section missing (research has $BLOCKING_COUNT blocking decisions)"
    FAILED_CHECKS+=("Architectural Decisions section missing")
  fi
else
  echo "  ✅ PASS: No blocking decisions in research (section not required)"
  ((PASSED_CHECKS++))
fi

# Check 2: No Unresolved Decision Markers
echo "[2/$TOTAL_CHECKS] Checking for unresolved decision markers..."
UNRESOLVED_COUNT=0
if grep -q "DECISION REQUIRED" "$PLAN_FILE" 2>/dev/null; then
  ((UNRESOLVED_COUNT++))
fi
if grep -q "TODO.*decision" "$PLAN_FILE" 2>/dev/null; then
  ((UNRESOLVED_COUNT++))
fi
if grep -q "🚨.*decision" "$PLAN_FILE" 2>/dev/null; then
  ((UNRESOLVED_COUNT++))
fi

if [ "$UNRESOLVED_COUNT" -eq 0 ]; then
  echo "  ✅ PASS: No unresolved decision markers"
  ((PASSED_CHECKS++))
else
  echo "  ❌ FAIL: Found unresolved decision markers"
  FAILED_CHECKS+=("Unresolved decision markers present")
fi

# Check 3: Files to Modify/Create Section Exists
echo "[3/$TOTAL_CHECKS] Checking Files to Modify/Create section..."
if grep -q "^## Files to Modify" "$PLAN_FILE"; then
  echo "  ✅ PASS: Files to Modify section found"
  ((PASSED_CHECKS++))
else
  echo "  ❌ FAIL: Files to Modify section missing"
  FAILED_CHECKS+=("Files to Modify section missing")
fi

# Check 4: Test Strategy Section Exists
echo "[4/$TOTAL_CHECKS] Checking Test Strategy section..."
if grep -q "^## Test Strategy" "$PLAN_FILE"; then
  echo "  ✅ PASS: Test Strategy section found"
  ((PASSED_CHECKS++))
else
  echo "  ❌ FAIL: Test Strategy section missing"
  FAILED_CHECKS+=("Test Strategy section missing")
fi

# Check 5: AC Coverage Map Table Exists
echo "[5/$TOTAL_CHECKS] Checking AC Coverage Map table..."
if grep -q "^### AC Coverage Map" "$PLAN_FILE" && grep -q "^| AC |" "$PLAN_FILE"; then
  echo "  ✅ PASS: AC Coverage Map table found"
  ((PASSED_CHECKS++))
else
  echo "  ❌ FAIL: AC Coverage Map table missing or malformed"
  FAILED_CHECKS+=("AC Coverage Map table missing")
fi

# Check 6: All ACs from Spec Mapped in Coverage
echo "[6/$TOTAL_CHECKS] Checking all ACs from spec are mapped..."
SPEC_AC_COUNT=$(grep -c "^\*\*AC[0-9]" "$SPEC_FILE" || true)
# Count UNIQUE AC identifiers (not total rows) - some ACs have multiple test methods
PLAN_AC_COUNT=$(grep "^| AC[0-9]" "$PLAN_FILE" | cut -d'|' -f2 | tr -d ' ' | sort -u | wc -l | tr -d ' ')

if [ "$SPEC_AC_COUNT" -eq "$PLAN_AC_COUNT" ]; then
  echo "  ✅ PASS: All $SPEC_AC_COUNT ACs from spec mapped in coverage table"
  ((PASSED_CHECKS++))
else
  echo "  ❌ FAIL: Spec has $SPEC_AC_COUNT ACs, but plan only maps $PLAN_AC_COUNT unique ACs"
  FAILED_CHECKS+=("Incomplete AC coverage mapping")
fi

# Check 7: Implementation Checklist Exists
echo "[7/$TOTAL_CHECKS] Checking Implementation Checklist..."
if grep -q "^## Implementation Checklist" "$PLAN_FILE"; then
  echo "  ✅ PASS: Implementation Checklist section found"
  ((PASSED_CHECKS++))
else
  echo "  ❌ FAIL: Implementation Checklist section missing"
  FAILED_CHECKS+=("Implementation Checklist missing")
fi

# Check 8: Regression Test Strategy Section Exists
echo "[8/$TOTAL_CHECKS] Checking Regression Test Strategy section..."
if grep -q "^## Regression Test Strategy" "$PLAN_FILE"; then
  # Verify section has content about affected features
  if grep -q "Affected Feature" "$PLAN_FILE" && grep -q "/sop-regression-verification" "$PLAN_FILE"; then
    echo "  ✅ PASS: Regression Test Strategy section found with required content"
    ((PASSED_CHECKS++))
  else
    echo "  ❌ FAIL: Regression Test Strategy section incomplete (missing affected features or verification command)"
    FAILED_CHECKS+=("Regression Test Strategy incomplete")
  fi
else
  echo "  ❌ FAIL: Regression Test Strategy section missing"
  FAILED_CHECKS+=("Regression Test Strategy section missing")
fi

# Calculate score
SCORE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "DoD Validation Results"
echo "═══════════════════════════════════════════════════════════"
echo "Passed: $PASSED_CHECKS/$TOTAL_CHECKS"
echo "Score: $SCORE%"
echo ""

if [ "${#FAILED_CHECKS[@]}" -gt 0 ]; then
  echo "Failed Checks:"
  for check in "${FAILED_CHECKS[@]}"; do
    echo "  - $check"
  done
  echo ""
fi

# Write DoD grade file
DOD_GRADE_FILE="$(dirname "$PLAN_FILE")/dod-grade.md"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$DOD_GRADE_FILE" <<EOF
# DoD Grade: Plan Phase

**Timestamp:** $TIMESTAMP
**Score:** $SCORE%
**Status:** $([ "$SCORE" -eq 100 ] && echo "PASS" || echo "FAIL")

## Validation Results

**Passed Checks:** $PASSED_CHECKS/$TOTAL_CHECKS

EOF

if [ "${#FAILED_CHECKS[@]}" -gt 0 ]; then
  cat >> "$DOD_GRADE_FILE" <<EOF
## Failed Checks

EOF
  for check in "${FAILED_CHECKS[@]}"; do
    echo "- $check" >> "$DOD_GRADE_FILE"
  done
  echo "" >> "$DOD_GRADE_FILE"
fi

cat >> "$DOD_GRADE_FILE" <<EOF
## Criteria Checklist

EOF

# Check 1: Architectural Decisions
if [ "$(grep -c "^## Architectural Decisions" "$PLAN_FILE" || echo 0)" -gt 0 ] || [ "$BLOCKING_COUNT" -eq 0 ]; then
  echo "- [x] Architectural Decisions resolved (if blocking decisions exist)" >> "$DOD_GRADE_FILE"
else
  echo "- [ ] Architectural Decisions resolved (if blocking decisions exist)" >> "$DOD_GRADE_FILE"
fi

# Check 2: No unresolved markers
UNRESOLVED_GRADE=0
if grep -q "DECISION REQUIRED" "$PLAN_FILE" 2>/dev/null; then UNRESOLVED_GRADE=1; fi
if grep -q "TODO.*decision" "$PLAN_FILE" 2>/dev/null; then UNRESOLVED_GRADE=1; fi
if grep -q "🚨.*decision" "$PLAN_FILE" 2>/dev/null; then UNRESOLVED_GRADE=1; fi

if [ "$UNRESOLVED_GRADE" -eq 0 ]; then
  echo "- [x] No unresolved decision markers" >> "$DOD_GRADE_FILE"
else
  echo "- [ ] No unresolved decision markers" >> "$DOD_GRADE_FILE"
fi

# Check 3-8: Simple checks
grep -q "^## Files to Modify" "$PLAN_FILE" && echo "- [x] Files to Modify/Create section present" >> "$DOD_GRADE_FILE" || echo "- [ ] Files to Modify/Create section present" >> "$DOD_GRADE_FILE"
grep -q "^## Test Strategy" "$PLAN_FILE" && echo "- [x] Test Strategy section present" >> "$DOD_GRADE_FILE" || echo "- [ ] Test Strategy section present" >> "$DOD_GRADE_FILE"
grep -q "^### AC Coverage Map" "$PLAN_FILE" && echo "- [x] AC Coverage Map table present" >> "$DOD_GRADE_FILE" || echo "- [ ] AC Coverage Map table present" >> "$DOD_GRADE_FILE"
[ "$SPEC_AC_COUNT" -eq "$PLAN_AC_COUNT" ] && echo "- [x] All ACs from spec mapped ($PLAN_AC_COUNT/$SPEC_AC_COUNT)" >> "$DOD_GRADE_FILE" || echo "- [ ] All ACs from spec mapped ($PLAN_AC_COUNT/$SPEC_AC_COUNT)" >> "$DOD_GRADE_FILE"
grep -q "^## Implementation Checklist" "$PLAN_FILE" && echo "- [x] Implementation Checklist present" >> "$DOD_GRADE_FILE" || echo "- [ ] Implementation Checklist present" >> "$DOD_GRADE_FILE"

# Check 8: Regression Test Strategy with verification command
if grep -q "^## Regression Test Strategy" "$PLAN_FILE" && grep -q "/sop-regression-verification" "$PLAN_FILE"; then
  echo "- [x] Regression Test Strategy present with verification command" >> "$DOD_GRADE_FILE"
else
  echo "- [ ] Regression Test Strategy present with verification command" >> "$DOD_GRADE_FILE"
fi

cat >> "$DOD_GRADE_FILE" <<EOF

---

**Generated by:** validate-dod.sh
**Plan File:** $PLAN_FILE
**Research File:** $RESEARCH_FILE
**Spec File:** $SPEC_FILE
EOF

echo "DoD grade written to: $DOD_GRADE_FILE"
echo ""

# Exit with appropriate code
if [ "$SCORE" -eq 100 ]; then
  echo "✅ RESULT: PASS"
  exit 0
else
  echo "❌ RESULT: FAIL"
  exit 1
fi
