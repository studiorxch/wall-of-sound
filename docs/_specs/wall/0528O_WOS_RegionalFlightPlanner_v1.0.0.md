---
spec: 0528O_WOS_RegionalFlightPlanner_v1.0.0
status: active
classification: planner-runtime
created: 2026-05-28
depends_on:
  - 0528K_WOS_RegionalFlightTripRuntime_v1.0.0
  - 0528N_WOS_RegionalFlightPresencePass_v1.0.0
---

# WOS Regional Flight Planner v1.0.0

## Purpose

Replace single hardcoded NYC→BOS route with planner-driven airport selection,
destination pinning, and generated route presets. Transition from demo trip to
reusable cinematic travel instrument.

---

## What Changed

### NEW: `wall/systems/world/regionalFlightPlanner.js` v1.0.0

Airport registry (10 airports): JFK, LGA, EWR, BOS, PHL, DCA, IAD, BDL, ALB, YUL

Three destination modes:
- **airport** — `planAirportToAirport('JFK', 'BOS')`
- **coordinate** — `planToCoordinate('JFK', { lat, lng, label })`
- **pin** — `pinDestination({ lat, lng, label })`

Three route profiles:
- **direct** — origin → midpoint → destination (3 waypoints)
- **scenic_coastal** — East Coast bend toward Atlantic (+2 coastal waypoints)
- **skyline_approach** — sweeping western approach corridor to destination (+1 pre-approach waypoint, 35km west of destination)

Altitude by distance:
| Distance | Cruise Alt |
|---|---|
| < 80km | 9,000ft |
| 80–250km | 18,000ft |
| 250km+ | 28,000ft |

Duration: `distanceKm / 12.96 km/min`, clamped 20–180 min. (420 kts)

Route preview: separate canvas at z-index 7 (below aircraft at 8). Dashed
`#88CCFF` line, endpoint dots at 5px, midpoint dots at 3px. Toggleable.

Advisory atmosphere metadata in `plannerMeta.suggestedTimeOfDay/suggestedWeather`
— not executed by planner.

Public API (frozen):
```js
SBE.RegionalFlightPlanner = {
  VERSION, AIRPORTS, PROFILES,
  listAirports, getAirport,
  setOriginAirport, getOriginAirport,
  pinDestination, clearDestination, getDestination,
  planAirportToAirport, planToCoordinate,
  setProfile, getProfile,
  generatePlan, startPlan,
  previewPlan, clearPreview,
  getState
}
```

### PATCHED: `regionalFlightTripRuntime.js` v1.0.0 → v1.1.0

- `startGeneratedTrip(generatedPreset)` — accepts planner-generated preset
  object, validates shape, registers ephemerally, starts through existing
  lifecycle code. Does NOT permanently mutate canonical `PRESETS`.
- `departureDeg` — ground phase now reads `_preset.departureDeg || 310` instead
  of hardcoded 310 (JFK default).

### PATCHED: `regionalFlightTripDebug.js` v1.1.0 → v1.2.0

Ten new debug commands under `_wos.debug.regionalFlight`:

```js
planner()               // planner state snapshot
airports()              // list registry airports
origin('JFK')           // set origin airport
destination('BOS')      // set destination airport (by airport ID)
pin(40.7, -74.0, 'lbl') // pin coordinate destination
profile('scenic_coastal') // set route profile
plan()                  // generate route
preview()               // show route overlay
clearPreview()          // remove overlay
startPlan()             // start generated trip
```

### Load order

```
aircraftRuntime.js
regionalFlightTripRuntime.js    ← patched v1.1.0
regionalFlightPlanner.js        ← NEW
airspaceInfluenceField.js
...
regionalFlightTripDebug.js      ← patched v1.2.0
```

---

## Console Verification

```js
// Airport-to-airport
_wos.debug.regionalFlight.airports()
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.destination('PHL')
_wos.debug.regionalFlight.profile('scenic_coastal')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.preview()
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.camera(true)

// Coordinate pin
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.pin(40.706, -74.012, 'Harbor test')
_wos.debug.regionalFlight.profile('skyline_approach')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()

// NYC → BOS canonical preset still works
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
```

---

## Validation Checklist

- [x] Origin airport selectable from 10-airport registry
- [x] Destination selectable by airport ID or lat/lng pin
- [x] Route generated for all three profiles (direct/scenic_coastal/skyline_approach)
- [x] Altitude auto-selected by distance (9k/18k/28kft)
- [x] Duration estimated at 420kts, clamped 20–180min
- [x] Preview draws route overlay at z-index 7 (below aircraft canvas)
- [x] Preview clears on startPlan()
- [x] startGeneratedTrip() validates preset shape before starting
- [x] Planner does not mutate canonical PRESETS dict
- [x] departureDeg reads from preset (not hardcoded)
- [x] NYC→BOS canonical preset still starts via .start()
- [x] Planner does not call AircraftRenderer or AircraftRuntime directly
- [x] All debug commands bound at _wos.debug.regionalFlight.*

---

## Advisory Atmosphere Metadata

```js
plan.plannerMeta.suggestedTimeOfDay   // 'dawn' | 'day' | 'dusk' | 'night'
plan.plannerMeta.suggestedWeather     // 'clear' | 'thin' | 'harbor_fog'
```

These are read-only advisory fields for future systems. The planner does not
apply cloud presets or map style — RegionalFlightTripRuntime's CLOUD_BY_PHASE
table continues to drive cloud changes per phase.
