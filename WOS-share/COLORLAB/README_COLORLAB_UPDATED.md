# COLORLAB

> Practical palette creation and color asset tooling for StudioRich / WOS.

COLORLAB is the working color tool for creating, editing, saving, organizing, and exporting reusable palettes.

Its first job is simple:

```text
make great palettes
save them safely
export them cleanly
```

COLORLAB supports WOS, PLAY, ImageLab, merch, posters, broadcast graphics, and external design workflows by producing strong reusable color assets.

---

# Core Mission

COLORLAB exists to help create:

- palettes
- swatch sets
- gradients
- texture ideas
- animated color pulse ideas
- exportable color assets

COLORLAB is not primarily:

- a runtime controller
- a governance console
- a publishing workflow
- a WOS activation surface
- a playlist runtime scheduler
- a projection analysis tool

Those systems may consume COLORLAB palettes later.

COLORLAB’s first responsibility is to make color usable.

---

# Current Product Rule

```text
No palette is useful until it can be created, edited, saved, reopened, reused, and exported.
```

This is the standard for the current build.

---

# Primary Workflow

```text
Palette Library
        ↓
Create Palette
        ├─ Import Image
        ├─ Generate Random
        ├─ Start From Seed Color
        ├─ Generate Harmony
        └─ Manual Build
        ↓
Edit Palette
        ↓
Save Palette
        ↓
Export
```

No runtime step is required.

No publishing step is required.

No governance review step is required.

---

# Current Build Spec

Primary build spec:

```text
0629H_COLORLAB_FunctionalPaletteTool_v1.0.0.md
```

Status:

```text
[BUILD]
```

This is the active implementation target.

It focuses on:

- image import preservation
- palette generation
- image color extraction
- seed color generation
- harmony generation
- manual palette editing
- palette library
- save/reopen behavior
- SVG export
- PNG export
- ASE export
- JSON export

---

# Product Direction Spec

Broader product direction:

```text
0629G_COLORLAB_PaletteGenerationAndExport_v1.0.1.md
```

Status:

```text
[REVIEW]
```

This remains useful as product direction, but it is not the immediate build target.

Build from `0629H` first.

---

# Current Functional Requirements

COLORLAB is functional only when the user can:

1. import an image without damaging it
2. extract colors from that image
3. generate palettes without images
4. manually edit colors
5. save palettes to a library
6. reopen saved palettes
7. export SVG
8. export PNG
9. export ASE
10. export JSON

If these do not work, COLORLAB is not complete.

---

# Image Import Rule

Imported images must never be degraded by default.

Core rule:

```text
Never shrink, overwrite, or replace the user's original image during import.
```

COLORLAB must preserve:

- original file
- original pixel dimensions
- original filename
- original color sampling source

Preview scaling is allowed visually only.

Preview scaling may not replace the source image.

Extraction must sample from the original-resolution source image, not from a reduced preview thumbnail.

---

# Palette Creation Modes

COLORLAB should support:

## Image Extraction

Create palettes from inspirational sources such as:

- title screens
- posters
- photographs
- ads
- fashion images
- screenshots
- visual references

Image extraction should allow:

- dominant color extraction
- clicked color sampling
- manual sample points
- duplicate color reduction
- optional low-saturation filtering
- optional low-contrast filtering
- manual cleanup after extraction

## Random Generation

Generate palettes without an image.

Required behavior:

- generate new palette
- regenerate palette
- lock swatches
- regenerate unlocked swatches only
- choose palette size
- save generated palette

## Seed Color Generation

Start from one color and generate a supporting palette.

Seed input methods:

- hex input
- color picker
- existing swatch
- sampled image color

## Harmony Generation

Required harmony modes:

- complementary
- analogous
- triadic
- tetradic
- split-complementary
- monochrome

## Manual Build

Manual creation must remain available because not every useful palette comes from an image.

---

# Palette Library

The Palette Library is the home screen.

It should show saved palettes as cards.

Each card should include:

- palette name
- swatch strip
- source type
- tags
- favorite status
- last edited
- quick export action

Required actions:

- open
- edit
- duplicate
- rename
- favorite
- archive
- delete
- export

---

# Palette Editor

The Palette Editor should be fast and simple.

Required controls:

- hex input
- color picker
- lock/unlock
- duplicate swatch
- remove swatch
- reorder swatches
- copy hex
- rename palette
- tags
- notes
- save
- export

The editor should not show governance, runtime, approval, quarantine, or activation language in the primary UI.

---

# Export Formats

Current required exports:

| Format | Purpose |
|---|---|
| SVG | vector swatch sheet |
| PNG | image swatch/card export |
| ASE | Adobe/Affinity-style swatch exchange |
| JSON | structured COLORLAB palette data |

Deferred exports:

- GPL
- CSS variables
- TXT hex list
- PDF palette sheet
- animated GIF
- MP4 pulse
- WebM pulse

---

# Preview Templates

Preview templates are allowed, but they are secondary.

They exist only to show possible use of colors.

Templates are examples, not integrations.

Possible templates:

- swatch sheet
- gradient card
- texture tile
- animated pulse strip
- poster block
- playlist card
- map card
- merch block
- channel banner
- UI panel

Templates may not block palette creation.

Templates may not require runtime integration.

---

# Deferred Systems

Do not prioritize these until the functional palette tool is solid:

- Projection Lab
- Map Theme Editor
- Playlist Theme Editor
- runtime profiles
- palette cycling
- publishing workflows
- governance-first UI
- mood-to-color AI
- music-to-color AI
- WOS live preview
- PLAY runtime preview

These may return later as consumers or extensions.

They should not weigh down the core palette creation experience.

---

# Relationship to WOS / PLAY / ImageLab

COLORLAB creates color assets.

Other systems decide how to use them.

```text
COLORLAB creates palettes.
WOS uses palettes for worlds.
PLAY uses palettes for music experiences.
ImageLab uses palettes for visual systems.
Merch and posters use palettes for design production.
```

COLORLAB should not be forced to understand every downstream use case.

Its job is to create options and choices.

---

# Repository Structure

Recommended structure:

```text
colorlab/
├── src/
│   ├── components/
│   ├── lib/
│   ├── types/
│   └── app/
├── docs/
├── README.md
└── package.json
```

Shared handoff location:

```text
chatGPT-share/
└── WOS-share/
    └── COLORLAB/
        ├── CURRENT/
        ├── SPECS/
        ├── REPORTS/
        └── ARCHIVE/
```

---

# Source Truth

Use these current files first:

```text
COLORLAB_CURRENT.md
COLORLAB_SOURCE_INDEX.md
COLORLAB_BUILD_STATUS.md
COLORLAB_ROLLUP_v1.0.0.md
0629H_COLORLAB_FunctionalPaletteTool_v1.0.0.md
```

Older governance/projection documents remain useful as historical infrastructure, but they are not the lead product identity.

---

# Current Status

COLORLAB has reset from:

```text
projection governance infrastructure
```

to:

```text
functional palette creation tool
```

The current successful direction is:

```text
simple
usable
color-first
palette-first
export-ready
```

---

# Implementation Guide

- **Where:** Replace the existing `colorlab/README.md` with this file.
- **What:** Build against `0629H_COLORLAB_FunctionalPaletteTool_v1.0.0.md` first.
- **Expect:** COLORLAB opens as a clear palette tool where users can generate, extract, edit, save, reopen, and export palettes without governance or runtime concepts getting in the way.
