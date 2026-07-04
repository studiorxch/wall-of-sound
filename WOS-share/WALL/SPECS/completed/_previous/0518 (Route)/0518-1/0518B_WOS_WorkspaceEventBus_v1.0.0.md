---
formalize:
- event contracts
- payloads
- namespaces
- lifecycle ordering
---

---
# 0518B_WOS_WorkspaceEventBus_v1.0.0

**Generated:** 05/18/2026  
**System:** WOS  
**Domain:** Workspace Infrastructure  
**Component:** Workspace Event Bus  
**Version:** 1.0.0

---

# Purpose

Formalize the WOS event system before:

- Route Planner
- Mapbox integration
- ecology simulation
- passenger cameras
- runtime orchestration
- multi-document synchronization

introduce uncontrolled event complexity.

This spec upgrades:

```
freeform event emission
```

into:

```
structured event orchestration
```

without overengineering the system.

---

# Core Principle

```
Events are contracts.Not casual notifications.
```

Every event must:

- belong to a namespace
- carry a stable payload
- follow lifecycle ordering
- support debugging
- avoid hidden side effects

---

# Current Problem

Workspace currently uses:

```
_emit("tabsChanged", payload)
```

with:

```
untyped string events
```

This becomes dangerous once:

- renderers
- runtimes
- panels
- maps
- cameras
- simulation systems

all begin subscribing simultaneously.

---

# Goals

## Immediate Goals

Provide:

- namespaced events
- typed payload conventions
- lifecycle ordering
- event tracing
- listener isolation
- subscription cleanup

---

## Long-Term Goals

Prepare for:

- runtime suspension
- multiplayer replication
- remote operators
- OBS broadcast hooks
- replay systems
- deterministic simulation playback

---

# File Structure

```
engine/    workspaceEventBus.js
```

---

# Event Naming Convention

All events use:

```
namespace:event
```

---

# Examples

```
workspace:loadedworkspace:saveddocument:createddocument:openeddocument:closeddocument:renameddocument:modifiedsidebar:changedruntime:registeredruntime:attachedruntime:startedruntime:stoppedcamera:targetChangedroute:updatedroute:loadedsimulation:tick
```

---

# Rules

## Rule 1 — No Bare Event Names

BAD:

```
tabsChanged
```

GOOD:

```
workspace:tabsChanged
```

---

## Rule 2 — Stable Payloads

Payload shape must remain stable.

BAD:

```
emit("document:opened", doc)
```

GOOD:

```
emit("document:opened", {    documentId,    document,    previousId})
```

---

## Rule 3 — Listener Isolation

One listener failure must NEVER break the event chain.

All listeners execute in isolated try/catch.

---

## Rule 4 — No Hidden Mutations

Events announce:

```
completed state changes
```

NOT:

```
permission to mutate
```

Meaning:

```
emit AFTER mutation
```

never:

```
emit BEFORE mutation
```

unless explicitly named:

```
before:will:prepare:
```

---

## Rule 5 — Event Bus Is Not State

The bus:

- does not own state
- does not queue logic
- does not orchestrate systems

It ONLY distributes signals.

---

# Event Bus API

---

# engine/workspaceEventBus.js

```
(function (global) {    "use strict";    var SBE = (global.SBE = global.SBE || {});    var _listeners = new Map();    var _traceEnabled = false;    function on(event, handler) {        if (!_listeners.has(event)) {            _listeners.set(event, []);        }        _listeners.get(event).push(handler);        return function unsubscribe() {            off(event, handler);        };    }    function off(event, handler) {        var arr = _listeners.get(event);        if (!arr) return;        var idx = arr.indexOf(handler);        if (idx !== -1) {            arr.splice(idx, 1);        }    }    function emit(event, payload) {        var arr = _listeners.get(event);        if (_traceEnabled) {            console.log(                "[EventBus]",                event,                payload            );        }        if (!arr || arr.length === 0) {            return;        }        for (var i = 0; i < arr.length; i++) {            try {                arr[i](payload);            } catch (err) {                console.error(                    "[EventBus] listener error:",                    event,                    err                );            }        }    }    function once(event, handler) {        function wrapper(payload) {            off(event, wrapper);            handler(payload);        }        on(event, wrapper);    }    function clear(event) {        if (event) {            _listeners.delete(event);            return;        }        _listeners.clear();    }    function listEvents() {        return Array.from(_listeners.keys());    }    function listenerCount(event) {        var arr = _listeners.get(event);        return arr ? arr.length : 0;    }    function setTracing(enabled) {        _traceEnabled = !!enabled;    }    SBE.WorkspaceEventBus = {        on,        off,        once,        emit,        clear,        listEvents,        listenerCount,        setTracing    };})(window);
```

