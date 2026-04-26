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

{% assign wall_specs = site.specs | where: "domain", "wall" | sort: "date" | reverse %}

{% if wall_specs.size > 0 %}

<div class="spec-list">
  <div class="spec-row header">
    <div>Date</div>
    <div>Domain</div>
    <div>Spec</div>
    <div>Component</div>
    <div>Version</div>
    <div>Status</div>
  </div>

{% for spec in wall_specs %}
<div class="spec-row">
<div class="spec-date">{{ spec.date | date: "%m/%d/%y" }}</div>
<div class="spec-domain">{{ spec.domain }}</div>
<div class="spec-title">
<a href="{{ spec.url | relative_url }}">{{ spec.title }}</a>
</div>
<div class="spec-component">{{ spec.component }}</div>
<div class="spec-version">v{{ spec.version }}</div>
<div class="spec-status">{{ spec.status }}</div>
<div class="spec-summary">{{ spec.summary }}</div>
</div>
{% endfor %}

</div>

{% else %}

No Wall specs found yet.

{% endif %}
