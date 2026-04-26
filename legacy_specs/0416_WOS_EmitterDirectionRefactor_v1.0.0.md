# 0416_WOS_EmitterDirectionRefactor_v1.0.0

Generated: 04/16/2026

## Scope
Refactor emitter behavior into a simpler directional model that removes the current ambiguity between:
- center vs edge spawning
- velocity X / velocity Y
- rotation vs direction responsibility

This update replaces the current emitter spawn controls with a unified edge-based directional system.

---

## Assumptions

- Emitters are behaviors attached to lines and shapes, not standalone objects
- Lines and shapes may still be partially separate systems internally, but emitter behavior should feel consistent across both
- Current velocity X / velocity Y controls are difficult to understand and should be removed from the UI
- Shape rotation may still be useful for geometry itself, but emitter direction should not depend on forcing users to rotate shapes just to get a precise angle
- A single angle control is preferred because it is simpler and supports precise directional control

---

## Core Decision

### Remove
- `spawnMode` (`center` / `edge`)
- `velocity.x`
- `velocity.y`

### Keep
- `strength`

### Add / Replace With
- `direction` (single dial / angle control)
- edge-based spawning only

---

## New Behavior Model

```ts
geometry (line / shape)
  → edge-side selection
  → spawn point on boundary
  → direction angle
  → strength
  → motion
```

This should collapse the current three emitter controls into one simpler directional model.

---

## UX Rule

### Center mode is removed
Center spawning is no longer needed.

### Edge spawning is always used
All particles emit from the boundary of the source geometry.

### Direction must define two things at once
1. which side is used for spawning
2. which direction the emitted particles travel

This creates a simpler mental model:
- point the emitter
- particles spawn from the relevant edge
- particles travel in that direction

---

## UI Changes

### Remove these controls
- Spawn Mode
- Velocity X
- Velocity Y

### Keep
- Strength

### Add
- Direction Dial

#### Direction Dial
- Range: `0–360°` or `0–2π`
- This is the primary emitter control
- It determines:
  - active edge side
  - travel direction

---

## Direction Model

```ts
direction: number // radians
```

Derived values:

```js
const dirX = Math.cos(direction);
const dirY = Math.sin(direction);
```

These values should be used internally only.  
The user should no longer interact with raw X/Y velocity values in the UI.

---

## Shape Edge-Side Selection

For shapes, use the dominant direction axis to determine which boundary side is active.

### Rules

```js
if (Math.abs(dirX) > Math.abs(dirY)) {
  edge = dirX > 0 ? "right" : "left";
} else {
  edge = dirY > 0 ? "bottom" : "top";
}
```

### Result
- direction pointing mostly upward → spawn from top edge
- direction pointing mostly downward → spawn from bottom edge
- direction pointing mostly left → spawn from left edge
- direction pointing mostly right → spawn from right edge

### Spawn Point on Shape
Once edge side is selected, choose a random point along that side of the shape bounds.

```js
function getShapeEdgePoint(shape, edge) {
  const b = shape.bounds;

  if (edge === "top") {
    return {
      x: randomBetween(b.minX, b.maxX),
      y: b.minY,
    };
  }

  if (edge === "bottom") {
    return {
      x: randomBetween(b.minX, b.maxX),
      y: b.maxY,
    };
  }

  if (edge === "left") {
    return {
      x: b.minX,
      y: randomBetween(b.minY, b.maxY),
    };
  }

  return {
    x: b.maxX,
    y: randomBetween(b.minY, b.maxY),
  };
}
```

---

## Line Edge-Side Selection

Lines do not have top/bottom/left/right in the same way shapes do.  
For lines, determine the active side using the line normal.

### Line Direction

```js
const dx = line.x2 - line.x1;
const dy = line.y2 - line.y1;
const length = Math.hypot(dx, dy);

const nx = -dy / length;
const ny = dx / length;
```

### Side Selection
Use the emitter direction against the line normal:

```js
const dot = nx * dirX + ny * dirY;
const side = dot >= 0 ? 1 : -1;
```

This determines which side of the line is considered the active spawning side.

### Spawn Point on Line
Spawn from a random point along the line:

```js
function getLineEdgePoint(line) {
  const t = Math.random();
  return {
    x: line.x1 + (line.x2 - line.x1) * t,
    y: line.y1 + (line.y2 - line.y1) * t,
  };
}
```

Note: this gives the position on the line. The line-side choice should be used for visual indication and optional small offset if needed.

---

## Optional Spawn Offset for Lines

To make line-side behavior visually clearer, allow a small spawn offset away from the line using the chosen normal side.

```js
const offset = 8 * side;

spawn.x += nx * offset;
spawn.y += ny * offset;
```

This is recommended because it makes line-side emission more visually understandable.

---

## Final Spawn Resolver

```js
function resolveEmitterSpawn(source, direction) {
  const dirX = Math.cos(direction);
  const dirY = Math.sin(direction);

  if (source.segments && source.bounds) {
    let edge;
    if (Math.abs(dirX) > Math.abs(dirY)) {
      edge = dirX > 0 ? "right" : "left";
    } else {
      edge = dirY > 0 ? "bottom" : "top";
    }

    return getShapeEdgePoint(source, edge);
  }

  if (typeof source.x1 === "number" && typeof source.x2 === "number") {
    return getLineEdgePoint(source);
  }

  return { x: 0, y: 0 };
}
```

---

## Velocity / Motion

Strength now controls emitted speed only.

```js
ball.vx = Math.cos(direction) * strength;
ball.vy = Math.sin(direction) * strength;
```

### Rule
- direction = angle
- strength = speed

These roles should remain separate and clear.

---

## Visual Feedback Requirements

To make the new system understandable, add visual feedback:

### Required
- direction arrow
- active edge highlight

### For Shapes
- highlight top / bottom / left / right edge currently selected

### For Lines
- show arrow direction
- optionally show slight side offset or side indicator

This is important so users can see:
- where particles are coming from
- why that side was chosen

---

## Backward Compatibility

When older scenes are loaded:

### If old velocity fields exist
Convert them into direction + strength:

```js
const direction = Math.atan2(oldVelocityY, oldVelocityX);
const strength = Math.hypot(oldVelocityX, oldVelocityY);
```

### If old spawn mode exists
Ignore it and default to edge-based emission.

---

## Constraints

- Do not reintroduce standalone emitter objects
- Do not keep center spawning in the new UI
- Do not expose raw velocity X/Y in the inspector
- Do not make users rotate a shape just to control emitter angle
- Keep system behavior consistent across both lines and shapes, even if their underlying code paths still differ internally

---

## Expected Result

The emitter system should now feel like a single spatial instrument:

- all emission comes from edges
- one dial controls where particles come from
- one dial controls where particles go
- strength controls how fast they travel

The user should not have to think in raw velocity numbers anymore.

---

## Validation Checklist

- [ ] Spawn Mode removed from inspector
- [ ] Velocity X removed from inspector
- [ ] Velocity Y removed from inspector
- [ ] Direction dial added
- [ ] Shapes emit from top/bottom/left/right edges based on direction
- [ ] Lines emit from the correct side based on line normal and direction
- [ ] Strength affects speed only
- [ ] Old scenes with velocity values still load correctly
- [ ] No center spawning remains in emitter behavior
- [ ] Visual feedback clearly shows active direction and spawn side

---

## Implementation Guide

- **Where code goes:** emitter behavior logic, inspector UI, scene hydration for backward compatibility
- **What to run:** reload app and test direction dial through full 360° on both lines and shapes
- **What to expect:** a simpler, edge-only emitter model with intuitive directional control
