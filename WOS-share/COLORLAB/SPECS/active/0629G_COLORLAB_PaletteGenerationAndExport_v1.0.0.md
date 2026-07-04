---
title: "COLORLAB Palette Generation and Export"
filename: "0629G_COLORLAB_PaletteGenerationAndExport_v1.0.0.md"
version: "1.0.0"
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
  - map theme editor
  - playlist theme editor
  - palette collections
  - SVG export
  - PNG export
  - ASE export
  - JSON export

parent_context:
  - "COLORLAB_CURRENT.md"
  - "COLORLAB_SOURCE_INDEX.md"
  - "COLORLAB_BUILD_STATUS.md"

related_specs:
  - "0522A_COLORLAB_PaletteGovernance_v1.3.0.md"
  - "0522I_COLORLAB_PaletteIntelligence_v1.1.0.md"
  - "0524E_COLORLAB_ProjectionLabUX_v1.0.1.md"
  - "0524F_COLORLAB_ProjectionPreviewSurface_v1.0.0.md"

terminology_notes:
  - "'Map Theme Editor' replaces 'Map Theme Preview' — the user is actively designing, not merely previewing."
  - "'Playlist Theme Editor' replaces 'Playlist Theme Preview' — same reasoning."
  - "Projection Lab is the advanced analysis surface that stress-tests finished themes."
---

# 0629G_COLORLAB_PaletteGenerationAndExport_v1.0.0

## Build Readiness

**Status:** `[REVIEW]`

This specification resets COLORLAB around its primary job:

```text
make palettes
save palettes
edit palettes
preview palettes
reuse palettes
export palettes
```

COLORLAB must first be a practical color tool before it becomes a mood, music, or runtime intelligence system.

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

---

# 2. Primary User Goal

The user should be able to:

```text
generate or extract colors
↓
adjust them quickly
↓
test them on a map or playlist surface
↓
save them into a palette library
↓
export them for design use
```

The workflow should feel closer to:

```text
Coolors + Adobe Color + map theme tester
```

than a governance console.

---

# 3. Product Architecture

COLORLAB workflow:

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
Projection Lab  (Advanced Analysis)
      ↓
