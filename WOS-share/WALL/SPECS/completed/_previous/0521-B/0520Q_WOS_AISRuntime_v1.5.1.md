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
# 0520Q_WOS_AISRuntime_v1.5.1

**Status:** OFFICIAL  
**Date:** 2026-05-20  
**System:** WOS  
**Domain:** Infrastructure Telemetry / Maritime  
**Component:** AISRuntime  
**Version:** 1.5.1

---

# 1. Revision Purpose

v1.5.1 is an:

```
emergency-status correction + lifecycle contradiction closure release
```

This revision resolves implementation-blocking ambiguities from v1.5.0:

- Forced Coast applicability
- AIS emergency beacon handling
- mooring reference definition
- stabilization window behavior
- anchor radius resolution
- environmental rotation scope
- camera protection radius
- feed state vs vessel state separation
- runtime-derived visibility/importance weights
- route metadata source order
- manual persistent-vessel promotion
- Schmidt trigger transition matrix

The goal is to preserve:

```
maritime truth
```

without allowing implementation drift.

---

# 2. Forced Coast Applicability Doctrine

## Blocking Clarification

`STATUS_FORCED_COAST` is:

```
PROTECTED-only
```

NOT universal.

---

## Canonical Rule

A vessel may enter:

```
STATUS_FORCED_COAST
```

ONLY if:

- it is `PROTECTED`
- lifecycle expiration threshold is reached
- no fresh valid telemetry has arrived
- renderer continuity would otherwise visibly break

---

## Non-Protected Vessel Rule

Non-protected vessels do NOT enter Forced Coast.

They follow standard:

```
fade → dormant/evict
```

lifecycle handling.

---

## Doctrine

Forced Coast exists to preserve:

```
viewer-facing continuity
```

not to give every low-value transient vessel a cinematic exit.

---

# 3. AIS Emergency Status Doctrine

## Critical Correction

AIS navigation status code:

```
14
```

represents emergency beacon categories such as:

- AIS-SART
- MOB-AIS
- EPIRB-AIS

These are NOT normal restricted-maneuvering vessels.

---

## Canonical Enum Addition

```
export enum WOSVesselState {  UNDERWAY = "STATUS_UNDERWAY",  ANCHORED = "STATUS_ANCHORED",  MOORED = "STATUS_MOORED",  RESTRICTED = "STATUS_RESTRICTED",  EMERGENCY = "STATUS_EMERGENCY",  STALE = "STATUS_STALE",  OFFLINE = "STATUS_OFFLINE",  DORMANT = "STATUS_DORMANT",  FORCED_COAST = "STATUS_FORCED_COAST",}
```

---

## Corrected AIS Mapping

```
const AIS_STATUS_TO_WOS_STATE: Record<number, WOSVesselState> = {  0: WOSVesselState.UNDERWAY,    // Under way using engine  1: WOSVesselState.ANCHORED,    // At anchor  2: WOSVesselState.RESTRICTED,  // Not under command  3: WOSVesselState.RESTRICTED,  // Restricted maneuverability  4: WOSVesselState.RESTRICTED,  // Constrained by draught  5: WOSVesselState.MOORED,      // Moored  6: WOSVesselState.STALE,       // Aground  7: WOSVesselState.RESTRICTED,  // Engaged in fishing  8: WOSVesselState.UNDERWAY,    // Under way sailing  9: WOSVesselState.RESTRICTED,  // Reserved / HSC  10: WOSVesselState.RESTRICTED, // Reserved / WIG  11: WOSVesselState.RESTRICTED,  12: WOSVesselState.RESTRICTED,  13: WOSVesselState.RESTRICTED,  14: WOSVesselState.EMERGENCY,  // AIS-SART / MOB-AIS / EPIRB-AIS  15: WOSVesselState.STALE,      // Undefined};
```

---

## Fallback Rule

Unknown AIS navigation codes MUST resolve to:

```
WOSVesselState.STALE
```

NOT:

```
WOSVesselState.UNDERWAY
```

Unknown means:

```
uncertain
```

not:

```
confidently moving
```

---

# 4. Emergency Rendering Doctrine

`STATUS_EMERGENCY` is not a normal cinematic vessel state.

MarineRenderer SHOULD initially render emergency contacts as:

- minimal alert glyph
- non-cinematic marker
- no wake trail
- no harbor ambience contribution
- no route-follow camera target by default

Emergency markers should be visually distinct but restrained.

---

# 5. Mooring Reference Doctrine

## Canonical Rule

Upon entering:

```
STATUS_MOORED
```

AISRuntime MUST record:

```
mooringReference = currentPosition;
```

---

## Purpose

`mooringReference` is used for:

- positional locking
- jitter suppression
- outward movement validation
- Schmidt trigger departure checks
- dock stability

---

# 6. Anchoring Reference Doctrine

Upon entering:

```
STATUS_ANCHORED
```

AISRuntime MUST record:

```
anchoringReference = currentPosition;anchorRadiusMeters = resolveAnchorRadius(vessel, environment, harborZone);
```

---

## Anchor Radius Resolution Rule

`anchorRadiusMeters` is computed:

