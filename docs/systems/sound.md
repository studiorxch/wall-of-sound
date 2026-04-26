---
layout: default
title: Sound System
domain: sound
---

# Sound System

## Current Pipeline

```txt
sound/data/sources/house/
→ sound/tools/bpm_normalize.py
→ sound/data/sources/house_124/
→ sound/tools/slicer.py
→ sound/data/slices/house_124/
→ sound/tools/demucs.py
→ sound/data/stems/
→ sound/engine/JUG_PLAYER_v1.7.1.py
```

## Related Specs

{% assign sound_specs = site.specs | where: "domain", "sound" | sort: "date" | reverse %}

{% if sound_specs.size > 0 %}

<div class="spec-list">
  <div class="spec-row header">
    <div>Date</div>
    <div>Domain</div>
    <div>Spec</div>
    <div>Component</div>
    <div>Version</div>
    <div>Status</div>
  </div>

{% for spec in sound_specs %}
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

No Sound specs found yet.

{% endif %}
