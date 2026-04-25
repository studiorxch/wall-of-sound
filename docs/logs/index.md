---
layout: default
title: Logs
---

# Logs

| Date                              | Domain       | Log        | Component | Status | Severity | Summary |
| --------------------------------- | ------------ | ---------- | --------- | ------ | -------- | ------- |
| {% assign sorted_logs = site.logs | sort: "date" | reverse %} |

{% for log in sorted_logs %}
| {{ log.date | date: "%Y-%m-%d" }} | {{ log.domain }} | [{{ log.title }}]({{ log.url | relative_url }}) | {{ log.component }} | {{ log.status }} | {{ log.severity }} | {{ log.summary }} |
{% endfor %}
