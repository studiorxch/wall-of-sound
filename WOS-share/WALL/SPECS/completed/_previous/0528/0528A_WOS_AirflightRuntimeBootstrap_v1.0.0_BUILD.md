# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Build the first visible aircraft runtime layer with airport-origin takeoff, altitude scaling, camera follow, and world influence tint.

---

# 0528A_WOS_AirflightRuntimeBootstrap_v1.0.0

---

layout: spec

title: "WOS Airflight Runtime Bootstrap"
date: 2026-05-28
doc_id: "0528A_WOS_AirflightRuntimeBootstrap_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "airflight_runtime_bootstrap"

type: "runtime-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Defines the first aircraft runtime layer for WOS: airport-origin aircraft, altitude progression, visible takeoff/landing motion, airspace observability, and a reusable world influence field for aircraft-driven atmospheric tint."

doctrine:

- "2D owns truth"
- "2.5D owns presentation"
- "visible output over hidden infrastructure"
- "aircraft reveal world scale"
- "infrastructure coexistence over isolated systems"

depends_on:

- "MapboxViewportRuntime"
- "Maritime25DContext"
- "MarineRenderer"
- "MapLayerCompositor"
- "ViewportLocationAuthority"
- "WorldAtmosphere"

enables:

- "AltitudeAwareWorldRenderer"
- "CloudAtmosphereLayer"
- "AircraftCorridorRuntime"
- "AirspaceInfluenceField"
- "AirportSurfaceAnchors"

tags:

- "airflight"
- "aircraft"
- "altitude"
- "airport"
- "airspace"
- "world-influence"
- "runtime"

---

# 🎯 PURPOSE

Build the first visible aircraft runtime layer in WOS.

This spec exists to prove that aircraft can:

- originate from real airport anchors
- take off visibly from low altitude
- climb through an altitude scale
- shrink and simplify as altitude increases
- cast a visible atmospheric influence around their position
- give maritime, rail, bridge, and city systems a larger spatial context

The immediate goal is not full aviation realism.

The immediate goal is:

```text
visible airspace continuity over New York infrastructure
```

Aircraft should make the world feel taller, larger, and more interconnected.

---

# 🧠 CORE PRINCIPLES

## Aircraft Reveal Scale

Aircraft exist to reveal:

- altitude
- distance
- airport geography
- skyline scale
- harbor context
- route continuity
- clouds and atmosphere

They should not be treated as decorative icons.

---

## Airports Are Spatial Anchors

Aircraft must originate from real geographic anchors.

Required airport anchors:

- JFK
- LGA
- EWR

Each airport anchor must define:

- coordinates
- runway-origin approximation
- takeoff heading set
- landing heading set
- local airspace radius
- default aircraft spawn cadence

---

## Altitude Is Presentation-Critical

Altitude must affect visible rendering immediately.

Aircraft altitude changes:

- icon scale
- shadow opacity
- shadow offset
- influence radius
- camera framing
- layer priority
- world tint strength
- trail length

Altitude is the primary affordance that differentiates aircraft from boats and trains.

---

## World Influence Must Be Tool-Ready

When an aircraft moves, it should be able to color the world around it.

This requires a reusable field:

```text
aircraft position
→ influence radius
→ color wash / blur / glow / noise
→ world response
```

This system must later support:

- aircraft aura
- cloud reveal
- weather bands
- broadcast failure trails
- music-reactive airspace
- train corridor tint
- vessel harbor tint

---

## No Deep Flight Simulation Yet

Do not build:

- real ADS-B ingestion
- full air traffic control
- realistic runway sequencing
- airport taxiway simulation
- complex climb physics
- collision avoidance

Build visible aircraft continuity first.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- aircraft runtime entity model
- airport anchor definitions
- aircraft lifecycle states
- altitude scalar progression
- takeoff and landing route curves
- aircraft camera-follow test mode
- world influence field emission
- aircraft debug tools

This spec may mutate:

- AircraftRuntime internal state
- AirspaceInfluenceField state
- aircraft lifecycle values
- aircraft altitude scalar
- aircraft route progress

This spec may observe:

- Mapbox camera state
- world time
- atmosphere state
- map projection utilities
- current viewport position

This spec MUST NOT mutate:

- Mapbox style URL
- maritime AIS truth
- vessel continuity state
- train runtime truth
- atmosphere baseline truth
- camera authority outside explicit test mode
- 3D building layer style except through compositor controls

---

# 🌊 CONTINUITY ROLE

Aircraft create vertical continuity.

