---
layout: default
title: Motion Panel + Color + Presets
system: "WOS"
domain: "wall"
component: MotionPanel
version: v1.2.0
status: draft
date: 2026-04-26
---

# 0426_WOS_MotionPanel_v1.2.0

Version: v1.2.0  
Date: 04/26/2026  
Status: Draft

---

## Objective

Expose motion brush controls in a minimal panel:

- restore color system (no white-only regression)
- allow real-time motion tuning
- introduce presets for fast creative iteration

No new systems. Only UI + state wiring.

---

## Core Principle

```text
state.motion = single source of truth
```
