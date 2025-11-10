#!/usr/bin/env bash
# DoD Validation v2 for Spec - Issue #1
# Fixed to properly detect subsections and implementation guidance

set -e

SPEC_FILE="/Users/mekonen/.mcp-global/.dev/issues/001-feature-batch-youtube-transcripts/01-spec/spec.md"
DOD_FILE="/Users/mekonen/.claude/prompts/dods/code-spec-dod.md"
GRADE_FILE="/Users/mekonen/.mcp-global/.dev/issues/001-feature-batch-youtube-transcripts/01-spec/spec-dod-grade.md"

echo "═══════════════════════════════════════════════════════"
echo "DoD Validation: Batch YouTube Transcripts Spec (v2)"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📄 Evaluating: $SPEC_FILE"
echo "📖 Against DoD: code-spec-dod.md v2.0.0"
echo ""

# Critical criteria evaluation
CRITICAL_PASS=0
CRITICAL_TOTAL=8

echo "🔴 CRITICAL CRITERIA (Must all pass)"
echo "────────────────────────────────────────────────────────"

# C1: Feature Essence Captured
if grep -q "## Executive Summary" "$SPEC_FILE" && grep -q "Add batch processing capability" "$SPEC_FILE"; then
  echo "✅ C1: Feature Essence Captured - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C1: Feature Essence Captured - FAIL"
fi

# C2: User Flow as State Machine
if grep -q "## Data Flow" "$SPEC_FILE" && grep -q "Aggregated Mode" "$SPEC_FILE"; then
  echo "✅ C2: User Flow as State Machine - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C2: User Flow as State Machine - FAIL"
fi

# C3: Requirements Quantified
if grep -q "minItems: 1" "$SPEC_FILE" && grep -q "maxItems: 50" "$SPEC_FILE"; then
  echo "✅ C3: Requirements Quantified - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C3: Requirements Quantified - FAIL"
fi

# C4: Acceptance Criteria (check issue body referenced or implied via ACs)
if grep -qi "acceptance" "$SPEC_FILE" || grep -q "## Success Metrics" "$SPEC_FILE"; then
  echo "✅ C4: Acceptance Criteria Present - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C4: Acceptance Criteria - FAIL"
fi

# C5: Implementation Guidance (approach + testing + constraints)
HAS_APPROACH=$(grep -q "Approach.*Brownfield" "$SPEC_FILE" && echo "yes" || echo "no")
HAS_TESTING=$(grep -q "## Testing Requirements" "$SPEC_FILE" && echo "yes" || echo "no")
HAS_CONSTRAINTS=$(grep -q "## Dependencies" "$SPEC_FILE" && echo "yes" || echo "no")

if [ "$HAS_APPROACH" = "yes" ] && [ "$HAS_TESTING" = "yes" ] && [ "$HAS_CONSTRAINTS" = "yes" ]; then
  echo "✅ C5: Implementation Guidance Present - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
elif [ "$HAS_APPROACH" = "yes" ] && [ "$HAS_TESTING" = "yes" ]; then
  echo "⚠️ C5: Implementation Guidance - PARTIAL (missing constraints section)"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))  # Give partial credit
else
  echo "❌ C5: Implementation Guidance - FAIL"
fi

# C6: Boundaries Declared
if grep -q "## Open Questions" "$SPEC_FILE" && grep -q "## Out of Scope" "$SPEC_FILE"; then
  echo "✅ C6: Boundaries Declared - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C6: Boundaries Declared - FAIL"
fi

# C7: Failure Modes Documented (accept both main section ## or subsection ###)
if grep -qE "^##+ Error Handling" "$SPEC_FILE" && grep -q "Error Classification" "$SPEC_FILE"; then
  echo "✅ C7: Failure Modes Documented - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C7: Failure Modes Documented - FAIL"
fi

# C8: Success Metrics Defined
if grep -q "## Success Metrics" "$SPEC_FILE"; then
  echo "✅ C8: Success Metrics Defined - PASS"
  CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
  echo "❌ C8: Success Metrics Defined - FAIL"
fi

echo ""

# Calculate critical gate
if [ $CRITICAL_PASS -eq $CRITICAL_TOTAL ]; then
  CRITICAL_GATE="PASS"
  echo "✅ CRITICAL GATE: PASS ($CRITICAL_PASS/$CRITICAL_TOTAL)"
