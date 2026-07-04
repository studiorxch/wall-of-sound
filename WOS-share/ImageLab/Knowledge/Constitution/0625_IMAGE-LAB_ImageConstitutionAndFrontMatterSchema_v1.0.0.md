# Image Lab Constitution + Front Matter Schema v1.0.0

## Purpose

Image Lab is a visual reference-processing system for StudioRich, WOS, Music Lab, video work, merch, posters, playlist worlds, and brand identity systems.

Its purpose is not to collect attractive images. Its purpose is to convert visual references into reusable creative intelligence.

```text
Image → Observation → Tags → Signals → Group → Rules → Prompt → Output → Archive
```

Image Lab treats every image as a fragment that may become:

- a design rule
- a visual system
- a moodboard group
- a brand direction
- a prompt
- a production requirement
- a project reference
- a rejected but useful contrast

---

# 1. Image Lab Constitution

## 1.1 Core Principle

Every image must be processed for **use**, not just saved for inspiration.

A visual reference is only valuable when it can answer at least one of these questions:

- What does this image teach us?
- What group does it belong to?
- What project could use it?
- What visual rule can be extracted?
- What should be copied, avoided, or transformed?
- Can this become a prompt, layout, palette, icon, texture, poster, HUD element, or merch graphic?

## 1.2 Image Lab Is a Refinery

Pinterest, screenshots, camera rolls, websites, books, film stills, album covers, and generated images are discovery sources.

Image Lab is the refinery.

```text
Pinterest = discovery
Image Lab = interpretation
Archivist GPT = conversion
Obsidian / Drive = permanent archive
Projects = deployment
```

The existing Archivist GPT may process music and video. Image Lab extends that archivist model into visual intelligence.

## 1.3 The Three Layers

### Collection Layer

The image enters the archive.

Examples:

- Pinterest reference
- screenshot
- poster
- album cover
- signage
- logo
- interface
- generated image
- film still
- visual identity system
- texture
- color reference
- typography treatment

Goal:

```text
Capture the visual fragment.
```

### Intelligence Layer

The image is interpreted.

The Archivist extracts:

- style
- theme
- mood
- color
- material
- function
- composition
- typography
- iconography
- texture
- visual signals
- project fit
- reusable rules
- prompt potential

Goal:

```text
Turn visual attraction into usable design logic.
```

### Output Layer

The processed image becomes usable.

Outputs may include:

- markdown note
- moodboard group
- prompt pack
- brand requirement
- visual rule
- palette
- layout direction
- icon direction
- poster direction
- WOS HUD reference
- merch reference
- generated-image brief

Goal:

```text
Convert visual logic into project material.
```

## 1.4 Required Processing Questions

Every visual reference should be processed through these questions:

### What is it?

Identify the visual object.

Examples:

- poster
- album cover
- signage system
- product graphic
- UI screen
- title card
- badge
- sticker
- texture
- map
- generated image

### What does it feel like?

Identify the mood.

Examples:

- calm
- cinematic
- dangerous
- disciplined
- romantic
- industrial
- late-night
- ritualistic
- broadcast
- archival
- underground
- high-alert

### What visual system is it using?

Identify the visible design logic.

Examples:

- grid
- centered title
- warning label
- monoline icon
- low-contrast typography
- signal color accent
- modular panel
- cinematic crop
- badge system
- route-map logic
- editorial layout

### What can be used?

Extract only the useful parts.

Examples:

- typography hierarchy
- color palette
- texture
- framing
- icon shape
- composition
- symbol behavior
- material finish
- lighting
- spacing
- information density

### What should not be used?

Identify weak or incompatible traits.

Examples:

- generic AI glow
- decorative clutter
- clip-art feeling
- overproduced stock look
- fake tech aesthetic
- unclear type
- unserious tone
- off-brand color
- too cute
- too corporate
- too literal

### Where does it belong?

Assign the image to groups and projects.

Examples:

- Image Lab
- Music Lab
- WOS
- StudioRich
- Surface.nyc
- HollowBookCo
- merch
- posters
- playlist worlds
- video
- brand identity
- HUD system

### What should it become?

Convert the image into a reusable output.

Examples:

- prompt
- palette
- layout rule
- icon set
- visual requirement
- moodboard group
- brand direction
- poster system
- title card
- interface component
- merch graphic

## 1.5 Keep / Cut / Convert Rule

Every image must receive one decision:

### Keep

The image has strong archive value but may not be immediately useful.

### Cut

The image is not useful enough for the system.

### Convert

The image should become a prompt, rule, palette, component, or project direction.

### Use Now

The image directly supports an active project.

