#!/bin/bash

# DoD Validation Script for Issue #9 Plan Phase
# Validates that the implementation plan meets all Definition of Done criteria

PLAN_FILE="$1"
RESEARCH_FILE="$2"
SPEC_FILE="$3"

if [ ! -f "$PLAN_FILE" ]; then
  echo "ERROR: Plan file not found: $PLAN_FILE"
  exit 1
fi

if [ ! -f "$RESEARCH_FILE" ]; then
  echo "ERROR: Research file not found: $RESEARCH_FILE"
  exit 1
fi

if [ ! -f "$SPEC_FILE" ]; then
  echo "ERROR: Spec file not found: $SPEC_FILE"
  exit 1
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SCORE=0
TOTAL_CHECKS=8
GAPS=()

echo "═══════════════════════════════════════════════════════════"
echo "DoD Validation: Plan Phase - Issue #9"
echo "Timestamp: $TIMESTAMP"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check 1: Plan has Summary section
echo "[1/$TOTAL_CHECKS] Checking for Summary section..."
if grep -q "^## Summary" "$PLAN_FILE"; then
  echo "  ✅ PASS: Summary section found"
  ((SCORE++))
else
  echo "  ❌ FAIL: Summary section missing"
  GAPS+=("Summary section missing")
fi
echo ""

# Check 2: Plan has Architectural Decisions section (if blocking decisions exist)
echo "[2/$TOTAL_CHECKS] Checking for Architectural Decisions section..."
BLOCKING_COUNT=$(grep -c "🚨" "$RESEARCH_FILE" || echo "0")
if [ "$BLOCKING_COUNT" -gt 0 ]; then
  if grep -q "^## Architectural Decisions" "$PLAN_FILE"; then
    # Check that decisions are numbered correctly (AD-1:, AD-2:, etc.)
    if grep -E "^### AD-[0-9]+:" "$PLAN_FILE" > /dev/null; then
      echo "  ✅ PASS: Architectural Decisions section found with proper formatting (AD-N:)"
      ((SCORE++))
    else
      echo "  ❌ FAIL: Architectural Decisions section found but decisions not properly formatted (must use ### AD-1:, ### AD-2:, etc.)"
      GAPS+=("Architectural Decisions section has improper formatting (missing AD-N: format)")
    fi
  else
    echo "  ❌ FAIL: Architectural Decisions section missing (research has $BLOCKING_COUNT blocking decisions)"
    GAPS+=("Architectural Decisions section missing (required when blocking decisions exist)")
  fi
else
  echo "  ✅ PASS: No blocking decisions in research, AD section optional"
  ((SCORE++))
fi
echo ""

# Check 3: Plan has Files to Modify section
echo "[3/$TOTAL_CHECKS] Checking for Files to Modify section..."
if grep -q "^## Files to Modify" "$PLAN_FILE"; then
  echo "  ✅ PASS: Files to Modify section found"
  ((SCORE++))
else
  echo "  ❌ FAIL: Files to Modify section missing"
  GAPS+=("Files to Modify section missing")
fi
echo ""

# Check 4: Plan has Test Strategy section with AC Coverage Map
echo "[4/$TOTAL_CHECKS] Checking for Test Strategy with AC Coverage Map..."
if grep -q "^## Test Strategy" "$PLAN_FILE"; then
  if grep -q "^### AC Coverage Map" "$PLAN_FILE"; then
    # Verify AC Coverage Map has proper formatting (first column is just AC identifier)
    # Extract table rows and check first column format
    if grep -A 999 "^### AC Coverage Map" "$PLAN_FILE" | grep "^|" | grep -v "^| AC |" | grep -v "^|-" | head -1 | grep -E "^\| AC[0-9]+ \|" > /dev/null; then
      echo "  ✅ PASS: Test Strategy section with AC Coverage Map found (proper formatting)"
      ((SCORE++))
    else
      echo "  ❌ FAIL: AC Coverage Map found but first column formatting incorrect (must be just AC1, AC2, etc.)"
      GAPS+=("AC Coverage Map has improper formatting (first column must be AC identifier only)")
    fi
  else
    echo "  ❌ FAIL: Test Strategy section found but AC Coverage Map subsection missing"
    GAPS+=("AC Coverage Map subsection missing from Test Strategy")
  fi
else
  echo "  ❌ FAIL: Test Strategy section missing"
  GAPS+=("Test Strategy section missing")
fi
echo ""

