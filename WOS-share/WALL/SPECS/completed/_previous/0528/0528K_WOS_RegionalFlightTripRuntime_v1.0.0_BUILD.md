# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Build the first 2-hour regional aircraft trip runtime using the existing AircraftRuntime, AircraftRenderer v2.0.0, ObjectProfileRegistry, AltitudeWorldRenderer, and CloudAtmosphereLayer.

# 0528K_WOS_RegionalFlightTripRuntime_v1.0.0

## Build Status

```text
[BUILD]
```

## Purpose

Create the first complete regional flight proof for WOS.

This system turns the current aircraft bootstrap into a structured 2-hour trip experience:

```text
airport origin
→ taxi / takeoff roll
→ climb
→ cruise
→ descent
→ arrival / completion
```

The goal is not global air traffic simulation.

The goal is a visible, cinematic, testable regional flight that proves:

- low-poly aircraft visuals work in motion
- altitude-aware world color transitions work over time
- clouds become meaningful during climb/cruise
- the camera can follow aircraft without breaking world coherence
- WOS can support longer-form spatial broadcast journeys

---

# Core Doctrine

```text
A flight trip is a programmed continuity arc.
It is not random aircraft spawning.
```

A regional flight should behave like a broadcast segment:

- geographically anchored
- paced for observation
- visually staged
- atmosphere-aware
- camera-compatible
- safe to interrupt, replay, and debug

---

# Non-Goals

This build does **not** implement:

- real FAA route ingestion
- real-time ADS-B flight tracking
- full airport taxi networks
- international/transoceanic routes
- 14–16 hour flights
- multiplayer air traffic
- full 3D aircraft meshes
- landing gear animation
- detailed airport simulation

Those are deferred.

---

# Required New Files

```text
wall/systems/world/regionalFlightTripRuntime.js
wall/systems/presentation/regionalFlightTripDebug.js
```

Optional only if needed:

```text
wall/data/flights/regional_trip_presets.js
```

---

# Load Order

In `index.html`, load:

```html
<script src="./systems/world/regionalFlightTripRuntime.js"></script>
```

after:

```html
<script src="./systems/world/aircraftRuntime.js"></script>
```

and before:

```html
<script src="./render/aircraftRenderer.js"></script>
```

Load debug companion after `main.js`:

```html
<script src="./systems/presentation/regionalFlightTripDebug.js"></script>
```

---

# Runtime Authority

## Owns

`RegionalFlightTripRuntime` owns:

- trip presets
- trip lifecycle timing
- origin / destination pairing
- route interpolation
- altitude profile
- desired camera follow mode
- trip progress value
- trip status

## Does Not Own

It does not own:

- aircraft rendering
- aircraft palette styling
- cloud rendering
- map style
- vessel state
- harbor geometry
- AIS runtime
- low-level camera implementation

---

# Initial Trip Preset

Build one default proof preset.

```js
type RegionalFlightTripPreset = {
  id: string;
  label: string;
  originAirportId: 'JFK' | 'LGA' | 'EWR';
  destinationAirportId: string;
  durationMs: number;
  aircraftClass: 'regional';
  cruiseAltitudeFt: number;
  cruiseSpeedKts: number;
  cameraProfile: string;
  route: Array<{ lat: number; lng: number; label?: string }>;
};
```

Default:

```js
{
  id: 'nyc_to_boston_regional_001',
  label: 'NYC → Boston Regional Flight',
  originAirportId: 'JFK',
  destinationAirportId: 'BOS',
  durationMs: 2 * 60 * 60 * 1000,
  aircraftClass: 'regional',
  cruiseAltitudeFt: 28000,
  cruiseSpeedKts: 420,
  cameraProfile: 'regional_observer',
  route: [
    { lat: 40.6413, lng: -73.7781, label: 'JFK' },
    { lat: 40.7800, lng: -73.5000, label: 'Long Island climb' },
    { lat: 41.0500, lng: -72.4500, label: 'Sound crossing' },
    { lat: 41.6500, lng: -71.6000, label: 'New England cruise' },
    { lat: 42.3656, lng: -71.0096, label: 'BOS' }
  ]
}
```