### Conflict Reference

The image is useful because it shows what not to do.

## 1.6 Moodboard Group Rule

A moodboard is not just a collection of images.

A moodboard must define:

- shared style
- shared mood
- shared theme
- repeated visual rules
- strongest references
- weak references
- usable project directions
- prompt translation
- production requirements

A good moodboard produces decisions.

A weak moodboard only produces vibes.

## 1.7 Image Generation Rule

Generated images should not be treated as final output by default.

Generated images should be processed back into the archive when useful.

```text
Reference → Generated Image → Review → Extract → Archive → Improve Next Prompt
```

The image-generation cycle improves when generated outputs are treated as new visual evidence.

## 1.8 Rights Rule

All reference images should be treated as **reference-only** unless ownership, license, or usage rights are confirmed.

The archive should distinguish between:

- reference-only
- owned
- generated
- public-domain
- licensed
- unknown
- fair-use-study
- production-approved

Do not treat saved images as automatically usable commercial assets.

---

# 2. Front Matter Schema: Individual Image Reference

Use this schema for individual image notes.

```yaml
---
title:
date: YYYY-MM-DD
version: v1.0.0
type: image-reference
status: draft

source:
source_url:
source_platform:
creator:
year:
rights_status: reference-only

project:
  - Image Lab

collections:
  - 

category:
visual_object:

style:
  - 
theme:
  - 
mood:
  - 
color:
  - 
material:
  - 
function:
  - 

composition:
  layout:
  framing:
  density:
  focal_point:
  hierarchy:

typography:
  present: false
  type_style:
  hierarchy:
  notes:

iconography:
  present: false
  symbols:
  notes:

texture:
  - 

visual_signals:
  - 

usable_qualities:
  - 

avoid:
  - 

related_groups:
  - 

project_fit:
  StudioRich:
  WOS:
  Music Lab:
  Video:
  Merch:
  Posters:
  Playlist Worlds:
  Brand Identity:

conversion_decision: keep
conversion_outputs:
  - 

prompt_potential:
  prompt_use:
  prompt_terms:
  negative_terms:

archive_notes:
tags:
  - image-lab
---
```

---

# 3. Required Field Definitions

## type

Allowed values:

```yaml
type: image-reference
type: moodboard-group
type: generated-output
type: visual-system
type: prompt-pack
type: brand-direction
```

## status

Allowed values:

```yaml
status: draft
status: processing
status: reviewed
status: approved
status: archived
status: rejected
```

## rights_status

Allowed values:

```yaml
rights_status: reference-only
rights_status: owned
rights_status: generated
rights_status: licensed
rights_status: public-domain
rights_status: fair-use-study
rights_status: unknown
rights_status: production-approved
```

## source_platform

Examples:

```yaml
source_platform: Pinterest
source_platform: Instagram
source_platform: YouTube
source_platform: Website
source_platform: Screenshot
source_platform: Camera Roll
source_platform: Book
source_platform: Film
source_platform: Generated
```

## category

Broad archive category.

Examples:

```yaml
category: urban-infrastructure
category: music-visual-culture
category: broadcast-hud
category: cinema-title-design
category: signage-icons-glyphs
category: texture-surface
category: typography
category: color-palette
category: merch-reference
category: generated-image
```

## visual_object

What the image literally is.

Examples:

```yaml
visual_object: poster
visual_object: album-cover
visual_object: sign
visual_object: interface
visual_object: title-card
visual_object: logo
visual_object: badge
visual_object: map
visual_object: texture
visual_object: product
visual_object: screenshot
```

## conversion_decision

Allowed values:

```yaml
conversion_decision: keep
conversion_decision: cut
conversion_decision: convert
conversion_decision: use-now
conversion_decision: conflict-reference
```

## conversion_outputs

What this image can become.

Examples:

```yaml
conversion_outputs:
  - prompt
  - palette
  - layout-rule
  - icon-direction
  - poster-system
  - hud-component
  - merch-graphic
  - playlist-cover
  - brand-rule
```

---

# 4. Moodboard Group Front Matter Schema

Use this schema when processing a group of images.

```yaml
---
title:
date: YYYY-MM-DD
version: v1.0.0
type: moodboard-group
status: draft

group_name:
group_purpose:
source_count:
primary_source_platform:

project:
  - Image Lab

related_projects:
  - 

category:
style:
  - 
theme:
  - 
mood:
  - 
color:
  - 
material:
  - 
function:
  - 

included_images:
  - 

strongest_references:
  - 

weak_references:
  - 

conflict_references:
  - 

shared_signals:
  - 

extracted_rules:
  - 

project_applications:
  StudioRich:
  WOS:
  Music Lab:
  Video:
  Merch:
  Posters:
  Playlist Worlds:
  Brand Identity:

prompt_direction:
positive_terms:
  - 
negative_terms:
  - 

production_requirements:
  - 

conversion_decision: convert
conversion_outputs:
  - prompt-pack
  - visual-system
  - brand-direction

archive_notes:
tags:
  - image-lab
  - moodboard
---
```

