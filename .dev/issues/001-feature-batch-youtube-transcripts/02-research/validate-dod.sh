#!/bin/bash
# DoD Validation Script for Research Phase
# Auto-generated validation checklist

RESEARCH_FILE="/Users/mekonen/.mcp-global/.dev/issues/001-feature-batch-youtube-transcripts/02-research/research.md"

echo "=== Research Phase - Definition of Done Validation ==="
echo ""

# Check if research file exists
if [ ! -f "$RESEARCH_FILE" ]; then
  echo "❌ FAIL: Research file not found at $RESEARCH_FILE"
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0

# DoD Criteria Checks

echo "1. Architecture Overview"
if grep -q "## 1. Current Architecture Overview" "$RESEARCH_FILE" && \
   grep -q "Project Structure" "$RESEARCH_FILE" && \
   grep -q "Core Dependencies" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Architecture overview documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Architecture overview missing or incomplete"
  ((FAIL_COUNT++))
fi

echo "2. Existing Implementation Analysis"
if grep -q "## 2. Existing Tool Implementation Analysis" "$RESEARCH_FILE" && \
   grep -q "Tool Registration Pattern" "$RESEARCH_FILE" && \
   grep -q "Tool Execution Pattern" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Existing implementation analyzed"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Existing implementation analysis missing"
  ((FAIL_COUNT++))
fi

echo "3. Request Throttling Architecture"
if grep -q "## 3. Request Throttling Architecture" "$RESEARCH_FILE" && \
   grep -q "Throttler Design" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Throttling architecture documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Throttling architecture missing"
  ((FAIL_COUNT++))
fi

echo "4. Security & Validation Patterns"
if grep -q "## 4. Security & Validation Patterns" "$RESEARCH_FILE" && \
   grep -q "Path Validation Function" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Security patterns documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Security patterns missing"
  ((FAIL_COUNT++))
fi

echo "5. Testing Infrastructure"
if grep -q "## 5. Testing Infrastructure" "$RESEARCH_FILE" && \
   grep -q "Test Organization" "$RESEARCH_FILE" && \
   grep -q "Test Patterns" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Testing infrastructure documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Testing infrastructure missing"
  ((FAIL_COUNT++))
fi

echo "6. File I/O & Path Handling"
if grep -q "## 6. File I/O & Path Handling Patterns" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: File I/O patterns documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: File I/O patterns missing"
  ((FAIL_COUNT++))
fi

echo "7. Refactoring Opportunities"
if grep -q "## 7. Refactoring Opportunities" "$RESEARCH_FILE" && \
   grep -q "Extract Single Transcript Processing" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Refactoring opportunities identified"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Refactoring opportunities missing"
  ((FAIL_COUNT++))
fi

echo "8. Integration Points"
if grep -q "## 8. Integration Points for Batch Feature" "$RESEARCH_FILE" && \
   grep -q "Tool Registration" "$RESEARCH_FILE" && \
   grep -q "Tool Execution Handler" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Integration points documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Integration points missing"
  ((FAIL_COUNT++))
fi

echo "9. Risk Assessment"
if grep -q "## 9. Risk Assessment & Mitigation" "$RESEARCH_FILE" && \
   grep -q "Technical Risks" "$RESEARCH_FILE" && \
   grep -q "Performance Risks" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Risk assessment documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Risk assessment missing"
  ((FAIL_COUNT++))
fi

echo "10. Blocking Decisions"
if grep -q "## 10. Blocking Decisions" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Blocking decisions documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Blocking decisions missing"
  ((FAIL_COUNT++))
fi

echo "11. Affected Features"
if grep -q "## 11. Affected Features & Integration Points" "$RESEARCH_FILE" && \
   grep -q "Regression Risk Mapping" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Affected features documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Affected features missing"
  ((FAIL_COUNT++))
fi

echo "12. Complexity Assessment"
if grep -q "## 12. Implementation Complexity Assessment" "$RESEARCH_FILE" && \
   grep -q "Complexity Metrics" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Complexity assessment documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Complexity assessment missing"
  ((FAIL_COUNT++))
fi

echo "13. Testing Strategy"
if grep -q "## 13. Testing Strategy" "$RESEARCH_FILE" && \
   grep -q "Unit Test Plan" "$RESEARCH_FILE" && \
   grep -q "Integration Test Plan" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Testing strategy documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Testing strategy missing"
  ((FAIL_COUNT++))
fi

echo "14. Documentation Requirements"
if grep -q "## 14. Documentation Requirements" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Documentation requirements documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Documentation requirements missing"
  ((FAIL_COUNT++))
fi

echo "15. Feasibility & Recommendation"
if grep -q "## 15. Feasibility & Recommendation" "$RESEARCH_FILE" && \
   grep -q "Feasibility Score" "$RESEARCH_FILE" && \
   grep -q "Complexity Score" "$RESEARCH_FILE" && \
   grep -q "Approach:" "$RESEARCH_FILE"; then
  echo "   ✅ PASS: Feasibility and recommendation documented"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL: Feasibility and recommendation missing"
  ((FAIL_COUNT++))
fi

echo ""
echo "=== Summary ==="
echo "Total Checks: $((PASS_COUNT + FAIL_COUNT))"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo "Score: $((PASS_COUNT * 100 / (PASS_COUNT + FAIL_COUNT)))%"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo "✅ ALL CHECKS PASSED - Research meets Definition of Done"
  exit 0
else
  echo "❌ SOME CHECKS FAILED - Research needs revision"
  exit 1
fi