---

# Workspace Integration

Replace:

```
_emit(...)
```

with:

```
SBE.WorkspaceEventBus.emit(...)
```

---

# Required Event Refactor

---

# Workspace Events

OLD:

```
tabsChangedactiveDocumentChangedworkspaceLoaded
```

NEW:

```
workspace:tabsChangedworkspace:activeDocumentChangedworkspace:loaded
```

---

# Document Events

OLD:

```
documentCreateddocumentCloseddocumentRenamed
```

NEW:

```
document:createddocument:closeddocument:renamed
```

---

# Runtime Events

OLD:

```
runtimeRegisteredruntimeAttached
```

NEW:

```
runtime:registeredruntime:attached
```

---

# Sidebar Events

OLD:

```
sidebarContextChanged
```

NEW:

```
sidebar:changed
```

---

# Event Lifecycle Ordering

Critical.

---

# Document Open Flow

Must ALWAYS occur in this order:

```
1. mutate active document2. emit document:opened3. emit workspace:tabsChanged4. renderer updates5. inspector updates
```

Never reorder silently.

---

# Route Update Flow

```
1. route mutates2. emit route:updated3. camera reevaluates4. ecology reevaluates5. render invalidates
```

---

# Event Tracing

Debugging support is mandatory.

---

# Console Tracing

```
SBE.WorkspaceEventBus.setTracing(true);
```

Outputs:

```
[EventBus] document:opened[EventBus] route:updated[EventBus] camera:targetChanged
```

---

# Future Debug Overlay

This spec intentionally prepares:

```
live event monitor HUD
```

later.

---

# Event Payload Standards

---

# Required Fields

Every payload SHOULD include:

```
sourcetimestamp
```

---

# Example

```
emit("document:opened", {    source: "Workspace",    timestamp: performance.now(),    documentId: doc.id,    document: doc,    previousId: prevId});
```

---

# Memory Safety

Every UI subscription MUST store unsubscribe handles.

BAD:

```
bus.on(...)
```

GOOD:

```
var unsub = bus.on(...);
```

Required for:

- document switching
- runtime unloading
- detached inspectors
- future multiplayer views

---

# Future Expansion

This architecture intentionally prepares for:

---

# Priority Events

Future:

```
emitPriority()
```

for:

- simulation
- camera
- audio timing

---

# Buffered Events

Future:

```
emitBuffered()
```

for:

- replay systems
- synchronization
- multiplayer replication

---

# Cross-Window Events

Future:

```
operator windowpassenger windowOBS outputmobile client
```

---

# Constraints

## Do NOT

- build a Redux clone
- build ECS messaging
- add async queues
- add dependency graphs
- add event inheritance

---

## Keep It

- synchronous
- inspectable
- deterministic
- traceable
- minimal

---

# Final Principle

```
Documents hold state.Runtimes execute behavior.Renderers visualize state.The Event Bus synchronizes awareness.
```

---

# Implementation Guide

### 1. Create Event Bus

Add:

```
engine/workspaceEventBus.js
```

### 2. Replace Internal _emit()

Refactor Workspace:

```
_emit(...)
```

→

```
SBE.WorkspaceEventBus.emit(...)
```

### 3. Normalize Event Names

Convert all events to:

```
namespace:event
```

format before Route Planner integration begins.