---

# 5. Generated Image Front Matter Schema

Use this schema for AI-generated images.

```yaml
---
title:
date: YYYY-MM-DD
version: v1.0.0
type: generated-output
status: draft

generator:
model:
prompt_source:
prompt_version:
source_moodboard:
source_references:
  - 

project:
  - Image Lab

category:
visual_object:

style:
  - 
theme:
  - 
mood:
  - 
color:
  - 
material:
  - 
function:
  - 

prompt:
negative_prompt:
generation_notes:

successes:
  - 

failures:
  - 

usable_qualities:
  - 

avoid_next_time:
  - 

next_prompt_adjustments:
  - 

project_fit:
  StudioRich:
  WOS:
  Music Lab:
  Video:
  Merch:
  Posters:
  Playlist Worlds:
  Brand Identity:

conversion_decision:
conversion_outputs:
  - 

rights_status: generated

archive_notes:
tags:
  - image-lab
  - generated-image
---
```

---

# 6. Standard Note Body Template

Use this after the front matter.

```md
# {{title}}

## Visual Summary

Briefly describe what is visible and what the image is doing.

## Core Read

Explain why this image matters.

## Visual Signals

- 

## Usable Qualities

- 

## Weak / Avoid

- 

## Grouping

Related groups:

- 

## Project Applications

### StudioRich

### WOS

### Music Lab

### Video

### Merch

### Posters

### Playlist Worlds

### Brand Identity

## Extracted Rules

- 

## Prompt Translation

### Positive Prompt Terms

- 

### Negative Prompt Terms

- 

## Conversion Decision

Decision:

Reason:

## Archive Notes
```

---

# 7. Archivist GPT Behavior Rules

When processing images, the Archivist must:

1. Prioritize usable design logic over vague aesthetic description.
2. Always separate attraction from usability.
3. Always identify project fit.
4. Always generate Obsidian-ready markdown.
5. Always include front matter.
6. Always include rights status.
7. Always include a keep / cut / convert / use-now / conflict-reference decision.
8. Always extract reusable rules.
9. Always produce prompt translation when image generation may be useful.
10. Never assume reference images are cleared for production use.
11. Never describe an image only as “cool,” “vibey,” or “interesting.”
12. Always connect visual references to possible outputs.
13. Always identify what should be avoided.
14. Always distinguish source references from generated outputs.
15. Always treat generated images as reviewable research material unless production-approved.

---

# 8. Minimal Intake Prompt for Archivist GPT

Use this when adding images to the existing Archivist GPT.

```text
Process this image for Image Lab.

Convert it into an Obsidian-ready markdown note using the Image Lab front matter schema. Extract style, theme, mood, color, material, function, visual signals, usable qualities, weak traits, related groups, project fit, prompt potential, reusable rules, and a keep/cut/convert/use-now/conflict-reference decision.

Prioritize practical StudioRich/WOS/Music Lab/video/merch/poster/playlist/brand use over vague aesthetic description.
```

---

# 9. Minimal Group Prompt for Archivist GPT

Use this when processing a group of images.

```text
Process this group as an Image Lab moodboard.

Identify the shared visual signals, strongest references, weak references, conflict references, extracted rules, project applications, production requirements, and prompt direction. Convert the group into an Obsidian-ready moodboard note using the Image Lab moodboard front matter schema.

Treat the group as visual research infrastructure, not decoration.
```

---

# 10. Minimal Generated Image Review Prompt

Use this when reviewing AI-generated images.

```text
Review this generated image for Image Lab.

Use the generated image front matter schema. Identify what succeeded, what failed, what is usable, what should be avoided next time, what prompt adjustments are needed, and whether the image should be kept, cut, converted, used now, or treated as a conflict reference.
```

---

# Implementation Guide

- **Where**: Add this document to the existing Archivist GPT knowledge base and to `Image Lab/00_Index/`.
- **What**: Use the individual image schema for single references, the moodboard schema for grouped images, and the generated-output schema for AI-created images.
- **Expect**: The Archivist GPT can process images into consistent Obsidian-ready notes while supporting moodboards, project-fit analysis, prompt translation, and reusable visual systems.
