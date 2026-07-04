---
layout: spec

title: "WOS Maritime Vessel Taxonomy"
date: 2026-05-23
doc_id: "0523A_WOS_MaritimeVesselTaxonomy_v1.1.0"
version: "1.1.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "MaritimeVesselTaxonomy"

type: "governance-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Defines the canonical vessel classification system used by maritime runtime infrastructure, continuity propagation, observability systems, atmospheric interpretation, and harbor-scale orchestration."
---

# 🎯 PURPOSE

Define the canonical vessel taxonomy infrastructure governing all maritime actor classification throughout WOS.

This taxonomy exists to:

- stabilize vessel interpretation across systems
- preserve continuity semantics
- eliminate renderer-side vessel guessing
- normalize atmospheric behavior
- unify observability logic
- prevent future classification fragmentation
- support scalable harbor populations

# 🧠 CORE PRINCIPLES

- Runtime owns taxonomy truth
- Taxonomy must remain stable across surfaces
- Taxonomy is behavioral infrastructure
- Renderer detail is secondary
- Sparse canonical classes beat hyper-specificity

# 📦 CANONICAL TAXONOMY

```ts
type VesselClass =
  | "CARGO"
  | "TANKER"
  | "PASSENGER"
  | "FERRY"
  | "TUG"
  | "SERVICE"
  | "FISHING"
  | "RECREATIONAL"
  | "MILITARY"
  | "INDUSTRIAL"
  | "UNKNOWN";
```

# 🔄 EXECUTION FLOW

```text
AIS Input
→ AIS Normalization
→ Canonical Vessel Classification
→ Taxonomy Profile Resolution
→ Runtime Registry Assignment
→ Continuity Participation
→ Interpretation Observation
→ Overlay Projection
→ Atmospheric Framing
```

# 🚫 NON-GOALS

This specification is NOT responsible for:

- gameplay systems
- renderer aesthetics
- wake physics
- cinematic scripting
- harbor economics
- AI vessel intelligence

# 📚 CANONICAL REFERENCES

- README
- NamingDoctrine
- SurfaceChannelDoctrine
- MaritimeMotionAuthority
- AISRuntime
- ContinuityDoctrineSuite
- OverlayGrammar
