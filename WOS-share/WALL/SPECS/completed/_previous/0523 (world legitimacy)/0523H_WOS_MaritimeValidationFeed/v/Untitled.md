Build 0523H MaritimeValidationFeed now.

Goal:
Stop using renderer-local fake boats as the primary test path. Add AIS-backed validation vessels through AISRuntime so the map renders boats from the same runtime path that live AIS will use.

Implement:
1. Create wall/validation/maritimeValidationFeed.js
2. Load it in wall/index.html after aisRuntime.js and before maritimeOccupancyRenderer.js
3. Add runtime flags in main.js:
   enableMaritimeValidationFeed: false
   maritimeValidationFeedAutostart: false
   showMaritimeValidationFeedLogs: false

4. Public API:
   SBE.MaritimeValidationFeed.enable(true/false)
   SBE.MaritimeValidationFeed.reset()
   SBE.MaritimeValidationFeed.tick(simulationTimeMs)
   SBE.MaritimeValidationFeed.debug()

5. Console helpers:
   _wos.enableMaritimeValidationFeed(true/false)
   _wos.resetMaritimeValidationFeed()
   _wos.debugMaritimeValidationFeed()

6. Feed behavior:
   - deterministic 35-vessel catalog
   - use existing water-corridor seed coordinates from MaritimeOccupancyRenderer v1.3.0 as source data
   - no Math.random()
   - 1Hz packet cadence
   - inject ONLY through AISRuntime public ingest method
   - do not mutate AISRuntime private buckets
   - do not write directly to OccupancyRenderer seed arrays
   - do not emit wakes directly

7. AIS packet shape:
   Match whatever AISRuntime currently accepts. Inspect aisRuntime.js first and adapt packet fields to its canonical ingest function.
   Required semantic fields:
   mmsi
   vesselName/name
   lat/lng
   speedKts or speedKnots
   heading/trueHeading/courseOverGround
   shipType/aisTypeCode
   status/state
   timestampMs
   validation.source = "MARITIME_VALIDATION_FEED"

8. Underway vessels:
   - advance deterministically along short route segments
   - use heading and speed from the validation catalog
   - loop route if needed
   - use simulationTimeMs

9. Stationary vessels:
   - anchored/moored emit packets but do not move
   - speed = 0
   - fixed heading

10. Renderer-local seeds:
   - keep _wos.seedWaterCorridors()
   - mark it visual-only in comments
   - do NOT use it as the main validation path

Acceptance:
- _wos.enableMaritimeValidationFeed(true) creates AISRuntime-backed boats
- _wos.debugAIS() shows active AIS validation vessels
- _wos.debugOccupancy() counts AIS vessels, not only seed vessels
- boats render through normal MaritimeOccupancyRenderer path
- no renderer-local seed helper is required
- no private runtime mutation