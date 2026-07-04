---
title: "COLORLAB Functional Palette Tool"
filename: "0629H_COLORLAB_FunctionalPaletteTool_v1.0.0.md"
version: "1.0.0"
date: "2026-06-29"
system: "COLORLAB"
module: "Functional Palette Tool"
type: "functional-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"

canonical_scope:
  - usable palette creation
  - image import preservation
  - palette generation
  - image color extraction
  - seed color generation
  - harmony generation
  - manual palette editing
  - palette library
  - palette save and recovery
  - SVG export
  - PNG export
  - ASE export
  - JSON export

core_rule: "COLORLAB makes palettes first. Everything else is secondary."
---

# 0629H_COLORLAB_FunctionalPaletteTool_v1.0.0

## Build Readiness

**Status:** `[BUILD]`

This specification defines the immediate functional build for COLORLAB.

The goal is simple:

```text
Create great palettes fast.
Save them safely.
Export them cleanly.
```

This spec intentionally removes or defers anything that slows down basic palette creation.

---

# 1. Product Mission

COLORLAB is a practical color creation tool.

Its first job is:

- generate palettes
- extract palettes from images
- edit palettes
- save palettes
- organize palettes
- export palettes

COLORLAB should feel closer to:

```text
Coolors + Adobe Color + local palette library
```

not:

```text
runtime governance console
```

---

# 2. Primary Build Requirement

The first successful build must allow a user to:

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

If these do not work, COLORLAB is not functional.

---

# 3. Explicit Non-Goals For This Build

Do not build these in this phase:

- Projection Lab
- Map Theme Editor
- Playlist Theme Editor
- runtime profiles
- palette cycling
- publishing workflows
- governance-first UI
- mood-to-color AI
- music-to-color AI
- runtime activation
- WOS live preview
- PLAY runtime preview
- advanced archival review flows

These may return later.

They are not required for the functional palette tool.

---

# 4. Core Workflow

The functional workflow is:

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

# 5. Image Import Doctrine

Imported images must never be degraded by default.

Core rule:

```text
Never shrink, overwrite, or replace the user's original image during import.
```

COLORLAB must preserve:

- original file
- original pixel dimensions
- original filename
- original image metadata when available
- original color sampling source

Preview scaling is allowed visually only.

Preview scaling may not replace the source image.

---

# 6. Image Import Functional Requirements

When an image is imported:

1. store original image data
2. record original width and height
3. create a separate preview thumbnail if needed
4. show the image scaled to fit the UI panel
5. sample colors from the original-resolution image
6. allow zoom and pan when possible
7. display original dimensions
8. warn if the source is genuinely low resolution
9. never extract from the preview thumbnail unless explicitly selected

---

# 7. Image Preview Rules

The UI may visually scale the image to fit the panel.

Allowed:

```text
display-fit: contain
visual scaling
preview thumbnail
zoom/pan viewport
```

Forbidden:

```text
destructive resize
thumbnail replacing source
sampling only from thumbnail
silent downscaling
cropping without user action
```

The user should understand the difference between:

```text
source image
```

and:

```text
preview display
```

---

# 8. Image Extraction Requirements

Image extraction must support:

- dominant color extraction
- clicked color sampling
- manual sample points
- duplicate color reduction
- optional low-saturation filtering
- optional low-contrast filtering
- palette size selection
- manual cleanup after extraction

Default extracted palette size:

```text
5 colors
```

Supported extraction size:

```text
3–12 colors
```

---

# 9. Color Sampling Accuracy

Color extraction should sample from the preserved original image.

Minimum behavior:

```text
clicked pixel color = source image pixel color at mapped coordinate
```

If the image is visually scaled in the UI, pointer coordinates must be mapped back to the original image coordinate space before sampling.

Example:

```text
preview coordinate
↓
mapped original coordinate
↓
sample original pixel
```

---

# 10. Palette Generator

COLORLAB must generate palettes without images.

Required generation modes:

- random
- locked random
- seed color
- harmony
- manual

---

# 11. Random Generation

Random generation must support:

- generate new palette
- regenerate palette
- lock swatches
- regenerate unlocked swatches only
- choose palette size
- save generated palette

Default palette size:

```text
5 colors
```

Supported size:

```text
3–12 colors
```

---

# 12. Seed Color Generation

Seed color generation starts from one color.

Input methods:

- hex value
- color picker
- existing swatch
- sampled image color

Minimum output:

- seed color
- one contrast color
- one accent color
- one neutral/support color
- one dark or light companion

Seed generation may use HSL, LAB, OKLCH, or implementation-defined color logic.

The output must remain editable.

---

# 13. Harmony Generation

Required harmony modes:

- complementary
- analogous
- triadic
- tetradic
- split-complementary
- monochrome

Harmony output must:

- remain editable
- support locked swatches
- save to the palette library
- export like any other palette

---

# 14. Manual Palette Builder

Manual palette creation must support:

