#!/bin/bash
# DoD Validation Script for Research Phase
# Issue: #3 - Request throttling for YouTube MCP Server

RESEARCH_FILE="/Users/mekonen/.mcp-global/.dev/issues/3-request-throttling-youtube-blocking/02-research/research.md"
SCORE=0
MAX_SCORE=100
ISSUES=()

echo "=== Research Report DoD Validation ==="
echo "Issue: #3 - Request throttling to prevent YouTube blocking"
echo ""

# Check 1: Executive Summary (10 points)
if grep -q "## Executive Summary" "$RESEARCH_FILE" && \
   grep -q "Complexity:" "$RESEARCH_FILE" && \
   grep -q "Feasibility:" "$RESEARCH_FILE" && \
   grep -q "Implementation Approach:" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Executive summary with complexity, feasibility, approach"
else
  ISSUES+=("❌ Missing complete executive summary")
fi

# Check 2: Current Architecture Analysis (10 points)
if grep -q "## 1. Current Architecture Analysis" "$RESEARCH_FILE" && \
   grep -q "### 1.1 Project Structure" "$RESEARCH_FILE" && \
   grep -q "### 1.2 Technology Stack" "$RESEARCH_FILE" && \
   grep -q "### 1.3 Current Request Flow" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Complete architecture analysis"
else
  ISSUES+=("❌ Incomplete architecture analysis")
fi

# Check 3: Similar Pattern Analysis (10 points)
if grep -q "## 2. Similar Pattern Analysis" "$RESEARCH_FILE" && \
   grep -q "Pattern Gap:" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Similar pattern analysis completed"
else
  ISSUES+=("❌ Missing pattern analysis")
fi

# Check 4: Integration Point Discovery (10 points)
if grep -q "## 3. Integration Point Discovery" "$RESEARCH_FILE" && \
   grep -q "INTEGRATION POINT" "$RESEARCH_FILE" && \
   grep -q "Line 189" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Integration points identified"
else
  ISSUES+=("❌ Integration points not fully documented")
fi

# Check 5: Testing Infrastructure (10 points)
if grep -q "## 4. Testing Infrastructure Discovery" "$RESEARCH_FILE" && \
   grep -q "Vitest" "$RESEARCH_FILE" && \
   grep -q "mockErrors.rateLimit" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Testing infrastructure analyzed"
else
  ISSUES+=("❌ Testing infrastructure incomplete")
fi

# Check 6: Risk & Constraint Analysis (10 points)
if grep -q "## 5. Risk & Constraint Analysis" "$RESEARCH_FILE" && \
   grep -q "Technical Risks" "$RESEARCH_FILE" && \
   grep -q "YouTube API Constraints" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Risk and constraints documented"
else
  ISSUES+=("❌ Risk analysis incomplete")
fi

# Check 7: Architecture Discovery (10 points)
if grep -q "## 6. Architecture Discovery" "$RESEARCH_FILE" && \
   grep -q "RequestThrottler" "$RESEARCH_FILE" && \
   grep -q "ThrottleConfig" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Proposed architecture defined"
else
  ISSUES+=("❌ Architecture design missing")
fi

# Check 8: Impact Analysis (10 points)
if grep -q "## 7. Impact Analysis" "$RESEARCH_FILE" && \
   grep -q "Files to Modify" "$RESEARCH_FILE" && \
   grep -q "Affected Features" "$RESEARCH_FILE" && \
   grep -q "Regression Risk Mapping" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Complete impact analysis"
else
  ISSUES+=("❌ Impact analysis incomplete")
fi

# Check 9: Blocking Decisions (10 points)
if grep -q "## 8. Blocking Decisions" "$RESEARCH_FILE" && \
   grep -q "DECISION" "$RESEARCH_FILE" && \
   grep -q "Blocker:" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Blocking decisions documented"
else
  ISSUES+=("❌ Blocking decisions not identified")
fi

# Check 10: Implementation Approach (10 points)
if grep -q "## 10. Implementation Approach" "$RESEARCH_FILE" && \
   grep -q "GREENFIELD" "$RESEARCH_FILE" && \
   grep -q "Phase 1:" "$RESEARCH_FILE" && \
   grep -q "Total Estimated Effort:" "$RESEARCH_FILE"; then
  SCORE=$((SCORE + 10))
  echo "✅ [10/10] Implementation approach with phases"
else
  ISSUES+=("❌ Implementation plan incomplete")
fi

# Summary
echo ""
echo "=== VALIDATION SUMMARY ==="
echo "Final Score: $SCORE/$MAX_SCORE"
echo ""

if [ ${#ISSUES[@]} -gt 0 ]; then
  echo "Issues Found:"
  for issue in "${ISSUES[@]}"; do
    echo "  $issue"
  done
  echo ""
fi

# Grade determination
if [ $SCORE -eq 100 ]; then
  echo "Grade: A+ (PASS)"
  echo "Status: Ready for planning phase"
  exit 0
elif [ $SCORE -ge 90 ]; then
  echo "Grade: A (PASS)"
  echo "Status: Minor improvements recommended"
  exit 0
elif [ $SCORE -ge 80 ]; then
  echo "Grade: B (CONDITIONAL PASS)"
  echo "Status: Address issues before proceeding"
  exit 0
else
  echo "Grade: C or below (FAIL)"
  echo "Status: Significant rework required"
  exit 1
fi
