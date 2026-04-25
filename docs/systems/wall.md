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
| Object System | active  | Unify strokes, shapes, groups, emitters  |
| Mop Tool      | active  | Primary drawing and transform tool       |
| Physics       | active  | Delta time, collision, damping, velocity |
| Emitters      | active  | Object-level behavior system             |
| Particles     | active  | Visual/audio event carriers              |
| Capsules      | planned | Embeddable interactive scenes            |
| UI Panels     | active  | Inspector, tools, presentation mode      |

## Boundary

Wall docs should not modify the sound pipeline unless a spec explicitly crosses domains.

## Related Specs

| Date                              | Spec                    | Component    | Version    | Status | Summary |
| --------------------------------- | ----------------------- | ------------ | ---------- | ------ | ------- |
| {% assign wall_specs = site.specs | where: "domain", "wall" | sort: "date" | reverse %} |

{% for spec in wall_specs %}
| {{ spec.date | date: "%Y-%m-%d" }} | [{{ spec.title }}]({{ spec.url | relative_url }}) | {{ spec.component }} | {{ spec.version }} | {{ spec.status }} | {{ spec.summary }} |
{% endfor %}
