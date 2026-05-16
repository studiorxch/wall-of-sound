0513_WOS_LineStyleSystem_v1.0.0.md
GOAL:
Extend SymbolLab construction lines beyond solid strokes into symbolic cartographic and procedural line systems.
This is NOT decorative styling.
Line styles become semantic infrastructure:

- transit routes
- territorial borders
- construction guides
- marching ants
- zoning systems
- rhythm notation
- signal paths
- procedural flow
  Inspired by:
- subway maps
- architectural diagrams
- military cartography
- Bauhaus graphics
- information systems
- schematic diagrams
  Reference direction:
  fine dotted grids,
  dashed transit routes,
  symbolic line rhythms,
  procedural patterning,
  minimal technical drawing language.
  ────────────────────────────────────────
  CORE DESIGN SHIFT
  ────────────────────────────────────────
  Current model:

```js
stroke = solid line
New model:

stroke = render system
A line is now:  {  geometry,  renderStyle,  spacing,  thickness,  cap,  proceduralPattern  }
This architecture is REQUIRED for future:

*  animated paths
*  moving walkers
*  musical sequencing rails
*  symbolic flow systems
*  territorial rendering
*  transit language
────────────────────────────────────────  DATA MODEL  ────────────────────────────────────────
Every drawable line-based object gains:
{  lineStyle: "solid" | "dashed" | "dotted" | "rail" | "double",  dashLength: number,  gapLength: number,  dotRadius: number,  patternSpacing: number,  lineCap: "round" | "square" | "butt"  }
Defaults:  {  lineStyle: "solid",  dashLength: 16,  gapLength: 8,  dotRadius: 2,  patternSpacing: 12,  lineCap: "round"  }
Applies to:

*  line
*  rect
*  roundedRect
*  circle
*  corner
*  polygon (future)
────────────────────────────────────────  PHASE 1 — DOTTED + DASHED  ────────────────────────────────────────
Implement first:

1.  SOLID  Current renderer
2.  DASHED  ctx.setLineDash([dashLength, gapLength])
3.  DOTTED  Procedural circles stamped along path length
IMPORTANT:  Dotted lines are NOT:  ctx.setLineDash()
Reason:  True dotted systems need:

*  independent dot radius
*  spacing control
*  future symbol replacement
*  future animated progression
Implementation:  Sample path distance.  Place circles every patternSpacing.
Pseudo:  for (d = 0; d < length; d += spacing)
Future:  dots may become:

*  symbols
*  walkers
*  glyphs
*  lights
*  particles
────────────────────────────────────────  UI  ────────────────────────────────────────
Construction panel gains:  LINE STYLE section.
Compact segmented buttons:
[SOLID]  [DASH]  [DOT]
Controls below:  Dash  Gap  Dot  Spacing
Context-aware visibility:

*  SOLID → hide controls
*  DASH → show dash/gap
*  DOT → show dot/spacing
UI footprint should remain compact.
Use:  small technical UI,  not large DAW sliders.
────────────────────────────────────────  RENDERING RULES  ────────────────────────────────────────
==================================================  SOLID
Default current rendering.
==================================================  DASHED
Use:  ctx.setLineDash()
Respect:  weight  corner radius  joins  caps
==================================================  DOTTED
Render true procedural dots.
Rules:

*  dots follow geometry
*  dots rotate with transforms
*  dots mirror correctly
*  dots scale correctly
*  dots remain evenly spaced
Required for:

*  transit maps
*  territorial maps
*  construction overlays
*  route systems
Use:  round caps by default.
────────────────────────────────────────  SYMBOLIC USE CASES  ────────────────────────────────────────
Examples:
solid
walls  frames  main geometry
dashed
guides  hidden infrastructure  future routes  zoning
dotted
territorial boundaries  movement trails  musical timing  scan paths  procedural energy
Future:  rail
parallel transit lines
double
subway / roadway systems
wave
audio or electrical flow
────────────────────────────────────────  PREVIEW INTEGRATION  ────────────────────────────────────────
Must render identically in:

*  construction canvas
*  slot thumbnails
*  word preview
*  pattern preview
*  world placement
*  brush placement
No alternate render paths.
────────────────────────────────────────  TRANSFORM SUPPORT  ────────────────────────────────────────
Line styles MUST survive:

*  scale
*  mirror
*  rotate
*  duplicate
*  copy/paste
*  group transforms
Dotted spacing must scale proportionally.
────────────────────────────────────────  FUTURE ARCHITECTURE  ────────────────────────────────────────
This spec intentionally prepares for:
symbolic path rendering:

*  arrows
*  glyph stamps
*  moving symbols
*  animated walkers
*  sequencing rails
Future extension:  {  linePattern: "dot",  patternSymbol: "@proc:3"  }
Meaning:  A line itself can deploy symbols procedurally.
This is foundational for:

*  symbolic graffiti
*  transit systems
*  procedural notation
*  musical route systems
────────────────────────────────────────  FILES EXPECTED  ────────────────────────────────────────
Likely touched:

*  engine/symbolRenderer.js
*  engine/glyphConstructor.js
*  ui/symbolDrawer.js
*  styles.css
Possible:

*  engine/pathSampler.js (recommended helper)
────────────────────────────────────────  SUCCESS CRITERIA  ────────────────────────────────────────
PASS CONDITIONS:
✓ Solid lines unchanged  ✓ Dashed lines functional  ✓ True dotted rendering functional  ✓ Dots evenly distributed along paths  ✓ Dots survive transforms  ✓ Slot previews render correctly  ✓ World placement renders correctly  ✓ Brush placement renders correctly  ✓ UI compact and technical  ✓ No duplicate render paths introduced
END

```