# Check 5: All ACs from spec are covered in AC Coverage Map
echo "[5/$TOTAL_CHECKS] Checking AC coverage completeness..."
AC_COUNT=$(grep -c "^\*\*AC[0-9]" "$SPEC_FILE" || echo "0")
if [ "$AC_COUNT" -gt 0 ]; then
  COVERED_ACS=$(grep -A 999 "^### AC Coverage Map" "$PLAN_FILE" | grep "^|" | grep -v "^| AC |" | grep -v "^|-" | grep -oE "AC[0-9]+" | sort -u | wc -l | tr -d ' ')
  if [ "$COVERED_ACS" -eq "$AC_COUNT" ]; then
    echo "  ✅ PASS: All $AC_COUNT ACs from spec are covered in AC Coverage Map"
    ((SCORE++))
  else
    echo "  ❌ FAIL: AC coverage incomplete (spec has $AC_COUNT ACs, map covers $COVERED_ACS)"
    GAPS+=("AC Coverage Map incomplete: spec has $AC_COUNT ACs, map covers $COVERED_ACS")
  fi
else
  echo "  ✅ PASS: No ACs in spec (unusual but valid)"
  ((SCORE++))
fi
echo ""

# Check 6: Plan has Regression Test Strategy section
echo "[6/$TOTAL_CHECKS] Checking for Regression Test Strategy section..."
if grep -q "^## Regression Test Strategy" "$PLAN_FILE"; then
  # Verify regression test strategy references affected features from research
  AFFECTED_FEATURES=$(grep -c "^\*\*Feature [0-9]" "$RESEARCH_FILE" || echo "0")
  if [ "$AFFECTED_FEATURES" -gt 0 ]; then
    # Check if plan has mappings for affected features
    MAPPED_FEATURES=$(grep -c "^#### Affected Feature [0-9]" "$PLAN_FILE" || echo "0")
    if [ "$MAPPED_FEATURES" -eq "$AFFECTED_FEATURES" ]; then
      echo "  ✅ PASS: Regression Test Strategy found with all $AFFECTED_FEATURES affected features mapped"
      ((SCORE++))
    else
      echo "  ❌ FAIL: Regression Test Strategy incomplete (research has $AFFECTED_FEATURES affected features, plan maps $MAPPED_FEATURES)"
      GAPS+=("Regression Test Strategy incomplete: $AFFECTED_FEATURES features in research, only $MAPPED_FEATURES mapped in plan")
    fi
  else
    # No affected features in research, but regression strategy should still exist
    echo "  ✅ PASS: Regression Test Strategy section found"
    ((SCORE++))
  fi
else
  echo "  ❌ FAIL: Regression Test Strategy section missing"
  GAPS+=("Regression Test Strategy section missing")
fi
echo ""

# Check 7: Plan has Implementation Checklist section
echo "[7/$TOTAL_CHECKS] Checking for Implementation Checklist section..."
if grep -q "^## Implementation Checklist" "$PLAN_FILE"; then
  # Count checklist items (lines starting with "- [ ]")
  CHECKLIST_ITEMS=$(grep -c "^- \[ \]" "$PLAN_FILE" || echo "0")
  if [ "$CHECKLIST_ITEMS" -ge 5 ]; then
    echo "  ✅ PASS: Implementation Checklist found with $CHECKLIST_ITEMS items (minimum 5 required)"
    ((SCORE++))
  else
    echo "  ❌ FAIL: Implementation Checklist found but only has $CHECKLIST_ITEMS items (minimum 5 required)"
    GAPS+=("Implementation Checklist too short: $CHECKLIST_ITEMS items (minimum 5 required)")
  fi
else
  echo "  ❌ FAIL: Implementation Checklist section missing"
  GAPS+=("Implementation Checklist section missing")
fi
echo ""

# Check 8: Plan has Definition of Done section
echo "[8/$TOTAL_CHECKS] Checking for Definition of Done section..."
if grep -q "^## Definition of Done" "$PLAN_FILE"; then
  # Check for Regression Testing subsection in DoD
  if grep -A 999 "^## Definition of Done" "$PLAN_FILE" | grep -q "^\*\*Regression Testing:\*\*"; then
    echo "  ✅ PASS: Definition of Done section found with Regression Testing subsection"
    ((SCORE++))
  else
    echo "  ❌ FAIL: Definition of Done section found but missing Regression Testing subsection"
    GAPS+=("Definition of Done missing Regression Testing subsection")
  fi
else
  echo "  ❌ FAIL: Definition of Done section missing"
  GAPS+=("Definition of Done section missing")
fi
echo ""

# Calculate percentage
PERCENTAGE=$((SCORE * 100 / TOTAL_CHECKS))

echo "═══════════════════════════════════════════════════════════"
echo "DoD Validation Results"
echo "═══════════════════════════════════════════════════════════"
echo "Score: $SCORE/$TOTAL_CHECKS ($PERCENTAGE%)"
echo ""

