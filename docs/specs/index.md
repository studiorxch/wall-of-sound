---
layout: default
title: Specs
---

# Specs

{% assign sorted_specs = site.specs | default: empty | sort: "date" | reverse %}

{% if sorted_specs.size > 0 %}

<div class="spec-list">
  <div class="spec-row header">
    <div>Date</div>
    <div>Domain</div>
    <div>Spec</div>
    <div>Component</div>
    <div>Version</div>
    <div>Status</div>
  </div>

{% for spec in sorted_specs %}
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

No specs found yet.

{% endif %}
