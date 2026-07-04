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
# What This Spec Should Introduce

## 1. Click-To-Create Waypoints

You need immediate spatial feedback.

Operator mode should support:

```
click map → add waypointdrag waypoint → movebackspace/delete → remove
```

This instantly makes:

- the map alive
- surfaces intentional
- camera targets meaningful

---

# 2. Route Visualization

The route must become unmistakably visible.

Right now your atmospheric lines are:

- beautiful
- unreadable as authored infrastructure

You need:

## Operator View

- crisp spline/polyline
- waypoint handles
- directional arrows
- route numbering
- distance markers
- active route highlighting

Think:

- transit planning
- GPS editing
- cinematic blocking

NOT ambient art.

---

## VIEW Mode

Then the exact same route becomes:

- glowing
- cinematic
- infrastructural
- atmospheric

Same data.  
Different render layer.

That distinction matters enormously.

---

# 3. Camera Route Following

This is probably the _real_ unlock.

The camera should finally:

- move along authored routes
- interpolate
- drift
- anticipate turns
- ease into curves

Once this exists:

- your world instantly becomes understandable

because now:

- motion has geography
- geography has intent

---

# 4. Spatial Metrics HUD

You already started this.

Now formalize it.

Every route should expose:

```
distanceestimated durationwaypoint countsurface scalevelocity profile
```

Later:

- transit mode
- weather
- traffic density
- soundtrack bias
- field recordings
- emergence likelihood

all connect here naturally.

---

# 5. Surface Anchoring

Critical.

Routes should become anchor systems for:

- graffiti
- billboards
- projections
- trains
- field recordings
- story events
- actors
- audio zones

Meaning:

```
surface.attach(routeSegment)surface.attach(intersection)surface.attach(district)
```

Now the map becomes compositional.

---

# Why This Is The Correct Next Step

Because this finally transitions WOS from:

```
"interesting rendering system"
```

into:

```
"spatial authoring environment"
```

That’s the actual threshold you’re approaching.

---

# What You Should NOT Do Yet

Avoid:

- complex GIS ingestion
- 3D buildings
- traffic simulation
- subway systems
- AI agents
- procedural cities

until:

- authored routes
- camera motion
- spatial readability

are solid.

Otherwise the world becomes noise again.

---

# The Real Goal Of This Phase

Not:

> “simulate New York”

But:

> “make authored spatial movement emotionally legible”

That’s the foundation everything else will sit on.
---
# Spec
```
0518I_WOS_RouteAuthoringInteraction_v1.0.0 Date: 2026-05-18 System: WOS Domain: Spatial Authoring Component: Route Authoring + Geographic Interaction Version: v1.0.0 Purpose Introduce direct geographic route authoring interaction into WOS. This spec establishes: click-to-create route editing waypoint manipulation route visibility systems authored spatial motion readable geographic intent camera-followable infrastructure This is the transition from: persistent map substrate to: interactive spatial authoring Core Principle Routes are NOT: decorative splines ambient particles abstract geometry Routes are: authored spatial intent They define: movement traversal pacing camera flow future actor behavior emergence corridors narrative geography Design Goal WOS must become: emotionally legible through movement NOT: visually noisy through effects The route system is the first major readability layer. Route Interaction Model Operator View Operator View becomes: a geographic authoring environment The user must be able to: create routes directly on the map manipulate waypoints inspect movement understand traversal preview camera flow Interaction Requirements Left Click Create waypoint Behavior: click on geographic map create waypoint at projected coordinates append to active route Drag Move waypoint Behavior: click + drag waypoint route updates live metrics update live camera previews update live Delete Remove waypoint Behavior: select waypoint Backspace/Delete removes route reflows immediately Double Click Insert waypoint between segments Behavior: double-click segment inject waypoint at nearest route position Route Visualization Critical readability requirement. Routes must become: clearly authored infrastructure NOT: ambient atmospheric decoration Operator View Rendering Required Visual Layers Route Spine crisp polyline/spline readable at all zoom levels high contrast against map Waypoint Handles draggable nodes hover feedback active selection state Direction Arrows subtle directional indicators spaced along route scale-aware Segment Highlighting Hovering: brightens route segment previews insertion behavior Active Route State Active route receives: increased luminance stronger glow visible metrics emphasis Inactive routes remain subdued. VIEW Mode Rendering The exact same route data becomes: cinematic infrastructure NOT: editing UI VIEW Rendering Rules Allowed glow passes atmospheric diffusion route pulse ecological tinting transit energy visualization Forbidden handles labels drag nodes operator overlays metric clutter Camera Route Following This is a primary system requirement. Routes must become: camera-readable movement systems Required Camera Behaviors Follow Route Camera may: interpolate along path anticipate turns ease curves drift laterally vary zoom by route context Route Camera Metadata camera: { mode?: "follow" | "observe" | "drift"; speed?: number; anticipation?: number; lateralDrift?: number; zoomMin?: number; zoomMax?: number; } Route Metrics HUD Operator View MUST expose: Metric Purpose Distance traversal scale Estimated Duration pacing Waypoint Count complexity Average Segment Length route density Surface Scale projection consistency Geographic Coordinate Rules Canonical route coordinates remain: longitude latitude NOT: screen coordinates All route logic operates in: geographic space Viewport rendering is projection-only. Surface Attachment Preparation Routes become future anchor systems for: billboards graffiti field recordings projection surfaces actor events ecology zones audio systems transit infrastructure New Route Anchor Model interface RouteAnchor { routeId: string; segmentId?: string; waypointId?: string; distanceAlongRoute?: number; } Route Authoring State Each route surface runtime must track: interaction: { hoveredWaypointId?: string; selectedWaypointId?: string; draggedWaypointId?: string; hoveredSegmentId?: string; insertionPreview?: boolean; } This state is: ephemeral runtime state NOT persisted. Spatial Legibility Rules Critical design philosophy. Routes must: read clearly at distance remain understandable at motion survive long-duration viewing support cinematic interpretation Avoid: excessive VFX clutter HUD overload neon spam decorative chaos Glass Layer Compatibility This spec formally acknowledges: interpretive glass overlays as part of WOS presentation language. Route rendering should support: transmissive overlays atmospheric filtering time-of-day reinterpretation ecology tinting perceptual viewing modes WITHOUT: mutating geographic truth Future Compatibility This architecture prepares: transit systems route broadcasting passenger modes cinematic navigation field recording paths ecology corridors actor traversal subway systems GPS playback ambient mobility streams without changing: core route structure Non-Goals This spec does NOT introduce: AI traffic procedural cities GIS imports multiplayer subway simulation actor orchestration 3D terrain This spec focuses ONLY on: human-authored geographic interaction Acceptance Criteria By completion: User Can click to create routes drag waypoints delete waypoints insert midpoints view metrics understand traversal direction preview route flow System Can render readable routes support camera traversal maintain geographic truth separate OP vs VIEW rendering expose future attachment anchors Final Principle The route is not decoration. It is authored movement through geographic reality. Implementation Guide 1. Add Direct Waypoint Interaction Implement: click drag delete insert inside Operator View. 2. Separate OP vs VIEW Rendering Operator: editing clarity VIEW: cinematic infrastructure 3. Prepare Camera Traversal Expose: route-followable camera metadata for future Passenger + Ecology systems.
```

---
# Refinement 

---
# Development

```

```