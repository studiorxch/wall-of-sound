0510_WOS_RealRouteIngestion_v1.0.0
Goal

Add the first real route ingestion layer for WOS.

This pass connects RouteWorldSchema_v1.0.0 to real-world route data without building full map rendering yet. Existing schema/state already includes RouteWorld, Route, RouteSegment, RouteActor, RouteEventZone, RouteSkin, CameraRig, and SurfaceAnchor, so this pass should extend that spine rather than create another route system.

Core Principle
GPS/map route = spatial truth
WOS route world = musical/living interpretation layer

Do not turn WOS into a map app.

This pass only needs:

real route geometry
→ normalized WOS canvas route
→ hero car traversal
→ route metadata
→ skin/event/camera readiness
File Targets
main.js
engine/schemas.js
state/sceneManager.js
ui/controls.js
index.html

Optional new file if cleaner:

engine/routeIngestion.js

Use vanilla IIFE style consistent with existing modules.

Phase 1 — Add Route Provider Types

Extend existing RouteWorld.provider.type.

Supported now:

"manual"
"geojson"
"encodedPolyline"

Future-only, do not implement yet:

"osm"
"mapbox"
"google"
"gpx"
Phase 2 — Add Ingestion API

Expose:

\_wos.routeWorld.importGeoJSONRoute(geojson, options)
\_wos.routeWorld.importEncodedPolyline(polyline, options)
\_wos.routeWorld.normalizeGeoRoute(points, options)
\_wos.routeWorld.fitRouteToCanvas(routeId, options)
\_wos.routeWorld.routeStats(routeId)

Keep existing manual route API intact:

\_wos.routeWorld.createManualRoute(...)
Phase 3 — Route Point Model

All route points should normalize to:

{
lat: number | null,
lng: number | null,
x: number,
y: number,
distanceMeters: number,
t: number
}

Rules:

lat/lng preserve real-world source data.
x/y are WOS canvas/world coordinates.
distanceMeters accumulates along route.
t is normalized 0–1.
Do not overwrite original provider metadata.
Phase 4 — GeoJSON Support

Support:

LineString
MultiLineString
Feature
FeatureCollection

Accept common formats:

{
"type": "Feature",
"geometry": {
"type": "LineString",
"coordinates": [[lng, lat], ...]
}
}

Implementation behavior:

Extract first valid route line.
Flatten MultiLineString into one route if possible.
Reject invalid geometry with clear warning.
Store provider metadata.
Phase 5 — Coordinate Projection

Implement simple local projection for v1.

No map tiles.
No Mercator tile engine.
No GIS dependency.

Use local bounding-box normalization:

lng → x
lat → y inverted

Fit route into canvas with padding:

padding = 120

Function:

projectLatLngToWorld(points, canvas, padding)

Important:

Preserve aspect ratio.
Center route.
Invert Y so north is visually up.
Store projection metadata:
route.metadata.projection = {
type: "local-bounds",
minLat,
maxLat,
minLng,
maxLng,
scale,
offsetX,
offsetY
}
Phase 6 — Distance Calculation

Add Haversine distance.

function haversineMeters(a, b) {}

Use real lat/lng distance when available.

Fallback:
use pixel distance if no geo data exists.

Route stores:

distanceMeters
durationSec
averageSpeedKph

If durationSec not provided:

durationSec = distanceMeters / averageSpeedMetersPerSecond

Default average speed:

48 kph
Phase 7 — Segment Generation

Auto-create route segments from imported route.

Initial segment strategy:

one segment per N points or per distance chunk

Default:

segmentTargetMeters = 1000

Each segment gets:

{
type: "road",
startT,
endT,
startDistanceMeters,
endDistanceMeters,
speedLimitKph,
mood,
density,
cameraHint,
skinHint
}

For now infer only lightly:

skinHint: "suburban"
mood: "night-drive"
type: "road"

Do not overbuild road classification yet.

Phase 8 — Route Stats HUD-Ready Data

Add:

\_wos.routeWorld.routeStats(routeId)

Return:

{
routeId,
name,
providerType,
pointCount,
segmentCount,
distanceMeters,
distanceMiles,
durationSec,
durationLabel,
averageSpeedKph,
averageSpeedMph,
startLabel,
endLabel
}

This prepares future HUD work.

Phase 9 — Scene Save / Load

Update sceneManager.js so route worlds persist. Current scene serialization already handles core scene objects, canvas, swarm, text, shapes, balls, and background, so add route world data cleanly rather than replacing that flow.

Persist:

routeWorld.world
routeWorld.routes
routeWorld.segments
routeWorld.actors
routeWorld.eventZones
routeWorld.skins
routeWorld.cameraRigs
routeWorld.surfaceAnchors

Do not persist runtime:

elapsedSec
triggeredEventIds
cameraX
cameraY

Rehydrate runtime on load.

Phase 10 — Minimal UI Hook

Add a small section under World tab:

ROUTE WORLD
[Import GeoJSON]
[Start Label]
[End Label]
[Duration Minutes]
[Fit Route]
[Start Route]

Do not build full route editor yet.

If UI wiring is risky, expose console API first and add only a file input.

Test Commands
\_wos.validateSchemas()

\_wos.routeWorld.importGeoJSONRoute({
type: "Feature",
geometry: {
type: "LineString",
coordinates: [
[-74.010, 40.720],
[-74.000, 40.735],
[-73.985, 40.750],
[-73.970, 40.770]
]
},
properties: {
name: "Test Manhattan Drift"
}
}, {
name: "Night Drive Geo Test",
durationSec: 7200,
startLabel: "Home",
endLabel: "Destination"
})

\_wos.routeWorld.addHeroCar()
\_wos.routeWorld.setCameraMode("overview")
\_wos.routeWorld.start()
\_wos.routeWorld.routeStats()
\_wos.routeWorld.state()

Expected:

Route appears.
Hero car moves along real normalized route.
Distance stats exist.
Route persists in saved scene.
No duplicate route systems created.
No map tiles required.
Non-Goals

Do not build:

traffic simulation
pedestrians
subway layer
map tile rendering
API billing integrations
3D scenes
full route editor
live GPS tracking
Completion Summary Required

Claude should report:

Files changed
API methods added
Route formats supported
Projection method used
Save/load changes
Test commands
Known limitations
