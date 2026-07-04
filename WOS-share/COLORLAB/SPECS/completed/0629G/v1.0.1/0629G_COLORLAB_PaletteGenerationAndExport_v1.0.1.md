---
title: "COLORLAB Palette Generation and Export"
filename: "0629G_COLORLAB_PaletteGenerationAndExport_v1.0.1.md"
version: "1.0.1"
date: "2026-06-29"
system: "COLORLAB"
module: "Palette Generation and Export"
type: "product-spec"
status: "[REVIEW]"
build_readiness: "[REVIEW]"
owner: "StudioRich / WOS"

canonical_scope:
  - palette library
  - palette generation
  - image-based extraction
  - seed-color generation
  - harmony generation
  - manual palette editing
  - palette editing
  - map theme editor
  - playlist theme editor
  - palette collections
  - SVG export
  - PNG export
  - ASE export
  - JSON export

terminology_notes:
  - "Palette Attributes are COLORLAB-owned design labels."
  - "Palette Attributes are not WOS runtime layer names."
  - "Map Theme Editor and Playlist Theme Editor are design editors, not runtime controllers."
  - "Projection Lab remains Advanced Analysis, not the lead product surface."

parent_context:
  - "COLORLAB_CURRENT.md"
  - "COLORLAB_SOURCE_INDEX.md"
  - "COLORLAB_BUILD_STATUS.md"

related_specs:
  - "0522A_COLORLAB_PaletteGovernance_v1.3.0.md"
  - "0522I_COLORLAB_PaletteIntelligence_v1.1.0.md"
  - "0524E_COLORLAB_ProjectionLabUX_v1.0.1.md"
  - "0524F_COLORLAB_ProjectionPreviewSurface_v1.0.0.md"

supersedes:
  - "0629G_COLORLAB_PaletteGenerationAndExport_v1.0.0.md"
---

# 0629G_COLORLAB_PaletteGenerationAndExport_v1.0.1

## Build Readiness

**Status:** `[REVIEW]`

This revision resolves the primary v1.0.0 review blockers:
- separates COLORLAB palette attributes from WOS runtime layer names
- clarifies Map Theme Editor and Playlist Theme Editor as design editors
- removes Palette Cycling from v1.0.0 scope
- clarifies seed/harmony generation as implementation-defined but bounded
- replaces vague “muddy color” cleanup language with objective cleanup behavior
- explicitly prohibits preview surfaces from mutating WOS runtime
- keeps Projection Lab as Advanced Analysis rather than the lead surface

This document is **not yet BUILD**.

It should receive one confirmation review before `[FREEZE — GO]`.

---

# 1. Core Product Doctrine

A palette is a first-class creative asset.

A palette is not:
- only an image extraction result
- only a runtime profile
- only a governance artifact
- only a temporary preview
- only a map style

A palette is a reusable design object that can support:
- WOS maps
- playlists
- posters
- cover art
- ImageLab references
- broadcast graphics
- Affinity workflows
- StudioRich visual systems

Core rule:

```text
No palette is useful until it can be saved, edited, previewed, reused, and exported.
```

COLORLAB must first be a practical color tool before it becomes a mood, music, or runtime intelligence system.

---

# 2. Primary User Goal

The user should be able to:

```text
generate or extract colors
↓
adjust them quickly
↓
test them on a map or playlist design surface
↓
save them into a palette library
↓
export them for design use
```

The workflow should feel closer to:

```text
Coolors + Adobe Color + map theme editor
```

than a governance console.

---

# 3. Product Workflow

The intended workflow is:

```text
Palette Library
        ↓
Palette Generator
        ↓
Palette Editor
        ↓
Map Theme Editor
        ↓
Playlist Theme Editor
        ↓
Projection Lab (Advanced Analysis)
        ↓
Export
```

Projection Lab is no longer the lead surface.

Projection Lab remains valuable as:
- advanced environmental testing
- time/weather stress testing
- projection-mode comparison
- source-bias inspection
- advisory analysis

But the primary COLORLAB workflow begins with:
- palettes
- generation
- editing
- saving
- exporting

---

# 4. Product Boundary

COLORLAB owns:
- palette creation
- palette editing
- palette storage
- palette export
- palette collections
- palette design previews
- map theme design editing
- playlist theme design editing

