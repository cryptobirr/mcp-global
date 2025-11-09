#!/usr/bin/env bash
# DoD Validation Script for Implementation Plan
# Issue: #14 - Stream Error Handler Test Coverage
# Created: 2025-11-06T21:27:00Z

set -euo pipefail

# Arguments
PLAN_FILE="${1:-}"
RESEARCH_FILE="${2:-}"
SPEC_FILE="${3:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation results
SCORE=0
MAX_SCORE=100
GAPS=()

# Output functions
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; GAPS+=("$1"); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Validate arguments
if [[ -z "$PLAN_FILE" ]] || [[ ! -f "$PLAN_FILE" ]]; then
  echo "Error: Plan file not found: $PLAN_FILE"
  exit 1
fi

if [[ -z "$RESEARCH_FILE" ]] || [[ ! -f "$RESEARCH_FILE" ]]; then
  echo "Error: Research file not found: $RESEARCH_FILE"
  exit 1
fi

if [[ -z "$SPEC_FILE" ]] || [[ ! -f "$SPEC_FILE" ]]; then
  echo "Error: Spec file not found: $SPEC_FILE"
  exit 1
fi

echo "=== DoD Validation for Issue #14 ==="
echo "Plan: $PLAN_FILE"
echo "Research: $RESEARCH_FILE"
echo "Spec: $SPEC_FILE"
echo ""

# Check 1: Architectural Decisions Section (15 points)
echo "Check 1: Architectural Decisions Section"
if grep -q "^## Architectural Decisions" "$PLAN_FILE"; then
  # Count resolved decisions
  DECISION_COUNT=$(grep -c "^### AD-[0-9]\+:" "$PLAN_FILE" || echo "0")

  if [[ "$DECISION_COUNT" -gt 0 ]]; then
    pass "Found $DECISION_COUNT architectural decision(s) with proper format (AD-1:, AD-2:, etc.)"
    SCORE=$((SCORE + 15))

    # Verify no unresolved markers
    if grep -qE "(TODO|DECISION REQUIRED|TBD|🚨)" "$PLAN_FILE" 2>/dev/null; then
      fail "Found unresolved decision markers (TODO, DECISION REQUIRED, TBD, or 🚨)"
      SCORE=$((SCORE - 15))
    else
      pass "No unresolved decision markers found"
    fi
  else
    fail "Architectural Decisions section exists but no decisions with format AD-N: found"
  fi
else
  # Check if there were blocking decisions in research
  BLOCKING_COUNT=$(grep -c "🚨" "$RESEARCH_FILE" || echo "0")
  if [[ "$BLOCKING_COUNT" -gt 0 ]]; then
    fail "Research has $BLOCKING_COUNT blocking decision(s) but plan has no Architectural Decisions section"
  else
    warn "No Architectural Decisions section (acceptable if research had no blocking decisions)"
    SCORE=$((SCORE + 15))
  fi
fi
echo ""

# Check 2: AC Coverage Map (20 points)
echo "Check 2: AC Coverage Map"
if grep -q "^### AC Coverage Map" "$PLAN_FILE"; then
  pass "AC Coverage Map section found"

  # Count ACs in spec
  SPEC_AC_COUNT=$(grep -cE "^\*\*AC[0-9]+:" "$SPEC_FILE" || echo "0")

  # Count ACs in coverage map (first column only)
  PLAN_AC_COUNT=$(grep -E "^\| AC[0-9]+ \|" "$PLAN_FILE" | wc -l | tr -d ' ')

  if [[ "$PLAN_AC_COUNT" -ge "$SPEC_AC_COUNT" ]] && [[ "$SPEC_AC_COUNT" -gt 0 ]]; then
    pass "All $SPEC_AC_COUNT ACs from spec covered in map"
    SCORE=$((SCORE + 20))
  else
    fail "AC coverage incomplete: spec has $SPEC_AC_COUNT ACs, map has $PLAN_AC_COUNT"
  fi
else
  fail "AC Coverage Map section not found (must be exactly '### AC Coverage Map')"
fi
echo ""

# Check 3: Files to Modify/Create Section (15 points)
echo "Check 3: Files to Modify/Create Section"
if grep -q "^## Files to Modify" "$PLAN_FILE"; then
  pass "Files to Modify section found"

  # Check for file path headers
  FILE_COUNT=$(grep -cE "^### File: \`.*\`$" "$PLAN_FILE" || echo "0")

  if [[ "$FILE_COUNT" -gt 0 ]]; then
    pass "Found $FILE_COUNT file(s) with proper format (### File: \`path\`)"
    SCORE=$((SCORE + 15))

    # Verify current/target code blocks exist
    CURRENT_CODE_COUNT=$(grep -c "^\*\*Current Code:\*\*" "$PLAN_FILE" || echo "0")
    TARGET_CODE_COUNT=$(grep -c "^\*\*Target Code:\*\*" "$PLAN_FILE" || echo "0")

    if [[ "$CURRENT_CODE_COUNT" -gt 0 ]] && [[ "$TARGET_CODE_COUNT" -gt 0 ]]; then
      pass "Current and Target code blocks found"
    else
      warn "Missing Current Code or Target Code blocks (found $CURRENT_CODE_COUNT current, $TARGET_CODE_COUNT target)"
    fi
  else
    fail "No files with proper format found"
  fi
else
  fail "Files to Modify section not found"
fi
echo ""

