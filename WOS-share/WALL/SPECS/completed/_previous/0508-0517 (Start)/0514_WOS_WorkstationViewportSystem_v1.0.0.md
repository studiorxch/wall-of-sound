---

# 0514_WOS_WorkstationViewportSystem_v1.0.0

## Core Goal

Turn the WOS + SymbolLab environment into:

```txt id="o0z6xv"
a movable spatial workspace
```

instead of:

```txt id="s9oq44"
a fixed stacked layout
```

---

# REQUIRED FEATURES

## F1 — Vertical Split Resize

Add a draggable horizontal splitter between:

```txt id="5tq9v9"
TOP = world canvas region
BOTTOM = SymbolLab workstation
```

User must be able to:

- drag vertically
- resize both regions live
- preserve proportions
- persist last position in state/uiPrefs

---

# Desired Behavior

Default:

```txt id="b3sznr"
Top:    ~58–65%
Bottom: ~35–42%
```

User-adjustable:

```txt id="7o3nb0"
minTopHeight: 240px
minBottomHeight: 320px
```

---

# F2 — Zoom Controls

Add viewport zoom controls for the WORLD canvas.

UI:

```txt id="q7yrg5"
[-] 100% [+]
```

Placement:

- bottom transport row
  OR
- lower-right viewport overlay

Behavior:

- zoom centered on viewport center
- smooth scaling
- preserve world coordinates

Support:

```txt id="7xbv4x"
25%
50%
100%
200%
400%
Fit
```

Mousewheel support:

```txt id="0zxy7u"
Cmd/Ctrl + wheel = zoom
```

---

# F3 — Pan System

Add:

```txt id="36hf74"
Spacebar + drag
```

for viewport panning.

This is critical.

Expected behavior:

- identical to Figma / Photoshop / Illustrator / TouchDesigner
- temporary hand tool
- works from anywhere over world canvas

Cursor:

```txt id="8m4jly"
grab
grabbing
```

---

# F4 — True Canvas Centering

The world canvas is still visually drifting.

We need:

```txt id="s7s2b0"
true optical centering
```

Requirements:

- center within remaining world region
- independent from workstation width
- independent from right inspector width
- independent from note meter width

Meaning:

```txt id="1uk1p4"
canvas center != page center
```

It must center within:

```txt id="hj9tux"
usable creative viewport
```

NOT the entire browser width.

---

# F5 — Keep Critical Controls Above Fold

Current issue:
transport + tools drift downward as workstation grows.

Must ALWAYS remain visible:

- note meter
- top canvas tool row
- transport controls

These are:

```txt id="j6skxv"
persistent performance controls
```

They cannot scroll away.

---

# Correct Structure

```txt id="8thc2d"
┌──────────────────────────────┐
│ top tools                    │
│ note meter                   │
│                              │
│        world viewport        │
│                              │
│ transport                    │
├──────── draggable split ─────┤
│ SymbolLab workstation        │
└──────────────────────────────┘
```

---

# IMPORTANT

The split resize should ONLY affect:

- world viewport region
- workstation region

NOT:

- inspector
- left meter
- overlay buttons
- top toolbar

Those remain pinned.

---

# Architectural Notes

Recommended:

```js id="0eq3sh"
state.ui.viewportSplit = 0.62;
state.ui.worldZoom = 1;
state.ui.worldPanX = 0;
state.ui.worldPanY = 0;
```

---

# UX Goal

The environment should begin feeling like:

- a creative operating system
- a navigable visual instrument
- an infinite composition surface

NOT:

- stacked webpage panels
- a responsive dashboard
- a fixed web app

This is the transition point where WOS starts behaving like a real world-building tool.
