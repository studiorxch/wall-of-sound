# Claude Spec Completion Report Prompt

After completing any WOS or PLAY spec/build task, create a standalone completion report file using the filename convention and template below.

The report must be concise, factual, and optimized for downstream project continuity. It should help ChatGPT, Claude, Obsidian, and future build sessions understand exactly what changed, what passed, what remains blocked, and what should happen next.

Do not include long process logs, internal reasoning, speculative commentary, or repeated background context unless it is necessary to explain a blocker or risk.

---

## Filename Convention

Use this format:

```txt
YYYY-MM-DD_<PROJECT>_<BUILD-ID>_COMPLETION_REPORT.md
```

Examples:

```txt
2026-06-19_WOS_0619G_StudioLibraryAndPlacementUXRecoveryPatch_COMPLETION_REPORT.md
2026-06-20_PLAY_0620A_PlaylistReadmeRecovery_COMPLETION_REPORT.md
```

Rules:

- Use ISO date: `YYYY-MM-DD`
    
- Use project code: `WOS`, `PLAY`, or another approved project code
    
- Include the build/spec ID when available
    
- Use PascalCase or compact readable name for the spec title
    
- End with `_COMPLETION_REPORT.md`
    
- Do not use spaces in filenames
    
- Do not overwrite old reports unless intentionally replacing a failed/incorrect report
    

---

# Spec Completion Report

## Metadata

```yaml
date: YYYY-MM-DD
project: WOS
build_id: 0619G
spec_name: StudioLibraryAndPlacementUXRecoveryPatch
status: PASS | PARTIAL_PASS | BLOCKED | FAILED
authoring_agent: Claude
report_type: completion_report
source_truth: repo_and_obsidian
```

---

## 1. Completion Summary

One short paragraph explaining what was completed.

Include:

- what the build/spec was meant to solve
    
- whether it passed, partially passed, failed, or remains blocked
    
- the most important result
    

Example:

```txt
0619G cleaned the Studio authoring surface by restoring the Library | Map | Canvas | Broadcast product model, clustering Import/Publish as tools, and improving map placement feedback. The build is PARTIAL_PASS because the UI cleanup shipped, but placement still needs visual confirmation on map click.
```

---

## 2. Status

```txt
Status: PASS | PARTIAL_PASS | BLOCKED | FAILED
```

### Status Definition

- `PASS` = all acceptance criteria met
    
- `PARTIAL_PASS` = core implementation shipped, but one or more acceptance criteria remain incomplete
    
- `BLOCKED` = implementation cannot proceed or verification cannot complete due to a known blocker
    
- `FAILED` = implementation did not meet the required outcome
    

---

## 3. Files Changed

List every touched file.

Use this format:

```txt
- path/to/file.js — one-line purpose of change
- path/to/file.css — one-line purpose of change
- path/to/file.md — one-line purpose of change
```

Rules:

- Include only files actually changed
    
- Do not include untouched reference files
    
- Mark newly created files with `[NEW]`
    
- Mark deleted files with `[REMOVED]`
    

Example:

```txt
- studio/studioShell.js — restored primary Studio mode routing and clustered tools
- studio/views/threeDCanvasView.js — added visible placement state and map click feedback
- studio/styles.css — cleaned Library layout and collapsible section styling
```

---

## 4. What Shipped

Bullet list of concrete shipped behavior.

Use implementation-level language, not process language.

Example:

```txt
- Restored Studio primary modes: Library, Map, Canvas, Broadcast
- Moved Import into a clustered tool area instead of Library clutter
- Added visible placement status when Place on Map is active
- Added failure messaging when map click placement cannot complete
```

---

## 5. Verification Results

Use a compact checklist.

```txt
- [x] Studio loads without fatal error
- [x] Library mode renders
- [x] Map mode renders
- [ ] Place on Map creates visible actor
- [x] Import is clustered as tool
- [x] Publish remains available as tool
```

For each failed or blocked item, add one sentence explaining why.

---

## 6. Acceptance Criteria Result

Copy the acceptance criteria from the spec if available, then mark each item.

```txt
A1. Clean startup UI — PASS
A2. Focused/collapsible Library sections — PASS
A3. Import clustered as tool — PASS
A4. Place on Map visibly works — BLOCKED
A5. Failed placement explains itself without DevTools — PARTIAL_PASS
```

---

## 7. Current Blockers

List only active blockers.

If none:

```txt
None.
```

If blockers exist:

```txt
- Map click handler fires but actor render confirmation is not visible.
- Building selection conflicts with placement mode when both are active.
```

Each blocker should include:

- what is blocked
    
- suspected cause, if known
    
- what file or system likely owns the fix
    

---

## 8. Known Risks

List risks that future work should know.

If none:

```txt
None.
```

Examples:

```txt
- Placement mode and building selection mode may compete for map click authority.
- Library cleanup may have hidden older custom asset controls that need relocation.
```

---

## 9. Do Not Reopen

List issues that were resolved and should not be re-litigated unless they break again.

Example:

```txt
- Do not reopen Mapbox token/style access unless the Studio map fails to load again.
- Do not restore Jekyll as active spec source.
- Do not restore Glyph Lab, Palette Lab, or Proof Stage as primary nav.
```

---

## 10. Continuity Notes for ChatGPT

Write 5–10 lines optimized for ChatGPT project continuity.

This section should be understandable without reading the full report.

Include:

- active state
    
- latest decision
    
- latest blocker
    
- next step
    
- anything ChatGPT should not forget
    

Example:

```txt
0619G is the active Studio UX recovery build. The locked product model is Modes: Library | Map | Canvas | Broadcast, with Publish and Import treated as tools. Studio map access was already fixed in 0619F v1.0.1 and should not be reopened unless map loading fails again. Current remaining blocker is visible Place on Map behavior. After placement is reliable, resume 0618D Building Texture Visible Proof Patch.
```

---

## 11. Next Recommended Step

One clear next action.

Use this format:

```txt
Next: <BUILD-ID or action>
Reason: <one sentence>
```

Example:

```txt
Next: Continue 0619G placement click recovery.
Reason: Building texture proof should not resume until map placement and selection feedback are reliable.
```

---

## 12. Source Pack Update Recommendation

State whether this report should update the shared ChatGPT source pack.

```txt
Update WOS_CURRENT.md: YES | NO
Update WOS_BUILD_STATUS.md: YES | NO
Update WOS_DO_NOT_REOPEN.md: YES | NO
Update WOS_SOURCE_INDEX.md: YES | NO
```

Then include a compact summary for daily rollup use:

```txt
Daily Rollup Entry:
- 0619G advanced Studio cleanup and placement UX recovery. Library/Map/Canvas/Broadcast product model remains locked. Placement click feedback remains the active blocker.
```

---

## 13. Final Report Rules

The completion report must:

- be standalone
    
- be short enough to paste into ChatGPT
    
- include exact files changed
    
- include pass/fail/blocker state
    
- include next step
    
- include ChatGPT continuity notes
    
- avoid process logs
    
- avoid internal reasoning
    
- avoid speculative future features unless listed as deferred