# 0603G_WOS_ActorRenderAuthority_v1.0.0 [BUILD]

## Purpose

Introduce a centralized Actor Render Authority layer that translates:

- Actor Truth
- Visual Profile
- LOD Policy

into a canonical Render Payload before WorldSpaceVehicleLayer (WSL) receives the actor.

This prevents WSL from accumulating actor-specific logic and establishes a reusable rendering pipeline.

## Architectural Goal

Current:

Truth Feed
→ Truth Actor Runtime
→ Actor Visual Registry
→ Truth Actor Visual LOD Policy
→ WorldSpaceVehicleLayer

Target:

Truth Feed
→ Truth Actor Runtime
→ Actor Visual Registry
→ Truth Actor Visual LOD Policy
→ Actor Render Authority
→ WorldSpaceVehicleLayer

## Public API

```js
resolveRenderPayload(actor)
registerVariant(type, resolver)
getVariant(type)
getState()
```

## Canonical Render Payload

```js
{
  actorId,
  actorType,
  renderVariant,
  lodTier,
  scale,
  opacity,
  paletteRef,
  glyphRef,
  renderPriority,
  metadata
}
```

## Citi Bike Mapping

hidden -> no payload

dot -> station_dot

node -> station_node

icon -> station_icon

## WSL Responsibilities

Allowed:
- build meshes
- apply transforms
- apply projection
- manage visibility
- manage depth

Forbidden:
- inspect truth metadata
- inspect feed types
- determine LOD
- determine variants
- determine station state

## Acceptance Criteria

- TruthActorRuntime emits render payloads through Actor Render Authority.
- Citi Bike stations resolve station_dot, station_node, and station_icon variants.
- WSL contains no Citi Bike specific decision logic.
- New actor types can be added without modifying WSL.
- Truth counts remain unchanged.
- LOD behavior remains unchanged.
- Actor identity remains unchanged.

## Build Readiness

Status: [BUILD]

## Implementation Guide

- Where
  - wall/systems/actors/actorRenderAuthority.js
  - truthActorRuntime.js
  - worldSpaceVehicleLayer.js

- What
  - Implement Render Authority.
  - Route all actor rendering through Render Authority.
  - Remove variant-selection responsibility from WSL.

- Expect
  - Citi Bike stations continue rendering.
  - Future buses, trains, ferries, and props reuse the same pipeline.
  - Reduced renderer complexity.
