# 0609G_WOS_CanvasStudioToolRecovery_v1.0.0_BUILD

## Objective

Restore the essential Canvas authoring workflow inside Studio Canvas.

0609F successfully restored Canvas boot and basic drawing functionality.

Canvas now loads inside Studio and supports basic stroke creation.

However, several critical authoring tools remain missing, inaccessible, or nonfunctional.

This build focuses exclusively on recovering the practical drawing, sampling, selection, and export workflows that previously existed inside Canvas.

No new features.

No redesign.

No Wall changes.

---

# Context

Current status:

|Tool|Status|
|---|---|
|Canvas Boot|✅ Working|
|Drawing Surface|✅ Working|
|Text Tool|✅ Working|
|Select Tool|❌ Broken|
|Ball Tool|❌ Broken|
|Walker / Motion Pen|❌ Broken|
|Sampler|⚠ Present but not validated|
|Export Controls|⚠ Unknown|
|Glyph Workflow|⚠ Missing / Not Recovered|
|Shape Tool|Retired|

---

# Design Authority

Canvas is now a Studio authoring tool.

Wall remains the broadcast surface.

Canvas recovery must occur entirely inside Studio.

Do not reintroduce Canvas editing controls into Wall.

---

# Scope

## In Scope

- Select tool recovery
    
- Ball tool recovery
    
- Walker / Motion Pen recovery
    
- Sampler recovery
    
- Save/Open/Export recovery
    
- Glyph workflow audit
    
- Canvas workflow restoration
    

## Out of Scope

- Shape tool restoration
    
- Wall UI changes
    
- Map Lab changes
    
- ColorLab changes
    
- New drawing systems
    
- New export systems
    
- New Canvas features
    
- GlyphLab redesign
    

---

# Shape Tool Doctrine

Shape Tool is considered retired.

Historical role:

```txt
Shape Tool
→ reusable drawing primitives
→ symbol placement
→ object creation
```

Current direction:

```txt
Glyph
→ reusable drawing primitives
→ symbol placement
→ reusable visual language
```

Therefore:

- Do not restore Shape as a visible tool.
    
- Preserve compatibility only if required by legacy scenes.
    
- Treat Glyph as the intended replacement.
    

---

# Requirements

## R1 — Select Tool Recovery

Select tool must:

- select existing objects
    
- select text
    
- select glyphs
    
- select balls
    
- select paths
    

Selection must visibly update active state.

---

## R2 — Ball Tool Recovery

Ball tool must:

- create visible balls
    
- participate in existing simulation
    
- respond to existing physics systems
    

Do not replace Ball behavior.

Repair existing behavior only.

---

## R3 — Walker / Motion Pen Recovery

Walker tool must:

- generate motion paths
    
- create valid path data
    
- interact with existing motion systems
    

Existing motion workflows must be preserved.

---

## R4 — Sampler Recovery

Sampler must be visibly accessible.

Verify:

- bank selection
    
- note selection
    
- audio assignment
    
- audio persistence
    

Do not redesign sampler.

Recover existing workflow only.

---

## R5 — Export Workflow Recovery

Audit and recover:

- Save Scene
    
- Open Scene
    
- Export
    
- Existing file workflows
    

Reuse existing implementation.

Do not invent new export systems.

---

## R6 — Glyph Workflow Audit

Before restoring Glyph access:

Identify:

- glyph ownership files
    
- glyph entry points
    
- glyph dependencies
    
- relationship to Studio Glyph Lab
    

Determine whether Glyph should be:

### Option A

Embedded directly inside Canvas.

### Option B

Launched through Studio Glyph Lab.

### Option C

Presented as a lightweight Glyph picker inside Canvas.

Provide recommendation.

Do NOT blindly duplicate glyph functionality.

---

## R7 — No Wall Regression

Wall must remain unchanged.

No visible Canvas controls may return to Wall.

No new buttons.

No new rails.

No new creator launchers.

---

# Acceptance Tests

## T1

Select tool functions correctly.

---

## T2

Ball tool creates visible balls.

---

## T3

Walker / Motion Pen creates usable motion paths.

---

## T4

Text tool remains operational.

---

## T5

Sampler is accessible.

---

## T6

Sampler bank assignment works.

---

## T7

Save workflow functions.

---

## T8

Open workflow functions.

---

## T9

Export workflow functions.

---

## T10

Glyph workflow audit completed.

---

## T11

Shape tool remains retired.

---

## T12

Wall UI unchanged.

---

# Required Report

## Restored

List all recovered tools.

---

## Broken

List any remaining failures.

---

## Glyph Recommendation

Recommend:

- Embedded Canvas Glyph
    
- Studio Glyph Lab
    
- Hybrid Glyph Picker
    

with rationale.

---

## Files Changed

Provide complete file list.

---

## Acceptance Results

Pass / Fail table.

---

# Success Criteria

Canvas inside Studio regains the core workflow required for:

```txt
Draw
Select
Animate
Sample
Save
Export
```

while preserving:

```txt
Wall = Broadcast Surface

Studio = Creator Environment
```

and keeping Shape permanently retired in favor of Glyph-based workflows.