---
Goal:
  - embedded live basemap
  - operator style vs presentation style
  - camera synchronization
  - viewport projection alignment
summary: Introduce a synchronized Mapbox-backed spatial viewport system into WOS.
---
# Review

![[Pasted image 20260517194609.png]]



---
# Spec
	
	# 0518E_WOS_MapboxViewport_v1.0.0
	
	## Goal
	
	Introduce a synchronized Mapbox-backed spatial viewport system into WOS.
	
	This spec establishes:
	
	- live map rendering
	- operator vs presentation map styles
	- synchronized camera state
	- route/world coordinate projection
	- reusable viewport infrastructure
	
	This is NOT:
	
	- full GIS tooling
	- world simulation
	- tile streaming optimization
	- emergence systems
	- traffic systems
	
	This is:
	
	```
	grounded spatial continuity
	```
	
	---
	
	# Core Intent
	
	WOS must stop feeling like:
	
	```
	objects floating in empty canvas space
	```
	
	and begin feeling like:
	
	```
	movement through real geography
	```
	
	The map is now:
	
	- orientation
	- measurement
	- continuity
	- scale reference
	- emotional grounding
	- traversal infrastructure
	
	---
	
	# Architectural Principle
	
	The map is NOT the world.
	
	The map is:
	
	```
	a spatial substrate
	```
	
	WOS overlays:
	
	- emergence
	- actors
	- routes
	- music
	- camera behavior
	- procedural systems
	
	on top of:
	
	```
	real geographic continuity
	```
	
	---
	
	# Runtime Ownership
	
	Mapbox integration belongs to:
	
	```
	RoutePlannerRuntime
	```
	
	NOT:
	
	- main.js
	- global renderers
	- Workspace
	- camera systems
	
	The runtime owns:
	
	- map instance
	- map camera state
	- projection helpers
	- style switching
	- viewport synchronization
	
	---
	
	# New Files
	
	## New Runtime Layer
	
	```
	wall/runtimes/mapboxViewportRuntime.js
	```
	
	Responsible for:
	
	- map lifecycle
	- style loading
	- projection
	- sync state
	- resize handling
	
	---
	
	## New Presentation Layer
	
	```
	wall/render/mapboxPresentationRenderer.js
	```
	
	Responsible for:
	
	- cinematic overlays
	- atmospheric rendering
	- presentation-only visuals
	
	---
	
	## New Operator Layer
	
	```
	wall/render/mapboxOperatorRenderer.js
	```
	
	Responsible for:
	
	- labels
	- route editing overlays
	- waypoint controls
	- diagnostics
	- metrics
	
	---
	
	## Optional Future Config
	
	```
	wall/config/mapStyles.js
	```
	
	Centralized style definitions.
	
	---
	
	# Dependencies
	
	Add Mapbox GL JS:
	
	```
	<link  href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css"  rel="stylesheet"/><script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
	```
	
	Load BEFORE:
	
	```
	routePlannerRuntime.js
	```
	
	---
	
	# Access Token
	
	Add:
	
	```
	mapboxgl.accessToken = "...";
	```
	
	inside:
	
	```
	mapboxViewportRuntime.js
	```
	
	DO NOT hardcode inside:
	
	- index.html
	- workspace
	- renderers
	
	---
	
	# Viewport Ownership
	
	Mapbox viewport is NOT the canvas.
	
	Mapbox becomes:
	
	```
	the spatial layer beneath WOS
	```
	
	Structure:
	
	```
	.canvas-area ├── #ws-tab-bar ├── #mapbox-viewport ├── #engine-canvas ├── #ws-lower-panel
	```
	
	Important:
	
	```
	canvas overlays the map
	```
	
	NOT:
	
	- side-by-side
	- iframe
	- separate app
	
	---
	
	# Z-Index Stack
	
	## Operator Mode
	
	```
	Mapbox BaseRoute GeometryRuntime OverlaysWOS CanvasInspector/UI
	```
	
	---
	
	## Presentation Mode
	
	```
	Presentation Map StyleAtmosphericsWOS EmergenceCamera FXMinimal UI
	```
	
	---
	
	# Required DOM
	
	Inject dynamically:
	
	```
	<div id="mapbox-viewport"></div>
	```
	
	inside:
	
	```
	WorkspaceUI.init()
	```
	
	BEFORE:
	
	```
	canvas-wrap
	```
	
	---
	
	# Required CSS
	
	## Map Viewport
	
	```
	#mapbox-viewport {  position: absolute;  inset: 0;  overflow: hidden;  z-index: 0;}
	```
	
	---
	
	## Canvas Overlay
	
	```
	#engine-canvas {  position: relative;  z-index: 2;  pointer-events: none;}
	```
	
	Canvas remains transparent over map.
	
	---
	
	# Projection System
	
	Critical requirement.
	
	Mapbox must expose:
	
	```
	project(latLng)unproject(screenXY)
	```
	
	through runtime helpers.
	
	Example:
	
	```
	runtime.project([lng, lat]);
	```
	
	returns:
	
	```
	{x, y}
	```
	
	This becomes canonical WOS spatial projection.
	
	---
	
	# Camera Synchronization
	
	The runtime owns canonical camera state:
	
	```
	{  center: [lng, lat],  zoom: 13.2,  bearing: 0,  pitch: 0}
	```
	
	Both:
	
	- Mapbox
	- WOS camera systems
	
	must synchronize through this state.
	
	DO NOT:
	
	- allow dual camera authority
	- independently pan canvas camera
	
	---
	
	# Presentation vs Operator Styles
	
	## Operator Style
	
	Use:
	
	```
	utility-focused map
	```
	
	Features:
	
	- labels
	- roads
	- parks
	- water
	- route readability
	- spatial debugging
	
	Use standard/lightly customized Mapbox style.
	
	---
	
	## Presentation Style
	
	Use:
	
	```
	cinematic branded map
	```
	
	Features:
	
	- reduced labels
	- dark palette
	- atmospheric contrast
	- subtle glow
	- emotional readability
	
	Use your custom StudioRich style:
	
	```
	cm3goyx23003901qkb60ff29p
	```
	
	---
	
	# Mode Switching
	
	Viewport mode changes must trigger:
	
	```
	runtime.setPresentationMode(true/false)
	```
	
	Which swaps:
	
	- style
	- overlays
	- interaction behavior
	
	---
	
	# Required Runtime API
	
	## Lifecycle
	
	```
	init(containerEl)destroy()resize()
	```
	
	---
	
	## Projection
	
	```
	project(latLng)unproject(screenXY)
	```
	
	---
	
	## Camera
	
	```
	setCamera(cameraState)getCamera()flyTo(target)fitBounds(bounds)
	```
	
	---
	
	## Styles
	
	```
	setPresentationMode(enabled)
	```
	
	---
	
	## Rendering
	
	```
	renderOperatorOverlay(ctx)renderPresentationLayer(ctx)
	```
	
	---
	
	# Route Integration
	
	Routes now become:
	
	```
	geographic paths
	```
	
	NOT arbitrary vectors.
	
	Waypoints must store:
	
	```
	{  lng,  lat}
	```
	
	NOT:
	
	```
	x/y canvas space
	```
	
	---
	
	# Camera Target Integration
	
	`getCameraTargets()` now returns:
	
	```
	{  lng,  lat,  importance,  radius,  type}
	```
	
	NOT canvas coordinates.
	
	---
	
	# Required Initial MVP
	
	Must support:
	
	## 1
	
	Load map successfully
	
	---
	
	## 2
	
	Switch styles:
	
	- operator
	- presentation
	
	---
	
	## 3
	
	Display geographic route
	
	---
	
	## 4
	
	Move camera along route
	
	---
	
	## 5
	
	Maintain synchronized canvas overlay
	
	---
	
	## 6
	
	Project lat/lng to canvas coordinates
	
	---
	
	# Constraints
	
	## DO NOT:
	
	- add GIS complexity
	- implement tile caching
	- build full map editor
	- add heavy geospatial abstractions
	- rewrite existing camera systems
	
	---
	
	## DO:
	
	- keep runtime-contained
	- keep projection canonical
	- keep rendering modular
	- keep camera authority centralized
	
	---
	
	# Acceptance Criteria
	
	## Operator Mode
	
	- readable utility map
	- editable route overlays
	- waypoint handles visible
	- camera movement works
	- projection alignment stable
	
	---
	
	## Presentation Mode
	
	- cinematic map style
	- minimal UI
	- smooth route traversal
	- emergence overlays align spatially
	
	---
	
	# Future Compatibility
	
	This architecture must later support:
	
	- subway layers
	- live traffic
	- emergence zones
	- actor traversal
	- district overlays
	- passenger mode
	- cinematic episodes
	- global map expansion
	
	WITHOUT:
	
	- rewriting viewport ownership
	- replacing projection systems
	- changing runtime delegation
	
	---
	
	# Implementation Guide
	
	- Add Mapbox viewport beneath engine canvas inside `.canvas-area`
	- Build runtime-contained projection + camera synchronization
	- Route all geographic rendering through runtime projection helpers