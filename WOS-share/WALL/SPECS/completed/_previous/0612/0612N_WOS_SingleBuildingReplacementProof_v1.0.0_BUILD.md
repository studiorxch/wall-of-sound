# 0612N_WOS_SingleBuildingReplacementProof_v1.0.0_BUILD

## Status

BUILD

## Purpose

Prove a complete end-to-end building replacement workflow.

This build is not about city density.

This build is not about skyline filtering.

This build exists to answer one question:

```text
Can WOS remove one source building and replace it with one WOS object with clear visual proof?
```

Until this passes, future landmark, skyline, density, and symbolic-object systems remain unproven.

---

## Dependency

Required prior pass:

```text
0612M_WOS_BuildingZeroStateProof_v1.0.0_BUILD
```

Expected proof:

```text
All non-WOS buildings can be removed.
```

If 0612M fails:

```text
STOP.
Do not continue.
```

---

## Core Proof

The system must demonstrate:

```text
Source Building A
      ↓
Hidden / Removed
      ↓
WOS Replacement Object B
      ↓
Visible
```

with visual confirmation.

---

## Test Scope

Exactly:

```text
1 source building
1 replacement object
1 location
1 publishable screenshot
```

No city-wide rollout.

No landmark registry.

No skyline authority.

No density authority.

---

## Building Selection

Select one building that already exists in the registry.

Requirements:

```text
known building key
known replacement assignment
known map position
```

Avoid:

```text
random generated test buildings
temporary fake geometry
```

Use a real authored building.

---

## Required Proof Runtime

Suggested file:

```text
wall/systems/presentation/singleBuildingReplacementProof.js
```

Version:

```text
v1.0.0
```

Classification:

```text
diagnostic-proof
replacement-proof
```

This runtime may call existing systems.

It must not become another replacement authority.

---

## Required Command

Expose:

```js
_wos.debug.buildings.singleReplacementProof()
```

and:

```js
SBE.SingleBuildingReplacementProof.run()
```

Optional:

```js
_wos.debug.buildings.singleReplacementReport()
```

---

## Required Behavior

### B1 — Resolve Building

Resolve:

```text
buildingKey
featureId
replacement assignment
```

Return failure if unresolved.

Failure:

```js
{
  ok: false,
  reason: "BUILDING_NOT_FOUND"
}
```

---

### B2 — Verify source exists

Before suppression:

```text
Source building visible
```

Required report:

```js
{
  sourceBuildingDetected: true
}
```

If not detected:

```text
FAIL_SOURCE_NOT_VISIBLE
```

---

### B3 — Suppress source

Use canonical suppression path only.

Do not create:

```text
new suppression runtime
new replacement runtime
new building authority
```

Use existing authority chain.

Required report:

```js
{
  sourceSuppressed: true
}
```

---

### B4 — Verify replacement visible

Verify:

```text
wos-replacement-layer
```

contains replacement geometry.

Required report:

```js
{
  replacementVisible: true
}
```

---

### B5 — Camera-safe framing

Call existing:

```js
cameraSafePreview()
```

or equivalent.

Expected:

```text
replacement centered
replacement readable
publishable framing
```

---

### B6 — Produce visual classification

Return one of:

```text
PASS_SINGLE_REPLACEMENT
FAIL_SOURCE_STILL_VISIBLE
FAIL_REPLACEMENT_NOT_VISIBLE
FAIL_BOTH_VISIBLE
FAIL_NOTHING_VISIBLE
```

No ambiguous success state.

---

## Required Report

```js
{
  ok: true,
  buildingKey,
  replacementActorId,
  sourceBuildingDetected,
  sourceSuppressed,
  replacementVisible,
  cameraSafePreviewApplied,
  classification,
  screenshotRecommended,
  notes:[]
}
```

---

## Validation Checklist

### T1 — Building resolves

Expected:

```text
PASS
```

---

### T2 — Source detected

Expected:

```text
PASS
```

---

### T3 — Source suppressed

Expected:

```text
PASS
```

---

### T4 — Replacement visible

Expected:

```text
PASS
```

---

### T5 — Camera-safe preview applied

Expected:

```text
PASS
```

---

### T6 — Visual result

Allowed:

```text
replacement visible
source gone
```

Forbidden:

```text
source visible
replacement hidden
both visible
```

---

### T7 — Screenshot proof

Provide:

```text
Before
After
```

Required:

```text
single replacement clearly visible
```

---

## Non-Goals

Do not implement:

```text
city density authority
landmark registry
skyline filtering
ghost footprints
canvas surfaces
event objects
new geometry system
new replacement runtime
new building authority
new publish workflow
```

---

## Claude Instruction

This build is a proof build.

Do not declare success based on console reports.

Success requires:

```text
visual proof
```

If both source and replacement remain visible:

```text
FAIL_BOTH_VISIBLE
```

If source remains visible:

```text
FAIL_SOURCE_STILL_VISIBLE
```

If replacement is not visible:

```text
FAIL_REPLACEMENT_NOT_VISIBLE
```

Return the actual result.

---

## Deliverables

Claude/Codex must return:

```text
1. Exact diff
2. Files changed
3. Building key used
4. Replacement actor used
5. Proof report
6. Before screenshot description
7. After screenshot description
8. Final classification
9. Remaining blockers
```

---

## Success Definition

Success is:

```text
One source building disappears.
One WOS replacement object appears.
The result is visually obvious.
```

Nothing more is required.

Nothing less is acceptable.