```
once on entry to STATUS_ANCHORED
```

and remains frozen for that anchored session.

---

## Default

```
DEFAULT_ANCHOR_RADIUS_METERS = 120
```

---

## Doctrine

Anchor radius is a lightweight continuity constraint.

It is NOT a live weather/current physics simulation.

---

# 7. Environmental Rotation Scope Doctrine

v1.5.x does NOT compute wind/current vessel rotation inside AISRuntime.

Any environmental rotation language is scoped to:

```
MarineRenderer interpretation
```

or future:

```
MarineEnvironmentRuntime
```

AISRuntime may expose:

- status
- heading
- anchor radius
- confidence
- stale state

but does NOT simulate wind, tide, or current-driven rotation in v1.5.x.

---

# 8. Stabilization Window Behavior

After boundary reprojection, vessel enters:

```
STATUS_STALE
```

for:

```
STABILIZATION_WINDOW_MS = 10000
```

---

## Incoming Telemetry During Stabilization

Fresh telemetry may arrive during the stabilization window.

Canonical handling:

### Valid Fresh In-Water Packets

Stabilization may end early ONLY after:

```
2 consecutive valid in-water packets
```

arrive.

Then:

```
STATUS_STALE → mapped runtime state
```

using AIS status translation.

---

### Invalid / Land-Adjacent Packets

Invalid packets during stabilization are:

- rejected
- not rendered
- not allowed to restart motion
- not allowed to bypass the window

---

### Internal State

AISRuntime MAY update internal confidence metadata during stabilization, but visible motion remains under the Reprojection Blend Pipe until released.

---

# 9. Reprojection Blend Pipe

When boundary reprojection occurs:

- simulation truth may correct immediately
- visible proxy may not jump

MarineRenderer MUST blend from:

```
last visible valid position
```

to:

```
corrected simulation position
```

over:

```
REPROJECTION_BLEND_MS = 7000
```

unless overridden within:

```
5000–10000ms
```

safe range.

---

# 10. Kinetic Energy Schmidt Trigger Doctrine

## Purpose

Prevent state thrashing between stationary and active states.

---

## Departure Trigger

A stationary vessel may depart only when:

```
speedKnots >= 0.8
```

AND:

```
positional delta moves consistently outward
```

for:

```
4 consecutive fixed-step simulation updates
```

relative to:

- `mooringReference`, for `STATUS_MOORED`
- `anchoringReference`, for `STATUS_ANCHORED`

---

## Stationary Re-Lock Trigger

A vessel may re-enter stationary lock only when:

```
speedKnots < 0.2
```

sustained for:

```
60 continuous seconds
```

---

# 11. Valid Schmidt Transition Matrix

Allowed transitions:

```
STATUS_MOORED → STATUS_UNDERWAYSTATUS_ANCHORED → STATUS_UNDERWAYSTATUS_UNDERWAY → STATUS_MOOREDSTATUS_UNDERWAY → STATUS_ANCHORED
```

Direct transitions are disallowed:

```
STATUS_MOORED → STATUS_ANCHOREDSTATUS_ANCHORED → STATUS_MOORED
```

unless fresh AIS status explicitly reports the new stationary state and passes validation.

---

# 12. Camera Protection Radius Doctrine

A vessel becomes:

```
PROTECTED
```

if located within:

```
20% of viewport diagonal
```

relative to:

- active camera center
- cinematic focus origin

---

## Protected Behavior

Protected vessels prefer:

- Forced Coast over immediate eviction
- delayed lifecycle removal
- renderer continuity preservation
- dormant identity retention when applicable

---

# 13. Feed State vs Vessel State Doctrine

Feed health and vessel state remain orthogonal.

---

## Feed-Level States

```
FEED_LIVEFEED_DEGRADEDFEED_OFFLINE
```

represent upstream telemetry health.

---

## Vessel-Level States

```
STATUS_UNDERWAYSTATUS_ANCHOREDSTATUS_MOOREDSTATUS_RESTRICTEDSTATUS_EMERGENCYSTATUS_STALESTATUS_OFFLINESTATUS_DORMANTSTATUS_FORCED_COAST
```

represent individual vessel lifecycle and certainty.

---

## Critical Rule

`FEED_OFFLINE` does NOT automatically rewrite every active vessel to:

```
STATUS_OFFLINE
```

Instead:

- feed state affects global confidence
- individual vessels transition through lifecycle timers
- dead reckoning and degradation rules continue per vessel

---

# 14. Feed State Machine

```
FEED_LIVE    ↓ no packets ≥ 2 minutesFEED_DEGRADED    ↓ no packets ≥ 10 minutesFEED_OFFLINE
```

Recovery:

```
FEED_OFFLINE    ↓ reconnect detectedFEED_DEGRADED    ↓ ≥ 3 valid normalized packets within 30 secondsFEED_LIVE
```

A feed MAY NOT jump directly from:

```
FEED_OFFLINE → FEED_LIVE
```

---

# 15. Runtime-Derived Weight Doctrine

The following are NOT feed-supplied authoritative fields:

```
importanceWeightvisibilityWeight
```

AISRuntime computes them after ingest.

---