They connect:

```text
airport → air corridor → skyline → harbor → cloud layer
```

Continuity expectations:

- aircraft remain persistent until route completion
- altitude changes smoothly
- shadow fades with altitude
- aircraft simplify with distance/height
- aircraft influence field follows aircraft position
- takeoff and landing remain readable at low altitude

Aircraft may become dormant when offscreen.

Dormant aircraft must preserve:

- route progress
- altitude state
- lifecycle state
- heading
- last known position

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

AircraftRuntime owns:

- aircraft route progress
- aircraft altitude scalar
- aircraft geographic position
- aircraft lifecycle state

AircraftRenderer owns:

- icon scale
- shadow appearance
- altitude visual compression
- trail drawing
- aircraft silhouette

AirspaceInfluenceField owns:

- presentation field values
- tint radius
- falloff
- field color
- field intensity

No renderer may fabricate aircraft truth.

No influence field may mutate aircraft truth.

---

# 📦 DATA MODEL

```ts
type AirportAnchor = {
  id: 'JFK' | 'LGA' | 'EWR';
  label: string;
  lat: number;
  lng: number;
  runwayHeadingsDeg: number[];
  defaultTakeoffHeadingDeg: number;
  localAirspaceRadiusM: number;
  enabled: boolean;
};

type AircraftLifecycleState =
  | 'PARKED'
  | 'TAKEOFF_ROLL'
  | 'CLIMB'
  | 'CRUISE'
  | 'DESCENT'
  | 'LANDING'
  | 'DORMANT'
  | 'COMPLETE';

type AircraftEntity = {
  id: string;
  callsign: string;
  aircraftClass: 'regional' | 'narrowbody' | 'widebody' | 'helicopter' | 'unknown';
  originAirportId: string;
  destinationAirportId?: string;
  lat: number;
  lng: number;
  headingDeg: number;
  groundSpeedKts: number;
  altitudeFt: number;
  altitudeScalar: number;
  routeProgress: number;
  lifecycleState: AircraftLifecycleState;
  influenceProfileId: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type AirspaceInfluenceSample = {
  id: string;
  sourceAircraftId: string;
  lat: number;
  lng: number;
  radiusM: number;
  intensity: number;
  color: string;
  falloff: 'linear' | 'smooth' | 'radial';
  altitudeScalar: number;
  expiresAtMs: number;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const AIRCRAFT_BOOTSTRAP_MAX_ACTIVE = 12;
const AIRCRAFT_UPDATE_HZ = 10;
const AIRCRAFT_DEFAULT_TAKEOFF_DURATION_SEC = 45;
const AIRCRAFT_DEFAULT_CLIMB_DURATION_SEC = 180;
const AIRCRAFT_DEFAULT_CRUISE_ALTITUDE_FT = 9000;
const AIRCRAFT_SHADOW_FADE_ALTITUDE_FT = 2500;
const AIRCRAFT_INFLUENCE_MIN_RADIUS_M = 600;
const AIRCRAFT_INFLUENCE_MAX_RADIUS_M = 6500;
const AIRCRAFT_INFLUENCE_DECAY_MS = 8000;
```

---

# 🔧 CORE FUNCTIONS

```ts
function initializeAircraftRuntime(): void {}

function registerAirportAnchors(anchors: AirportAnchor[]): void {}

function spawnAircraftFromAirport(airportId: string, options?: Partial<AircraftEntity>): AircraftEntity {}

function updateAircraftRuntime(deltaMs: number): void {}

function resolveAircraftRoutePosition(entity: AircraftEntity): { lat: number; lng: number; headingDeg: number } {}

function resolveAircraftAltitude(entity: AircraftEntity): { altitudeFt: number; altitudeScalar: number } {}

function emitAirspaceInfluence(entity: AircraftEntity): AirspaceInfluenceSample {}

function getActiveAircraft(): AircraftEntity[] {}

function setAircraftDebugVisible(enabled: boolean): void {}

function setAircraftCameraFollow(entityId: string | null): void {}
```

---

# 🔄 EXECUTION FLOW

```text
Runtime Boot
→ Register Airport Anchors
→ Spawn Bootstrap Aircraft
→ Resolve Route Progress
→ Resolve Altitude Scalar
→ Emit Airspace Influence Sample
→ AircraftRenderer Observes Active Aircraft
→ Camera Test Mode May Follow Aircraft
→ Influence Field Renders World Tint
→ Debug Tools Report State
```

Update cadence:

```text
10Hz runtime update
60fps renderer observation
```

