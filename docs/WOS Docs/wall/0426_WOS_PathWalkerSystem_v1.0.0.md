---
layout: default
title: Path & Walker System
system: WOS
domain: wall
component: PathWalker
version: v1.0.0
status: active
date: 2026-04-26
---

# 0426_WOS_PathWalkerSystem_v1.0.0

Version: v1.0.0  
Date: 04/26/2026  
Status: Ready for Implementation

---

## 0. ASSUMPTIONS

- JavaScript (ES6+)
- Existing update/render loop (dt-based)
- Mop already produces stroke point arrays
- Particle system exists
- No external dependencies

---

## 1. OBJECTIVE

Introduce a time-based motion system:

- Continuous motion (line, loop, freehand)
- Reusable paths
- Walkers as motion drivers
- Foundation for animation and expressive systems

---

## 2. SYSTEM OVERVIEW

Input (Mop / System)  
→ Path  
→ Walker  
→ Driver (optional)  
→ Target (position, scale, rotation)

---

## 3. DATA MODEL

### 3.1 Vec2

```js
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static lerp(a, b, t) {
    return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  static dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

export class Path {
  constructor({ id, type = 'line', points = [], closed = false }) {
    this.id = id
    this.type = type
    this.points = points
    this.closed = closed
    this.length = this.computeLength()
  }

  computeLength() {
    if (this.points.length < 2) return 0

    let len = 0

    for (let i = 0; i < this.points.length - 1; i++) {
      len += Vec2.dist(this.points[i], this.points[i + 1])
    }

    if (this.closed) {
      len += Vec2.dist(
        this.points[this.points.length - 1],
        this.points[0]
      )
    }

    return len
  }
}
Walker
export class Walker {
  constructor({
    id,
    path,
    speed = 0.2,
    t = 0,
    mode = 'loop'
  }) {
    this.id = id
    this.path = path
    this.speed = speed
    this.t = t
    this.mode = mode

    this.direction = 1
    this.position = new Vec2()
  }

  update(dt) {
    if (!this.path || this.path.points.length < 2) return

    this.t += this.speed * dt * this.direction

    if (this.mode === 'loop') {
      this.t = this.t % 1
      if (this.t < 0) this.t += 1
    }

    if (this.mode === 'pingpong') {
      if (this.t > 1) {
        this.t = 1
        this.direction *= -1
      } else if (this.t < 0) {
        this.t = 0
        this.direction *= -1
      }
    }

    if (this.mode === 'once') {
      this.t = Math.max(0, Math.min(1, this.t))
    }

    this.position = samplePath(this.path, this.t)
  }
}
Core Logic
export function samplePath(path, t) {
  const pts = path.points
  const total = pts.length

  if (total < 2) return new Vec2()

  const scaled = t * (path.closed ? total : total - 1)
  const i = Math.floor(scaled)
  const localT = scaled - i

  const a = pts[i % total]
  const b = pts[(i + 1) % total]

  return Vec2.lerp(a, b, localT)
}
Path Generators
export function createLinePath(id, a, b) {
  return new Path({
    id,
    type: 'line',
    points: [a, b],
    closed: false
  })
}

export function createCirclePath(id, center, radius, segments = 32) {
  const points = []

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2

    points.push(
      new Vec2(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius
      )
    )
  }

  return new Path({
    id,
    type: 'loop',
    points,
    closed: true
  })
}

export function createFreehandPath(id, strokePoints) {
  return new Path({
    id,
    type: 'freehand',
    points: strokePoints,
    closed: false
  })
}
Integration
function update(dt) {
  walkers.forEach(w => w.update(dt))
}
```
