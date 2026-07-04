---
layout: spec
title: "Transit Livery Hooks"
date: 2026-06-05
doc_id: "0605C_WOS_TransitLiveryHooks_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "transit_livery_hooks"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Adds a presentation-only livery hook layer for selected live transit actors, enabling future StudioRich, graffiti, sponsored, event, holiday, and debug wraps without mutating truth, feeds, selector, motion smoothing, or Mapbox."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth remains real"
  - "Livery is presentation"
  - "Real vehicle first, skin second"
  - "No fake trucks required"

depends_on:
  - "0604M_WOS_BusAssetPack_v1.0.0"
  - "0604L_WOS_BusDebugLabelPass_v1.0.0"
  - "0605A_WOS_TransitPresencePass_v1.0.0"
  - "0605B_WOS_BusMotionSmoothing_v1.0.0"

enables:
  - "0605D_WOS_CruiseMovementField_v1.0.0"
  - "0605E_WOS_HeroTransitTargeting_v1.0.0"
  - "0605F_WOS_TransitSponsoredWrapPass_v1.0.0"
  - "0605G_WOS_GraffitiTransitWrapPass_v1.0.0"
  - "0605H_WOS_StudioTransitAssignmentPanel_v1.0.0"

tags:
  - "transit"
  - "bus"
  - "livery"
  - "graffiti"
  - "sponsored"
  - "presentation"
  - "studio-ready"
---

# 0605C_WOS_TransitLiveryHooks_v1.0.0_BUILD

## PURPOSE

Create the first presentation-only hook system for transit liveries.

This spec does not implement full graffiti, advertising, or Studio editing.

It creates the safe layer where those future systems can attach.

The goal:

```text
real bus
→ real route
→ real movement
→ presentation livery hook
```

without creating:

```text
fake vehicle truth
synthetic trucks
ad actors
graffiti truth
```

This preserves the stronger architectural position:

```text
Truth stays real.
Worldbuilding rides on presentation.
```

---

# CURRENT BUILD CONTEXT

Completed transit stack:

```text
0604G Feed Inventory          ✅
0604H Realtime Adapter        ✅
0604I Actor Bridge            ✅
0604J Fallback Renderer       ✅
0604K Presentation Selector   ✅
0604L Debug Label Pass        ✅
0604M Bus Asset Pack          ✅
0605A Transit Presence Pass   ✅
0605B Bus Motion Smoothing    ✅
```

Current buses are:

```text
real
visible
selectable
identifiable
classified
present
smooth
```

Missing:

```text
presentation skin identity
```

0605C adds:

```text
liveryKey
wrapKey
surfaceTag
presentationIntent
```

as renderer-readable presentation metadata.

---

# CORE DECISION

Livery is not truth.

A bus remains:

```text
vehicle.bus
```

regardless of whether it is rendered as:

```text
standard MTA
StudioRich
graffiti
sponsored
event
holiday
debug
```

Canonical split:

```text
Actor truth says: what the vehicle is.
Livery hook says: how it is dressed.
```

---

# AUTHORITY BOUNDARIES

## This spec owns

- transit livery hook vocabulary
- local livery assignment cache
- vehicle/route/class targeting rules
- livery metadata normalization
- read-only livery profile resolution
- debug assignment/inspection commands
- renderer-safe livery payload shape

## This spec may read

- `SBE.BusAssetResolver`
- `SBE.BusPresentationSelector`
- `SBE.TruthActorRuntime`
- selected `vehicle.bus` actor metadata
- actor routeId / vehicleId / busAssetClass
- localStorage for development-only livery assignments

## This spec may write

- its own local livery assignment cache
- optional localStorage development assignments
- renderer payload presentation fields only, via renderer integration

## This spec must not write

- TruthActorRuntime
- actor metadata
- MTA adapter rows
- MTA actor bridge rows
- BusPresentationSelector state
- BusMotionSmoothing cache
- TransitPresencePass state
- Mapbox sources/layers
- Studio saved asset library
- real asset assignment authority
- maritime/AIS systems
- Citi Bike/subway systems

---

# NEW FILE

```text
wall/systems/transit/transitLiveryHooks.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/busAssetResolver.js
```

before:

```text
wall/systems/transit/busVisualFallbackRenderer.js
wall/systems/transit/transitPresencePass.js
```

Reason:

```text
renderer and presence can read livery hooks
```

---

# PUBLIC API

Expose:

```js
SBE.TransitLiveryHooks
```

Frozen API:

```js
start()
stop()
isActive()

resolveForActor(actor)
resolveForVehicle(vehicleId)
resolveForRoute(routeId)

assignVehicle(vehicleId, liveryKey, options)
assignRoute(routeId, liveryKey, options)
assignClass(busAssetClass, liveryKey, options)

clearVehicle(vehicleId)
clearRoute(routeId)
clearClass(busAssetClass)
clearAll()

listAssignments()
listLiveries()
getState()
getStats()

setEnabled(enabled)
setDebug(enabled)
```

---

# LIVERY PROFILE MODEL