COLORLAB does NOT own:
- WOS runtime activation
- WOS final map rendering
- WOS runtime layer vocabulary
- approval governance as a visible user workflow
- runtime import enforcement
- music mood inference in v1.0.0
- ML-based color recommendation in v1.0.0

Preview surfaces may show how palettes could look.

Preview surfaces may NOT:
- mutate WOS runtime
- activate WOS runtime state
- define WOS runtime truth
- own WOS renderer behavior
- replace WOS import validation

---

# 5. Primary Screens

COLORLAB should prioritize these screens:

| Screen | Purpose |
|---|---|
| Palette Library | browse, organize, reuse palettes |
| Palette Generator | create new palettes |
| Palette Editor | adjust swatches and attributes |
| Map Theme Editor | design-test palette behavior on a map-like surface |
| Playlist Theme Editor | design-test palette behavior on playlist surfaces |
| Projection Lab | advanced analysis and environmental stress testing |
| Export Panel | export palette to usable formats |

---

# 6. Palette Library

The Palette Library is the default home screen.

It should show saved palettes as cards.

Each palette card should include:
- palette name
- swatch strip
- source type
- tags
- date created
- last edited
- favorite status
- usage labels
- export status

Allowed actions:
- open
- duplicate
- rename
- edit
- favorite
- archive
- delete
- export

Library filters:
- all
- favorites
- map themes
- playlist themes
- image-derived
- generated
- imported
- archived

---

# 7. Palette Data Model

A palette must include:

```ts
type ColorlabPalette = {
  id: string;
  name: string;
  colors: ColorlabSwatch[];
  sourceType: PaletteSourceType;
  tags: string[];
  notes?: string;
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};
```

The palette model must remain color-first.

It must not embed WOS runtime authority.

---

# 8. Swatch Data Model

Each swatch must include:

```ts
type ColorlabSwatch = {
  id: string;
  hex: string;
  attribute?: PaletteAttribute;
  locked: boolean;
  label?: string;
};
```

Swatches should support:
- hex editing
- color picker editing
- lock/unlock
- drag reorder
- duplicate
- delete
- attribute assignment
- copy hex

---

# 9. Palette Source Types

Supported source types:

```ts
type PaletteSourceType =
  | "generated"
  | "image_extracted"
  | "seed_color"
  | "manual"
  | "imported"
  | "duplicated";
```

Source type must be visible but should not dominate the UI.

---

# 10. Palette Attributes

Palette Attributes are COLORLAB-owned design labels.

They are not WOS runtime layer names.

Initial attributes:

```text
primary
secondary
accent
highlight
shadow
glow
neutral
muted
background
foreground
atmosphere
contrast
softener
```

Attributes are optional.

A palette can remain a simple unassigned color set.

---

## 10.1 Attribute Mapping Boundary

Map and playlist systems may map COLORLAB attributes into their own domain roles.

Example:

```text
COLORLAB attribute: primary
→ Map role: road
```

or:

```text
COLORLAB attribute: accent
→ Playlist role: track highlight
```

This mapping is external to the core palette asset.

COLORLAB may provide a design mapping UI.

COLORLAB may NOT own canonical WOS runtime layer vocabulary.

---

# 11. Palette Generation Modes

COLORLAB v1.0.1 must support these creation modes:

| Mode | Purpose |
|---|---|
| Random | generate a fresh palette |
| Locked Random | regenerate unlocked colors only |
| Seed Color | generate from one starting color |
| Harmony | generate using color harmony logic |
| Image Extraction | extract from uploaded/found image |
| Manual Build | create from scratch |
| Duplicate Existing | branch from saved palette |

---

# 12. Random Generator

Random generator must support:
- generate palette
- regenerate palette
- lock individual colors
- regenerate unlocked colors
- choose palette size
- quick save
- quick duplicate

Default palette size:

```text
5 colors
```

Supported palette sizes:

```text
3–12 colors
```

Random generation may use implementation-defined color logic as long as:
- output is valid hex color data
- locked colors remain unchanged
- generated palettes can be edited manually
- generated palettes can be saved to the library

---

# 13. Seed Color Generator

The user may start from a single color.

Seed input methods:
- hex input
- color picker
- sampled image color
- selected existing swatch

Seed generation should create a practical supporting palette.

Minimum output:

```text
seed color
1 contrast color
1 accent color
1 neutral/support color
1 dark or light companion
```