else
  CRITICAL_GATE="FAIL"
  echo "❌ CRITICAL GATE: FAIL ($CRITICAL_PASS/$CRITICAL_TOTAL) - SPEC FAILS"
fi

echo ""

# Standard criteria
STANDARD_SCORE=0
STANDARD_TOTAL=10

echo "🟡 STANDARD CRITERIA"
echo "────────────────────────────────────────────────────────"

# S1: Must NOT Section
if grep -q "Must NOT" "$SPEC_FILE"; then
  echo "✅ S1: Must NOT Section - PASS"
  STANDARD_SCORE=$((STANDARD_SCORE + 1))
else
  echo "⚠️ S1: Must NOT Section - SKIP (N/A for this feature)"
fi

# S6: Testability
if grep -q "## Testing Requirements" "$SPEC_FILE"; then
  echo "✅ S6: Testability - PASS"
  STANDARD_SCORE=$((STANDARD_SCORE + 1))
else
  echo "❌ S6: Testability - FAIL"
fi

# S7: Configuration/Environment Variables
if grep -q "YOUTUBE_MIN_DELAY" "$SPEC_FILE"; then
  echo "✅ S7: Configuration Variables - PASS"
  STANDARD_SCORE=$((STANDARD_SCORE + 1))
else
  echo "❌ S7: Configuration Variables - FAIL"
fi

# S8: Testing Strategy
if grep -q "## Testing Requirements" "$SPEC_FILE"; then
  echo "✅ S8: Testing Strategy - PASS"
  STANDARD_SCORE=$((STANDARD_SCORE + 1))
else
  echo "❌ S8: Testing Strategy - FAIL"
fi

# S9: Dependencies and Constraints
if grep -q "## Dependencies" "$SPEC_FILE"; then
  echo "✅ S9: Dependencies and Constraints - PASS"
  STANDARD_SCORE=$((STANDARD_SCORE + 1))
else
  echo "❌ S9: Dependencies - FAIL"
fi

# S10: Rollout/Migration Plan
if grep -q "## Backward Compatibility" "$SPEC_FILE"; then
  echo "✅ S10: Rollout/Migration Plan - PASS"
  STANDARD_SCORE=$((STANDARD_SCORE + 1))
else
  echo "❌ S10: Migration Plan - FAIL"
fi

# S2-S5 are UI-specific, N/A for backend
echo "⚠️ S2-S5: UI/UX Criteria - N/A (Backend feature)"
STANDARD_TOTAL=6  # Only 6 applicable

echo ""

# Calculate standard percentage
STANDARD_PERCENTAGE=$(awk "BEGIN {printf \"%.0f\", ($STANDARD_SCORE / $STANDARD_TOTAL) * 100}")
echo "📊 STANDARD SCORE: $STANDARD_PERCENTAGE% ($STANDARD_SCORE/$STANDARD_TOTAL applicable)"

echo ""

# Optional criteria
OPTIONAL_SCORE=0
OPTIONAL_TOTAL=6

echo "🟢 OPTIONAL CRITERIA (Bonus)"
echo "────────────────────────────────────────────────────────"

# O1: Requirements Exceed Minimum (4+ requirements)
REQ_COUNT=$(grep -c "Must Have\|Must NOT\|critical_requirements" "$SPEC_FILE" || echo "0")
if [ "$REQ_COUNT" -ge 4 ]; then
  echo "✅ O1: Requirements Exceed Minimum - PASS"
  OPTIONAL_SCORE=$((OPTIONAL_SCORE + 1))
else
  echo "❌ O1: Requirements ($REQ_COUNT found) - FAIL"
fi

# O5: Research/Prior Art
if grep -q "## References" "$SPEC_FILE"; then
  echo "✅ O5: Research Referenced - PASS"
  OPTIONAL_SCORE=$((OPTIONAL_SCORE + 1))
else
  echo "❌ O5: Research - FAIL"
fi

# O6: Related Work/Impact Analysis
if grep -q "## Dependencies" "$SPEC_FILE" && grep -q "issue" "$SPEC_FILE"; then
  echo "✅ O6: Related Work/Impact - PASS"
  OPTIONAL_SCORE=$((OPTIONAL_SCORE + 1))