- add swatch
- remove swatch
- duplicate swatch
- reorder swatches
- paste hex
- use color picker
- copy hex
- rename palette
- add tags
- save palette

Manual palette creation is required.

Not all useful palettes come from images.

---

# 15. Palette Data Model

```ts
type ColorlabPalette = {
  id: string;
  name: string;
  swatches: ColorlabSwatch[];
  sourceType: PaletteSourceType;
  tags: string[];
  notes?: string;
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};
```

---

# 16. Swatch Data Model

```ts
type ColorlabSwatch = {
  id: string;
  hex: string;
  label?: string;
  locked: boolean;
};
```

No runtime role is required for the functional build.

Roles, attributes, map mappings, and playlist mappings are deferred.

---

# 17. Palette Source Types

```ts
type PaletteSourceType =
  | "generated"
  | "image_extracted"
  | "seed_color"
  | "harmony"
  | "manual"
  | "imported"
  | "duplicated";
```

---

# 18. Palette Library

The Palette Library is the home screen.

It must show saved palettes as cards.

Each card should include:

- palette name
- swatch strip
- source type
- tags
- favorite status
- last edited
- quick export button

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

# 19. Save Behavior

Save behavior must be obvious.

Required UI states:

- unsaved changes
- saving
- saved
- save failed

The user should never lose a palette silently.

Manual save must exist even if autosave also exists.

---

# 20. Recovery Behavior

COLORLAB must protect work.

Minimum recovery behavior:

- current draft persists locally
- unsaved changes warning
- deleted palette recovery if practical
- duplicate-before-destructive-edit option
- save failure message

Preferred persistence for first build:

```text
IndexedDB or local project storage
```

The implementation must choose one primary persistence path.

Do not split saved palettes across multiple silent stores.

---

# 21. Preview Templates

Preview templates are allowed but secondary.

They exist only to show possible use of colors.

Templates are examples, not integrations.

Allowed templates:

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

# 22. Color Asset Variants

COLORLAB may create simple color asset variants from a palette.

Allowed variants:

- gradient
- texture
- pattern
- animated pulse
- swatch sheet

These variants are optional for first build unless easy to implement.

Palette creation remains the priority.

---

# 23. Texture Direction

Texture generation may include:

- grain texture
- soft noise texture
- paper texture
- vapor/haze texture
- gradient mesh-like texture
- tiled color field

Textures must be generated from saved or active palettes.

Textures are creative assets.

They are not runtime simulation.

---

# 24. Animated Pulse Direction

Animated pulse generation may include:

- slow color fade
- two-color pulse
- multi-color loop
- glow pulse
- stripe pulse
- ambient wash

Pulse export may be deferred.

The first build may preview pulses in-browser only.

Animated pulse is a creative color option, not a runtime scheduler.

---

# 25. Export Formats

Required exports:

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

# 26. SVG Export

SVG export must support:

- swatch strip
- palette name
- optional hex labels
- optional swatch labels
- transparent or solid background

---

# 27. PNG Export

PNG export must support:

- swatch strip
- square palette card
- optional palette name
- optional hex labels

PNG export should be useful for:

- visual review
- sharing
- moodboards
- Pinterest
- documentation

---

# 28. ASE Export

ASE export must support:

- palette name
- swatch names if available
- RGB color values

Label clearly:

```text
ASE swatch exchange export
```

Do not promise guaranteed Affinity install.

Compatibility testing belongs in implementation QA.

---

# 29. JSON Export

JSON export must include:

- palette id
- palette name
- swatches
- source type
- tags
- notes
- favorite
- archived
- createdAt
- updatedAt

JSON must be readable and stable.

---

# 30. Remove Useless Items

The build should remove, hide, or defer any UI that does not support palette creation.

Remove from the primary UI:

- governance panels
- approval status
- runtime authority warnings
- Projection Lab launcher
- map runtime panels
- playlist runtime panels
- stale/lineage displays
- quarantine language
- activation language

These may exist internally later.

They do not belong in the functional palette tool UI.

---

# 31. Acceptance Criteria

This build is accepted only when:

- imported images keep original size
- image preview scaling does not damage source image
- extraction samples from original image
- users can create palettes without images
- users can generate random palettes
- users can generate seed palettes
- users can generate harmony palettes
- users can manually build palettes
- users can edit swatches
- users can save palettes
- users can reopen palettes
- users can export SVG
- users can export PNG
- users can export ASE
- users can export JSON
- the UI feels like a color tool
- the tool helps create actual palettes for later WOS, PLAY, ImageLab, merch, and design use

---

# 32. Implementation Guide

- **Where:** `chatGPT-share/WOS-share/COLORLAB/SPECS/active/0629H_COLORLAB_FunctionalPaletteTool_v1.0.0.md`
- **What:** Build the functional palette tool first: import images safely, generate palettes, edit/save palettes, and export usable assets.
- **Expect:** COLORLAB becomes usable as a real palette creation tool before any map, playlist, projection, runtime, or governance features are reintroduced.
