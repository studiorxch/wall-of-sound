---
layout: default
title: Specs
---

# Specs

| Date                                | Domain       | Spec       | Component | Version | Status | Summary |
| ----------------------------------- | ------------ | ---------- | --------- | ------- | ------ | ------- |
| {% assign sorted_specs = site.specs | sort: "date" | reverse %} |

{% for spec in sorted_specs %}
| {{ spec.date | date: "%Y-%m-%d" }} | {{ spec.domain }} | [{{ spec.title }}]({{ spec.url | relative_url }}) | {{ spec.component }} | {{ spec.version }} | {{ spec.status }} | {{ spec.summary }} |
{% endfor %}
