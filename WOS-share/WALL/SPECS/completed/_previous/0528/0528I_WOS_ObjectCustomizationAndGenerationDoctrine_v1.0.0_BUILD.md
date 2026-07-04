# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Establish the shared doctrine and data contract for WOS object customization, low-poly object generation, Color Lab integration, and first aircraft object production.

# 0528I_WOS_ObjectCustomizationAndGenerationDoctrine_v1.0.0_BUILD

## Purpose

Define the first unified WOS object customization and generation doctrine.

This spec expands beyond vessel-only styling and establishes a scalable path for:

- customizing boats already inside WOS
- generating new low-poly objects for the world
- linking object geometry to Color Lab palettes/materials
- preparing a low-poly airplane as the next major visual target
- supporting future airport, road, maritime, arcade, and orbital objects

The goal is to stop treating boats, planes, vehicles, buildings, props, and future arcade/world objects as separate one-off systems.

Canonical direction:

```text
Object Generator = form factory
Color Lab        = color/material/style authority
WOS Runtime      = placement, movement, atmosphere, and behavior
```

---

# 1. Core Doctrine

## 1.1 WOS Objects Are Adapted, Not Literal

WOS objects should not attempt photoreal reproduction.

They should translate real-world forms into a consistent WOS visual language:

```text
real object
→ simplified geometry
→ readable silhouette
→ controlled palette
→ atmospheric integration
→ runtime behavior
```

WOS should prioritize:

- clarity in motion
- recognizable silhouette
- low-to-medium geometry complexity
- matte / soft material language
- atmospheric compatibility
- stream-safe readability
- modular reuse

WOS should avoid:

- hyperreal PBR dependency
- noisy texture realism
- inconsistent AI-generated asset styles
- one-off hardcoded object renderers
- asset soup

---

# 2. System Roles

## 2.1 Object Generator

The Object Generator is the form-production layer.

It owns:

- low-poly object generation prompts
- geometry simplification rules
- object category templates
- silhouette constraints
- LOD expectations
- export metadata
- future mesh normalization pipeline

It does not own:

- final runtime behavior
- world placement truth
- Color Lab palettes
- simulation physics
- AIS / aircraft / vehicle runtime truth

## 2.2 Color Lab

Color Lab is the style and material authority.

It owns:

- palettes
- material slots
- atmosphere compatibility
- theme variants
- district color logic
- night/day material behavior
- future exportable style packs

It does not generate object geometry.

## 2.3 WOS Runtime

WOS Runtime owns:

- object placement
- projection
- camera behavior
- altitude response
- maritime/air/road lifecycle state
- interaction
- animation
- render scheduling
- visibility gates

It does not author object geometry directly.

---

# 3. Object Categories

The doctrine must support these categories from the start, even if only vessels and aircraft are built immediately.

| Category | Examples | Initial Priority |
|---|---|---:|
| maritime | ferry, tug, cargo, tanker, cruise, recreational | 1 |
| aviation | regional jet, prop plane, helicopter, baggage carts | 1 |
| airport ground | baggage carts, fuel trucks, fire trucks, service vans | 2 |
| road vehicles | taxi, bus, van, box truck, fire truck, police car | 3 |
| rail/transit | subway cars, train cars, maintenance carts | 3 |
| infrastructure | cranes, towers, docks, kiosks, terminals, signals | 2 |
| arcade/world props | arcade cabinet, vending machine, booth, neon sign | 2 |
| orbital | rocket, satellite, capsule, launch support vehicles | 4 |
| people/crowd | low-poly passengers, workers, silhouettes | 4 |

---

# 4. Visual Language Requirements

## 4.1 Geometry

All generated objects should follow these rules:

```text
readable silhouette > geometric detail
clean massing       > noisy realism
implied detail      > literal modeling
stable LOD          > constant fidelity
```

Required geometry traits:

- low-to-medium polygon count
- strong silhouette from top and oblique camera angles
- major masses exaggerated slightly for readability
- tiny details omitted unless they define class identity
- edge softness through bevels or stylized material, not heavy realism
- no fragile thin geometry unless object category requires it, such as cranes

## 4.2 Materials

Materials should be:

- matte
- minimally textured
- palette controlled
- atmosphere friendly
- non-glossy unless functionally important
- readable under fog/cloud/haze overlays

Avoid:

- hyperreal roughness/metalness noise
- excessive procedural texture
- photographic grime that breaks scale
- highly reflective surfaces that compete with Mapbox/harbor atmosphere

## 4.3 Color

Color should be functional.

It must support:

- class identity
- movement readability
- district atmosphere
- night lighting
- emergency/status override
- player/camera attention

White is reserved for:

- hover
- selection
- debug labels
- emergency/alert contrast
- lighting accents where semantically correct

Objects should not default to white hull/body fills unless the class doctrine explicitly permits it.

---

# 5. Object Profile Contract

Every generated/customized object should eventually resolve to a WOS Object Profile.

```json
{
  "id": "wos_object_aircraft_regional_jet_001",
  "category": "aviation",
  "classKey": "REGIONAL_JET",
  "displayName": "Regional Jet 01",
  "geometryMode": "low_poly_mesh",
  "visualLanguage": "wos_low_poly_massing",
  "paletteRef": "airport_dawn",
  "materialSlots": {
    "body": "matte_primary",
    "secondary": "matte_secondary",
    "glass": "dark_translucent",
    "accent": "signal_accent",
    "light": "navigation_light"
  },
  "lod": {
    "far": "point_or_silhouette",
    "mid": "simplified_mesh",
    "near": "full_low_poly_mesh",
    "hero": "low_poly_mesh_with_detail"
  },
  "scale": {
    "lengthMeters": 36,
    "widthMeters": 29,
    "heightMeters": 11
  },
  "runtimeHints": {
    "supportsAltitudeScaling": true,
    "supportsNavigationLights": true,
    "supportsShadow": true,
    "supportsAtmosphereTint": true
  }
}
```

