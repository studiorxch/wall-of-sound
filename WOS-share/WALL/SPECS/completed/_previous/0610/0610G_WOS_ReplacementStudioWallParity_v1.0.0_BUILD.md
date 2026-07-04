# 0610G_WOS_ReplacementStudioWallParity_v1.0.0_BUILD

## Purpose
Establish visual parity between Studio Map Lab and Wall replacement rendering.

## Objectives
1. True runtime preview mode inside Studio
2. Reuse BuildingStyleKit geometry
3. Reuse BuildingReplacementRuntime materials
4. Suppress authoring visuals during preview
5. Preserve editing workflow

## New Module
studio/systems/maplab/buildingPreviewRuntime.js

## Preview Modes

### Author View
- Selection overlays
- Authoring cues
- Original building visible

### Output Preview
- Replacement geometry visible
- Runtime materials visible
- Original building suppressed

## UI
Add:
- Author
- Preview

Default: Author

## Geometry Authority
Reuse BuildingStyleKit.

## Material Authority
Reuse BuildingReplacementRuntime.ARCHETYPE_MATERIALS.

## Preview Layer
wos-preview-replacements

Type:
- fill-extrusion

## Diagnostics
window.WOSMapLab.previewStatus()

## Acceptance Criteria
Studio Preview must match Wall Runtime for:
- Geometry
- Height
- Materials
- Suppression
- Dominance

## Implementation Guide

### Where
- studio/systems/maplab/buildingPreviewRuntime.js
- studio/views/mapLabView.js
- studio/styles/mapLab.css

### What
npm run dev

### Expect
Studio preview matches Wall replacement output.
