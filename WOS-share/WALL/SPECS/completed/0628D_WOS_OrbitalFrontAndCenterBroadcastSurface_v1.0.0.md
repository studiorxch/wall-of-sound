# 0628D_WOS_OrbitalFrontAndCenterBroadcastSurface_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** WALL / Orbital Earth / Broadcast Surface  
**Document Type:** Priority Reset + Runtime Containment Spec  
**Version:** v1.0.0  
**Status:** Active Implementation Spec  
**Sequence:** 0628D  
**Depends On:**  
- `0628B_WOS_OrbitalEarthGlobeVisibilityAndMapTransition_v1.0.0.md`
- `0628C_WOS_GlobalMapTintRemovalAndRawGlobePass_v1.0.0.md`

---

## Purpose

Make **Orbital Earth** the front-and-center WOS presentation surface.

Orbital is not a side mode, hidden tab, debug experiment, or optional visual. It is the current primary broadcast-facing WOS surface. Every UI layer, control strip, debug widget, PLAY panel, and global visual treatment must respect that priority.

The goal is:

```text
Orbital first.
Clean broadcast surface.
No leaked controls.
No visual contamination.
No competing UI.
```

---

## Current Failure

Recent screenshots show that even after Orbital entry and tint removal were repaired, unrelated UI controls are still leaking into the broadcast frame.

Visible unauthorized controls include:

```text
120.0
8 Bars
1/4
Q TO STOP
0E 0T 0B
play button
record button
stop square
close X
```

These are not approved WALL broadcast controls.

They appear to belong to one of:

```text
PLAY sampler
Flow-Curve
Scheduler
sequencer
recorder/debug controls
parent-frame overlay
editor timing controls
```

This is a surface containment failure.

---

## Priority Reset

Until this spec passes, freeze:

```text
Canvas recovery
Buildings recovery
Sampler expansion
Buses
Swarm Fish
new PLAY work
new transport controls
new visual FX
new atmosphere/filter work
new HUD styling
```

Allowed work only:

```text
Orbital presentation
broadcast surface containment
UI leak removal
runtime state verification
diagnostics
```

---

## Core Rule

Nothing renders into the WOS broadcast surface unless it is explicitly approved as broadcast-safe.

```text
Default-deny all UI.
Allow only approved WALL controls.
```

---

## Ownership Boundaries

| Surface | Owns | Forbidden |
|---|---|---|
| **WALL / Orbital** | globe, map, camera, route state, approved WALL transport | PLAY sampler/sequencer/editor controls |
| **Broadcast HUD** | clean viewing surface, minimal approved status controls | debug strips, record widgets, timing panels |
| **PLAY** | music, flow-curve, sampler, scheduler, playlist systems | default rendering into WALL broadcast frame |
| **Debug / Dev** | diagnostics, temporary controls, testing overlays | default visibility in broadcast mode |
| **Studio** | authoring canvas, buildings, actor placement | runtime broadcast contamination |

---

## Required Visual Outcome

Orbital view must show:

```text
Earth/globe front and center
clean broadcast frame
approved WOS controls only
no PLAY strip
no sequencer strip
no sampler strip
no debug strip
no record/timing controls
no purple/navy tint
no paper/grain/matte texture
no atmosphere composite over the globe
no fake sphere fallback
```

---

## Scope

Allowed:

```text
hide leaked UI controls from WALL/Broadcast/Orbital
add broadcast-safe allowlist
add dev-only/debug-only gating
add diagnostic report for visible control surfaces
fix body classes or mode gates
fix parent-frame overlay leakage
fix z-index containment
```

Not allowed:

```text
change globe renderer
change camera
change map style swap
change Mapbox core runtime
change PLAY functionality
remove sampler from PLAY
remove Flow-Curve from PLAY
delete debug tools
change Moon
change buses
change buildings
change Studio canvas
```

The goal is containment, not feature deletion.

---

## Required Implementation

### 1. Identify leaked control strip source

Find the component responsible for the visible controls:

```text
120.0
8 Bars
1/4
Q TO STOP
0E 0T 0B
play / record / stop / close controls
```

Report exact source:

```text
file
selector/component
mount point
z-index
parent container
mode gate
reason it appeared in WALL broadcast frame
```

---

### 2. Add broadcast-safe UI allowlist

During Orbital/Broadcast runtime, only approved controls may render.

Approved by default:

```text
WOS transport deck
Orbital / Flight / Drive mode buttons
Launch / Pause / Stop if already part of WALL deck
location/status text if already approved
A3 now-playing block only if parent-frame placement is approved
```

Not approved by default:

```text
tempo controls
bar length controls
quantize controls
record buttons
sampler controls
scheduler controls
Flow-Curve editor controls
debug close buttons
developer counters
hidden test panels
```

---

### 3. Gate PLAY controls away from WALL

PLAY controls must not render into WALL unless explicitly requested by an integration contract.

Acceptable gates:

```text
body.play-editor-active
body.flow-curve-editor-active
body.scheduler-active
body.dev-ui-active
```

Forbidden default:

```text
PLAY control visible because WALL is loaded
PLAY control visible because Orbital is active
PLAY control visible because parent frame is present
```

---

### 4. Gate debug controls away from Broadcast

Debug/dev controls must be visible only when explicitly enabled.

Examples:

```text
?dev=1
localStorage.WOS_DEV_UI === "true"
body.dev-ui-active
```

They must not appear in normal broadcast mode.

---

### 5. Preserve Orbital entry fixes

Do not regress the repaired Orbital path.

Must remain true after this spec:

```js
SBE.OrbitalModeController === SBE.OrbitalMode
SBE.OrbitalEarthMode.isActive() === true after Orbital entry
SBE.OrbitalEarthMode.getGlobeVisibilityReport() is authoritative when active
```

---

### 6. Preserve tint removal

Do not re-enable:

```text
#atmosphere-composite over Orbital
purple/navy wash
paper texture
map dim overlay
orbital rim haze
Mapbox fog bowl ring
```

The 0628C rule must remain active:

```css
body.wos-orbital-earth-active #atmosphere-composite {
  display: none;
}
```

---

## Required Diagnostics

Add or update a report:

```js
SBE.WosBroadcastSurfaceReport?.()
```

or equivalent:

```js
SBE.OrbitalEarthMode.getBroadcastSurfaceReport?.()
```

Report fields:

```js
{
  orbitalEarthActive: boolean,
  broadcastModeActive: boolean,
  visibleControlSurfaces: [
    {
      id: string,
      selector: string,
      owner: "WALL" | "PLAY" | "DEBUG" | "STUDIO" | "UNKNOWN",
      approvedForBroadcast: boolean,
      visible: boolean,
      zIndex: string,
      reason: string
    }
  ],
  leakedControls: [],
  blockers: [],
  passed: boolean
}
```

Blockers should include:

```text
play-controls-visible-in-broadcast
debug-controls-visible-in-broadcast
sampler-controls-visible-in-wall
sequencer-controls-visible-in-wall
unapproved-control-surface-visible
atmosphere-composite-visible-in-orbital
```

---

## QA Procedure

### Test A — Orbital Entry

1. Reload.
2. Click Orbital.
3. Wait 3 seconds.
4. Run:

```js
({
  earthActive: SBE.OrbitalEarthMode?.isActive?.(),
  globeReport: SBE.OrbitalEarthMode?.getGlobeVisibilityReport?.(),
  surfaceReport: SBE.WosBroadcastSurfaceReport?.() || SBE.OrbitalEarthMode?.getBroadcastSurfaceReport?.()
});
```

Expected:

```text
earthActive === true
globe report authoritative
surface report passed === true
no leaked controls
```

---

### Test B — Screenshot Review

Capture the broadcast frame.

Expected visible:

```text
Orbital Earth front and center
clean approved WALL transport controls only
no PLAY/sequencer/debug strip
no Q TO STOP
no tempo/bar/record controls
```

Fail if any of these appear:

```text
120.0
8 Bars
1/4
Q TO STOP
0E 0T 0B
record button
sampler controls
debug close X
```

---

### Test C — Return to Map

1. Return from Orbital to Flight/Map.
2. Run:

```js
SBE.WosModeTransitionController?.getTransitionCleanupReport?.()
```

Expected:

```text
passed: true
normal map restored
no stuck Orbital class
no stuck hidden controls outside proper mode
```

---

### Test D — PLAY Still Works In Its Own Context

Open PLAY / Flow-Curve / Sampler context intentionally.

Expected:

```text
PLAY controls appear only in PLAY-approved context
sampler/sequencer controls still function where they belong
nothing leaks into WALL broadcast frame by default
```

---

## Acceptance Criteria

This spec is complete when:

1. Orbital is visually front and center.
2. The leaked sampler/sequencer/debug strip is gone from the broadcast frame.
3. Bottom deck shows only approved WALL controls.
4. No `120.0`, `8 Bars`, `1/4`, `Q TO STOP`, `0E 0T 0B`, record/stop/debug strip appears by default.
5. PLAY controls are contained to PLAY contexts.
6. Debug controls are contained to dev/debug contexts.
7. Orbital entry still works.
8. Globe visibility report remains authoritative when active.
9. Atmosphere composite stays suppressed during Orbital.
10. No purple/navy tint returns.
11. No paper/grain/matte texture returns.
12. Return to map passes transition cleanup.
13. No new Orbital renderer is added.
14. No Canvas/Building/Studio work is touched.
15. No buses or swarm fish work is touched.

---

## Required Developer Report

After implementation, return:

```text
Files searched:
Files edited:
Leaked control source:
Owner of leaked control:
Mount point:
Selector(s):
Mode gate before:
Mode gate after:
Broadcast-safe allowlist:
Visible control surface report:
Orbital entry QA:
Screenshot QA:
Return-to-map QA:
PLAY-context QA:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No globe renderer changes.
No camera changes.
No Mapbox style-swap changes.
No Moon changes.
No Canvas changes.
No Building changes.
No Buses changes.
No Swarm Fish changes.
```

---

## Stop Conditions

Stop and report if:

```text
leaked control source cannot be identified
controls are injected from parent PLAY frame and cannot be scoped from WALL alone
hiding controls breaks WALL transport deck
hiding controls breaks PLAY sampler in its own context
Orbital entry regresses
globe report becomes non-authoritative again
```

Do not patch with random z-index changes unless the source owner and mode gate are identified.

---

## Final Principle

Orbital is the current WOS front page.

Everything that does not serve Orbital must either be hidden, scoped, or moved out of the broadcast surface.