---

# 6. Boat Customization Path

## 6.1 Immediate Vessel Use

Existing vessel systems should remain the immediate proof target.

Boats should support:

- class-based silhouettes
- class-based palettes
- geo-projected tilted hulls
- top-down symbolic sprites
- shared visual profiles across both modes
- future material slot editing

## 6.2 Vessel Classes

Minimum classes:

- CARGO
- TANKER
- FERRY
- PASSENGER
- TUG
- SERVICE
- PILOT
- RECREATIONAL
- INDUSTRIAL
- UNKNOWN

## 6.3 Vessel Customization Scope

Customization should eventually support:

- hull color
- stroke/edge color
- deck color
- accent color
- navigation light behavior
- deck block visibility
- centerline visibility
- class-specific shape exaggeration
- hover/selection styles

Do not build a full UI editor until the underlying object profile contract is stable.

---

# 7. First Generated Object Target: Low-Poly Aircraft

## 7.1 Goal

Create a WOS-compatible low-poly aircraft that can:

- leave JFK/LGA/EWR
- climb from runway scale to regional cruise altitude
- fly a 2-hour regional route
- support camera follow
- support altitude-aware scaling
- support color/material control
- survive cloud/atmosphere overlays

This is the first major non-maritime generated object target.

## 7.2 Aircraft Visual Requirements

The aircraft should be:

- low-poly
- readable from top-down and oblique camera angles
- matte/shaded rather than hyperreal
- visually compatible with Mapbox 3D/low-poly city massing
- large enough at runway/takeoff scale
- smaller but still readable at altitude
- compatible with altitude-aware world tinting

Required geometry components:

- fuselage
- wings
- tail fins
- cockpit/window band
- engine/prop cues depending on aircraft type
- navigation light points
- underside/shadow support

## 7.3 First Aircraft Type

Initial type:

```text
REGIONAL_JET
```

Why:

- familiar silhouette
- good for JFK/LGA/EWR departures
- supports 1.5–2.5 hour trip runtime
- easier than long-haul widebody
- not as tiny as private aircraft

Future types:

- prop commuter
- helicopter
- cargo plane
- private jet
- airport service vehicle

---

# 8. Regional Flight Runtime Target

Do not attempt a Japan 14–16 hour flight yet.

First goal:

```text
NYC regional flight: ~2 hours
```

Candidate route types:

- NYC → Boston
- NYC → Washington DC
- NYC → Pittsburgh
- NYC → Toronto
- NYC → Montreal
- NYC → Charlotte
- NYC → Detroit

The route should support:

- takeoff
- climb
- mid-cruise
- weather/cloud transition
- descent
- arrival approach

Success means WOS can sustain a long-form camera/world journey without needing global coverage.

---

# 9. AI Generation Compatibility

The Object Generator should eventually produce prompts and/or source files for external AI/3D tools.

Prompt doctrine:

```text
low-poly stylized realism
matte materials
clean geometry
strong silhouette
no photorealism
no excessive texture noise
no ornate detail
orthographic readable form
WOS-compatible color slots
```

Example aircraft prompt:

```text
Create a low-poly regional jet for a stylized cinematic map-world engine. Clean simplified geometry, matte materials, soft beveled edges, readable silhouette from top-down and oblique camera angles, no photorealism, no excessive texture detail. Include fuselage, wings, tail fins, cockpit band, subtle engine shapes, and navigation light points. Neutral material slots for body, secondary, glass, accent, and lights. Designed for a New York airport departure scene and altitude-aware world rendering.
```

Example arcade cabinet prompt:

```text
Create a low-poly arcade cabinet prop for a stylized cinematic urban world. Clean geometric massing, matte painted surfaces, readable silhouette, minimal texture noise, soft edges, simplified screen, controls, coin slot, and marquee. Designed to fit a WOS New New York environment with configurable color/material slots.
```

---

# 10. Output Targets

Future Object Generator outputs should support:

- `.glb` / `.gltf` for mesh runtime
- `.json` object profile metadata
- `.png` preview thumbnails
- future LOD variants
- future Color Lab palette bindings

Do not require direct browser-side AI generation.

The first implementation may be offline/local:

```text
AI / Claude / mesh generator
→ Blender cleanup or scripted normalization
→ WOS object profile
→ runtime loader
```

---

# 11. Success Criteria

This spec is successful when:

- object customization is no longer vessel-only
- Color Lab is defined as the style/material authority
- Object Generator is defined as the geometry/form authority
- WOS Runtime is defined as placement/motion/atmosphere authority
- boats remain the first customization target
- a low-poly regional aircraft becomes the next generated-object target
- the 2-hour regional flight is identified as the first major aviation proof

---

# 12. Build Order After This Spec

Proceed in this order:

```text
0528J_WOS_LowPolyAircraftVisualPass_v1.0.0_BUILD
0528K_WOS_RegionalFlightTripRuntime_v1.0.0_BUILD
0528L_WOS_ObjectProfileRegistry_v1.0.0_BUILD
0528M_WOS_ColorLabObjectMaterialBridge_v1.0.0_BUILD
```

Do not build a full UI object editor until the first aircraft visual pass proves that the object profile model works.

---

# 13. Implementation Guide

- Put doctrine and object profile contracts under `docs/_specs/` or equivalent WOS spec storage.
- Build the low-poly aircraft visual pass next; use the current aircraft runtime as the movement host.
- Expect the next visible proof to be a styled regional jet leaving an airport and scaling through altitude bands.