Note: route points are acceptable as a stylized first proof. Exact aviation routing is deferred.

---

# Trip Lifecycle

```text
IDLE
→ PREPARE
→ TAXI_HOLD
→ TAKEOFF
→ CLIMB
→ CRUISE
→ DESCENT
→ ARRIVAL
→ COMPLETE
```

## Timing Distribution

For a 2-hour trip:

| Segment | Percent | Duration |
|---|---:|---:|
| PREPARE | 0–2% | ~2.4 min |
| TAXI_HOLD | 2–6% | ~4.8 min |
| TAKEOFF | 6–9% | ~3.6 min |
| CLIMB | 9–24% | ~18 min |
| CRUISE | 24–76% | ~62 min |
| DESCENT | 76–94% | ~22 min |
| ARRIVAL | 94–100% | ~7 min |

Implementation may support a debug time scale so the full trip can be tested in minutes.

---

# Altitude Profile

Use normalized trip progress `p = elapsedMs / durationMs`.

```js
type RegionalFlightAltitudeProfile = {
  altitudeFt: number;
  altitudeScalar: number;
  lifecycleState: string;
};
```

Rules:

- ground phases: `0–800 ft`
- takeoff: ramp to `3,000 ft`
- climb: ramp to `28,000 ft`
- cruise: hold near `28,000 ft`
- descent: ramp down to `2,000 ft`
- arrival: ramp to `0 ft`

Altitude scalar should map into the existing altitude-aware world renderer:

```text
0.00 = ground
0.08 = takeoff / low climb
0.35 = mid climb
0.70 = high cruise
1.00 = full cruise
```

---

# Route Interpolation

Implement route interpolation across preset waypoints.

Required helper:

```js
interpolateRoutePoint(route, t) → { lat, lng, headingDeg, segmentIndex }
```

Requirements:

- `t` is normalized `0–1`
- route segment length should be approximated with haversine distance
- progress should move proportionally by segment distance, not equal waypoint count
- heading should be computed from current point to next point

---

# AircraftRuntime Integration

Do not rewrite `AircraftRuntime`.

Add a trip-controlled aircraft entity by either:

## Preferred

Expose a safe AircraftRuntime method:

```js
upsertExternalAircraft(entity)
```

The trip runtime writes a single aircraft state each tick:

```js
{
  id: 'trip_aircraft_001',
  callsign: 'WOS218',
  aircraftClass: 'regional',
  originAirportId: 'JFK',
  lifecycleState,
  lat,
  lng,
  headingDeg,
  altitudeFt,
  altitudeScalar,
  groundSpeedKts
}
```

## Acceptable fallback

Spawn from JFK and update its lat/lng/altitude directly through a documented trip-owned adapter.

Do not create a second aircraft renderer.

---

# Camera Profile

Add a trip camera helper, not a new camera system.

Profile:

```text
regional_observer
```

Behavior:

- follows aircraft smoothly
- keeps pitch between `45–65°` during climb/cruise
- zooms out as altitude increases
- allows clouds and world tint to become visible
- does not snap every frame
- updates camera at a throttled cadence, e.g. every `1000–1800ms`

Recommended:

```js
cameraZoom = lerp(12.8, 7.8, altitudeScalar)
cameraPitch = lerp(45, 62, altitudeScalar)
```

At low altitude, preserve airport readability.

At high altitude, preserve route/world readability.

---

# Atmosphere Integration

Regional flight should passively drive existing systems.

## AltitudeWorldRenderer

No direct rendering mutation.

It should read the aircraft altitude normally.

## CloudAtmosphereLayer

No direct canvas mutation.

Trip runtime may set a recommended preset by stage:

