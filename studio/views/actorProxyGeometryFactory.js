// ── WOS ActorProxyGeometryFactory ─────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase5ObjectRenderLayer_v1.0.0_BUILD
// 0615D_WOS_3DAssetVisualAuthoringPass_v1.0.0_BUILD
// 0616B_WOS_ProxyShapeEditorPass_v1.0.0_BUILD
// 0616C_WOS_ObjectColorMaterialAuthoringPass_v1.0.0_BUILD
// Produces deterministic Three.js Object3D proxy per actorCategory / actorType.
// Geometry is Y-up, centred at origin unless noted. All dimensions in world metres.
// 0615D: added readable/hero detail tiers, improved per-category silhouettes,
//        direction arrow helper, authoring scale multipliers.
// 0616B: parametric shape-recipe templates (createFromShapeRecipe). shapeDraft is
//        Studio session/preview state ONLY — never written to actor manifests.
//        If no shapeDraft is supplied, 0615D proxy behavior is unchanged.
// 0616C: every mesh tagged with mesh.userData.materialSlot (body/roof/glass/
//        accent/edge/emissive) via _slot(). Untagged meshes default to 'body'
//        in the render layer's material-preview applier.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // Locked proxy colour map §4.2
  var COLORS = {
    prop:      0x8B8680,
    structure: 0xA89880,
    maritime:  0x4A7FA5,
    vehicle:   0x5A7A6A,
    aircraft:  0x9AAAB8,
    selection: 0x00CED1,  // cyan — matches AURL selection colour
    arrow:     0x00CED1,
  };

  // Ring radius in metres per actorCategory (max proxy footprint / 2 + margin) §5.3
  var RING_RADIUS_M = {
    prop:      1.5,
    structure: 5.0,
    maritime:  11.0,
    vehicle:   3.0,
    aircraft:  16.5,
  };

  // Studio authoring scale multipliers — never written to manifests
  var AUTHORING_SCALE = {
    prop:      2.0,
    structure: 1.0,
    maritime:  2.2,
    vehicle:   1.8,
    aircraft:  2.4,
  };

  // ── Material helpers ──────────────────────────────────────────────────────────
  function _mat(hex, opacity) {
    var opts = { color: hex };
    if (opacity != null && opacity < 1) { opts.transparent = true; opts.opacity = opacity; }
    return new global.THREE.MeshLambertMaterial(opts);
  }

  function _basicMat(hex, opacity) {
    var opts = { color: hex };
    if (opacity != null && opacity < 1) { opts.transparent = true; opts.opacity = opacity; }
    return new global.THREE.MeshBasicMaterial(opts);
  }

  // 0616C: tag a mesh with a stable semantic material slot for ObjectMaterialAuthoringController.
  // Untagged meshes fall back to 'body' (enforced in the render layer's preview applier).
  function _slot(mesh, slot) {
    mesh.userData.materialSlot = slot || 'body';
    return mesh;
  }

  // Box with origin at base centre
  function _box(w, h, d, color) {
    var THREE = global.THREE;
    var geo  = new THREE.BoxGeometry(w, h, d);
    var mesh = new THREE.Mesh(geo, _mat(color));
    mesh.position.y = h / 2;
    _slot(mesh, 'body');
    var g = new THREE.Group();
    g.add(mesh);
    return g;
  }

  // ── Simple tier — original shapes ────────────────────────────────────────────

  // Hull wedge: 20m × 4m × 6m. Bow at +Z, stern at -Z.
  function _hullSimple() {
    var THREE = global.THREE;
    var L = 10, W = 3, H = 4;
    var v = [
      -W, H, -L,   W, H, -L,   -W, 0, -L,   W, 0, -L,
       0, H,  L,    0, 0,  L,
    ];
    var idx = [
      0, 2, 3,  0, 3, 1,
      0, 1, 4,
      2, 5, 3,
      0, 4, 5,  0, 5, 2,
      1, 3, 5,  1, 5, 4,
    ];
    var pos = new Float32Array(idx.length * 3);
    for (var i = 0; i < idx.length; i++) {
      var b = idx[i] * 3;
      pos[i * 3] = v[b]; pos[i * 3 + 1] = v[b + 1]; pos[i * 3 + 2] = v[b + 2];
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    var g = new THREE.Group();
    g.add(_slot(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLORS.maritime, side: THREE.DoubleSide })), 'body'));
    return g;
  }

  function _aircraftSimple() {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var color = COLORS.aircraft;
    var fuseGeo = new THREE.CylinderGeometry(1, 1, 30, 8);
    fuseGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var fuse = new THREE.Mesh(fuseGeo, _mat(color));
    fuse.position.y = 4;
    _slot(fuse, 'body');
    g.add(fuse);
    var wingGeo = new THREE.PlaneGeometry(30, 1.5);
    wingGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var wing = new THREE.Mesh(wingGeo, new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide }));
    wing.position.y = 4;
    _slot(wing, 'body');
    g.add(wing);
    return g;
  }

  // ── Readable tier — improved silhouettes ─────────────────────────────────────

  function _marineReadable() {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var c = COLORS.maritime;

    // Hull wedge (same as simple but taller/wider for readability)
    var L = 10, W = 3, H = 3.5;
    var v = [
      -W, H, -L,   W, H, -L,   -W, 0, -L,   W, 0, -L,
       0, H,  L,    0, 0,  L,
    ];
    var idx = [
      0,2,3, 0,3,1, 0,1,4, 2,5,3, 0,4,5, 0,5,2, 1,3,5, 1,5,4,
    ];
    var pos = new Float32Array(idx.length * 3);
    for (var i = 0; i < idx.length; i++) {
      var b = idx[i] * 3; pos[i*3]=v[b]; pos[i*3+1]=v[b+1]; pos[i*3+2]=v[b+2];
    }
    var hullGeo = new THREE.BufferGeometry();
    hullGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    hullGeo.computeVertexNormals();
    g.add(_slot(new THREE.Mesh(hullGeo, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })), 'body'));

    // Cabin block mid-ship
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 5), _mat(0x3d6a8a));
    cabin.position.set(0, H + 1.5, -2);
    _slot(cabin, 'roof');
    g.add(cabin);

    // Bow marker spike
    var bowGeo = new THREE.CylinderGeometry(0, 0.4, 2, 6);
    var bow = new THREE.Mesh(bowGeo, _basicMat(COLORS.selection));
    bow.position.set(0, H, L);
    bow.rotation.x = -Math.PI / 2;
    _slot(bow, 'accent');
    g.add(bow);

    return g;
  }

  function _vehicleReadable() {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var c = COLORS.vehicle;

    // Body
    var body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.5), _mat(c));
    body.position.y = 0.6;
    _slot(body, 'body');
    g.add(body);

    // Cabin / roof
    var roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 2.4), _mat(0x3d5c4a));
    roof.position.set(0, 1.65, -0.2);
    _slot(roof, 'roof');
    g.add(roof);

    // Windshield — glass slot
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), _basicMat(0x203848, 0.7));
    glass.position.set(0, 1.65, 0.95);
    glass.rotation.x = -Math.PI / 6;
    _slot(glass, 'glass');
    g.add(glass);

    // Front marker — small cyan wedge pointing +Z (forward)
    var fwdGeo = new THREE.CylinderGeometry(0, 0.35, 0.8, 4);
    var fwd = new THREE.Mesh(fwdGeo, _basicMat(COLORS.selection));
    fwd.position.set(0, 1.2, 2.4);
    fwd.rotation.x = -Math.PI / 2;
    _slot(fwd, 'accent');
    g.add(fwd);

    return g;
  }

  function _aircraftReadable() {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var c = COLORS.aircraft;

    // Fuselage
    var fuseGeo = new THREE.CylinderGeometry(0.9, 1.1, 28, 8);
    fuseGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var fuse = new THREE.Mesh(fuseGeo, _mat(c));
    fuse.position.y = 5;
    _slot(fuse, 'body');
    g.add(fuse);

    // Wings (swept)
    var wGeo = new THREE.PlaneGeometry(32, 3);
    wGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var wing = new THREE.Mesh(wGeo, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    wing.position.y = 4.8;
    _slot(wing, 'body');
    g.add(wing);

    // Tail plane
    var tGeo = new THREE.PlaneGeometry(10, 1.5);
    tGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var tail = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    tail.position.set(0, 6, -13);
    _slot(tail, 'edge');
    g.add(tail);

    // Vertical stabiliser
    var vsGeo = new THREE.PlaneGeometry(1.2, 4);
    var vs = new THREE.Mesh(vsGeo, new THREE.MeshLambertMaterial({ color: 0x7a8896, side: THREE.DoubleSide }));
    vs.position.set(0, 7, -13);
    _slot(vs, 'edge');
    g.add(vs);

    // Nose marker
    var noseGeo = new THREE.CylinderGeometry(0, 0.6, 2, 6);
    var nose = new THREE.Mesh(noseGeo, _basicMat(COLORS.selection));
    nose.position.set(0, 4.8, 15);
    nose.rotation.x = -Math.PI / 2;
    _slot(nose, 'accent');
    g.add(nose);

    return g;
  }

  function _propReadable() {
    var THREE = global.THREE;
    var g = new THREE.Group();

    // Base cylinder
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 0.3, 16), _mat(COLORS.prop));
    base.position.y = 0.15;
    _slot(base, 'body');
    g.add(base);

    // Main body — slightly tapered box
    var body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), _mat(COLORS.prop));
    body.position.y = 1.0;
    _slot(body, 'body');
    g.add(body);

    // Top sphere
    var top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), _mat(0x6e6660));
    top.position.y = 2.1;
    _slot(top, 'accent');
    g.add(top);

    // Forward nub
    var nub = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.3, 0.6, 6), _basicMat(COLORS.selection));
    nub.position.set(0, 1.0, 0.65);
    nub.rotation.x = -Math.PI / 2;
    _slot(nub, 'accent');
    g.add(nub);

    return g;
  }

  function _structureReadable() {
    var THREE = global.THREE;
    var g = new THREE.Group();

    // Main mass
    var body = new THREE.Mesh(new THREE.BoxGeometry(8, 18, 8), _mat(COLORS.structure));
    body.position.y = 9;
    _slot(body, 'body');
    g.add(body);

    // Setback upper
    var upper = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 5), _mat(0x9a8870));
    upper.position.y = 21;
    _slot(upper, 'roof');
    g.add(upper);

    // Base footprint ring hint
    var ringGeo = new THREE.RingGeometry(4.5, 5.5, 32);
    ringGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLORS.selection, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    ring.position.y = 0.05;
    _slot(ring, 'accent');
    g.add(ring);

    return g;
  }

  // ── 0616B: Parametric shape-recipe templates ─────────────────────────────────
  // shapeDraft = { template, params } — Studio-only preview state, never persisted.

  var TEMPLATE_DEFAULTS = {
    'structure.block':   { lengthM: 12, widthM: 10, heightM: 24, roofHeightM: 2, setbackM: 0 },
    'structure.tower':   { baseLengthM: 10, baseWidthM: 10, heightM: 40, shaftScale: 0.6, roofHeightM: 3 },
    'vehicle.body':      { lengthM: 5, widthM: 2.2, heightM: 1.8, roofHeightM: 0.6, frontSlope: 0.2, rearSlope: 0.1 },
    'maritime.hull':     { lengthM: 14, widthM: 4, heightM: 2, bowTaper: 0.6, sternTaper: 0.25, cabinHeightM: 1.6 },
    'aircraft.fuselage': { lengthM: 12, bodyWidthM: 1.8, bodyHeightM: 1.8, wingSpanM: 12, tailSpanM: 4, noseTaper: 0.5 },
    'prop.boxStack':     { lengthM: 3, widthM: 3, heightM: 3, baseHeightM: 0.3, topHeightM: 0.5 },
  };

  var TEMPLATES_BY_CATEGORY = {
    structure: ['structure.block', 'structure.tower'],
    vehicle:   ['vehicle.body'],
    maritime:  ['maritime.hull'],
    aircraft:  ['aircraft.fuselage'], // reachable only via vehicle category + aircraft actorType
    prop:      ['prop.boxStack'],
  };

  function _mergeParams(template, params) {
    var defaults = TEMPLATE_DEFAULTS[template] || {};
    var out = Object.assign({}, defaults);
    if (params) {
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v != null && !isNaN(v)) out[k] = v;
      });
    }
    return out;
  }

  function _shapeStructureBlock(p) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var L = p.lengthM, W = p.widthM, H = p.heightM;
    var body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), _mat(COLORS.structure));
    body.position.y = H / 2;
    _slot(body, 'body');
    g.add(body);
    if (p.roofHeightM > 0) {
      var setback = p.setbackM || 0;
      var rl = Math.max(0.5, L - setback * 2), rw = Math.max(0.5, W - setback * 2);
      var roof = new THREE.Mesh(new THREE.BoxGeometry(rl, p.roofHeightM, rw), _mat(0x9a8870));
      roof.position.y = H + p.roofHeightM / 2;
      _slot(roof, 'roof');
      g.add(roof);
    }
    var maxFootprint = Math.max(L, W);
    var ringGeo = new THREE.RingGeometry(maxFootprint / 2 + 0.5, maxFootprint / 2 + 1.5, 32);
    ringGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLORS.selection, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    ring.position.y = 0.05;
    _slot(ring, 'accent');
    g.add(ring);
    return g;
  }

  function _shapeStructureTower(p) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var L = p.baseLengthM, W = p.baseWidthM, H = p.heightM;
    var shaftH = H * 0.7, topH = H - shaftH;
    var scale = p.shaftScale != null ? p.shaftScale : 0.6;
    var base = new THREE.Mesh(new THREE.BoxGeometry(L, shaftH, W), _mat(COLORS.structure));
    base.position.y = shaftH / 2;
    _slot(base, 'body');
    g.add(base);
    var top = new THREE.Mesh(new THREE.BoxGeometry(L * scale, topH, W * scale), _mat(0x9a8870));
    top.position.y = shaftH + topH / 2;
    _slot(top, 'roof');
    g.add(top);
    if (p.roofHeightM > 0) {
      var roof = new THREE.Mesh(new THREE.BoxGeometry(L * scale * 0.6, p.roofHeightM, W * scale * 0.6), _mat(0x6e6660));
      roof.position.y = shaftH + topH + p.roofHeightM / 2;
      _slot(roof, 'roof');
      g.add(roof);
    }
    return g;
  }

  function _shapeVehicleBody(p) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var L = p.lengthM, W = p.widthM, H = p.heightM;
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), _mat(COLORS.vehicle));
    body.position.y = H / 2;
    _slot(body, 'body');
    g.add(body);
    if (p.roofHeightM > 0) {
      var roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, p.roofHeightM, L * 0.55), _mat(0x3d5c4a));
      roof.position.set(0, H + p.roofHeightM / 2, -L * 0.08);
      _slot(roof, 'roof');
      g.add(roof);

      // Windshield — glass slot, scaled with roof footprint
      var glass = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.65, p.roofHeightM * 1.1), _basicMat(0x203848, 0.7));
      glass.position.set(0, H + p.roofHeightM / 2, -L * 0.08 + L * 0.275 + 0.05);
      glass.rotation.x = -Math.PI / 6;
      _slot(glass, 'glass');
      g.add(glass);
    }
    var frontSlope = p.frontSlope || 0;
    if (frontSlope > 0) {
      var fGeo = new THREE.CylinderGeometry(0, Math.max(0.1, W * 0.5), Math.max(0.2, frontSlope * L), 4);
      var fWedge = new THREE.Mesh(fGeo, _mat(COLORS.vehicle));
      fWedge.rotation.x = -Math.PI / 2;
      fWedge.rotation.z = Math.PI / 4;
      fWedge.position.set(0, H * 0.6, L / 2 + (frontSlope * L) / 2);
      _slot(fWedge, 'body');
      g.add(fWedge);
    }
    // Front marker — forward direction stays readable regardless of slope params
    var fwd = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.35, 0.8, 4), _basicMat(COLORS.selection));
    fwd.position.set(0, H * 0.7, L / 2 + 0.5);
    fwd.rotation.x = -Math.PI / 2;
    _slot(fwd, 'accent');
    g.add(fwd);
    return g;
  }

  function _shapeMaritimeHull(p) {
    var THREE = global.THREE;
    var L = p.lengthM / 2, W = p.widthM / 2, H = p.heightM;
    var bowTaper = p.bowTaper != null ? p.bowTaper : 0.6;
    var sternTaper = p.sternTaper != null ? p.sternTaper : 0.25;
    var sternW = W * (1 - sternTaper);
    var bowH = H * (1 - bowTaper * 0.3);
    var v = [
      -W, H, -L,   W, H, -L,   -sternW, 0, -L,   sternW, 0, -L,
       0, bowH, L,  0, 0, L,
    ];
    var idx = [0, 2, 3, 0, 3, 1, 0, 1, 4, 2, 5, 3, 0, 4, 5, 0, 5, 2, 1, 3, 5, 1, 5, 4];
    var pos = new Float32Array(idx.length * 3);
    for (var i = 0; i < idx.length; i++) {
      var b = idx[i] * 3;
      pos[i * 3] = v[b]; pos[i * 3 + 1] = v[b + 1]; pos[i * 3 + 2] = v[b + 2];
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    var g = new THREE.Group();
    g.add(_slot(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLORS.maritime, side: THREE.DoubleSide })), 'body'));

    if (p.cabinHeightM > 0) {
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 1.3, p.cabinHeightM, L * 0.5), _mat(0x3d6a8a));
      cabin.position.set(0, H + p.cabinHeightM / 2, -L * 0.2);
      _slot(cabin, 'roof');
      g.add(cabin);
    }
    var bow = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.4, 2, 6), _basicMat(COLORS.selection));
    bow.position.set(0, H * 0.5, L);
    bow.rotation.x = -Math.PI / 2;
    _slot(bow, 'accent');
    g.add(bow);
    return g;
  }

  function _shapeAircraftFuselage(p) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var L = p.lengthM;
    var bodyR = ((p.bodyWidthM || 1.8) + (p.bodyHeightM || 1.8)) / 4;
    var noseTaper = p.noseTaper != null ? p.noseTaper : 0.5;
    var fuseGeo = new THREE.CylinderGeometry(Math.max(0.1, bodyR * (1 - noseTaper * 0.4)), bodyR, L, 8);
    fuseGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var fuse = new THREE.Mesh(fuseGeo, _mat(COLORS.aircraft));
    fuse.position.y = bodyR + 3;
    _slot(fuse, 'body');
    g.add(fuse);

    var wingSpan = p.wingSpanM || 12;
    var wGeo = new THREE.PlaneGeometry(wingSpan, Math.max(1, bodyR * 1.6));
    wGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var wing = new THREE.Mesh(wGeo, new THREE.MeshLambertMaterial({ color: COLORS.aircraft, side: THREE.DoubleSide }));
    wing.position.y = fuse.position.y;
    _slot(wing, 'body');
    g.add(wing);

    var tailSpan = p.tailSpanM || 4;
    var tGeo = new THREE.PlaneGeometry(tailSpan, 1.2);
    tGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var tail = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ color: COLORS.aircraft, side: THREE.DoubleSide }));
    tail.position.set(0, fuse.position.y + 0.6, -L / 2 - 0.5);
    _slot(tail, 'edge');
    g.add(tail);

    var vs = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.5), new THREE.MeshLambertMaterial({ color: 0x7a8896, side: THREE.DoubleSide }));
    vs.position.set(0, fuse.position.y + 1.5, -L / 2 - 0.5);
    _slot(vs, 'edge');
    g.add(vs);

    var nose = new THREE.Mesh(new THREE.CylinderGeometry(0, Math.max(0.1, bodyR * 0.6), 1.5, 6), _basicMat(COLORS.selection));
    nose.position.set(0, fuse.position.y, L / 2 + 0.75);
    nose.rotation.x = -Math.PI / 2;
    _slot(nose, 'accent');
    g.add(nose);
    return g;
  }

  function _shapePropBoxStack(p) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    var L = p.lengthM, W = p.widthM, H = p.heightM;
    var baseH = p.baseHeightM || 0;
    var topH = p.topHeightM || 0;
    var midH = Math.max(0.2, H - baseH - topH);
    var y = 0;
    if (baseH > 0) {
      var base = new THREE.Mesh(new THREE.BoxGeometry(L * 1.1, baseH, W * 1.1), _mat(COLORS.prop));
      base.position.y = baseH / 2;
      _slot(base, 'body');
      g.add(base);
      y = baseH;
    }
    var body = new THREE.Mesh(new THREE.BoxGeometry(L, midH, W), _mat(COLORS.prop));
    body.position.y = y + midH / 2;
    _slot(body, 'body');
    g.add(body);
    y += midH;
    if (topH > 0) {
      var top = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, topH, W * 0.8), _mat(0x6e6660));
      top.position.y = y + topH / 2;
      _slot(top, 'accent');
      g.add(top);
    }
    var nub = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.3, 0.5, 6), _basicMat(COLORS.selection));
    nub.position.set(0, midH * 0.5, W / 2 + 0.3);
    nub.rotation.x = -Math.PI / 2;
    _slot(nub, 'accent');
    g.add(nub);
    return g;
  }

  function _buildFromTemplate(template, params) {
    var p = _mergeParams(template, params);
    switch (template) {
      case 'structure.block':   return _shapeStructureBlock(p);
      case 'structure.tower':   return _shapeStructureTower(p);
      case 'vehicle.body':      return _shapeVehicleBody(p);
      case 'maritime.hull':     return _shapeMaritimeHull(p);
      case 'aircraft.fuselage': return _shapeAircraftFuselage(p);
      case 'prop.boxStack':     return _shapePropBoxStack(p);
      default: return null;
    }
  }

  // ── Hero tier — bigger + stronger edges ──────────────────────────────────────
  // Hero wraps readable and scales it up with emissive accent

  function _heroWrap(readableGroup, accentHex) {
    var THREE = global.THREE;
    readableGroup.scale.setScalar(1.25);
    // Add subtle emissive edge mesh over hull/body
    var accent = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: accentHex || COLORS.selection, transparent: true, opacity: 0.55 })
    );
    accent.position.y = 0.5;
    _slot(accent, 'accent');
    readableGroup.add(accent);
    return readableGroup;
  }

  // ── Direction arrow (Studio-only, heading-relative) ──────────────────────────
  // Returns a Group: cone pointing +Z (forward = headingDeg=0 → north-ish in scene)
  // Caller positions it at actor anchor, then rotates with heading.

  function makeArrow(category) {
    var THREE = global.THREE;
    var g = new THREE.Group();

    var isStructure = (category === 'structure');
    if (isStructure) return g; // no arrow for structures by default

    // Shaft
    var shaftLen = (category === 'aircraft') ? 20 : (category === 'maritime') ? 14 : 4;
    var shaftR   = shaftLen * 0.04;
    var shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 6);
    shaftGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: COLORS.arrow }));
    shaft.position.z = shaftLen / 2;
    shaft.position.y = (category === 'aircraft') ? 6 : (category === 'maritime') ? 3 : 1.5;
    g.add(shaft);

    // Head cone
    var headLen = shaftLen * 0.35;
    var headR   = shaftR * 3;
    var headGeo = new THREE.CylinderGeometry(0, headR, headLen, 8);
    headGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    var head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: COLORS.arrow }));
    head.position.z  = shaftLen + headLen / 2;
    head.position.y  = shaft.position.y;
    g.add(head);

    g.visible = false; // hidden until selection
    return g;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  function ActorProxyGeometryFactory() {}

  ActorProxyGeometryFactory.prototype.create = function (actorCategory, actorType, detailMode, options) {
    var THREE = global.THREE;
    if (!THREE) throw new Error('[ActorProxyGeometryFactory] THREE not loaded');

    var mode = detailMode || 'readable';

    // 0616B: parametric shape draft takes precedence when present and valid.
    // If no shapeDraft is supplied, behavior is identical to pre-0616B.
    var shapeDraft = options && options.shapeDraft;
    if (shapeDraft && shapeDraft.template) {
      var shaped = _buildFromTemplate(shapeDraft.template, shapeDraft.params);
      if (shaped) return (mode === 'hero') ? _heroWrap(shaped, COLORS.selection) : shaped;
    }

    // Aircraft override
    if (actorCategory === 'vehicle' && actorType === 'aircraft') {
      if (mode === 'simple') return _aircraftSimple();
      var ag = _aircraftReadable();
      return (mode === 'hero') ? _heroWrap(ag, COLORS.selection) : ag;
    }

    if (mode === 'simple') {
      switch (actorCategory) {
        case 'structure': return _box(8, 16, 8, COLORS.structure);
        case 'maritime':  return _hullSimple();
        case 'vehicle':   return _box(4, 1.5, 2, COLORS.vehicle);
        default:          return _box(1, 1, 1, COLORS.prop);
      }
    }

    var g;
    switch (actorCategory) {
      case 'structure': g = _structureReadable(); break;
      case 'maritime':  g = _marineReadable();    break;
      case 'vehicle':   g = _vehicleReadable();   break;
      case 'aircraft':  g = _aircraftReadable();  break;
      default:          g = _propReadable();       break;
    }
    return (mode === 'hero') ? _heroWrap(g, COLORS.selection) : g;
  };

  ActorProxyGeometryFactory.prototype.makeArrow = makeArrow;

  // ── 0616B: parametric shape-recipe public API ────────────────────────────────
  ActorProxyGeometryFactory.prototype.createFromShapeRecipe = function (template, params) {
    return _buildFromTemplate(template, params);
  };

  ActorProxyGeometryFactory.prototype.templatesForCategory = function (actorCategory, actorType) {
    if (actorCategory === 'vehicle' && actorType === 'aircraft') return ['aircraft.fuselage'];
    return (TEMPLATES_BY_CATEGORY[actorCategory] || []).slice();
  };

  ActorProxyGeometryFactory.prototype.defaultTemplateFor = function (actorCategory, actorType) {
    var list = this.templatesForCategory(actorCategory, actorType);
    return list[0] || null;
  };

  ActorProxyGeometryFactory.prototype.defaultParamsFor = function (template) {
    return Object.assign({}, TEMPLATE_DEFAULTS[template] || {});
  };

  ActorProxyGeometryFactory.prototype.paramKeysFor = function (template) {
    return Object.keys(TEMPLATE_DEFAULTS[template] || {});
  };

  ActorProxyGeometryFactory.prototype.authoringScaleFor = function (actorCategory, actorType) {
    if (actorCategory === 'vehicle' && actorType === 'aircraft') return AUTHORING_SCALE.aircraft;
    return AUTHORING_SCALE[actorCategory] || AUTHORING_SCALE.prop;
  };

  // Ring radius in metres for the selection ground ring
  ActorProxyGeometryFactory.prototype.ringRadiusM = function (actorCategory, actorType) {
    if (actorCategory === 'vehicle' && actorType === 'aircraft') return RING_RADIUS_M.aircraft;
    return RING_RADIUS_M[actorCategory] || RING_RADIUS_M.prop;
  };

  global.WOSActorProxyGeometryFactory = new ActorProxyGeometryFactory();
  console.log('[ActorProxyGeometryFactory] ready — 0615D');
})(window);
