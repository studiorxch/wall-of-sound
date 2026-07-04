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
The next step is to make the surface rail _real_, not decorative.

Right now you have:

- atmosphere
- destinations
- travel
- telemetry
- map identity
- persistent surfaces

But surfaces are still mostly visual shells.

The next milestone is:

# Surface Runtime State

Each surface needs to become an actual independent world state container.

---

# Priority Order

~~## 1. Surface Runtime Architecture (MOST IMPORTANT)~~

Before:

- thumbnails
- animations
- procedural previews
- fancy avatar systems

you need persistent state separation.

Each surface should independently preserve:

```
camerazoompitchbearingweathertimeroutemap stylemusic profilerender layersworld settings
```

Otherwise switching surfaces will feel fake.

---

# Why This Matters

You’re transitioning into:

```
channel switching
```

not:

```
opening tabs
```

A channel remembers itself.

Example:

```
TOKYO RAIN- zoomed street-level- rainy atmosphere- neon map style- ambient city soundtrackNYC SUBWAY- underground topology- transit overlay- darker palette- industrial soundscape
```

When users switch back:  
everything should still exist.

That’s the magic.

---

# This Is The True Milestone

Not the UI.

The persistence.

Once this works:  
WOS suddenly feels alive.

---

# After That

## 2. Surface Transition System

When switching surfaces:

DO NOT:

- hard cut instantly

Instead:

- fade atmosphere
- glide camera
- lerp weather
- crossfade soundtrack
- pulse telemetry

Even subtle transitions will massively increase perceived sophistication.

---

# Then

## 3. Surface Identity System

Only AFTER runtime persistence exists:

Add:

- avatars
- generated thumbnails
- color systems
- preview glyphs
- live rings

Because then the visuals actually represent something real.

---

# Then

## 4. World Mode vs Creation Mode

This becomes your major UX split.

---

## WORLD MODE

Minimal UI.

Feels like:

- ambient broadcast
- travel channel
- atmospheric navigation
- living geography

---

## CREATION MODE

Full tools:

- brushes
- emitters
- inspectors
- routing
- systems

This separation will dramatically clean the experience.

---

# Then

## 5. Route Movement / Autopilot

This is where things become emotionally compelling.

Examples:

- fly from NYC → Tokyo
- slow atmospheric travel
- procedural soundtrack adaptation
- weather evolution
- time zone drift

This is the beginning of:  
“passenger mode.”

Huge feature.

---

# Then Eventually

## 6. Ecology / Actors / Traffic

At this point:  
the worlds become inhabited.

And WOS transforms from:

```
beautiful map system
```

into:

```
living audiovisual geography
```

---

# Immediate Recommendation

The next actual implementation should be:

# `SurfaceStateManager`

Canonical structure:

```
SurfaceState = {  id,  name,  camera: {    lng,    lat,    zoom,    bearing,    pitch  },  atmosphere: {},  route: {},  music: {},  layers: {},  renderStyle: {},  createdAt,  updatedAt}
```

Then:

- switching surfaces restores full state
- each surface persists independently
- rail becomes meaningful

That’s the real next step.
```

---
# Refinement 

---
# Development

```

```