if [ "${#GAPS[@]}" -gt 0 ]; then
  echo "Gaps Identified:"
  for gap in "${GAPS[@]}"; do
    echo "  - $gap"
  done
  echo ""
fi

# Create DoD grade file
DOD_GRADE_FILE="$(dirname "$PLAN_FILE")/dod-grade.md"
cat > "$DOD_GRADE_FILE" <<EOF
# DoD Validation Grade: Plan Phase - Issue #9

**Timestamp:** $TIMESTAMP
**Score:** $SCORE/$TOTAL_CHECKS ($PERCENTAGE%)
**Status:** $([ "$SCORE" -eq "$TOTAL_CHECKS" ] && echo "PASS ✅" || echo "FAIL ❌")

## Validation Results

| Check | Status | Details |
|-------|--------|---------|
| Summary section | $(grep -q "^## Summary" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL") | $(grep -q "^## Summary" "$PLAN_FILE" && echo "Found" || echo "Missing") |
| Architectural Decisions | $([ "$BLOCKING_COUNT" -gt 0 ] && { grep -q "^## Architectural Decisions" "$PLAN_FILE" && grep -E "^### AD-[0-9]+:" "$PLAN_FILE" > /dev/null && echo "✅ PASS" || echo "❌ FAIL"; } || echo "✅ PASS") | $([ "$BLOCKING_COUNT" -gt 0 ] && { grep -q "^## Architectural Decisions" "$PLAN_FILE" && echo "Found with proper formatting" || echo "Missing or improper format"; } || echo "No blocking decisions") |
| Files to Modify section | $(grep -q "^## Files to Modify" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL") | $(grep -q "^## Files to Modify" "$PLAN_FILE" && echo "Found" || echo "Missing") |
| Test Strategy + AC Coverage Map | $(grep -q "^## Test Strategy" "$PLAN_FILE" && grep -q "^### AC Coverage Map" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL") | $(grep -q "^### AC Coverage Map" "$PLAN_FILE" && echo "Found with proper formatting" || echo "Missing or improper format") |
| AC coverage completeness | $([ "$COVERED_ACS" -eq "$AC_COUNT" ] && echo "✅ PASS" || echo "❌ FAIL") | $COVERED_ACS/$AC_COUNT ACs covered |
| Regression Test Strategy | $(grep -q "^## Regression Test Strategy" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL") | $(grep -q "^## Regression Test Strategy" "$PLAN_FILE" && echo "Found" || echo "Missing") |
| Implementation Checklist | $([ "$CHECKLIST_ITEMS" -ge 5 ] && echo "✅ PASS" || echo "❌ FAIL") | $CHECKLIST_ITEMS items (minimum 5) |
| Definition of Done | $(grep -q "^## Definition of Done" "$PLAN_FILE" && grep -A 999 "^## Definition of Done" "$PLAN_FILE" | grep -q "^\*\*Regression Testing:\*\*" && echo "✅ PASS" || echo "❌ FAIL") | $(grep -q "^## Definition of Done" "$PLAN_FILE" && echo "Found" || echo "Missing") |

## Gaps Identified

EOF

if [ "${#GAPS[@]}" -gt 0 ]; then
  for gap in "${GAPS[@]}"; do
    echo "- $gap" >> "$DOD_GRADE_FILE"
  done
else
  echo "No gaps identified - plan meets all DoD criteria ✅" >> "$DOD_GRADE_FILE"
fi

echo "" >> "$DOD_GRADE_FILE"
echo "---" >> "$DOD_GRADE_FILE"
echo "" >> "$DOD_GRADE_FILE"
echo "**Next Steps:**" >> "$DOD_GRADE_FILE"
if [ "$SCORE" -eq "$TOTAL_CHECKS" ]; then
  echo "- Plan is ready for implementation phase" >> "$DOD_GRADE_FILE"
  echo "- Update issue to phase:ready-for-dev" >> "$DOD_GRADE_FILE"
  echo "- Run /sop-implement to begin implementation" >> "$DOD_GRADE_FILE"
else
  echo "- Address gaps identified above" >> "$DOD_GRADE_FILE"
  echo "- Re-run DoD validation after revisions" >> "$DOD_GRADE_FILE"
  echo "- Maximum 3 revision iterations allowed" >> "$DOD_GRADE_FILE"
fi

echo "DoD grade saved to: $DOD_GRADE_FILE"
echo ""

if [ "$SCORE" -eq "$TOTAL_CHECKS" ]; then
  echo "✅ DoD Validation PASSED - Ready for implementation"
  exit 0
else
  echo "❌ DoD Validation FAILED - Revisions required"
  exit 1
fi