Export
```

Palette Library is the home screen.
Palette creation is the primary activity.
Projection Lab is the advanced analysis and environmental testing surface — not the first experience.

---

# 4. Product Boundary

COLORLAB owns:
- palette creation
- palette editing
- palette storage
- palette preview
- palette export
- palette collections
- map theme testing
- playlist theme testing

COLORLAB does NOT own:
- WOS runtime activation
- WOS final map rendering
- approval governance as a visible user workflow
- runtime import enforcement
- music mood inference in v1.0.0
- ML-based color recommendation in v1.0.0

---

# 5. Primary Screens

COLORLAB should prioritize these screens:

| Screen | Purpose |
|---|---|
| Palette Library | browse, organize, reuse palettes |
| Palette Generator | create new palettes |
| Palette Editor | adjust swatches and roles |
| Map Theme Editor | design and test palette on WOS-like map surface |
| Playlist Theme Editor | design and test palette on playlist visual surface |
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

---

# 8. Swatch Data Model

Each swatch must include:

```ts
type ColorlabSwatch = {
  id: string;
  hex: string;
  role?: PaletteRole;
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
- role assignment
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

# 10. Palette Roles

Palette roles should remain practical and design-facing.

Initial roles:

```text
dominant
accent
glow
shadow
muted
sky_top
sky_mid
haze
water
road
building
land
route
text_ui
background
foreground
```

Roles are optional.

A palette can remain a simple unassigned color set.

---

# 11. Palette Generation Modes

COLORLAB v1.0.0 must support these creation modes:

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

---

# 13. Seed Color Generator

The user may start from a single color.

Seed input methods:
- hex input
- color picker
- eyedropper from image
- selected existing swatch

Seed generation should create:
- variations
- accents
- contrast colors
- supporting neutrals
- optional dark/light companions

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
warm_cool
neutral_accent
```

Harmony mode should remain understandable.

Do not expose complex color theory unless opened in an advanced panel.

---

# 15. Image Extraction

Image extraction must remain one path, not the whole product.

Image extraction should support:
- upload image
- sample dominant colors
- sample clicked colors
- remove near-duplicates
- cleanup muddy colors
- manually replace colors
- save result as palette

Image extraction must not be treated as finished until the palette can be edited and saved.

---

# 16. Manual Palette Build

Manual build should support:
- add swatch
- paste hex
- choose color
- reorder
- assign roles
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
- role dropdown
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

Map Theme Editor should allow immediate design and testing.

Core behavior:

```text
select palette
↓
map surface updates immediately
↓
adjust swatch
↓
map surface updates immediately
```

No export should be required to see colors on a map.

The user is actively designing the theme, not previewing a finished product.

Map surface should include practical roles:
- water
- land
- roads
- buildings
- labels
- route
- glow
- atmosphere
- background

The Map Theme Editor is a design surface.

It is not WOS runtime authority.

Projection Lab is the advanced environmental testing surface for finished themes.

---

# 19. Playlist Theme Editor

Playlist Theme Editor should allow palette design and testing on:
- playlist card
- cover background
- waveform/visualizer strip
- track highlight
- title text
- ambient background

The user is actively designing the playlist theme, not previewing a finished product.

Playlist Theme Editor should help answer:

```text
Can this palette carry a music identity?
```

This is not mood inference yet.

This is visual design and testing.

---

# 20. Palette Collections

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
- export collection

---

# 21. Palette Cycling

COLORLAB should support cycling palettes for future WOS and playlist use.

Cycle modes:
- manual
- every track
- every playlist section
- timed interval
- shuffled
- ordered sequence

In v1.0.0, palette cycling can remain a saved metadata plan.

It does not need to drive live runtime behavior yet.

---

# 22. Export Formats

Required v1.0.0 exports:

| Format | Purpose |
|---|---|
| SVG | clean swatch sheet |
| PNG | image strip or card preview |
| ASE | Adobe/Affinity swatch exchange |
| JSON | COLORLAB/WOS structured data |

Deferred:
- GPL
- CSS variables
- TXT hex list
- PDF palette sheet

These may be added later if needed.

---

# 23. SVG Export

SVG export should support:
- swatch strip
- labeled palette sheet
- optional hex labels
- optional role labels
- palette name
- transparent or dark background

SVG export should be suitable for:
- documentation
- design reference
- Obsidian notes
- moodboards
- sharing

---

# 24. PNG Export

PNG export should support:
- horizontal swatch strip
- square palette card
- playlist preview card
- map theme editor capture

PNG export should be suitable for:
- quick sharing
- Pinterest
- social posting
- visual review
- reference boards

---

# 25. ASE Export

ASE export should support:
- palette name
- swatch names
- RGB color values
- grouped palette export when supported

Purpose:

```text
move COLORLAB palettes into Affinity / Adobe-style design workflows
```

ASE export must be tested against Affinity import behavior.

If exact compatibility varies, export panel should clearly label it:

```text
ASE swatch exchange export
```

not:

```text
guaranteed Affinity palette install
```

---

# 26. JSON Export

JSON export is for COLORLAB/WOS interoperability.

JSON should include:
- palette id
- palette name
- swatches
- roles
- tags
- source type
- collection id if applicable
- created/updated timestamps

JSON export should remain readable and stable.

---

# 27. Save Behavior

Save behavior must be obvious.

Required states:
- unsaved changes
- saved
- saving
- save failed

The user should never lose a palette silently.

Autosave may exist, but manual save must remain available.

---

# 28. Recovery Behavior

COLORLAB must protect against losing work.

Minimum recovery behavior:
- draft palette persists locally
- unsaved changes warning
- recently deleted palette recovery
- duplicate before destructive edits
- clear saved/unsaved state

This is a product requirement, not an advanced feature.

---

# 29. Import Behavior

Import may support:
- JSON palette
- ASE palette
- image file
- pasted hex list

In v1.0.0, import may prioritize:
- image file
- JSON
- pasted hex list

ASE import may be deferred if export is the priority.

---

# 30. Mood and Music Deferral

Mood-to-color and color-to-mood are important future systems.

They are intentionally deferred from v1.0.0.

Future systems may support:
- mood to palette generation
- palette to mood tagging
- playlist color plotting
- track energy to color movement
- genre-based color families
- section-based palette cycling
- music-aware palette transitions

But v1.0.0 must stay focused on:

```text
generate
edit
save
preview
export
```

---

# 31. Acceptance Criteria

This specification is accepted only when:
- users can generate palettes without images
- users can extract palettes from images
- users can manually edit palettes
- users can save palettes into a library
- users can test palettes in the Map Theme Editor
- users can test palettes in the Playlist Theme Editor
- users can export SVG
- users can export PNG
- users can export ASE
- users can export JSON
- users can recover unsaved work
- palette creation is faster than governance review
- COLORLAB feels like a color tool

---

# 32. Non-Goals

This specification does not define:
- WOS runtime activation
- runtime profile approval
- mood inference
- music-to-color AI
- ML clustering
- final WOS renderer behavior
- governance review workflows
- collaborative review queues

---

# 33. Implementation Guide

- **Where:** `WOS-share/COLORLAB/SPECS/active/0629G_COLORLAB_PaletteGenerationAndExport_v1.0.0.md`
- **What:** Build the practical palette generation, editing, Map Theme Editor, Playlist Theme Editor, library, and export workflow before extending mood/music intelligence or Projection Lab.
- **Expect:** COLORLAB becomes a fast usable palette tool for WOS maps, playlists, and external design workflows. Projection Lab becomes the advanced analysis surface for finished themes.
- **Hold:** Do not update COLORLAB_CURRENT.md, COLORLAB_BUILD_STATUS.md, or COLORLAB_ROLLUP until this spec reaches [FREEZE — GO].
