#!/bin/bash

# DoD Validation Script for YouTube MCP Server Test Coverage Fix
# Usage: ./validate-dod.sh <plan_file> <research_file> <spec_file>

set -euo pipefail

PLAN_FILE="$1"
RESEARCH_FILE="$2"
SPEC_FILE="$3"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation results
PASSED_CHECKS=0
TOTAL_CHECKS=0
DOD_SCORE=0
FAILURES=()

echo "🔍 DoD Validation Started at $TIMESTAMP"
echo "======================================"

# Helper function to check a requirement
check_requirement() {
    local description="$1"
    local check_command="$2"

    echo -n "Checking: $description ... "
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if eval "$check_command"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}FAIL${NC}"
        FAILURES+=("$description")
    fi
}

# Helper function to check file content
check_file_content() {
    local file="$1"
    local pattern="$2"
    local description="$3"

    echo -n "Checking: $description ... "
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [[ -f "$file" ]] && grep -q "$pattern" "$file"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}FAIL${NC}"
        FAILURES+=("$description")
    fi
}

# 1. Plan Structure Validation
echo "📋 Plan Structure Validation"
echo "---------------------------"

check_requirement "Plan file exists" "[[ -f '$PLAN_FILE' ]]"
check_requirement "Plan has proper header" "grep -q '^# Implementation Plan:' '$PLAN_FILE'"
check_requirement "Plan has issue reference" "grep -q '^# Issue:' '$PLAN_FILE'"
check_requirement "Plan has approach specified" "grep -q '^# Approach:' '$PLAN_FILE'"
check_requirement "Plan has creation timestamp" "grep -q '^# Created:' '$PLAN_FILE'"
check_requirement "Plan has version" "grep -q '^# Version:' '$PLAN_FILE'"

# 2. Architectural Decisions Validation
echo ""
echo "🏗️  Architectural Decisions Validation"
echo "------------------------------------"

check_file_content "$PLAN_FILE" "^## Architectural Decisions" "Architectural Decisions section exists"
check_file_content "$PLAN_FILE" "^### AD-1:" "First architectural decision documented"
check_file_content "$PLAN_FILE" "^### AD-2:" "Second architectural decision documented"
check_file_content "$PLAN_FILE" "Rationale:" "Rationale provided for decisions"
check_file_content "$PLAN_FILE" "Trade-offs:" "Trade-offs documented for decisions"

# 3. AC Coverage Map Validation
echo ""
echo "📊 AC Coverage Map Validation"
echo "----------------------------"

check_file_content "$PLAN_FILE" "^### AC Coverage Map" "AC Coverage Map section exists"
check_file_content "$PLAN_FILE" "| AC | Test Type | Test Location |" "AC Coverage Map table format correct"

# Check that all ACs from spec are covered
AC_COUNT=$(grep -c "^AC[0-9]" "$SPEC_FILE" || echo "0")
echo "Checking AC coverage: Found $AC_COUNT ACs in spec"

for i in {1..9}; do
    check_file_content "$PLAN_FILE" "| AC$i |" "AC$i is covered in test plan"
done

# 4. Files to Modify/Create Validation
echo ""
echo "📁 Files Structure Validation"
echo "-----------------------------"

check_file_content "$PLAN_FILE" "^## Files to Modify/Create" "Files section exists"
check_file_content "$PLAN_FILE" "^### Files to Modify" "Files to Modify subsection exists"
check_file_content "$PLAN_FILE" "#### File: \`tests/streaming.test.ts\`" "Key file identified for modification"
check_file_content "$PLAN_FILE" "^### New Files to Create" "New Files subsection exists"

# 5. Regression Test Strategy Validation
echo ""
echo "🔄 Regression Test Strategy Validation"
echo "--------------------------------------"

check_file_content "$PLAN_FILE" "^### Regression Test Strategy" "Regression Test Strategy section exists"
check_file_content "$PLAN_FILE" "Feature 1: Transcript Fetching Logic" "Feature 1 regression coverage"
check_file_content "$PLAN_FILE" "Feature 2: File Output Generation" "Feature 2 regression coverage"
check_file_content "$PLAN_FILE" "Feature 3: MCP Tool Registration" "Feature 3 regression coverage"
check_file_content "$PLAN_FILE" "Feature 4: Error Handling" "Feature 4 regression coverage"
check_file_content "$PLAN_FILE" "Total Regression Tests Required:" "Total regression test count specified"
check_file_content "$PLAN_FILE" "/sop-regression-verification 18" "Regression verification command referenced"