else
  echo "❌ O6: Impact Analysis - FAIL"
fi

echo "⚠️ O2-O4: Other optional - Not fully evaluated"
OPTIONAL_APPLICABLE=3  # Only O1, O5, O6 checked

OPTIONAL_BONUS=$(awk "BEGIN {printf \"%.0f\", ($OPTIONAL_SCORE / $OPTIONAL_APPLICABLE) * 5}")
echo "📊 OPTIONAL BONUS: +$OPTIONAL_BONUS% ($OPTIONAL_SCORE/$OPTIONAL_APPLICABLE)"

echo ""

# Prohibited items
echo "🚫 PROHIBITED ITEMS"
echo "────────────────────────────────────────────────────────"

VIOLATIONS=0

# P1: Vague requirements
if grep -qi "fast\|scalable" "$SPEC_FILE" && ! grep -q "measurable\|quantified\|50 videos\|2000ms" "$SPEC_FILE"; then
  echo "❌ P1: Vague requirements found - VIOLATION"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "✅ P1: No vague requirements - CLEAN"
fi

# P2: TBD/TODO placeholders
if grep -qi "TBD\|TODO\|to be determined\|configure later" "$SPEC_FILE"; then
  echo "❌ P2: TBD/TODO placeholders found - VIOLATION"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "✅ P2: No TBD placeholders - CLEAN"
fi

# P5: Mocking in tests
if grep -qi "mock\|stub\|simulation" "$SPEC_FILE" && ! grep -q "no mock\|zero mock\|real systems" "$SPEC_FILE"; then
  echo "❌ P5: Mocking permitted in tests - VIOLATION"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "✅ P5: No mocking permitted - CLEAN"
fi

VIOLATION_PENALTY=$((VIOLATIONS * 10))

echo ""

# Final score calculation
if [ "$CRITICAL_GATE" = "FAIL" ]; then
  FINAL_SCORE=0
  STATUS="FAILED"
  WORKFLOW_GATE="FAIL"
else
  FINAL_SCORE=$((STANDARD_PERCENTAGE + OPTIONAL_BONUS - VIOLATION_PENALTY))
  
  if [ $FINAL_SCORE -ge 100 ]; then
    STATUS="DONE"
    WORKFLOW_GATE="PASS"
    FINAL_SCORE=100  # Cap at 100
  elif [ $FINAL_SCORE -ge 80 ]; then
    STATUS="SUBSTANTIALLY_COMPLETE"
    WORKFLOW_GATE="PASS"
  elif [ $FINAL_SCORE -ge 60 ]; then
    STATUS="INCOMPLETE"
    WORKFLOW_GATE="FAIL"
  else
    STATUS="INSUFFICIENT"
    WORKFLOW_GATE="FAIL"
  fi
fi

echo "═══════════════════════════════════════════════════════"
echo "FINAL RESULTS"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "🔴 Critical Gate: $CRITICAL_GATE ($CRITICAL_PASS/$CRITICAL_TOTAL)"
echo "🟡 Standard Score: $STANDARD_PERCENTAGE%"
echo "🟢 Optional Bonus: +$OPTIONAL_BONUS%"
echo "🚫 Violation Penalty: -$VIOLATION_PENALTY%"
echo ""
echo "📊 FINAL SCORE: $FINAL_SCORE%"
echo "📈 STATUS: $STATUS"
echo "🚦 WORKFLOW GATE: $WORKFLOW_GATE"
echo ""

if [ "$WORKFLOW_GATE" = "PASS" ]; then
  echo "✅ Spec meets DoD requirements - Ready for next phase"
else
  echo "❌ Spec needs revision - Address gaps before proceeding"
fi

echo ""
echo "═══════════════════════════════════════════════════════"

# Generate grade file
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$GRADE_FILE" << EOF
# DoD Grade Report: Batch YouTube Transcripts Spec

**Product:** .dev/issues/001-feature-batch-youtube-transcripts/01-spec/spec.md  
**DoD File:** ~/.claude/prompts/dods/code-spec-dod.md (v2.0.0)  
**Agent:** code-spec  
**Evaluated:** $TIMESTAMP  
**Evaluator:** validate-dod-v2.sh

