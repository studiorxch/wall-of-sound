// ── OrbObjectFactory v1.0.0 ───────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: presentation-authority / orb-object-factory
//
// The ONE shared builder for all five Orb archetypes — a pure function of an
// OrbProfile record, with no Mapbox/map dependency and no wall/-specific
// globals beyond the THREE constructor passed in. Both the canonical
// LIVE MAP renderer (orbProfileRenderer.js, wall/) and the MUSIC editor's
// preview surface call into this exact same file (MUSIC loads it dynamically
// through the existing /wall-app proxy, mirroring how wallMapPreview.ts
// already lazy-loads mapbox-env.js) — archetype construction exists in
// exactly one place, never duplicated.
//
// Only basic Three.js primitives are used (SphereGeometry, BufferGeometry/
// Points, LineSegments, MeshStandardMaterial/MeshPhysicalMaterial) — no
// imported models, no custom shaders, no fluid simulation, per the written
// spec's explicit scope limit. No audio-reactive parameter exists anywhere
// in this file.
//
// Contract: build(profile, THREE) returns
//   { group: THREE.Group, update(elapsedSeconds), refresh(profile), dispose() }
// `group` gets exactly ONE world-position transform applied by the caller
// (a baked Mercator matrix on LIVE MAP, or a fixed preview camera in MUSIC).
// `update()` is LOCAL-space motion only — a pure function of elapsed time,
// decoupled from where the group is placed. `refresh(profile)` re-applies
// COSMETIC values (color/opacity/roughness/scale/lighting/motion speed) onto
// the already-built objects with no dispose/rebuild — geometry TOPOLOGY is
// always built at a fixed unit size, with `geometry.scale` applied as a
// group-level scale transform, specifically so scale edits stay cosmetic.
// Any STRUCTURAL change (archetype, segments, particle/node count, contained
// primitive) requires the caller to dispose() and build() again — the two
// are never blurred together.
//
// Placement: wall/systems/presentation/orbObjectFactory.js
// Load: BEFORE orbProfileRegistry.js and orbProfileRenderer.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Structural fields — changing any of these requires a full dispose+rebuild,
  // since they change vertex/index buffer topology or object-graph shape.
  var STRUCTURAL_PROP_IDS = [
    'archetype', 'geometry.segments', 'geometry.deformation',
    'particles.enabled', 'particles.count', 'particles.spread',
    'nodes.enabled', 'nodes.count', 'nodes.connectionDistance',
    'containedObject.enabled', 'containedObject.primitive',
  ];

  function isStructuralField(propId) { return STRUCTURAL_PROP_IDS.indexOf(propId) !== -1; }

  function _num(v, fallback) { return (typeof v === 'number' && isFinite(v)) ? v : fallback; }

  function _buildLights(THREE, group, lighting) {
    var ambient = new THREE.AmbientLight(0xffffff, _num(lighting.ambientIntensity, 0.3));
    var key = new THREE.DirectionalLight(0xffffff, _num(lighting.keyIntensity, 1));
    key.position.set(2, 3, 2);
    var rim = new THREE.DirectionalLight(0xffffff, _num(lighting.rimIntensity, 0.5));
    rim.position.set(-2, -1, -2);
    group.add(ambient, key, rim);
    return { ambient: ambient, key: key, rim: rim };
  }

  function _refreshLights(lights, lighting) {
    lights.ambient.intensity = _num(lighting.ambientIntensity, lights.ambient.intensity);
    lights.key.intensity = _num(lighting.keyIntensity, lights.key.intensity);
    lights.rim.intensity = _num(lighting.rimIntensity, lights.rim.intensity);
  }

  function _baseMaterial(THREE, material) {
    return new THREE.MeshStandardMaterial({
      color: material.baseColor,
      emissive: material.emissiveColor,
      emissiveIntensity: _num(material.emissiveIntensity, 0),
      roughness: _num(material.roughness, 0.5),
      metalness: _num(material.metalness, 0),
      opacity: _num(material.opacity, 1),
      transparent: !!material.transparent,
    });
  }

  function _refreshBaseMaterial(material3, material) {
    material3.color.set(material.baseColor);
    material3.emissive.set(material.emissiveColor);
    material3.emissiveIntensity = _num(material.emissiveIntensity, material3.emissiveIntensity);
    material3.roughness = _num(material.roughness, material3.roughness);
    material3.metalness = _num(material.metalness, material3.metalness);
    material3.opacity = _num(material.opacity, material3.opacity);
    material3.transparent = !!material.transparent;
    material3.needsUpdate = true;
  }

  function _physicalShellMaterial(THREE, material) {
    return new THREE.MeshPhysicalMaterial({
      color: material.baseColor,
      emissive: material.emissiveColor,
      emissiveIntensity: _num(material.emissiveIntensity, 0),
      roughness: _num(material.roughness, 0.1),
      metalness: _num(material.metalness, 0),
      opacity: _num(material.opacity, 0.6),
      transparent: true,
      transmission: _num(material.transmission, 0.9),
    });
  }

  function _refreshShellMaterial(material3, material) {
    _refreshBaseMaterial(material3, material);
    material3.transmission = _num(material.transmission, material3.transmission);
    material3.transparent = true;
  }

  // Light, non-shader vertex displacement along each vertex's own normal,
  // modulated by a fixed sine pattern keyed off vertex index — a simple,
  // static "organic" surface variation, not a procedural/noise shader.
  // Baked once at construction time (deformation is not a live-updatable
  // cosmetic field — changing it meaningfully changes the mesh's silhouette).
  function _applyDeformation(geometry, amount) {
    if (!amount) return;
    var pos = geometry.attributes.position;
    var normal = geometry.attributes.normal;
    for (var i = 0; i < pos.count; i++) {
      var nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
      var wobble = Math.sin(i * 12.9898) * amount;
      pos.setXYZ(i, pos.getX(i) + nx * wobble, pos.getY(i) + ny * wobble, pos.getZ(i) + nz * wobble);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  function _containedPrimitiveGeometry(THREE, primitive, scale) {
    switch (primitive) {
      case 'cube':  return new THREE.BoxGeometry(scale, scale, scale);
      case 'torus': return new THREE.TorusGeometry(scale * 0.6, scale * 0.25, 16, 32);
      case 'sphere':
      default:      return new THREE.SphereGeometry(scale, 24, 24);
    }
  }

  // ── Archetype builders — geometry always built at unit scale (radius 1);
  // `group.scale` carries profile.geometry.scale so scale stays cosmetic. ────

  function _buildCoreSphere(THREE, profile) {
    var group = new THREE.Group();
    var segments = Math.max(8, _num(profile.geometry.segments, 32));
    var geometry = new THREE.SphereGeometry(1, segments, segments);
    _applyDeformation(geometry, _num(profile.geometry.deformation, 0));
    var material = _baseMaterial(THREE, profile.material);
    var mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    var lights = _buildLights(THREE, group, profile.lighting);
    group.scale.setScalar(_num(profile.geometry.scale, 1));
    return {
      group: group,
      disposables: [geometry, material],
      onUpdate: function (t, motion) {
        group.rotation.y = t * motion.rotationSpeed;
        mesh.position.y = Math.sin(t * 1.3) * motion.idleAmplitude;
        mesh.scale.setScalar(1 + Math.sin(t * 2.0) * motion.pulseAmount);
      },
      onRefresh: function (p) {
        _refreshBaseMaterial(material, p.material);
        _refreshLights(lights, p.lighting);
        group.scale.setScalar(_num(p.geometry.scale, 1));
      },
    };
  }

  function _buildGlassShell(THREE, profile) {
    var group = new THREE.Group();
    var segments = Math.max(8, _num(profile.geometry.segments, 32));
    var shellGeo = new THREE.SphereGeometry(1, segments, segments);
    var shellMat = _physicalShellMaterial(THREE, profile.material);
    var shell = new THREE.Mesh(shellGeo, shellMat);
    group.add(shell);
    var disposables = [shellGeo, shellMat];
    var inner = null, innerMat = null;
    var containedObject = profile.containedObject;
    if (containedObject && containedObject.enabled && containedObject.primitive !== 'none') {
      var innerGeo = _containedPrimitiveGeometry(THREE, containedObject.primitive, 0.4);
      innerMat = new THREE.MeshStandardMaterial({
        color: containedObject.color,
        emissive: profile.material.emissiveColor,
        emissiveIntensity: _num(profile.material.emissiveIntensity, 0),
      });
      inner = new THREE.Mesh(innerGeo, innerMat);
      inner.scale.setScalar(_num(containedObject.scale, 0.4) / 0.4);
      group.add(inner);
      disposables.push(innerGeo, innerMat);
    }
    var lights = _buildLights(THREE, group, profile.lighting);
    group.scale.setScalar(_num(profile.geometry.scale, 1));
    return {
      group: group,
      disposables: disposables,
      onUpdate: function (t, motion) {
        group.rotation.y = t * motion.rotationSpeed;
        if (inner) inner.rotation.y = t * motion.rotationSpeed * 1.7; // independent internal spin
      },
      onRefresh: function (p) {
        _refreshShellMaterial(shellMat, p.material);
        _refreshLights(lights, p.lighting);
        group.scale.setScalar(_num(p.geometry.scale, 1));
        if (inner && p.containedObject) {
          innerMat.color.set(p.containedObject.color);
          inner.scale.setScalar(_num(p.containedObject.scale, 0.4) / 0.4);
        }
      },
    };
  }

  function _buildParticleOrb(THREE, profile) {
    var group = new THREE.Group();
    var particles = profile.particles || { enabled: true, count: 400, size: 0.02, spread: 1, speed: 0.5 };
    var count = particles.enabled ? Math.max(1, _num(particles.count, 400)) : 0;
    var positions = new Float32Array(count * 3);
    var basePositions = new Float32Array(count * 3);
    var spread = _num(particles.spread, 1);
    for (var i = 0; i < count; i++) {
      // Uniform-ish spherical distribution — simple rejection-free technique.
      var u = Math.random(), v = Math.random();
      var theta = 2 * Math.PI * u;
      var phi = Math.acos(2 * v - 1);
      var r = spread * Math.cbrt(Math.random());
      var x = r * Math.sin(phi) * Math.cos(theta);
      var y = r * Math.sin(phi) * Math.sin(theta);
      var z = r * Math.cos(phi);
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      basePositions[i * 3] = x; basePositions[i * 3 + 1] = y; basePositions[i * 3 + 2] = z;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var material = new THREE.PointsMaterial({
      color: profile.material.baseColor,
      size: _num(particles.size, 0.02),
      transparent: true,
      opacity: _num(profile.material.opacity, 1),
    });
    var points = new THREE.Points(geometry, material);
    group.add(points);
    var disposables = [geometry, material];

    var coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
    var coreMat = new THREE.MeshStandardMaterial({
      color: profile.material.baseColor,
      emissive: profile.material.emissiveColor,
      emissiveIntensity: _num(profile.material.emissiveIntensity, 0.5),
      transparent: true,
      opacity: 0.6,
    });
    var core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);
    disposables.push(coreGeo, coreMat);

    var lights = _buildLights(THREE, group, profile.lighting);
    group.scale.setScalar(_num(profile.geometry.scale, 1));
    var speed = _num(particles.speed, 0.5);
    return {
      group: group,
      disposables: disposables,
      onUpdate: function (t, motion) {
        group.rotation.y = t * motion.rotationSpeed;
        var posAttr = geometry.attributes.position;
        for (var i2 = 0; i2 < count; i2++) {
          var bx = basePositions[i2 * 3], by = basePositions[i2 * 3 + 1], bz = basePositions[i2 * 3 + 2];
          var swirl = Math.sin(t * speed + i2) * motion.idleAmplitude * 0.3;
          posAttr.setXYZ(i2, bx + swirl, by + swirl * 0.6, bz);
        }
        posAttr.needsUpdate = true;
      },
      onRefresh: function (p) {
        material.color.set(p.material.baseColor);
        material.opacity = _num(p.material.opacity, material.opacity);
        if (p.particles) material.size = _num(p.particles.size, material.size);
        coreMat.color.set(p.material.baseColor);
        coreMat.emissive.set(p.material.emissiveColor);
        coreMat.emissiveIntensity = _num(p.material.emissiveIntensity, coreMat.emissiveIntensity);
        _refreshLights(lights, p.lighting);
        group.scale.setScalar(_num(p.geometry.scale, 1));
      },
    };
  }

  function _buildNodeCluster(THREE, profile) {
    var group = new THREE.Group();
    var nodes = profile.nodes || { enabled: true, count: 12, connectionDistance: 0.8, lineOpacity: 0.4 };
    var count = nodes.enabled ? Math.max(2, _num(nodes.count, 12)) : 0;
    var nodeMat = _baseMaterial(THREE, profile.material);
    var nodeGeo = new THREE.SphereGeometry(0.12, 12, 12);
    var basePositions = [];
    var disposables = [nodeMat, nodeGeo];
    for (var i = 0; i < count; i++) {
      // Fibonacci sphere distribution — even, deterministic spread, radius 1.
      var phi = Math.acos(1 - 2 * (i + 0.5) / count);
      var theta = Math.PI * (1 + Math.sqrt(5)) * i;
      var x = Math.sin(phi) * Math.cos(theta);
      var y = Math.sin(phi) * Math.sin(theta);
      var z = Math.cos(phi);
      var mesh = new THREE.Mesh(nodeGeo, nodeMat);
      mesh.position.set(x, y, z);
      group.add(mesh);
      basePositions.push({ x: x, y: y, z: z });
    }

    var connectionDistance = _num(nodes.connectionDistance, 0.8);
    var linePositions = [];
    for (var a = 0; a < basePositions.length; a++) {
      for (var b = a + 1; b < basePositions.length; b++) {
        var pa = basePositions[a], pb = basePositions[b];
        var dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= connectionDistance) linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      }
    }
    var lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3));
    var lineMat = new THREE.LineBasicMaterial({
      color: profile.material.emissiveColor,
      transparent: true,
      opacity: _num(nodes.lineOpacity, 0.4),
    });
    var lines = new THREE.LineSegments(lineGeo, lineMat);
    group.add(lines);
    disposables.push(lineGeo, lineMat);

    var lights = _buildLights(THREE, group, profile.lighting);
    group.scale.setScalar(_num(profile.geometry.scale, 1));
    return {
      group: group,
      disposables: disposables,
      onUpdate: function (t, motion) { group.rotation.y = t * motion.rotationSpeed; },
      onRefresh: function (p) {
        _refreshBaseMaterial(nodeMat, p.material);
        lineMat.color.set(p.material.emissiveColor);
        if (p.nodes) lineMat.opacity = _num(p.nodes.lineOpacity, lineMat.opacity);
        _refreshLights(lights, p.lighting);
        group.scale.setScalar(_num(p.geometry.scale, 1));
      },
    };
  }

  function _buildContainedWorld(THREE, profile) {
    var group = new THREE.Group();
    var segments = Math.max(8, _num(profile.geometry.segments, 32));
    var shellGeo = new THREE.SphereGeometry(1, segments, segments);
    var shellMat = _physicalShellMaterial(THREE, profile.material);
    var shell = new THREE.Mesh(shellGeo, shellMat);
    group.add(shell);
    var disposables = [shellGeo, shellMat];

    var inner = null, innerMat = null;
    var containedObject = profile.containedObject || { enabled: true, primitive: 'sphere', scale: 0.5, color: profile.material.baseColor };
    if (containedObject.enabled && containedObject.primitive !== 'none') {
      var innerGeo = _containedPrimitiveGeometry(THREE, containedObject.primitive, 0.5);
      innerMat = new THREE.MeshStandardMaterial({
        color: containedObject.color,
        emissive: profile.material.emissiveColor,
        emissiveIntensity: _num(profile.material.emissiveIntensity, 0.4),
      });
      inner = new THREE.Mesh(innerGeo, innerMat);
      inner.scale.setScalar(_num(containedObject.scale, 0.5) / 0.5);
      group.add(inner);
      disposables.push(innerGeo, innerMat);
    }
    var lights = _buildLights(THREE, group, profile.lighting);
    group.scale.setScalar(_num(profile.geometry.scale, 1));
    return {
      group: group,
      disposables: disposables,
      onUpdate: function (t, motion) {
        group.rotation.y = t * motion.rotationSpeed * 0.4; // outer shell drifts slowly
        if (inner) inner.rotation.y = t * motion.rotationSpeed * 2.2; // independent internal rotation
      },
      onRefresh: function (p) {
        _refreshShellMaterial(shellMat, p.material);
        _refreshLights(lights, p.lighting);
        group.scale.setScalar(_num(p.geometry.scale, 1));
        if (inner && p.containedObject) {
          innerMat.color.set(p.containedObject.color);
          inner.scale.setScalar(_num(p.containedObject.scale, 0.5) / 0.5);
        }
      },
    };
  }

  var BUILDERS = {
    'core-sphere': _buildCoreSphere,
    'glass-shell': _buildGlassShell,
    'particle-orb': _buildParticleOrb,
    'node-cluster': _buildNodeCluster,
    'contained-world': _buildContainedWorld,
  };

  function build(profile, THREE) {
    var builder = BUILDERS[profile.archetype];
    if (!builder) throw new Error('[OrbObjectFactory] unknown archetype: ' + profile.archetype);
    var built = builder(THREE, profile);
    var startTime = null;
    return {
      group: built.group,
      update: function (elapsedSeconds) {
        if (startTime == null) startTime = elapsedSeconds;
        built.onUpdate(elapsedSeconds - startTime, profile.motion);
      },
      refresh: function (nextProfile) { built.onRefresh(nextProfile); },
      dispose: function () {
        var disposed = built.disposables;
        disposed.forEach(function (d) { if (d && typeof d.dispose === 'function') d.dispose(); });
        built.group.traverse(function (obj) {
          if (obj.geometry && disposed.indexOf(obj.geometry) === -1) obj.geometry.dispose();
          if (obj.material && disposed.indexOf(obj.material) === -1) {
            if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
            else obj.material.dispose();
          }
        });
      },
    };
  }

  SBE.OrbObjectFactory = Object.freeze({
    VERSION: VERSION,
    build: build,
    isStructuralField: isStructuralField,
    STRUCTURAL_PROP_IDS: STRUCTURAL_PROP_IDS.slice(),
  });

  console.log('[OrbObjectFactory] v' + VERSION + ' loaded');

})(window);