Seed generation may use:
- HSL adjustment
- LAB adjustment
- OKLCH adjustment
- complementary offset
- lightness/chroma variation
- implementation-defined color logic

Seed generation must not be treated as factual color theory certification.

It is a creative generation tool.

---

# 14. Harmony Generator

Supported harmony modes:

```text
complementary
analogous
triadic
tetradic
split_complementary
monochrome
```

Deferred harmony-style modes:
- warm_cool
- neutral_accent

Harmony generation may use implementation-defined color-space logic in v1.0.1.

Required behavior:
- mode name must be visible
- generated colors must remain editable
- locked colors must remain unchanged
- harmony output must be saveable as a palette

Do not expose complex color theory unless opened in an advanced panel.

---

# 15. Image Extraction

Image extraction remains one creation path, not the whole product.

Image extraction should support:
- upload image
- sample dominant colors
- sample clicked colors
- remove near-duplicates
- optional low-saturation filtering
- optional low-contrast filtering
- manually replace colors
- save result as palette

Objective cleanup language:

```text
near-duplicate reduction
low-saturation filtering
low-contrast filtering
```

Do not use undefined terms such as:

```text
muddy color cleanup
```

unless a later algorithm spec defines them.

Image extraction must not be treated as finished until the palette can be edited and saved.

---

# 16. Manual Palette Build

Manual build should support:
- add swatch
- paste hex
- choose color
- reorder
- assign attributes
- rename palette
- save palette

Manual build is required because not every useful palette comes from an image.

---

# 17. Palette Editor

Palette Editor must prioritize speed.

Required controls:
- swatch color picker
- hex input
- lock/unlock
- duplicate swatch
- delete swatch
- drag reorder
- attribute dropdown
- rename palette
- tags
- notes
- save
- duplicate
- export

The editor should avoid:
- governance-heavy language
- runtime approval language
- hidden save behavior
- complex lifecycle states

---

# 18. Map Theme Editor

Map Theme Editor allows immediate design testing.

Core behavior:

```text
select palette
↓
map design surface updates without explicit refresh
↓
adjust swatch
↓
map design surface updates without explicit refresh
```

No export should be required to test colors on a map design surface.

The Map Theme Editor may expose map-oriented preview mappings such as:
- water
- land
- roads
- buildings
- labels
- route
- glow
- atmosphere
- background

These are preview mappings.

They are not COLORLAB-owned WOS runtime schema.

The map design surface should be:
- static
- mock-based
- non-runtime
- safe for experimentation

It must not be a live WOS runtime surface unless governed by a separate WOS integration spec.

The Map Theme Editor is a design editor.

It is not WOS runtime authority.

---

# 19. Playlist Theme Editor

Playlist Theme Editor allows palette testing on playlist-oriented design surfaces.

It may include:
- playlist card
- cover background
- waveform/visualizer strip
- track highlight
- title text
- ambient background

These are preview mappings.

They are not PLAY runtime scheduling semantics.

Playlist Theme Editor should help answer:

```text
Can this palette carry a music identity visually?
```

This is not mood inference.

This is not music-to-color AI.

This is visual testing.

---

# 20. Projection Lab Boundary

Projection Lab remains Advanced Analysis.

Projection Lab may be used after a palette or theme exists to test:
- time of day
- weather
- projection modes
- source-bias visibility
- Fiction/Truth distinction
- environmental survivability

Projection Lab is not the default creation surface.

Projection Lab may not convert recommendations into approval or runtime activation.

---

# 21. Palette Collections

Collections allow palettes to be grouped for reuse.

Collection examples:
- Tokyo Night
- Subway Map Tests
- Playlist Covers
- Rain Themes
- WOS Water Tests
- Poster Palettes
- Seasonal Sets

Collections should support:
- create
- rename
- add palette
- remove palette
- reorder palettes

Collection export may be deferred if it complicates v1.0.1.

---

# 22. Palette Cycling Deferral

Palette Cycling is removed from v1.0.1 build scope.

Future cycling may support:
- every track
- every playlist section
- timed interval
- shuffled sequence
- ordered sequence

But this belongs in a future runtime or playlist integration specification.

COLORLAB v1.0.1 focuses on:

```text
generate
edit
save
preview
export
```

not runtime scheduling.

---

# 23. Export Formats

Required v1.0.1 exports:

| Format | Purpose |
|---|---|
| SVG | clean swatch sheet |
| PNG | image strip or card preview |
| ASE | Adobe/Affinity-style swatch exchange |
| JSON | COLORLAB/WOS structured data |

Deferred:
- GPL
- CSS variables
- TXT hex list
- PDF palette sheet

These may be added later if needed.

---

# 24. SVG Export

SVG export should support:
- swatch strip
- labeled palette sheet
- optional hex labels
- optional attribute labels
- palette name
- transparent or dark background

SVG export should be suitable for:
- documentation
- design reference
- Obsidian notes
- moodboards
- sharing

---

# 25. PNG Export

PNG export should support:
- horizontal swatch strip
- square palette card
- playlist preview card
- map theme preview capture

PNG export should be suitable for:
- quick sharing
- Pinterest
- social posting
- visual review
- reference boards

---

# 26. ASE Export

ASE export should support:
- palette name
- swatch names
- RGB color values
- grouped palette export when supported

Purpose:

```text
move COLORLAB palettes into Affinity / Adobe-style design workflows
```

ASE export should be labeled as:

```text
ASE swatch exchange export
```

not:

```text
guaranteed Affinity palette install
```

Compatibility testing belongs in QA/test notes, not this product spec.

---

# 27. JSON Export

JSON export is for COLORLAB/WOS interoperability.

JSON should include:
- palette id
- palette name
- swatches
- attributes
- tags
- source type
- collection id if applicable
- created/updated timestamps

JSON export should remain readable and stable.

---

# 28. Save Behavior

Save behavior must be obvious.

Required states:
- unsaved changes
- saved
- saving
- save failed

The user should never lose a palette silently.

Autosave may exist, but manual save must remain available.

---

# 29. Recovery Behavior

COLORLAB must protect against losing work.

Minimum recovery behavior:
- draft palette persists locally
- unsaved changes warning
- recently deleted palette recovery
- duplicate before destructive edits
- clear saved/unsaved state

Persistence ownership should be explicit during implementation.

Acceptable v1.0.1 persistence targets:
- IndexedDB
- local project storage
- application database

Implementation must choose one primary persistence path and avoid silent divergence between local drafts and saved library entries.

---

# 30. Import Behavior

Import may support:
- JSON palette
- ASE palette
- image file
- pasted hex list

In v1.0.1, import may prioritize:
- image file
- JSON
- pasted hex list

ASE import may be deferred if export is the priority.

---

# 31. Mood and Music Deferral

Mood-to-color and color-to-mood are important future systems.

They are intentionally deferred from v1.0.1.

Future systems may support:
- mood to palette generation
- palette to mood tagging
- playlist color plotting
- track energy to color movement
- genre-based color families
- section-based palette cycling
- music-aware palette transitions

Future mood/music systems must preserve:
- COLORLAB as palette authoring system
- PLAY as playlist/music context system
- WOS as runtime authority system

v1.0.1 must stay focused on:

```text
generate
edit
save
preview
export
```

---

# 32. Acceptance Criteria

This specification is accepted only when:
- users can generate palettes without images
- users can extract palettes from images
- users can manually edit palettes
- users can save palettes into a library
- users can use neutral COLORLAB attributes
- users can map attributes to preview roles without creating WOS runtime authority
- users can design-test palettes on a static map surface
- users can design-test palettes on a playlist surface
- users can export SVG
- users can export PNG
- users can export ASE
- users can export JSON
- users can recover unsaved work
- palette cycling is deferred
- palette creation is faster than governance review
- COLORLAB feels like a color tool

---

# 33. Non-Goals

This specification does not define:
- WOS runtime activation
- runtime profile approval
- mood inference
- music-to-color AI
- ML clustering
- final WOS renderer behavior
- governance review workflows
- collaborative review queues
- live WOS runtime preview
- canonical WOS map layer names
- PLAY runtime scheduling
- palette cycling runtime behavior

---

# 34. Implementation Guide

- **Where:** `chatGPT-share/WOS-share/COLORLAB/SPECS/active/0629G_COLORLAB_PaletteGenerationAndExport_v1.0.1.md`
- **What:** Review this revision against the v1.0.0 review blockers, then approve for `[FREEZE — GO]` if role ownership, preview boundaries, seed generation, and cycling deferral are accepted.
- **Expect:** COLORLAB becomes a fast usable palette tool for WOS maps, playlists, and external design programs without collapsing into runtime authority.
