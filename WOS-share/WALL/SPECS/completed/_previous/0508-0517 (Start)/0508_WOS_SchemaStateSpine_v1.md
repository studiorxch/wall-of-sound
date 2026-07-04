👉 0508_WOS_SchemaStateSpine_v1.0.0
Purpose:

Define the core schemas that describe Canvas, World, Layers, Channels, Objects, Tools, Commands, and Runtime state.
This should be another thin architecture pass, like the registry pass.
Not a rewrite. Not a UI redesign. Not Bauhaus yet.
Why this is next
The registry now tells us:

what exists
what status it has
where it may appear
The schema layer tells us:

what properties each thing is allowed to have
what defaults it uses
what can be saved
what is runtime-only
what UI control should eventually render it
That is the missing bridge before we clean the panels.
What the next spec should add
Create:

wall/engine/schemas.js
Loaded after:

<script src="./engine/registry.js"></script>

and before:

<script src="./main.js"></script>

The current index.html already has the right type of script-order pattern now because registry.js is loaded before main.js.
Schemas to define first

CanvasSchema
WorldSchema
LayerSchema
ChannelSchema
ObjectSchemas
ToolDefaultsSchema
RuntimeSchema
Minimal fields only
Canvas

width
height
framePreset
backgroundColor
transparentBackground
World

mode
strength
direction
layers
Layer

id
type
label
status
visible
locked
opacity
zIndex
depth
source
renderer
audioChannelId
Channel

id
label
status
muted
volume
type
output
Object
Start simple:

stroke
ball
text
shape
gridLayer
Runtime

transport
selection
cache
pointer
camera
ui
But clearly mark:

persistent: true / false
runtime: true / false
