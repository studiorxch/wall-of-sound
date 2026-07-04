After completing this spec, create a file named:

`YYYY-MM-DD_<PROJECT>_<BUILD-ID>_<SpecName>_COMPLETION_REPORT.md`

Use this format:

```md
# Spec Completion Report

## Metadata
date:
project:
build_id:
spec_name:
status: PASS | PARTIAL_PASS | BLOCKED | FAILED
authoring_agent: Claude

## Completion Summary
One short paragraph.

## Files Changed
- path — purpose

## What Shipped
- concrete shipped result

## Verification Results
- [x] check
- [ ] check — reason if failed/blocked

## Acceptance Criteria Result
A1. item — PASS/PARTIAL_PASS/BLOCKED/FAILED

## Current Blockers
- blocker or None

## Known Risks
- risk or None

## Do Not Reopen
- resolved issue or None

## ChatGPT Continuity Notes
5–10 lines explaining the current state, latest decision, active blocker, and next step.

## Next Recommended Step
Next:
Reason:

## Source Pack Update Recommendation
Update WOS_CURRENT.md: YES/NO
Update WOS_BUILD_STATUS.md: YES/NO
Update WOS_DO_NOT_REOPEN.md: YES/NO
Update WOS_SOURCE_INDEX.md: YES/NO

Daily Rollup Entry:
- one bullet suitable for daily summary
```

Keep it concise. Do not include process logs, internal reasoning, or repeated background context.