---
spec: 0528I_WOS_ObjectCustomizationAndGenerationDoctrine_v1.0.0
status: active
classification: doctrine
created: 2026-05-28
---

# WOS Object Customization and Generation Doctrine v1.0.0

## Purpose

Define the first unified WOS object customization and generation doctrine.
Establishes a scalable path for customizing existing WOS objects, generating
new low-poly objects, linking geometry to Color Lab palettes/materials, and
preparing a low-poly airplane as the next major visual target.

Canonical direction:

```
Object Generator = form factory
Color Lab        = color/material/style authority
WOS Runtime      = placement, movement, atmosphere, and behavior
```

---

## 1. Core Doctrine

WOS objects translate real-world forms into the WOS visual language:

```
real object
→ simplified geometry
→ readable silhouette
→ controlled palette
→ atmospheric integration
→ runtime behavior
```

Prioritize:
- clarity in motion
- recognizable silhouette
- low-to-medium geometry complexity
- matte / soft material language
- atmospheric compatibility
- stream-safe readability
- modular reuse

Avoid:
- hyperreal PBR dependency
- noisy texture realism
- inconsistent AI-generated asset styles
- one-off hardcoded object renderers

---

## 2. System Roles

### Object Generator
Owns: low-poly generation prompts, geometry simplification rules, object
category templates, silhouette constraints, LOD expectations, export metadata.
Does NOT own: runtime behavior, world placement, Color Lab palettes, physics.

### Color Lab
Owns: palettes, material slots, atmosphere compatibility, theme variants,
district color logic, night/day material behavior, future exportable style packs.
Does NOT generate object geometry.

### WOS Runtime
Owns: object placement, projection, camera behavior, altitude response,
lifecycle state, interaction, animation, render scheduling, visibility gates.
Does NOT author object geometry directly.

---

## 3. Object Categories

| Category | Examples | Priority |
|---|---|---:|
| maritime | ferry, tug, cargo, tanker, cruise, recreational | 1 |
| aviation | regional jet, prop plane, helicopter | 1 |
| airport ground | baggage carts, fuel trucks, fire trucks | 2 |
| infrastructure | cranes, towers, docks, kiosks, terminals | 2 |
| arcade/world props | arcade cabinet, vending machine, neon sign | 2 |
| road vehicles | taxi, bus, van, box truck, fire truck | 3 |
| rail/transit | subway cars, train cars, maintenance carts | 3 |
| orbital | rocket, satellite, capsule | 4 |
| people/crowd | low-poly passengers, workers, silhouettes | 4 |

---

## 4. Visual Language Requirements

### Geometry rules

```
readable silhouette > geometric detail
clean massing       > noisy realism
implied detail      > literal modeling
stable LOD          > constant fidelity
```

Required traits: low-to-medium polygon count, strong silhouette from top and
oblique camera angles, major masses slightly exaggerated, tiny details omitted
unless class-defining, no fragile thin geometry except cranes/antennas.

### Materials

Matte, minimally textured, palette-controlled, atmosphere-friendly, readable
under fog/cloud/haze. No hyperreal roughness/metalness, no photographic grime.

### Color

Functional. Must support: class identity, movement readability, district
atmosphere, night lighting, emergency/status override.

White is reserved for: hover, selection, debug labels, emergency contrast,
lighting accents where semantically correct. Objects must NOT default to white
hull/body fills unless the class doctrine explicitly permits it.

---

## 5. Object Profile Contract

Every generated or customized object resolves to a WOS Object Profile.
Canonical shape — see `wall/registries/objectProfileRegistry.js`.

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
    "body":      "matte_primary",
    "secondary": "matte_secondary",
    "glass":     "dark_translucent",
    "accent":    "signal_accent",
    "light":     "navigation_light"
  },
  "lod": {
    "far":  "point_or_silhouette",
    "mid":  "simplified_mesh",
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

## 6. Boat Customization Path

Vessel systems remain the first proof target. Boats should support:
- class-based silhouettes
- class-based palettes
- geo-projected tilted hulls
- top-down symbolic sprites
- shared visual profiles across both render modes
- future material slot editing

Vessel classes: CARGO, TANKER, FERRY, PASSENGER, TUG, SERVICE, PILOT,
RECREATIONAL, INDUSTRIAL, UNKNOWN.

Customization scope (not building a full UI until object profile contract is
stable): hull color, stroke/edge color, deck color, accent color, navigation
light behavior, deck block visibility, class-specific shape exaggeration,
hover/selection styles.

---

## 7. First Generated Object Target: Low-Poly Aircraft

Goal: a WOS-compatible low-poly aircraft that can leave JFK/LGA/EWR, climb
from runway scale to regional cruise altitude, support camera follow, support
altitude-aware scaling, and survive cloud/atmosphere overlays.

**First type: REGIONAL_JET** — familiar silhouette, 1.5–2.5 hour trip runtime.

Required geometry components: fuselage, wings, tail fins, cockpit/window band,
engine cues, navigation light points, underside/shadow support.

**First aviation route: NYC regional (~2 hours)**

Candidates: NYC→Boston, NYC→DC, NYC→Pittsburgh, NYC→Toronto, NYC→Montreal.

The route must support: takeoff, climb, mid-cruise, weather/cloud transition,
descent, arrival approach.

---

## 8. AI Generation Prompt Doctrine

```
low-poly stylized realism
matte materials
clean geometry
strong silhouette
no photorealism
no excessive texture noise
orthographic readable form
WOS-compatible color slots
```

Regional jet prompt:
```
Create a low-poly regional jet for a stylized cinematic map-world engine.
Clean simplified geometry, matte materials, soft beveled edges, readable
silhouette from top-down and oblique camera angles, no photorealism, no
excessive texture detail. Include fuselage, wings, tail fins, cockpit band,
subtle engine shapes, and navigation light points. Neutral material slots for
body, secondary, glass, accent, and lights. Designed for a New York airport
departure scene and altitude-aware world rendering.
```

---

## 9. Output Targets

Future Object Generator outputs: `.glb`/`.gltf` mesh, `.json` object profile
metadata, `.png` preview thumbnails, LOD variants, Color Lab palette bindings.

First implementation may be offline/local:
```
AI / Claude / mesh generator
→ Blender cleanup or scripted normalization
→ WOS object profile
→ runtime loader
```

---

## 10. Build Order

```
0528J_WOS_LowPolyAircraftVisualPass_v1.0.0_BUILD
0528K_WOS_RegionalFlightTripRuntime_v1.0.0_BUILD
0528L_WOS_ObjectProfileRegistry_v1.0.0_BUILD
0528M_WOS_ColorLabObjectMaterialBridge_v1.0.0_BUILD
```

Do not build a full UI object editor until the first aircraft visual pass
proves that the object profile model works.

---

## 11. Success Criteria

- Object customization is no longer vessel-only
- Color Lab is defined as the style/material authority
- Object Generator is defined as the geometry/form authority
- WOS Runtime is defined as placement/motion/atmosphere authority
- Boats remain the first customization proof target
- A low-poly regional aircraft becomes the next generated-object target
- The 2-hour regional flight is identified as the first major aviation proof