```js
type TransitLiveryProfile = {
  liveryKey: string
  label: string
  category:
    | "default"
    | "studio"
    | "graffiti"
    | "sponsored"
    | "event"
    | "holiday"
    | "debug"

  paletteRef: string | null
  wrapKey: string | null
  surfaceTag: string | null

  accent: string | null
  roofAccent: string | null
  sidePanelAccent: string | null

  priority: number
  enabled: boolean
  debugOnly: boolean
}
```

All returned profiles must be frozen or cloned safely.

---

# REQUIRED LIVERIES

Initial registry:

```js
default_mta
studiorich_cyan
graffiti_test
sponsored_blank
event_gold
holiday_red
debug_magenta
```

## default_mta

Purpose:

```text
normal transit presentation
```

Category:

```text
default
```

## studiorich_cyan

Purpose:

```text
first StudioRich transit skin hook
```

Category:

```text
studio
```

## graffiti_test

Purpose:

```text
future graffiti wrap placeholder
```

Category:

```text
graffiti
```

Important:

```text
does not draw graffiti yet
```

## sponsored_blank

Purpose:

```text
future ad/sponsor wrap placeholder
```

Category:

```text
sponsored
```

Important:

```text
does not place logos or copy yet
```

## event_gold

Purpose:

```text
future event/hero bus placeholder
```

Category:

```text
event
```

## holiday_red

Purpose:

```text
future seasonal styling placeholder
```

Category:

```text
holiday
```

## debug_magenta

Purpose:

```text
high-visibility diagnostic livery
```

Category:

```text
debug
```

Default:

```text
debugOnly:true
```

---

# ASSIGNMENT PRIORITY

When resolving livery for an actor:

```text
vehicle assignment
→ route assignment
→ class assignment
→ actor metadata busClass special
→ default_mta
```

Priority order:

```js
vehicle > route > class > special > default
```

Reason:

```text
a specific vehicle override must beat a route-wide skin
```

---

# ASSIGNMENT STORAGE

0605C may use in-memory cache.

Optional development persistence:

```text
localStorage['wos.transit.liveryAssignments']
```

Persistence is allowed only for local/dev assignments.

This is not the final Studio asset assignment system.

Future Studio panel must replace this with an explicit asset assignment authority.

---

# RESOLVED LIVERY OUTPUT

`resolveForActor(actor)` returns:

```js
{
  actorId: actor.actorId,
  vehicleId: string | null,
  routeId: string | null,
  busAssetClass: string | null,

  liveryKey: string,
  category: string,
  paletteRef: string | null,
  wrapKey: string | null,
  surfaceTag: string | null,

  accent: string | null,
  roofAccent: string | null,
  sidePanelAccent: string | null,

  source:
    | "vehicle"
    | "route"
    | "class"
    | "special"
    | "default"
}
```

No truth data may be modified.

---

# RENDERER INTEGRATION

Patch:

```text
wall/systems/transit/busVisualFallbackRenderer.js
```

In payload construction:

```js
const livery = SBE.TransitLiveryHooks?.resolveForActor(actor)
```

Then include presentation-only fields:

```js
metadata: {
  ...
  liveryKey: livery.liveryKey,
  liveryCategory: livery.category,
  liverySource: livery.source,
  wrapKey: livery.wrapKey,
  surfaceTag: livery.surfaceTag
}
```

If livery provides presentation accents:

```js
paletteRef = livery.paletteRef || assetProfile.paletteRef
```

Do not mutate:

```text
actor.metadata
asset resolver profile
truth actor
```

---

# PRESENCE PASS INTEGRATION

Patch:

```text
wall/systems/transit/transitPresencePass.js
```

Presence may read livery:

```js
const livery = SBE.TransitLiveryHooks?.resolveForActor(actor)
```

Use only subtle accent influence:

```text
debug_magenta may show strong debug accent
studiorich_cyan may cool class accent
default_mta uses existing class accent
```

Presence must not introduce ads/graffiti drawing.

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.transit
```

Required:

```js
liveryState()
liveryStats()
listTransitLiveries()
listTransitLiveryAssignments()

assignBusLivery(vehicleId, liveryKey, options)
assignRouteLivery(routeId, liveryKey, options)
assignBusClassLivery(busAssetClass, liveryKey, options)

clearBusLivery(vehicleId)
clearRouteLivery(routeId)
clearBusClassLivery(busAssetClass)
clearAllTransitLiveries()