AircraftRenderer must interpolate between runtime updates.

---

# 🛫 AIRPORT ANCHORS

## Required Bootstrap Anchors

```ts
const AIRPORT_ANCHORS: AirportAnchor[] = [
  {
    id: 'JFK',
    label: 'John F. Kennedy International Airport',
    lat: 40.6413,
    lng: -73.7781,
    runwayHeadingsDeg: [40, 130, 220, 310],
    defaultTakeoffHeadingDeg: 310,
    localAirspaceRadiusM: 14000,
    enabled: true,
  },
  {
    id: 'LGA',
    label: 'LaGuardia Airport',
    lat: 40.7769,
    lng: -73.8740,
    runwayHeadingsDeg: [40, 130, 220, 310],
    defaultTakeoffHeadingDeg: 220,
    localAirspaceRadiusM: 10000,
    enabled: true,
  },
  {
    id: 'EWR',
    label: 'Newark Liberty International Airport',
    lat: 40.6895,
    lng: -74.1745,
    runwayHeadingsDeg: [40, 220, 110, 290],
    defaultTakeoffHeadingDeg: 40,
    localAirspaceRadiusM: 14000,
    enabled: true,
  },
];
```

These coordinates are bootstrap anchors, not precise runway endpoints.

Precise runway geometry is deferred.

---

# ✈️ AIRCRAFT LIFECYCLE

## PARKED

- aircraft exists at airport anchor
- no shadow trail
- optional debug marker only

## TAKEOFF_ROLL

- aircraft moves slowly along approximate runway heading
- altitudeScalar remains near 0
- shadow is tight and dark
- aircraft scale is largest

## CLIMB

- aircraft follows curved outbound route
- altitudeScalar rises from 0 to 1
- shadow fades and offsets
- influence radius expands
- aircraft icon gradually shrinks

## CRUISE

- aircraft moves steadily along air corridor
- influence radius is broad
- shadow hidden
- aircraft becomes simplified

## DESCENT / LANDING

- inverse of climb
- shadow returns near airport
- aircraft scale increases slightly

## COMPLETE

- entity removed or marked dormant

---

# 🎨 AIRSPACE INFLUENCE FIELD

Aircraft must emit a visible field.

Initial visual behavior:

```text
low altitude → small warm ground tint
climb        → expanding translucent airspace wash
cruise       → large faint color field
landing      → contracting field
```

Default field colors:

```ts
const AIRSPACE_INFLUENCE_COLORS = {
  regional:   'rgba(160, 220, 255, 0.18)',
  narrowbody: 'rgba(180, 220, 255, 0.20)',
  widebody:   'rgba(210, 230, 255, 0.22)',
  helicopter: 'rgba(255, 210, 140, 0.20)',
  unknown:    'rgba(200, 220, 240, 0.16)',
};
```

Rendering must support:

- opacity
- radius
- falloff
- debug circle
- blend mode control
- enable / disable toggle

This is the tool needed for:

```text
when a plane flies, color the world around it
```

---

# 🎥 CAMERA TEST MODE

Expose a camera-follow test mode.

Required debug command:

```js
_wos.debug.aircraft.followFirst()
_wos.debug.aircraft.follow(null)
```

Camera follow must:

- preserve pitch
- preserve bearing unless explicitly changed
- smoothly center on aircraft
- keep aircraft below visual horizon during climb
- avoid hard snapping

This is a test mode only.

It must not replace camera doctrine or ViewportAuthority.

---

# 🛰️ OBSERVABILITY IMPACT

Aircraft make these systems visibly more meaningful:

- 3D buildings
- harbor boats
- bridges
- airports
- clouds
- airspace tint
- altitude-aware camera
- map layer compositor

Expected visible outcomes:

- aircraft take off from airport anchors
- aircraft scale down while climbing
- aircraft shadow fades with altitude
- aircraft influence field colors nearby world area
- skyline and harbor gain vertical context
- far aircraft become subtle moving marks

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- MapboxViewportRuntime
- UniversalClock
- WorldAtmosphere
- ViewportLocationAuthority
- MapLayerCompositor

## Writes To

- AircraftRuntimeState
- AirspaceInfluenceFieldState
- AircraftDebugState

## Observed By

- AircraftRenderer
- AirspaceInfluenceRenderer
- AltitudeAwareWorldRenderer
- CloudAtmosphereLayer
- WorldHUD

## Forbidden Mutations

