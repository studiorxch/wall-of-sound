from pathlib import Path

content = """---
layout: default
title: Stroke Path Closure
component: StrokePathClosure
version: v1.0.0
status: draft
date: 2026-04-26
---

# 0426_WOS_StrokePathClosure_v1.0.0

Version: v1.0.0  
Date: 04/26/2026  
Status: Draft  
Component: StrokePathClosure  

---

## Objective

Fix walker looping for stroke-backed paths by adding explicit stroke closure support.

This spec does not replace the current walker system. It only corrects the mismatch between:

- path walkers that can loop
- stroke walkers that currently remain open/clamped

The goal is to make closed drawn shapes usable as loopable walker paths.

---

## Current Problem

The current walker system supports:

- `motionMode: "pingpong"`
- `motionMode: "loop"`
- `motionMode: "once"`

It also supports path types:

- `stroke`
- `line`
- `circle`

Line and circle paths now have explicit closure behavior.

However, stroke paths are still created like this:

```js
path: { type: "stroke", points: stroke.points, closed: false }