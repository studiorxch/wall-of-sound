0611A_WOS_HiddenSourceSuppressionResolutionAudit_v1.0.0_BUILD

Objective

0610Q is complete and reports successful suppression state, however hidden source buildings remain visibly rendered in Author Mode.

This task is NOT to add new systems.

This task is to determine exactly why suppression is not reaching the rendered geometry.

Current state

Author Mode:
- hidden:true persists correctly
- author badge updates correctly
- authorSuppressionStatus() reports active suppression
- applyRegistryEdits() executes
- footprint expansion runtime exists
- group expansion runtime exists
- compound expansion runtime exists

Problem

Selected buildings marked:

hidden:true

remain visible on the Studio map.

We need a deterministic audit of the suppression chain.

Acceptance Criteria

Create a debug report showing:

1. Registry Layer

For selected building:

- buildingKey
- hidden state
- stored geometry
- stored feature id

2. Suppression Collection Layer

Report:

- hiddenSourceCount
- directIdCount
- footprintExpandedIdCount
- groupExpandedIdCount
- compoundExpandedIdCount
- totalSuppressedIdCount

3. Footprint Query Layer

For the selected building footprint:

Report every feature returned from:

queryRenderedFeatures()

Including:

- layer.id
- source
- sourceLayer
- feature.id

Goal:

Determine whether rendered feature ids actually match registry ids.

4. Layer Target Audit

Report every layer receiving suppression:

For each:

- layer id
- layer type
- opacity property name
- expression applied

Verify suppression is reaching:

fill-extrusion

layers.

5. Paint Verification

After suppression executes:

Read back:

map.getPaintProperty()

for every targeted layer.

Verify expression actually exists.

6. Failure Classification

Output exactly one result:

A. Registry mismatch

B. Footprint query failure

C. Feature id mismatch

D. Layer targeting failure

E. Paint mutation failure

F. Mapbox style limitation

Do NOT create fixes yet.

Do NOT add new systems.

Do NOT modify architecture.

Goal is root-cause identification only.

Deliver:

- findings
- exact failing stage
- exact feature ids involved
- exact layer ids involved
- recommended minimal patch