# Check 4: Implementation Checklist (15 points)
echo "Check 4: Implementation Checklist"
if grep -q "^## Implementation Checklist" "$PLAN_FILE"; then
  pass "Implementation Checklist section found"

  # Count checklist items
  CHECKLIST_COUNT=$(grep -cE "^- \[ \]" "$PLAN_FILE" || echo "0")

  if [[ "$CHECKLIST_COUNT" -ge 10 ]]; then
    pass "Found $CHECKLIST_COUNT checklist items (≥10 required)"
    SCORE=$((SCORE + 15))
  else
    fail "Insufficient checklist items: found $CHECKLIST_COUNT, need ≥10"
  fi
else
  fail "Implementation Checklist section not found"
fi
echo ""

# Check 5: Test Strategy with NO MOCKS (15 points)
echo "Check 5: Test Strategy with NO MOCKS"
if grep -q "^## Test Strategy" "$PLAN_FILE"; then
  pass "Test Strategy section found"

  # Check for NO MOCKS statement
  if grep -qi "NO MOCKS" "$PLAN_FILE"; then
    pass "NO MOCKS policy stated"
    SCORE=$((SCORE + 10))
  else
    fail "NO MOCKS policy not found"
  fi

  # Check for test infrastructure definition
  if grep -q "Test Infrastructure" "$PLAN_FILE"; then
    pass "Test Infrastructure defined"
    SCORE=$((SCORE + 5))
  else
    warn "Test Infrastructure section not found"
  fi
else
  fail "Test Strategy section not found"
fi
echo ""

# Check 6: Regression Test Strategy (10 points)
echo "Check 6: Regression Test Strategy"
if grep -q "^## Regression Test Strategy" "$PLAN_FILE"; then
  pass "Regression Test Strategy section found"

  # Check for affected features from research
  if grep -q "### Affected Features from Research" "$PLAN_FILE" || grep -q "#### Affected Feature" "$PLAN_FILE"; then
    pass "Affected features documented"
    SCORE=$((SCORE + 5))
  else
    fail "Affected features not documented"
  fi

  # Check for regression test execution plan
  if grep -qi "Regression Test Execution Plan" "$PLAN_FILE" || grep -qi "npm test" "$PLAN_FILE"; then
    pass "Regression test execution plan found"
    SCORE=$((SCORE + 5))
  else
    fail "Regression test execution plan not found"
  fi
else
  fail "Regression Test Strategy section not found (CRITICAL: required per SOP Phase 5.5)"
fi
echo ""

# Check 7: Definition of Done (10 points)
echo "Check 7: Definition of Done"
if grep -q "^## Definition of Done" "$PLAN_FILE"; then
  pass "Definition of Done section found"

  # Count DoD items
  DOD_COUNT=$(grep -cE "^- \[ \]" "$PLAN_FILE" | tail -1 || echo "0")

  if [[ "$DOD_COUNT" -ge 4 ]]; then
    pass "Found DoD items (≥4 required)"
    SCORE=$((SCORE + 5))
  else
    warn "Few DoD items found (this is acceptable if comprehensive)"
    SCORE=$((SCORE + 5))
  fi

  # Check for regression testing in DoD
  if grep -q "Regression" "$PLAN_FILE" | tail -10; then
    pass "Regression testing mentioned in DoD"
    SCORE=$((SCORE + 5))
  else
    fail "Regression testing not mentioned in DoD"
  fi
else
  fail "Definition of Done section not found"
fi
echo ""

# Final score calculation
echo "=== Validation Summary ==="
echo "Score: $SCORE / $MAX_SCORE"

if [[ ${#GAPS[@]} -gt 0 ]]; then
  echo ""
  echo "Gaps to address:"
  for gap in "${GAPS[@]}"; do
    echo "  - $gap"
  done
fi

# Generate DoD grade file
GRADE_FILE="$(dirname "$PLAN_FILE")/dod-grade.md"
cat > "$GRADE_FILE" <<EOF
# DoD Validation Grade

**Issue:** #14
**Plan Version:** v1
**Validation Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Score:** $SCORE / $MAX_SCORE

## Validation Results

### Check 1: Architectural Decisions (15 points)
$(grep -q "^## Architectural Decisions" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

### Check 2: AC Coverage Map (20 points)
$(grep -q "^### AC Coverage Map" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

### Check 3: Files to Modify/Create (15 points)
$(grep -q "^## Files to Modify" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

### Check 4: Implementation Checklist (15 points)
$(grep -q "^## Implementation Checklist" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

### Check 5: Test Strategy with NO MOCKS (15 points)
$(grep -q "^## Test Strategy" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

### Check 6: Regression Test Strategy (10 points)
$(grep -q "^## Regression Test Strategy" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

### Check 7: Definition of Done (10 points)
$(grep -q "^## Definition of Done" "$PLAN_FILE" && echo "✅ PASS" || echo "❌ FAIL")

## Gaps Identified

EOF

if [[ ${#GAPS[@]} -gt 0 ]]; then
  for gap in "${GAPS[@]}"; do
    echo "- $gap" >> "$GRADE_FILE"
  done
else
  echo "No gaps identified. Plan meets all DoD criteria." >> "$GRADE_FILE"
fi

echo ""
echo "DoD grade written to: $GRADE_FILE"

# Exit with appropriate code
if [[ "$SCORE" -ge 85 ]]; then
  echo -e "${GREEN}✅ PASS${NC} - Plan meets DoD criteria (≥85%)"
  exit 0
else
  echo -e "${RED}❌ FAIL${NC} - Plan needs revision (<85%)"
  exit 1
fi
