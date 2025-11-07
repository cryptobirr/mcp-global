#!/bin/bash
#
# DoD Validation Script for Implementation Plan
# Usage: validate-dod.sh <plan-file> [research-file] [spec-file]
#

set -euo pipefail

PLAN_FILE="${1:-}"
RESEARCH_FILE="${2:-}"
SPEC_FILE="${3:-}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Validation results
PASS=0
FAIL=1
SCORE=0
MAX_SCORE=8  # Updated to 8 critical checks
GAPS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate plan file exists
if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
  echo -e "${RED}❌ ERROR: Plan file not found: $PLAN_FILE${NC}"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "DoD Validation for Implementation Plan"
echo "═══════════════════════════════════════════════════════════"
echo "Plan: $PLAN_FILE"
echo "Timestamp: $TIMESTAMP"
echo ""

# Check 1: Architectural Decisions section exists (if research has blocking decisions)
echo -n "Check 1: Architectural Decisions... "
if grep -q "🚨" "$RESEARCH_FILE" 2>/dev/null; then
  if grep -q "^## Architectural Decisions" "$PLAN_FILE"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((SCORE++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    GAPS+=("Missing 'Architectural Decisions' section (research has blocking decisions)")
  fi
else
  # No blocking decisions in research, check if section exists
  if grep -q "^## Architectural Decisions" "$PLAN_FILE"; then
    echo -e "${GREEN}✓ PASS${NC} (section exists)"
    ((SCORE++))
  else
    echo -e "${YELLOW}⊘ SKIP${NC} (no blocking decisions in research)"
    ((SCORE++))  # Don't penalize if not needed
  fi
fi

# Check 2: AC Coverage Map exists and is properly formatted
echo -n "Check 2: AC Coverage Map... "
if grep -q "^### AC Coverage Map" "$PLAN_FILE"; then
  # Verify table format (first column should be just AC identifiers)
  if grep -A 5 "^### AC Coverage Map" "$PLAN_FILE" | grep -q "^| AC1 "; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((SCORE++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    GAPS+=("AC Coverage Map table first column must contain ONLY AC identifiers (e.g., 'AC1', 'AC2')")
  fi
else
  echo -e "${RED}✗ FAIL${NC}"
  GAPS+=("Missing 'AC Coverage Map' section")
fi

# Check 3: All ACs from spec are mapped
echo -n "Check 3: All ACs mapped... "
if [ -n "$SPEC_FILE" ] && [ -f "$SPEC_FILE" ]; then
  SPEC_ACS=$(grep -oE "AC[0-9]+" "$SPEC_FILE" | sort -u || echo "")
  PLAN_ACS=$(grep -oE "AC[0-9]+" "$PLAN_FILE" | sort -u || echo "")

  MISSING_ACS=()
  for ac in $SPEC_ACS; do
    if ! echo "$PLAN_ACS" | grep -q "$ac"; then
      MISSING_ACS+=("$ac")
    fi
  done

  if [ ${#MISSING_ACS[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((SCORE++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    GAPS+=("Missing AC mapping for: ${MISSING_ACS[*]}")
  fi
else
  # For test-gap issues without traditional spec, check issue body
  echo -e "${YELLOW}⊘ SKIP${NC} (no spec file - test-gap issue)"
  ((SCORE++))  # Don't penalize test-gap issues
fi

# Check 4: Test Strategy section exists
echo -n "Check 4: Test Strategy section... "
if grep -q "^## Test Strategy" "$PLAN_FILE"; then
  echo -e "${GREEN}✓ PASS${NC}"
  ((SCORE++))
else
  echo -e "${RED}✗ FAIL${NC}"
  GAPS+=("Missing 'Test Strategy' section")
fi

# Check 5: NO MOCKS policy enforced
echo -n "Check 5: NO MOCKS policy... "
if grep -q "NO MOCKS" "$PLAN_FILE"; then
  echo -e "${GREEN}✓ PASS${NC}"
  ((SCORE++))
else
  echo -e "${RED}✗ FAIL${NC}"
  GAPS+=("Missing NO MOCKS policy documentation")
fi

# Check 6: Implementation Checklist exists
echo -n "Check 6: Implementation Checklist... "
if grep -q "^## Implementation Checklist" "$PLAN_FILE"; then
  echo -e "${GREEN}✓ PASS${NC}"
  ((SCORE++))
else
  echo -e "${RED}✗ FAIL${NC}"
  GAPS+=("Missing 'Implementation Checklist' section")
fi

# Check 7: Regression Test Strategy section exists
echo -n "Check 7: Regression Test Strategy... "
if grep -q "^## Regression Test Strategy" "$PLAN_FILE"; then
  # Verify regression section references /sop-regression-verification (if not test-gap)
  if [ -n "$RESEARCH_FILE" ] && [ -f "$RESEARCH_FILE" ]; then
    if grep -q "Regression Test Execution Plan" "$PLAN_FILE"; then
      echo -e "${GREEN}✓ PASS${NC}"
      ((SCORE++))
    else
      echo -e "${RED}✗ FAIL${NC}"
      GAPS+=("Regression Test Strategy missing 'Regression Test Execution Plan' section")
    fi
  else
    echo -e "${GREEN}✓ PASS${NC} (section exists)"
    ((SCORE++))
  fi
else
  echo -e "${RED}✗ FAIL${NC}"
  GAPS+=("Missing 'Regression Test Strategy' section")
fi

# Check 8: Definition of Done section exists
echo -n "Check 8: Definition of Done... "
if grep -q "^## Definition of Done" "$PLAN_FILE"; then
  echo -e "${GREEN}✓ PASS${NC}"
  ((SCORE++))
else
  echo -e "${RED}✗ FAIL${NC}"
  GAPS+=("Missing 'Definition of Done' section")
fi

# Calculate percentage
PERCENTAGE=$((SCORE * 100 / MAX_SCORE))

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Results"
echo "═══════════════════════════════════════════════════════════"
echo "Score: $SCORE/$MAX_SCORE ($PERCENTAGE%)"

# Create DoD grade file
GRADE_FILE="$(dirname "$PLAN_FILE")/dod-grade.md"
cat > "$GRADE_FILE" <<EOF
# DoD Validation Grade

**Plan:** $(basename "$PLAN_FILE")
**Timestamp:** $TIMESTAMP
**Score:** $SCORE/$MAX_SCORE ($PERCENTAGE%)

## Validation Results

EOF

if [ $SCORE -eq $MAX_SCORE ]; then
  echo -e "${GREEN}✅ PASS - Plan meets DoD criteria${NC}"
  cat >> "$GRADE_FILE" <<EOF
**Result:** ✅ PASS

All DoD criteria met. Plan is ready for implementation.

EOF
  exit 0
else
  echo -e "${RED}❌ FAIL - Plan does not meet DoD criteria${NC}"
  echo ""
  echo "Gaps identified:"

  cat >> "$GRADE_FILE" <<EOF
**Result:** ❌ FAIL ($PERCENTAGE%)

## Gaps Identified

EOF

  for gap in "${GAPS[@]}"; do
    echo -e "${RED}  - $gap${NC}"
    echo "- $gap" >> "$GRADE_FILE"
  done

  exit 1
fi
