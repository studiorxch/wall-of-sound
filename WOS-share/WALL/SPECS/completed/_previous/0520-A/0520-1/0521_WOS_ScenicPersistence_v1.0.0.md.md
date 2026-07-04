---
Generated: 
System: WOS  
Domain:  
Component: 
Version: 1.0.0
Summary:
Description:
Tags:
Status:
---
# Discovery

---
# Spec
```
# 0521_WOS_ScenicPersistence_v1.0.0

## Overview

Scenic Persistence extends PassengerMode from:

- noticing significance  
    to:
- emotionally lingering within significance

The system introduces:

- observational hesitation
- release resistance
- scenic fixation
- return glances
- inertia drag
- environmental attachment

without:

- scripts
- objectives
- hard camera locks
- cinematic rails

The camera behaves less like:

- a gameplay camera

and more like:

- a distracted passenger
- a contemplative observer
- a drifting consciousness

This system transforms:

```
attention → emotional duration
```

---

# Core Philosophy

## Attention is not enough

Current architecture:

- detects significant geography
- biases bearing and silence
- modulates inertia

But real observational behavior also includes:

- hesitation
- lingering
- reluctance to leave
- subconscious return
- scenic afterimage

Humans do not instantly release meaningful spaces.

Neither should WOS.

---

# System Goals

## Introduce cinematic holding behavior

The camera should:

- slow before departure
- resist transitions
- overshoot and settle back
- retain directional memory
- softly re-acquire important spaces

without:

- feeling mechanical
- snapping
- explicit scripting

---

# New Runtime Module

```
engine/scenicPersistence.js
```

Global:

```
SBE.ScenicPersistence
```

Consumes:

- PassengerMode
- AttentionGeography
- WorldDriftManager
- WorldAtmosphere
- RouteCamera state

Produces:

- persistence influence
- release resistance
- linger curves
- scenic momentum
- return impulses

---

# Architectural Role

## AttentionGeography decides:

```
"What matters?"
```

## ScenicPersistence decides:

```
"How difficult is it to emotionally leave?"
```

Critical separation.

Attention determines:

- attraction

Scenic Persistence determines:

- temporal attachment

---

# Core Concepts

---

# 1. Persistence Score

Computed continuously.

```
persistenceScore = (  fieldWeight *  proximity *  silenceAffinity *  atmosphericIntensity *  familiarityModifier *  motionSuppression)
```

Range:

```
0.0 → 1.0
```

Controls:

- linger duration
- release softness
- bearing decay
- inertia drag
- return glance probability

---

# 2. Scenic Drag

High persistence softens movement release.

Example:

```
Brooklyn Bridge at night rain:camera takes longer to rotate away
```

Applied to:

```
frame.tBearingframe.tZoomframe.tPitch
```

NOT:

```
hard lock
```

Instead:

```
slower emotional release
```

---

# 3. Return Glance System

After leaving a high-persistence field:

- camera may briefly look back
- slight bearing recoil
- subtle horizon reacquisition

Characteristics:

- probabilistic
- rare
- atmospheric
- soft amplitude

Never:

- dramatic
- gamey
- obvious

---

# 4. Release Threshold

Each field develops:

```
emotional inertia
```

Camera only fully releases when:

- distance grows
- competing field exceeds weight
- soundtrack energy rises
- silence window ends
- environmental conditions shift

---

# 5. Persistence Memory

Recent scenic encounters leave:

```
afterimage residue
```

This affects:

- nearby future framing
- silence likelihood
- pacing softness
- future field attraction

Example:

```
Leaving Red Hook waterfront in fog slightly biases the next 30–60 seconds toward slower pacing.
```

---

# Runtime State

```
_state = {  activeFieldId: null,  persistence: {    score: 0,    accumulated: 0,    releaseVelocity: 0.02,    scenicDrag: 0,  },  returnGlance: {    eligible: false,    probability: 0,    cooldownUntil: 0,  },  memory: {    residue: 0,    residueDecay: 0.001,    recentFields: [],  },};
```

---

# New Attention Field Parameters

Extend AttentionGeography fields.

```
persistenceBias: {  holdAffinity: 1.4,  returnGlanceAffinity: 1.2,  releaseResistance: 1.5,  residueStrength: 1.3,}
```

---

# Environmental Influence

## Rain

- increases persistence
- increases return glance probability

## Fog

- increases scenic drag
- slows release velocity

## Night

- increases hold affinity
- increases silence persistence

## High soundtrack energy

- reduces persistence
- accelerates release

---

# Drift Coupling

## Deep Night

- strongest persistence

## Morning

- weakest persistence

## Still Dawn

- elevated return glances

## Midday

- low scenic drag

---

# Camera Behaviors

## Soft Bearing Hold

Instead of:

```
tBearing = newBearing
```

Use:

```
tBearing = lerp(current, target, releaseVelocity)
```

Where:

```
releaseVelocity
```

slows under persistence.

---

## Zoom Retention

High persistence slightly delays:

- zoom normalization
- framing reset

Creates:

```
visual reluctance
```

---

## Horizon Memory

Camera retains:

- prior scenic orientation
- prior environmental framing

Allows:

- subconscious continuity

---

# Silence Coupling

High persistence zones:

- amplify silence window probability
- extend silence duration

Result:

```
significant spaces become quieter
```

without muting audio entirely.

---

# Behavioral Examples

---

## Example A — Brooklyn Bridge / Rain / Night

Conditions:

- rain
- low soundtrack energy
- midnight

Behavior:

- camera slows turn-away
- bridge remains near horizon longer
- silence window extends
- occasional return glance after departure

---

## Example B — Industrial Corridor / Midday

Conditions:

- bright daylight
- moderate traffic
- energetic soundtrack

Behavior:

- low persistence
- fast release
- no return behavior

---

## Example C — Red Hook Waterfront / Fog

Behavior:

- elevated scenic drag
- increased pause probability
- softened inertia
- extended silence pacing

---

# Important Constraints

## NEVER:

- fully lock camera
- stop route traversal
- create cutscenes
- trigger scripted events
- visibly announce persistence
- add UI indicators

Persistence must remain:

```
feltnot explained
```

---

# Integration Points

## PassengerMode

Add:

```
applyScenicPersistence()evaluateReturnGlance()
```

inside active passenger tick.

---

## AttentionGeography

Add:

```
field.persistenceBias
```

optional extension.

---

## ViewportAuthority

No changes required.

Persistence only influences:

```
camera softness
```

not authority ownership.

---

# Future Expansion

---

# 1. District Emotional Identity

Entire districts develop:

- persistence profiles
- pacing tendencies
- silence personalities

---

# 2. Infrastructure Memory

Repeated traversals:

- slowly alter persistence
- familiar places lose novelty
- emotionally important spaces deepen

---

# 3. Character-Coupled Persistence

Different passengers:

- linger differently
- resist differently
- prefer different environments

---

# 4. Seasonal Persistence

Winter:

- stronger silence
- longer holds

Summer:

- faster release
- higher motion energy

---

# Success Criteria

System succeeds when:

- users cannot fully explain camera behavior
- spaces feel emotionally weighted
- transitions feel human
- movement feels contemplative
- atmosphere alters pacing subconsciously

Failure occurs if:

- behavior feels scripted
- users notice deterministic patterns
- camera appears “cinematic” in an obvious way
- movement becomes game-like

---

# Implementation Notes

## Tick Frequency

Reuse PassengerMode cadence:

```
PASSENGER_TICK_MS = 120
```

Avoid additional RAF systems.

---

## Performance

Persistence calculations are lightweight:

- scalar blends
- lerps
- probabilistic checks

No:

- pathfinding
- raycasts
- expensive queries

---

# File Targets

```
engine/scenicPersistence.jsengine/passengerMode.jsengine/attentionGeography.js
```

---

# Final Philosophy

Attention Geography made the world:

```
significant
```

Scenic Persistence makes the world:

```
difficult to emotionally leave
```

That distinction is the foundation of:

- contemplative traversal
- cinematic geography
- observational atmosphere
- environmental consciousness

WOS should not feel like:

```
a camera exploring a world
```

It should feel like:

```
a world slowly affecting a consciousness
```
```

---
# Refinement 

---
# Development

```

```