# 6. Implementation Checklist Validation
echo ""
echo "✅ Implementation Checklist Validation"
echo "------------------------------------"

check_file_content "$PLAN_FILE" "^## Implementation Checklist" "Implementation Checklist section exists"
check_file_content "$PLAN_FILE" "### Setup" "Setup phase in checklist"
check_file_content "$PLAN_FILE" "### Phase 1:" "Phase 1 in checklist"
check_file_content "$PLAN_FILE" "### Final Verification" "Final verification in checklist"

# 7. Definition of Done Validation
echo ""
echo "🎯 Definition of Done Validation"
echo "-------------------------------"

check_file_content "$PLAN_FILE" "^## Definition of Done" "Definition of Done section exists"
check_file_content "$PLAN_FILE" ">80% line coverage" "Coverage target specified"
check_file_content "$PLAN_FILE" "All spec requirements met" "Spec requirements verification"
check_file_content "$PLAN_FILE" "No regressions" "Regression requirement included"
check_file_content "$PLAN_FILE" "MCP protocol compliance" "MCP compliance verification"

# 8. Critical Content Validation
echo ""
echo "⚠️  Critical Content Validation"
echo "-----------------------------"

# Check for blocking decisions resolution
BLOCKING_DECISIONS=$(grep -c "🚨" "$RESEARCH_FILE" || echo "0")
echo "Checking: All $BLOCKING_DECISIONS blocking decisions resolved in plan"

if [[ $BLOCKING_DECISIONS -eq 2 ]]; then
    check_file_content "$PLAN_FILE" "AD-1:" "Decision 1 resolved"
    check_file_content "$PLAN_FILE" "AD-2:" "Decision 2 resolved"
fi

# Check for brownfield approach
check_file_content "$PLAN_FILE" "BROWNFIELD" "Brownfield approach correctly identified"

# Check for test infrastructure
check_file_content "$PLAN_FILE" "Vitest" "Vitest framework specified"
check_file_content "$PLAN_FILE" "vi\\.mock" "Mock strategy specified"

# 9. Cross-Reference Validation
echo ""
echo "🔗 Cross-Reference Validation"
echo "---------------------------"

# Check that plan addresses spec requirements
check_file_content "$PLAN_FILE" "youtube-transcript" "YouTube API dependency addressed"
check_file_content "$PLAN_FILE" "@modelcontextprotocol/sdk" "MCP SDK dependency addressed"
check_file_content "$PLAN_FILE" "security" "Security requirements addressed"

# Check that plan uses research findings
check_file_content "$PLAN_FILE" "src/index.ts" "Key implementation file referenced"
check_file_content "$PLAN_FILE" "tests/streaming.test.ts" "Current test file referenced"

# 10. Format and Completeness Validation
echo ""
echo "📝 Format and Completeness Validation"
echo "------------------------------------"

check_requirement "Plan has minimum 20 implementation checklist items" "[[ \$(grep -c '^- \[' '$PLAN_FILE') -ge 20 ]]"
check_requirement "Plan has proper markdown formatting" "grep -q '^#' '$PLAN_FILE' && grep -q '^##' '$PLAN_FILE'"

# Calculate DoD Score
DOD_SCORE=$(( PASSED_CHECKS * 100 / TOTAL_CHECKS ))

# Final Results
echo ""
echo "🏁 DoD Validation Results"
echo "========================="
echo "Timestamp: $TIMESTAMP"
echo "Total Checks: $TOTAL_CHECKS"
echo "Passed Checks: $PASSED_CHECKS"
echo "Failed Checks: $((TOTAL_CHECKS - PASSED_CHECKS))"
echo "DoD Score: ${DOD_SCORE}%"

if [[ ${#FAILURES[@]} -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ FAILED CHECKS:${NC}"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi

echo ""
if [[ $DOD_SCORE -eq 100 ]]; then
    echo -e "${GREEN}✅ DoD VALIDATION PASSED${NC}"
    exit 0
elif [[ $DOD_SCORE -ge 80 ]]; then
    echo -e "${YELLOW}⚠️  DoD VALIDATION PASSED WITH MINOR ISSUES${NC}"
    exit 0
else
    echo -e "${RED}❌ DoD VALIDATION FAILED${NC}"
    echo "Plan needs revision before proceeding to implementation."
    exit 1
fi