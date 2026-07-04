---
title: "COLORLAB Source Index"
filename: "COLORLAB_SOURCE_INDEX.md"
system: "COLORLAB"
type: "source-index"
status: "active"
updated: "2026-05-24"
owner: "StudioRich / WOS"
---

# COLORLAB_SOURCE_INDEX

## Purpose

This file identifies the current COLORLAB source files, implementation surfaces, and spec relationships needed for handoff, review, and build continuity.

It is not a full file tree.

It is the readable source map for agents and reviewers.

---

# Repository Location

Recommended parent location:

```text
wall-of-sound/colorlab/
```

Recommended source layout:

```text
wall-of-sound/colorlab/
├── src/
│   ├── components/
│   ├── lib/
│   ├── types/
│   └── app/
├── docs/
└── README.md
```

---

# Current Important Source Files

## Types

```text
src/types/projection.ts
```

Owns projection artifact classes, persistence classes, intake intent, recommendation levels, runtime role keys, environment states, Projection Lab state, revision binding, stale state, mode contexts, source bias, export governance, lineage, and runtime profile artifacts.

## Governance Logic

```text
src/lib/projectionGovernance.ts
```

Owns intake defaults, stale-state detection, activation validation, artifact validation, runtime profile building, Truth/Mood/Reference/Fiction constructors, deterministic hashing, and revocation signaling.

## Runtime Profile Export

```text
src/lib/paletteRuntimeProfileExport.ts
```

Owns role key validation, recommendation value validation, runtime profile export validation, fail-closed serialization, invariant export governance enforcement, timestamp-free content hashing, and canonical JSON export naming.

## Projection Lab UX

```text
src/components/ProjectionLabWorkspace.tsx
```

Owns Projection Stage, Control Surface, Governance Surface, Comparison Surface, mode switcher, time/weather controls, Fiction badge, WOS authority notice, source context, comparison independence, and advisory/runtime separation display.

## App Integration

```text
src/app/App.tsx
```

Owns COLORLAB project tab and ProjectionLabWorkspace rendering.

## Styles

```text
src/index.css
```

Owns Projection Lab layout, governance visibility styling, Fiction mode badge, WOS authority notice, source warning states, and responsive layout.

---

# Related WOS Boundary Files

These files are WOS runtime-side, not COLORLAB-owned:

```text
src/types/wosProfileImport.ts
src/lib/wosProfileImportAdapter.ts
```

They own WOS runtime profile intake, quarantine lifecycle, activation validation, rollback baseline, revocation-aware runtime cache handling, and WOS sovereignty enforcement.

Do not move these into COLORLAB ownership.

---

# Spec-to-Source Map

| Spec | Source Surface |
|---|---|
| `0524_COLORLAB_ProjectionOutputGovernance_v1.3.0.md` | `projection.ts`, `projectionGovernance.ts` |
| `0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md` | `paletteRuntimeProfileExport.ts` |
| `0524E_COLORLAB_ProjectionLabUX_v1.0.1.md` | `ProjectionLabWorkspace.tsx`, `index.css`, `App.tsx` |
| `0524F_COLORLAB_ProjectionPreviewSurface_v1.0.0.md` | future preview surface implementation |
| `0524D_WOS_ColorRuntimeProfileImport_v1.0.2.md` | WOS boundary only: `wosProfileImport.ts`, `wosProfileImportAdapter.ts` |

---

# Source Ownership Rules

COLORLAB owns color extraction, palette cleanup, palette intelligence, projection analysis, Projection Lab UX, preview surfaces, advisory runtime profiles, and source-bias visibility.

WOS owns runtime import, validation, activation, rollback, renderer execution, simulation clocks, and live runtime state.

---

# Source Handoff Rules

When syncing to `chatGPT-share`, include:

```text
COLORLAB_SOURCE_INDEX.md
COLORLAB_CURRENT.md
COLORLAB_BUILD_STATUS.md
```

When handing source to Claude/Codex, include:

```text
src/types/projection.ts
src/lib/projectionGovernance.ts
src/lib/paletteRuntimeProfileExport.ts
src/components/ProjectionLabWorkspace.tsx
src/app/App.tsx
src/index.css
```

Only include WOS import files when the task crosses into runtime intake.

---

# Implementation Guide

- **Where:** `chatGPT-share/WOS-share/COLORLAB/CURRENT/COLORLAB_SOURCE_INDEX.md`
- **What:** Update whenever source files are added, moved, renamed, or promoted into build relevance.
- **Expect:** Build agents can quickly identify which files matter for COLORLAB without scanning the full repo.
