---
layout: spec
title: "EmitterSystem Workflow"
date: 2026-04-16
doc_id: "0416_WALL_OF_SOUND_EmitterSystem_Workflow_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "emitter_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0416_WALL_OF_SOUND_EmitterSystem_Workflow_v1.0.0

## 🎯 Objective

Implement emitter behavior correctly and minimally with: - No rewrites -
No extra files - No architecture changes - Only targeted fixes

------------------------------------------------------------------------

## 🧠 CORE RULES

### 1. Patch Only

-   Modify existing functions only
-   Do NOT recreate files
-   Do NOT restructure systems
-   Do NOT introduce new systems

### 2. Single Source of Truth

All emitter logic must live in: line.behavior.emitterConfig

### 3. One Timing System

Use numeric division: 4, 8, 16, 32

Never use fractions or decimals.

### 4. System Boundaries

-   Behavior → spawn logic
-   Ball System → movement
-   Collision → detection
-   Renderer → visuals

Emitters must NOT modify other systems.

------------------------------------------------------------------------

## 🔧 REQUIRED FEATURES

### Direction

angle = atan2(y2 - y1, x2 - x1)

finalVx = dirX \* speed + behaviorVx finalVy = dirY \* speed +
behaviorVy

------------------------------------------------------------------------

### Rate

Range: 100 → 8000 ms

------------------------------------------------------------------------

### Quantize

division = cfg.division ?? state.transport.division

interval = (60 / bpm) \* (4 / division)

Anti-drift: cfg.lastSpawn = now - ((now - cfg.lastSpawn) % intervalMs)

------------------------------------------------------------------------

### Spawn Mode

center → line origin\
edge → offset along direction

------------------------------------------------------------------------

### Silent Mode

if (!cfg.silent) triggerSound()

------------------------------------------------------------------------

## 🔁 DATA FLOW

### UI → STATE

Update: line.behavior.emitterConfig

### STATE → RUNTIME

Read ONLY from emitterConfig

### STATE → UI

Sync inspector with: - rate - quantize - division - spawnMode - silent

------------------------------------------------------------------------

## 🚫 FAILURE PATTERNS

-   Runtime defaults overriding UI
-   Dual emitter systems
-   UI not wired to state
-   Direction not respected

------------------------------------------------------------------------

## 🧪 TEST CHECKLIST

-   Line emits particles
-   Rotation affects direction
-   Slow rate works (8000ms)
-   Quantize syncs to BPM
-   Different divisions produce different rhythms
-   Silent mode suppresses sound

------------------------------------------------------------------------

## 🧭 CLAUDE WORKFLOW

### DO

-   Request small patches
-   Target one function
-   Ask for modified code only

### DO NOT

-   Request full files
-   Allow rewrites
-   Allow extra documentation output

------------------------------------------------------------------------

## PROMPT TEMPLATE

Fix ONLY updateBehaviorEmitters()

-   Do not rewrite file
-   Do not create new systems
-   Use existing emitterConfig
-   Ensure quantize, rate, direction work

Return ONLY modified function

------------------------------------------------------------------------

## SYSTEM PRINCIPLES

Emitters are behaviors, not tools\
Timing is per-behavior, not global\
Line direction defines emission

------------------------------------------------------------------------

## RESULT

-   Stable system
-   Predictable behavior
-   Efficient Claude usage