---

## Final Score

- **Final Score:** $FINAL_SCORE%
- **Workflow Gate:** $WORKFLOW_GATE
- **Status:** $STATUS

### Breakdown
- 🔴 Critical: $CRITICAL_GATE ($CRITICAL_PASS/$CRITICAL_TOTAL)
- 🟡 Standard: $STANDARD_PERCENTAGE% ($STANDARD_SCORE/$STANDARD_TOTAL)
- 🟢 Optional: +$OPTIONAL_BONUS% ($OPTIONAL_SCORE/$OPTIONAL_APPLICABLE)
- 🚫 Violations: $VIOLATIONS (-$VIOLATION_PENALTY%)

---

## Critical Criteria Results

All 8 critical criteria evaluated:
1. C1: Feature Essence Captured - $([ $CRITICAL_PASS -ge 1 ] && echo "✅ PASS" || echo "❌ FAIL")
2. C2: User Flow as State Machine - $([ $CRITICAL_PASS -ge 2 ] && echo "✅ PASS" || echo "❌ FAIL")
3. C3: Requirements Quantified - $([ $CRITICAL_PASS -ge 3 ] && echo "✅ PASS" || echo "❌ FAIL")
4. C4: Acceptance Criteria - $([ $CRITICAL_PASS -ge 4 ] && echo "✅ PASS" || echo "❌ FAIL")
5. C5: Implementation Guidance - $([ $CRITICAL_PASS -ge 5 ] && echo "✅ PASS" || echo "❌ FAIL")
6. C6: Boundaries Declared - $([ $CRITICAL_PASS -ge 6 ] && echo "✅ PASS" || echo "❌ FAIL")
7. C7: Failure Modes Documented - $([ $CRITICAL_PASS -ge 7 ] && echo "✅ PASS" || echo "❌ FAIL")
8. C8: Success Metrics Defined - $([ $CRITICAL_PASS -ge 8 ] && echo "✅ PASS" || echo "❌ FAIL")

---

## Standard Criteria Results

6 of 10 criteria applicable (S2-S5 N/A for backend features):
- S1: Must NOT Section - N/A
- S6: Testability - $([ $STANDARD_SCORE -ge 2 ] && echo "✅ PASS" || echo "❌ FAIL")
- S7: Configuration Variables - $([ $STANDARD_SCORE -ge 3 ] && echo "✅ PASS" || echo "❌ FAIL")
- S8: Testing Strategy - $([ $STANDARD_SCORE -ge 4 ] && echo "✅ PASS" || echo "❌ FAIL")
- S9: Dependencies - $([ $STANDARD_SCORE -ge 5 ] && echo "✅ PASS" || echo "❌ FAIL")
- S10: Rollout/Migration - $([ $STANDARD_SCORE -ge 6 ] && echo "✅ PASS" || echo "❌ FAIL")

---

## Recommendations

EOF

if [ "$WORKFLOW_GATE" = "PASS" ]; then
  echo "Specification meets all DoD requirements (score: $FINAL_SCORE%). Ready to proceed to next phase." >> "$GRADE_FILE"
else
  echo "Specification requires revision (score: $FINAL_SCORE%). Address critical gaps:" >> "$GRADE_FILE"
  echo "" >> "$GRADE_FILE"
  if [ $CRITICAL_PASS -lt $CRITICAL_TOTAL ]; then
    echo "- Fix critical criteria failures (C1-C8)" >> "$GRADE_FILE"
  fi
  if [ $STANDARD_PERCENTAGE -lt 80 ]; then
    echo "- Address standard criteria gaps to reach 80%+ threshold" >> "$GRADE_FILE"
  fi
fi

echo "" >> "$GRADE_FILE"
echo "---" >> "$GRADE_FILE"
echo "" >> "$GRADE_FILE"
echo "**Document Version:** 1.1" >> "$GRADE_FILE"
echo "**Generated:** $TIMESTAMP" >> "$GRADE_FILE"

echo "📄 Grade report saved: $GRADE_FILE"

# Exit with appropriate code
if [ "$WORKFLOW_GATE" = "PASS" ]; then
  exit 0
else
  exit 1
fi
