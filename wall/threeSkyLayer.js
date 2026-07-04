(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── ThreeSkyLayer (0625E_WALL_ThreeSkyLayerMapboxCustomLayerPatch) ───────────
  //
  // WALL-side Mapbox CustomLayerInterface for atmospheric sky rendering.
  //
  // Three.js feasibility audit (0625D):
  //   THREE present in WALL: YES — global.THREE via CDN (three@0.160.0).
  //   THREE.Sky helper: NOT present (not in three.min.js; needs examples/js/objects/Sky.js).
  //   Custom layer support: YES — established pattern from worldSpaceVehicleLayer.js.
  //   Resolution (0625E): Implement inline sky shader — minimal Preetham-inspired
  //   atmospheric gradient with sun disk. Avoids needing THREE.Sky helper CDN addon.
  //
  // Layer placement:
  //   Added on style.load via SBE.MapboxViewportRuntime.onStyleLoad().
  //   Placed before fill-extrusion layers (3D buildings) so it renders behind geometry.
  //   renderingMode '2d' — renders before the 3D pipeline, correct for sky-behind-world.
  //
  // Parameters:
  //   Source: SBE.AtmosphereRuntime.getState().phase → internal SKY_PHASES table
  //   mapped from the same baselines as PLAY's skyAtmosphereModel.ts.
  //   Cloud rendering: cloudAtmosphereRenderer.js is preserved and untouched.
  //   Sky layer handles sun/gradient only.

  // ── Internal sky parameter table (mirrors PLAY skyAtmosphereModel.ts) ────────
  // phase → sun elevation (deg), sun azimuth (deg), turbidity, rayleigh, exposure
  // Maps AtmosphereRuntime's phase names → sky params.
  // 0625F: Raised afternoon/evening exposures (+30–60%) so sky reads atmospheric
  // rather than crushed dark. Night/late_night remain intentionally dim.
  var SKY_PARAMS = {
    deep_night:    { elev: -20, azim: 0,   turbidity: 2,  rayleigh: 1.0, exposure: 0.12 },
    early_morning: { elev: -3,  azim: 80,  turbidity: 3,  rayleigh: 2.0, exposure: 0.30 },
    morning_rush:  { elev: 18,  azim: 100, turbidity: 4,  rayleigh: 2.2, exposure: 0.80 },
    midmorning:    { elev: 38,  azim: 130, turbidity: 5,  rayleigh: 1.8, exposure: 1.00 },
    midday:        { elev: 70,  azim: 180, turbidity: 5,  rayleigh: 1.4, exposure: 1.20 },
    afternoon:     { elev: 40,  azim: 220, turbidity: 5,  rayleigh: 1.6, exposure: 1.10 },
    evening_rush:  { elev: 12,  azim: 255, turbidity: 7,  rayleigh: 2.4, exposure: 0.90 },
    early_evening: { elev: 3,   azim: 270, turbidity: 8,  rayleigh: 2.8, exposure: 0.70 },
    late_evening:  { elev: -6,  azim: 270, turbidity: 4,  rayleigh: 1.6, exposure: 0.38 },
    late_night:    { elev: -25, azim: 0,   turbidity: 2,  rayleigh: 0.8, exposure: 0.10 },
  };

  function _getSkyState() {
    var ar = SBE.AtmosphereRuntime;
    var phase = (ar && ar.getState) ? ar.getState().phase : 'afternoon';
    return SKY_PARAMS[phase] || SKY_PARAMS.afternoon;
  }

  // ── Sun direction from elevation + azimuth ────────────────────────────────────
  // Returns normalized vec3 [x, y, z] (Y-up). Mapbox bearing: 0=north, +east.
  function _sunDir(elevDeg, azimDeg) {
    var el = elevDeg * Math.PI / 180;
    var az = azimDeg * Math.PI / 180;
    // x=east, y=up, z=north (right-hand, y-up)
    var cosEl = Math.cos(el);
    return [
      cosEl * Math.sin(az),
      Math.sin(el),
      cosEl * Math.cos(az),
    ];
  }

  // ── WebGL sky shader ──────────────────────────────────────────────────────────
  // Simplified atmospheric gradient + sun disk. Implements core Rayleigh/Mie
  // intuition without full Preetham double-integral (sufficiently atmospheric).

  var VERT_SRC = [
    'attribute vec2 aPos;',
    'varying vec2 vUV;',
    'void main() {',
    '  vUV = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.999, 1.0);',
    '}',
  ].join('\n');

  var FRAG_SRC = [
    'precision mediump float;',
    'varying vec2 vUV;',
    'uniform vec3  uSunDir;',
    'uniform float uTurbidity;',
    'uniform float uRayleigh;',
    'uniform float uExposure;',
    'uniform float uAspect;',

    // Camera pitch/bearing from Mapbox viewport (degrees)
    'uniform float uBearing;',
    'uniform float uPitch;',

    // Reconstruct view direction from UV + camera orientation
    'vec3 viewDir(vec2 uv, float bearing, float pitch, float aspect) {',
    '  float pi = 3.14159265;',
    '  vec2 ndc = uv * 2.0 - 1.0;',
    '  ndc.x *= aspect;',
    // Field of view ~70 deg tangent
    '  float fovTan = 0.70;',
    '  vec3 vLocal = normalize(vec3(ndc * fovTan, -1.0));',
    // Rotate for pitch (x-axis)
    '  float cp = cos(-pitch * pi / 180.0);',
    '  float sp = sin(-pitch * pi / 180.0);',
    '  vec3 vPitch = vec3(vLocal.x, vLocal.y * cp - vLocal.z * sp, vLocal.y * sp + vLocal.z * cp);',
    // Rotate for bearing (y-axis)
    '  float cb = cos(-bearing * pi / 180.0);',
    '  float sb = sin(-bearing * pi / 180.0);',
    '  return normalize(vec3(vPitch.x * cb + vPitch.z * sb, vPitch.y, -vPitch.x * sb + vPitch.z * cb));',
    '}',

    'void main() {',
    '  vec3 vd = viewDir(vUV, uBearing, uPitch, uAspect);',

    // Sky gradient: up component → zenith vs horizon
    '  float upT = clamp(vd.y * 2.0, 0.0, 1.0);',
    '  float horizonT = 1.0 - upT;',

    // Sun angle
    '  float sunDot = clamp(dot(vd, normalize(uSunDir)), 0.0, 1.0);',

    // 0625F: dayT uses wider ramp so horizon sky stays bright at low sun elevation.
    // sunDir.y = sin(elevation). At elev 0° (horizon sun), dayT = 0.45 instead of 0.2.
    '  float sunElev = uSunDir.y;',
    '  float dayT = clamp(sunElev * 2.5 + 0.45, 0.0, 1.0);',

    // Zenith: clear blue at day, deep indigo at night. 0625F: lifted zenithDay.
    '  vec3 zenithDay   = vec3(0.24, 0.46, 0.88);',
    '  vec3 zenithNight = vec3(0.01, 0.02, 0.08);',
    '  vec3 zenithColor = mix(zenithNight, zenithDay, dayT);',
    '  zenithColor *= 1.0 + clamp(uRayleigh / 6.0, 0.0, 0.25);',

    // Horizon: bright airy blue at day, deep indigo at night. 0625F: lifted horizonDay.
    '  vec3 horizonDay   = vec3(0.68, 0.82, 0.98);',
    '  vec3 horizonNight = vec3(0.02, 0.03, 0.11);',
    '  vec3 horizonColor = mix(horizonNight, horizonDay, dayT);',

    // Sunset/sunrise glow (warm when sun near horizon, in sun's azimuth direction)
    '  float sunGlowT = clamp(1.0 - abs(sunElev) * 4.0, 0.0, 1.0);',
    '  float azimAlign = clamp(dot(normalize(vec2(vd.x, vd.z)), normalize(vec2(uSunDir.x, uSunDir.z))), 0.0, 1.0);',
    '  vec3 sunsetGlow = vec3(1.00, 0.52, 0.20) * sunGlowT * azimAlign;',
    '  horizonColor += sunsetGlow * horizonT * 0.65;',

    // Turbidity haze toward horizon
    '  float hazeT = horizonT * clamp(uTurbidity / 12.0, 0.0, 0.7);',
    '  vec3 hazeColor = vec3(0.82, 0.88, 0.95) * dayT + vec3(0.04, 0.04, 0.10) * (1.0 - dayT);',
    '  vec3 skyColor = mix(zenithColor, horizonColor, clamp(horizonT * 1.4, 0.0, 1.0));',
    '  skyColor = mix(skyColor, hazeColor, hazeT * 0.35);',

    // Alpha: sky is opaque above horizon, transparent below so map tiles show through.
    // groundFade: 0 at horizon, 1 well below horizon (fades out over ~10° below).
    '  float groundFade = clamp((-vd.y + 0.02) * 14.0, 0.0, 1.0);',
    '  float skyAlpha   = 1.0 - groundFade;',

    // Sun disk + Mie glow — only in sky region
    '  float sunCore = pow(sunDot, 512.0);',
    '  float sunGlow = pow(sunDot, 8.0) * 0.35;',
    '  vec3 sunColor = mix(vec3(1.0, 0.80, 0.50), vec3(1.0, 1.0, 0.92), dayT);',
    '  if (sunElev > -0.06) {',
    '    skyColor += sunColor * sunCore;',
    '    skyColor += sunColor * sunGlow * clamp(dayT + 0.3, 0.0, 1.0);',
    '  }',

    // Exposure — applied from uniform (tuned per phase in SKY_PARAMS)
    '  skyColor *= uExposure;',

    // 0625F: minimum luminance floor — prevents crushed black sky in dim phases.
    '  skyColor = max(skyColor, vec3(0.015, 0.015, 0.028));',

    // Filmic tone-map: gentler curve (1.2 vs 1.8) preserves more mid-tone brightness.
    '  skyColor = 1.0 - exp(-skyColor * 1.2);',

    // 0625F: gamma correction (sRGB).
    '  skyColor = pow(skyColor, vec3(1.0 / 2.2));',

    // Output: alpha=0 below horizon → map tiles show through; alpha=1 above horizon.
    '  gl_FragColor = vec4(skyColor, skyAlpha);',
    '}',
  ].join('\n');

  // ── Layer state ───────────────────────────────────────────────────────────────
  var _gl       = null;
  var _prog     = null;
  var _buf      = null;
  var _locs     = null;
  var _map      = null;
  var _active   = false;
  var _initErr  = null;

  function _compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var err = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Sky shader compile: ' + err);
    }
    return s;
  }

  function _linkProgram(gl, vert, frag) {
    var prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var err = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('Sky program link: ' + err);
    }
    return prog;
  }

  // ── Mapbox CustomLayerInterface ───────────────────────────────────────────────
  var _customLayer = {
    id:            'wall-three-sky',
    type:          'custom',
    // renderingMode '2d' renders before 3D pipeline — sky is behind all 3D geometry
    renderingMode: '2d',

    onAdd: function (map, gl) {
      _map = map;
      _gl  = gl;
      try {
        var vs = _compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
        var fs = _compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
        _prog = _linkProgram(gl, vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        // Fullscreen quad: two triangles
        _buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, _buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1,  1, -1,  -1, 1,
           1, -1,  1,  1,  -1, 1,
        ]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        _locs = {
          aPos:      gl.getAttribLocation(_prog, 'aPos'),
          uSunDir:   gl.getUniformLocation(_prog, 'uSunDir'),
          uTurbidity:gl.getUniformLocation(_prog, 'uTurbidity'),
          uRayleigh: gl.getUniformLocation(_prog, 'uRayleigh'),
          uExposure: gl.getUniformLocation(_prog, 'uExposure'),
          uAspect:   gl.getUniformLocation(_prog, 'uAspect'),
          uBearing:  gl.getUniformLocation(_prog, 'uBearing'),
          uPitch:    gl.getUniformLocation(_prog, 'uPitch'),
        };

        _active = true;
        _initErr = null;
        if (typeof console !== 'undefined') {
          console.log('[ThreeSkyLayer] onAdd — sky shader compiled and ready.');
        }
      } catch (e) {
        _initErr = e.message || String(e);
        _active = false;
        console.warn('[ThreeSkyLayer] onAdd failed:', _initErr);
      }
    },

    render: function (gl, matrix) {
      if (!_active || !_prog || !_buf || !_locs || !_map) return;

      var sky = _getSkyState();
      var sd  = _sunDir(sky.elev, sky.azim);

      // Camera bearing/pitch from map
      var bearing = _map.getBearing ? _map.getBearing() : 0;
      var pitch   = _map.getPitch   ? _map.getPitch()   : 0;

      // Canvas aspect ratio
      var canvas = _map.getCanvas ? _map.getCanvas() : { width: 1, height: 1 };
      var aspect = canvas.width / (canvas.height || 1);

      // Save GL state
      var prevDepthTest  = gl.isEnabled(gl.DEPTH_TEST);
      var prevBlend      = gl.isEnabled(gl.BLEND);
      var prevBlendSrcRGB   = gl.getParameter(gl.BLEND_SRC_RGB);
      var prevBlendDstRGB   = gl.getParameter(gl.BLEND_DST_RGB);
      var prevBlendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
      var prevBlendDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);

      gl.disable(gl.DEPTH_TEST);
      // Blend sky over map tiles: sky alpha controls opacity above horizon (0 below).
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,   // RGB: normal alpha composite
        gl.ZERO,      gl.ONE                     // Alpha channel: preserve dest alpha
      );

      gl.useProgram(_prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, _buf);
      gl.enableVertexAttribArray(_locs.aPos);
      gl.vertexAttribPointer(_locs.aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform3fv(_locs.uSunDir,    sd);
      gl.uniform1f(_locs.uTurbidity,  sky.turbidity);
      gl.uniform1f(_locs.uRayleigh,   sky.rayleigh);
      gl.uniform1f(_locs.uExposure,   sky.exposure);
      gl.uniform1f(_locs.uAspect,     aspect);
      gl.uniform1f(_locs.uBearing,    bearing);
      gl.uniform1f(_locs.uPitch,      pitch);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.disableVertexAttribArray(_locs.aPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);

      // Restore GL state
      if (!prevBlend)   gl.disable(gl.BLEND);
      gl.blendFuncSeparate(prevBlendSrcRGB, prevBlendDstRGB, prevBlendSrcAlpha, prevBlendDstAlpha);
      if (prevDepthTest) gl.enable(gl.DEPTH_TEST);

      _map.triggerRepaint();
    },
  };

  // ── Mount ─────────────────────────────────────────────────────────────────────
  // Called after map + style are ready. Adds sky layer before fill-extrusion
  // (3D buildings) so sky renders behind world geometry.
  function mount(map) {
    if (!map || typeof map.addLayer !== 'function') return;
    if (map.getLayer && map.getLayer('wall-three-sky')) return; // idempotent

    function _addLayer() {
      try {
        // Find first fill-extrusion layer to insert sky before buildings
        var beforeId;
        if (map.getStyle) {
          var layers = map.getStyle().layers || [];
          for (var i = 0; i < layers.length; i++) {
            if (layers[i].type === 'fill-extrusion') { beforeId = layers[i].id; break; }
          }
        }
        if (beforeId) {
          map.addLayer(_customLayer, beforeId);
        } else {
          map.addLayer(_customLayer);
        }
        console.log('[ThreeSkyLayer] mounted — beforeId:', beforeId || '(none, appended)');
        // Notify PLAY parent window: sky renderer is now active.
        // PLAY BroadcastHudShell listens for this to update ATM status to THREE SKY.
        try { global.parent.postMessage({ type: 'wall:sky-status', renderer: 'three-sky' }, '*'); } catch (pe) {}
      } catch (e) {
        console.warn('[ThreeSkyLayer] addLayer failed:', e.message || e);
        try { global.parent.postMessage({ type: 'wall:sky-status', renderer: 'sky-bridge', blockReason: 'WALL ADD LAYER FAILED: ' + (e.message || e) }, '*'); } catch (pe) {}
      }
    }

    if (map.loaded && map.loaded()) {
      _addLayer();
    } else {
      map.once('style.load', _addLayer);
    }
  }

  // ── Status (queried by PLAY postMessage bridge) ───────────────────────────────
  function getStatus() {
    if (_active)  return { renderer: 'three-sky', blockReason: null };
    if (_initErr) return { renderer: 'sky-bridge', blockReason: 'WALL SHADER ERROR: ' + _initErr };
    return { renderer: 'sky-bridge', blockReason: 'WALL THREE SKY NOT MOUNTED' };
  }

  // ── Auto-mount via MapboxViewportRuntime when available ───────────────────────
  // MapboxViewportRuntime.onStyleLoad() fires when style is ready; getMap() gives
  // the live map instance. This avoids modifying main.js.
  function _autoMount() {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr) return;
    var map = mvr.getMap ? mvr.getMap() : null;
    if (map) {
      mount(map);
    } else {
      // Wait for MapboxViewportRuntime to signal readiness
      if (typeof mvr.onStyleLoad === 'function') {
        mvr.onStyleLoad(function () {
          var m = mvr.getMap ? mvr.getMap() : null;
          if (m) mount(m);
        });
      }
    }
  }

  // Delay to let MapboxViewportRuntime load first
  if (global.setTimeout) {
    global.setTimeout(function () {
      if (SBE.MapboxViewportRuntime) {
        _autoMount();
      } else {
        // Fallback: retry once after another tick
        global.setTimeout(_autoMount, 1000);
      }
    }, 200);
  }

  SBE.ThreeSkyLayer = Object.freeze({
    VERSION: '1.0.0',
    mount:   mount,
    getStatus: getStatus,
  });

})(window);
