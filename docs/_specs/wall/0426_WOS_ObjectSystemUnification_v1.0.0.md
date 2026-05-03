---
layout: spec
title: "Object System Unification"
date: 2026-04-26
doc_id: "0426_WOS_ObjectSystemUnification_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "wall"
component: "geometry_pipeline"

type: "core-spec"
status: "active"
priority: "critical"
risk: "medium"

summary: "Unifies demo geometry and Mop-drawn geometry into a single object-based system so that particles, collision, and behaviors operate consistently across all drawn elements."
---

# 🎯 PURPOSE

Eliminate the split between:

- demoLines (legacy system)
- Mop-drawn shapes (new system)

Replace both with a single unified:

objects[]

All systems must operate ONLY on this unified structure.

---

# 🚨 PROBLEM

demoLines → collision → particles ✔
mop shapes → render only ❌

---

# 🧠 CORE PRINCIPLE

INPUT → OBJECTS[] → SYSTEMS

No alternate paths.

---

# 📦 DATA MODEL

type Segment = { x1, y1, x2, y2 }

type Object = {
id,
segments[],
strokeWidth,
color,
behavior?,
mechanic?
}

---

# 🔧 IMPLEMENTATION

## GLOBAL STORE

window.WOS = window.WOS || {};
WOS.objects = [];

---

## DELETE LEGACY

Remove:

- demoLines
- all references
- separate collision/render paths

---

## DEMO → OBJECTS

function createLineObject(x1,y1,x2,y2,opts={}) {
return {
id: crypto.randomUUID(),
segments: [{ x1,y1,x2,y2 }],
strokeWidth: opts.strokeWidth || 3,
color: opts.color || "#fff"
}
}

WOS.objects = [
createLineObject(200,200,600,250),
createLineObject(300,400,700,450)
]

---

## MOP → OBJECTS

function buildSegments(points){
const segs=[]
for(let i=0;i<points.length-1;i++){
segs.push({
x1:points.x,
y1:points.y,
x2:points.x,
y2:points.y
})
}
return segs
}

WOS.objects.push({
id: crypto.randomUUID(),
segments: buildSegments(stroke.points),
strokeWidth: stroke.width,
color: stroke.color
})

---

## COLLISION (CRITICAL)

for (const obj of WOS.objects) {
for (const seg of obj.segments) {
checkCollision(p, seg)
}
}

---

## RENDER

for (const obj of WOS.objects) {
for (const seg of obj.segments) {
drawSegment(seg, obj)
}
}

---

# 🧪 VALIDATION

- Mop lines collide ✔
- Demo lines collide ✔
- No system difference ✔

---

# 🔥 SUCCESS

Everything = Objects
Particles hit everything

---