| Stage | Cloud Preset |
|---|---|
| PREPARE / TAXI | clear or thin |
| CLIMB | thin |
| CRUISE | harbor_fog or thin |
| DESCENT | harbor_fog |
| ARRIVAL | clear / harbor_fog |

This must happen through existing public APIs only.

---

# Debug API

Bind:

```js
_wos.debug.regionalFlight
```

Required commands:

```js
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.stop()
_wos.debug.regionalFlight.pause()
_wos.debug.regionalFlight.resume()
_wos.debug.regionalFlight.reset()
_wos.debug.regionalFlight.speed(multiplier)
_wos.debug.regionalFlight.status()
_wos.debug.regionalFlight.camera(bool)
_wos.debug.regionalFlight.preset(id)
_wos.debug.regionalFlight.jump(progress)
_wos.debug.regionalFlight.audit()
```

Examples:

```js
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.speed(60)      // test 2 hours in 2 minutes
_wos.debug.regionalFlight.jump(0.50)     // mid-cruise
_wos.debug.regionalFlight.camera(true)
_wos.debug.regionalFlight.audit()
```

---

# Runtime State

Expose:

```js
SBE.RegionalFlightTripRuntime.getState()
```

Returns:

```js
{
  version,
  enabled,
  active,
  paused,
  presetId,
  elapsedMs,
  durationMs,
  progress,
  speedMultiplier,
  lifecycleState,
  aircraftId,
  cameraFollowEnabled,
  current: {
    lat,
    lng,
    headingDeg,
    altitudeFt,
    altitudeScalar,
    groundSpeedKts,
    segmentIndex
  }
}
```

---

# Performance Rules

- Update trip state at `10Hz` or lower.
- Camera updates must be throttled.
- Do not create another RAF loop unless unavoidable.
- Do not duplicate aircraft rendering.
- Do not fetch route data at runtime for this build.
- Do not trigger heavy geometry loading during trip start.

---

# Validation Checklist

- [ ] `regionalFlightTripRuntime.js` loads with no console errors.
- [ ] `_wos.debug.regionalFlight.start()` starts a trip aircraft.
- [ ] `_wos.debug.regionalFlight.speed(60)` accelerates test playback.
- [ ] `_wos.debug.regionalFlight.jump(0.5)` moves aircraft to cruise.
- [ ] Aircraft uses `AircraftRenderer v2.0.0` low-poly visual path.
- [ ] Aircraft altitude drives existing altitude-world behavior.
- [ ] Cloud layer is visible during climb/cruise.
- [ ] Camera follows smoothly when enabled.
- [ ] Route trace remains useful during takeoff/climb.
- [ ] No duplicate aircraft glyphs appear.
- [ ] No second aircraft renderer is created.
- [ ] Trip can stop/reset cleanly.

---

# Success Criteria

A single regional aircraft can depart NYC and progress through a full 2-hour flight arc.

At accelerated debug speed, the user can visually confirm:

```text
airport departure
→ climb through cloud/altitude color
→ cruise world view
→ descent/arrival
```

The aircraft should feel like the first real WOS object trip, not just an icon moving across a map.

---

# Build Order

1. Create `regionalFlightTripRuntime.js`.
2. Add static NYC→Boston preset.
3. Implement route interpolation and altitude profile.
4. Integrate with `AircraftRuntime` using one visible aircraft entity.
5. Add camera follow helper.
6. Add debug companion.
7. Validate with accelerated trip playback.

---

# Implementation Guide

- Add runtime in `wall/systems/world/regionalFlightTripRuntime.js` and debug companion in `wall/systems/presentation/regionalFlightTripDebug.js`.
- Patch `AircraftRuntime` only if a safe external aircraft upsert method is needed.
- Test with `_wos.debug.regionalFlight.start()`, `_wos.debug.regionalFlight.speed(60)`, and `_wos.debug.regionalFlight.jump(0.5)`.
