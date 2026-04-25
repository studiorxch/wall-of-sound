## Wall dashboard

`docs/systems/wall.md`:

```md
---
layout: default
title: Wall System
domain: wall
---

# Wall System

## Current Focus

Visual / physics / interaction layer for Wall of Sound.

## Core Areas

| Component     | Status  | Notes                                    |
| ------------- | ------- | ---------------------------------------- |
| Object System | active  | unify strokes, shapes, groups, emitters  |
| Mop Tool      | active  | primary drawing and transform tool       |
| Physics       | active  | delta time, collision, damping, velocity |
| Emitters      | active  | object-level behavior system             |
| Capsules      | planned | embeddable interactive scenes            |
| UI Panels     | active  | inspector, tools, presentation mode      |

## Boundary

Wall docs should not modify the sound pipeline unless a spec explicitly crosses domains.
```
