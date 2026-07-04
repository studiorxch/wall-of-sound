0602F_WOS_HeroVehicleActiveMeshOrientationFix_v1.0.0_BUILD

Problem:
0602E corrected _buildCarMesh(), but active WSL vehicle mode renders hero through _buildVehicleMesh() via _buildVehicleLOD(). The visible hero still uses the older -Y-front body layout.

Patch:
Update _buildVehicleMesh() so hero_car geometry uses local +Y as the visual front, matching:
- getHeroDrawState().localForwardAxis = '+Y'
- getHeroForwardBearingDeg()
- 0602A light cue placement
- heroHeadingAudit aligned:true

Do not change:
- headingDeg
- mesh.rotation.z
- VEHICLE_HEADING_OFFSET_DEG
- _applyTransform()
- modelMatrix transform
- camera
- route/runtime

Required edits inside _buildVehicleMesh():
- front fascia: move from -L*0.5 to +L*0.5
- rear fascia: move from +L*0.5 to -L*0.5
- front windshield: move to +Y side of cabin
- rear window: move to -Y side
- headlights: move to +Y front
- taillights: move to -Y rear
- noseCue: move to +Y and rotate to point +Y
- cabin bias should visually trail behind the hood, not lead it

Acceptance:
With heroHeadingAudit() returning aligned:true:
- visible hood/headlights lead travel direction
- rear glass/taillights trail
- no heading offset changes required
- no runtime/camera/route changes