- AISRuntime vessel truth
- MarineRenderer vessel continuity
- Mapbox style source
- Surface state identity
- Channel scheduling
- WorldAtmosphere baseline truth
- ViewportAuthority outside camera test mode

---

# 🎼 ORCHESTRATION NOTES

This spec exposes aircraft runtime state.

It does not orchestrate full broadcasts.

Aircraft may later participate in:

- Surface programming
- Channel scheduling
- cloud transitions
- airport segment blocks
- long-route observability

Those are deferred.

---

# 🧪 VALIDATION CHECKLIST

## Bootstrap Runtime

- [ ] `SBE.AircraftRuntime` loads without breaking maritime runtime
- [ ] JFK / LGA / EWR anchors register
- [ ] aircraft can spawn from each airport
- [ ] aircraft lifecycle progresses over time
- [ ] aircraft altitudeScalar moves smoothly from 0 to 1
- [ ] aircraft position remains geographically projected

## Renderer

- [ ] aircraft are visible at low altitude
- [ ] aircraft scale changes with altitude
- [ ] shadow fades as altitude increases
- [ ] aircraft simplify at high altitude
- [ ] aircraft heading is readable

## Influence Field

- [ ] aircraft emits visible tint radius
- [ ] influence radius expands with altitude
- [ ] influence opacity remains subtle
- [ ] field can be toggled off
- [ ] field does not mutate world truth

## Debug

- [ ] `_wos.debug.aircraft.spawn('JFK')` works
- [ ] `_wos.debug.aircraft.spawn('LGA')` works
- [ ] `_wos.debug.aircraft.spawn('EWR')` works
- [ ] `_wos.debug.aircraft.list()` prints active aircraft
- [ ] `_wos.debug.aircraft.followFirst()` activates camera test follow
- [ ] `_wos.debug.aircraft.influence(true)` toggles influence field

## Screenshot Gates

- [ ] aircraft visibly lifts off from airport area
- [ ] shadow fades during climb
- [ ] world tint visibly follows aircraft
- [ ] aircraft over harbor makes boats/buildings feel contextual
- [ ] aircraft view makes NYC feel vertically layered

---

# 🚫 NON-GOALS

This spec does NOT implement:

- live ADS-B ingestion
- real flight schedules
- accurate runway geometry
- taxiing
- air traffic control
- aircraft collision avoidance
- detailed aircraft models
- full cloud interaction
- full altitude-aware world renderer
- flight audio scoring
- passenger systems
- gameplay scoring

---

# ⏸️ DEFERRED SYSTEMS

Deferred:

- `0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0`
- `0528C_WOS_CloudAtmosphereLayer_v1.0.0`
- `0528D_WOS_AircraftCorridorRuntime_v1.0.0`
- `0528E_WOS_ADSBIngestBridge_v1.0.0`
- `0528F_WOS_AirportSurfaceDetailPass_v1.0.0`

---

# 📚 CANONICAL REFERENCES

- README
- WOS Naming Doctrine
- Surface Channel Doctrine
- WOS Constitutional Spec Template
- MapboxViewportRuntime
- Maritime25DContext
- MarineRenderer
- MapLayerCompositor
- ViewportLocationAuthority
- WorldAtmosphere

---

# 💬 IMPLEMENTATION NOTES

## New Files

```text
wall/systems/world/aircraftRuntime.js
wall/render/aircraftRenderer.js
wall/systems/presentation/airspaceInfluenceField.js
wall/render/airspaceInfluenceRenderer.js
wall/systems/presentation/aircraftDebug.js
```

## Required Script Order

```html
<script src="./systems/world/aircraftRuntime.js"></script>
<script src="./systems/presentation/airspaceInfluenceField.js"></script>
<script src="./render/airspaceInfluenceRenderer.js"></script>
<script src="./render/aircraftRenderer.js"></script>
<!-- debug after main.js -->
<script src="./systems/presentation/aircraftDebug.js"></script>
```

## Required Debug Namespace

```js
_wos.debug.aircraft = {
  spawn,
  list,
  clear,
  follow,
  followFirst,
  influence,
  anchors,
  audit,
};
```

## Implementation Guide

- Add the runtime and renderer files under `wall/systems/world`, `wall/systems/presentation`, and `wall/render`; load runtime/renderers before `main.js`, debug after `main.js`.
- Run `_wos.debug.aircraft.spawn('JFK')`, `_wos.debug.aircraft.followFirst()`, and `_wos.debug.aircraft.influence(true)`.
- Expect a plane to lift from an airport anchor, shrink while climbing, lose its shadow with altitude, and tint the world around its route.