## Inputs May Include

- vessel type
- camera proximity
- persistent identity flag
- weather visibility
- vessel size
- ferry/passenger classification
- harbor zone
- active Surface profile

---

## Doctrine

Feeds provide telemetry.

WOS computes visual and cinematic importance.

---

# 16. Route Metadata Source Order

Route/operator metadata may come from multiple sources.

Canonical precedence:

```
persistent registry    ↓protected dormant cache    ↓standard dormant cache    ↓clean feed metadata    ↓unknown
```

---

## Clean Metadata Rule

Feed metadata is usable only if:

- non-empty
- not `"UNKNOWN"`
- not `"N/A"`
- not provider filler
- passes configured label validation

---

# 17. Persistent Vessel Promotion API

AISRuntime MUST expose:

```
AISRuntime.promotePersistentVessel(mmsi, metadata);AISRuntime.demotePersistentVessel(mmsi);
```

---

## promotePersistentVessel()

Marks a vessel as persistent identity.

May define:

- vesselName
- callsign
- operator
- routeIdentity
- appearanceProfile
- homeHarborZone
- notes

---

## demotePersistentVessel()

Removes persistent identity protection.

Does not delete current live vessel state.

---

# 18. Forced Coast Terminal Resolution

`STATUS_FORCED_COAST` applies only to protected vessels.

After:

```
FORCED_COAST_DURATION_MS = 30000
```

resolution:

|Vessel Type|Resolution|
|---|---|
|persistent identity|`PROTECTED_DORMANT_BUCKET`|
|useful non-persistent metadata|`DORMANT_BUCKET`|
|low-value transient|full eviction|

---

## Non-Protected Lifecycle

Non-protected vessels bypass Forced Coast and follow:

```
standard fade → dormant/evict
```

---

# 19. Dormant Buckets

AISRuntime maintains:

```
ACTIVE_BUCKETDORMANT_BUCKETPROTECTED_DORMANT_BUCKET
```

---

## DORMANT_BUCKET

```
MAX_DORMANT_VESSELS = 200LRU eviction
```

---

## PROTECTED_DORMANT_BUCKET

Persistent vessels bypass standard LRU eviction.

Protected dormant TTL:

```
PROTECTED_DORMANT_TTL_MS = 86400000
```

Equivalent:

```
24 hours
```

---

# 20. Dormant Rehydration Lookup Order

Before allocating a new active vessel, AISIngestBridge MUST check:

1. `ACTIVE_BUCKET`
2. `PROTECTED_DORMANT_BUCKET`
3. `DORMANT_BUCKET`

by MMSI.

Multiple active vessels with the same MMSI are:

```
STRICTLY FORBIDDEN
```

---

# 21. Rehydration Merge Table

|Field|Precedence Source|
|---|---|
|`lat` / `lng`|Fresh telemetry|
|`speedKnots`|Fresh telemetry|
|`courseOverGround`|Fresh telemetry|
|`trueHeading`|Fresh telemetry if valid|
|`state`|AIS status mapping matrix|
|`lastUpdateMs`|Fresh telemetry|
|`vesselName`|Dormant/persistent cache unless feed value is clean|
|`callsign`|Dormant/persistent cache unless feed value is clean|
|`operator`|Persistent registry/cache|
|`routeIdentity`|Persistent registry/cache|
|`appearanceProfile`|Persistent registry/cache|
|`dimensions`|Fresh telemetry only if valid|

---

# 22. connectFeed API Contract

```
AISRuntime.connectFeed({  url,  protocol,  authToken,  reconnect,  retryIntervalMs,  normalizationProfile,});
```

---

## Defaults

```
{  reconnect: true,  retryIntervalMs: 5000}
```

---

## Required Fields

|Parameter|Required|Purpose|
|---|---|---|
|`url`|yes|feed endpoint|
|`protocol`|yes|`"ws"`, `"wss"`, or `"polling"`|
|`normalizationProfile`|yes|provider schema profile|

---

# 23. AISIngestBridge Boundary

AISIngestBridge owns:

- provider authentication
- websocket connection
- reconnect behavior
- provider schema translation
- AIS status translation
- packet validation
- normalized payload emission
- dormant lookup before allocation

AISRuntime owns:

- deterministic vessel state
- lifecycle management
- fixed-step simulation
- continuity resolution
- atmospheric output

---

# 24. Normalized Payload Schema

AISRuntime MUST receive already-normalized packets:

```
{  "mmsi": 367123450,  "vesselName": "Example Vessel",  "callsign": "WOS123",  "state": "STATUS_UNDERWAY",  "telemetry": {    "lat": 40.7012,    "lng": -74.0184,    "speedKnots": 12.4,    "courseOverGround": 185.5,    "trueHeading": 182.0  },  "dimensions": {    "lengthMeters": 240,    "widthMeters": 32  },  "timestampMs": 1779300000000}
```

---

# 25. Final Doctrine

```
AISRuntime is not a radar screen.It is a continuity instrument.The harbor must never feel like packets.It must feel alive,heavy,slow,truthful,and endlessly in motion.
```
```

---
# Review/ Refinement 

---
# Development

```

```