inspectBusLivery(vehicleId)
```

Optional bridge commands in:

```js
_wos.debug.worldActors
```

Allowed aliases:

```js
busLivery(vehicleId, liveryKey)
routeLivery(routeId, liveryKey)
```

---

# EXAMPLES

## Assign a StudioRich skin to one bus

```js
_wos.debug.transit.assignBusLivery("7564", "studiorich_cyan")
```

## Assign graffiti placeholder to one route

```js
_wos.debug.transit.assignRouteLivery("M15", "graffiti_test")
```

## Assign sponsored placeholder to express class

```js
_wos.debug.transit.assignBusClassLivery("express", "sponsored_blank")
```

## Inspect

```js
_wos.debug.transit.inspectBusLivery("7564")
```

---

# HARD RULES

0605C SHALL NOT:

```text
draw actual graffiti
place actual ads
place logos
render text panels
create billboards
create ad actors
create sponsored campaign system
create Studio editor
mutate truth actor metadata
change routes
change bus classification
change motion smoothing
change selector scoring
change MTA feed rows
change Mapbox style
```

---

# PERFORMANCE REQUIREMENTS

```text
no per-frame allocation storms
no actor scan inside livery resolver
constant-time vehicle lookup
constant-time route lookup
constant-time class lookup
frozen registry profiles
safe fallback to default_mta
```

Renderer may call `resolveForActor(actor)` per selected bus.

Target:

```text
500 selected buses without visible slowdown
```

---

# STATE MODEL

```js
type TransitLiveryHooksState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  liveryCount: number
  vehicleAssignmentCount: number
  routeAssignmentCount: number
  classAssignmentCount: number

  persistenceEnabled: boolean
  lastAssignmentAt: number | null
  lastClearAt: number | null
  lastError: string | null
}
```

---

# STATS MODEL

```js
type TransitLiveryHooksStats = {
  resolves: number
  defaultResolves: number
  vehicleResolves: number
  routeResolves: number
  classResolves: number
  specialResolves: number
  invalidLiveryRejects: number
}
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.TransitLiveryHooks exists
no actors required
no map required
no crash
```

## T2 — Default resolve

Given normal bus actor:

```text
resolveForActor(actor).liveryKey === default_mta
source === default
```

## T3 — Vehicle assignment wins

Given vehicle assignment:

```text
vehicle assignment beats route/class/default
```

## T4 — Route assignment wins over class

Given route and class assignment:

```text
route assignment selected
```

## T5 — Class assignment works

Given class assignment only:

```text
class assignment selected
```

## T6 — Special actor fallback

Given `metadata.busClass:'special'` and no explicit assignment:

```text
source === special
event_gold or default special hook selected
```

## T7 — Invalid livery rejected

Expected:

```text
assignVehicle(vehicleId, "missing_livery") returns false
state unchanged
invalidLiveryRejects increments
```

## T8 — Clear vehicle assignment

Expected:

```text
vehicle assignment removed
resolve falls back to next priority
```

## T9 — List liveries

Expected:

```text
all required livery keys returned
```

## T10 — Renderer payload includes livery metadata

Expected:

```text
WSL bus payload metadata includes liveryKey/category/source/wrapKey/surfaceTag
```

## T11 — Presence reads livery safely

Expected:

```text
TransitPresencePass can read livery accent
no crash if livery hook absent
```

## T12 — No truth mutation

Expected:

```text
actor object unchanged after resolve/assign/render
TruthActorRuntime unchanged
```

## T13 — No selector mutation

Expected:

```text
BusPresentationSelector state unchanged
```

## T14 — No smoothing mutation

Expected:

```text
BusMotionSmoothing cache unchanged except normal observe/render flow
livery never writes smoothing records
```

## T15 — No Mapbox mutation

Expected:

```text
no new Mapbox sources
no new Mapbox layers
```

## T16 — Debug commands work

Expected:

```text
liveryState()
listTransitLiveries()
assignBusLivery()
inspectBusLivery()
clearAllTransitLiveries()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
actual graffiti rendering
actual ad rendering
image/logo upload
billboard system
campaign manager
Studio livery editor
route label styling
camera follow
cruise movement field
Citi Bike skins
subway skins
fake trucks
synthetic vehicle truth
```

---

# DEFERRED SYSTEMS

## 0605D — Cruise Movement Field

Aggregate far-altitude movement lights.

## 0605E — Hero Transit Targeting

Follow/select one route or bus for camera/world moments.

## 0605F — Transit Sponsored Wrap Pass

Actual ad panel rendering and campaign rules.

## 0605G — Graffiti Transit Wrap Pass

Actual graffiti/wildstyle wrap rendering.

## 0605H — Studio Transit Assignment Panel

Authoring interface for assigning liveries without console commands.

---

# NEXT SPEC

Recommended next:

```text
0605D_WOS_CruiseMovementField_v1.0.0_BUILD
```

Reason:

```text
current cruise altitude still hides individual buses
far city movement is the next visual-scale gap
```

Alternative if livery hooks reveal strong visual interest:

```text
0605H_WOS_StudioTransitAssignmentPanel_v1.0.0_BUILD
```

but only after the hook layer proves stable.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/transitLiveryHooks.js`; register it in `wall/index.html` after `busAssetResolver.js` and before `busVisualFallbackRenderer.js`; patch `busVisualFallbackRenderer.js` to pass resolved livery metadata into WSL payloads; patch `transitPresencePass.js` to read livery accent safely; add debug commands to `worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/transitLiveryHooks.js`, `node --check wall/systems/transit/busVisualFallbackRenderer.js`, `node --check wall/systems/transit/transitPresencePass.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: Specific buses, routes, or bus classes can be assigned presentation livery keys through debug commands; renderer payloads expose livery metadata; presence cues may subtly reflect livery; truth, selector, smoothing, Mapbox, and feeds remain unchanged.
