(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalFxPanel — collapsible Orbital FX control panel ────────────────────

  var _CSS_ID = 'orbital-fx-panel-css';

  var _CSS = [
    '#orbital-fx-panel {',
    '  position: fixed; bottom: 100px; right: 12px; z-index: 950;',
    '  width: 220px; background: rgba(4,8,16,0.88);',
    '  border: 1px solid rgba(100,160,220,0.22); border-radius: 8px;',
    '  font-family: "Share Tech Mono","IBM Plex Mono","Courier New",monospace;',
    '  font-size: 9px; color: rgba(200,230,255,0.82);',
    '  letter-spacing: 0.06em; text-transform: uppercase;',
    '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
    '  user-select: none; display: none; overflow: hidden;',
    '}',
    '#orbital-fx-panel.ofx--open { display: block; }',
    '.ofx-header {',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  padding: 8px 10px 6px; border-bottom: 1px solid rgba(100,160,220,0.14);',
    '  cursor: pointer;',
    '}',
    '.ofx-title { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: rgba(160,210,255,0.92); }',
    '.ofx-close { opacity: 0.5; cursor: pointer; font-size: 14px; line-height: 1; }',
    '.ofx-close:hover { opacity: 0.9; }',
    '.ofx-body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 10px; }',
    '.ofx-section { display: flex; flex-direction: column; gap: 4px; }',
    '.ofx-section-lbl { font-size: 7px; letter-spacing: 0.22em; color: rgba(160,210,255,0.38); margin-bottom: 2px; }',
    '.ofx-btn-row { display: flex; gap: 3px; flex-wrap: wrap; }',
    '.ofx-btn {',
    '  padding: 3px 8px; border-radius: 4px; cursor: pointer; font-family: inherit;',
    '  font-size: 8px; letter-spacing: 0.10em; text-transform: uppercase;',
    '  background: rgba(200,230,255,0.06); border: 1px solid rgba(100,160,220,0.20);',
    '  color: rgba(200,230,255,0.62); transition: background 100ms, color 100ms;',
    '}',
    '.ofx-btn:hover { background: rgba(200,230,255,0.14); color: rgba(200,230,255,0.92); }',
    '.ofx-btn.active { background: rgba(50,185,140,0.16); border-color: rgba(50,185,140,0.40); color: rgba(80,215,170,0.95); }',
    '.ofx-slider-row { display: grid; grid-template-columns: 68px 1fr 28px; align-items: center; gap: 5px; }',
    '.ofx-slider-lbl { font-size: 8px; color: rgba(200,230,255,0.44); }',
    '.ofx-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 2px;',
    '  background: rgba(100,160,220,0.20); border-radius: 1px; outline: none; cursor: pointer; }',
    '.ofx-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 8px; height: 8px;',
    '  border-radius: 50%; background: rgba(100,180,255,0.85); cursor: pointer; }',
    '.ofx-val { font-size: 8px; color: rgba(200,230,255,0.55); text-align: right; min-width: 24px; }',
    '.ofx-toggle-row { display: flex; gap: 4px; }',
    '.ofx-action-row { display: flex; gap: 4px; margin-top: 2px; }',
    '.ofx-action { flex: 1; padding: 4px 6px; text-align: center; cursor: pointer;',
    '  background: rgba(200,230,255,0.06); border: 1px solid rgba(100,160,220,0.18);',
    '  border-radius: 4px; font-family: inherit; font-size: 8px; letter-spacing: 0.10em;',
    '  color: rgba(200,230,255,0.55); transition: background 100ms; text-transform: uppercase; }',
    '.ofx-action:hover { background: rgba(200,230,255,0.14); color: rgba(200,230,255,0.90); }',
    '.ofx-action--danger { border-color: rgba(220,100,80,0.28); color: rgba(220,150,130,0.70); }',
    '.ofx-action--danger:hover { background: rgba(220,80,60,0.12); color: rgba(255,140,120,0.95); }',
    '.ofx-sep { height: 1px; background: rgba(100,160,220,0.10); margin: 2px 0; }'
  ].join('\n');

  var _EARTH_SLIDERS = [
    { key: 'orbitalSurfaceBrightness', label: 'Surface'   },
    { key: 'orbitalLineOpacity',       label: 'Lines'     },
    { key: 'orbitalAtmosphereOpacity', label: 'Atmosphere'},
    { key: 'orbitalRimOpacity',        label: 'Rim Glow'  },
    { key: 'orbitalHazeOpacity',       label: 'Haze'      },
    { key: 'orbitalStarOpacity',       label: 'Stars'     },
    { key: 'orbitalOriginOpacity',     label: 'Origin Mkr'}
  ];

  var _EARTH_PRESETS = [
    { key: 'readable_orbit',  label: 'Readable' },
    { key: 'deep_orbit',      label: 'Deep'     },
    { key: 'broadcast_orbit', label: 'Broadcast'},
    { key: 'minimal_orbit',   label: 'Minimal'  }
  ];

  var _SLIDERS = [
    { key: 'atmosphereIntensity',   label: 'Atmosphere',   section: 'scene' },
    { key: 'gridIntensity',         label: 'Grid',         section: 'scene' },
    { key: 'signalIntensity',       label: 'Signals',      section: 'scene' },
    { key: 'particleIntensity',     label: 'Particles',    section: 'scene' },
    { key: 'scanRingIntensity',     label: 'Scan Rings',   section: 'scene' },
    { key: 'routeArcIntensity',     label: 'Route Arcs',   section: 'scene' },
    { key: 'bloomIntensity',        label: 'Bloom',        section: 'scene' },
    { key: 'rotationSpeed',         label: 'Rotation',     section: 'motion' },
    { key: 'cameraDrift',           label: 'Cam Drift',    section: 'motion' },
    { key: 'textureNoiseIntensity', label: 'Tex Noise',    section: 'visual' },
    { key: 'grainIntensity',        label: 'Grain',        section: 'visual' },
    { key: 'glowRadius',            label: 'Glow Radius',  section: 'visual' },
    { key: 'scanlineIntensity',     label: 'Scanlines',    section: 'visual' }
  ];

  function OrbitalFxPanel(opts) {
    opts = opts || {};
    this._onStateChange = opts.onStateChange || null;  // fn(partialState)
    this._onAction      = opts.onAction      || null;  // fn(action) where action = 'freeze'|'reset'|'exit'
    this._panel = null;
    this._open  = false;
  }

  OrbitalFxPanel.prototype.init = function () {
    if (!document.getElementById(_CSS_ID)) {
      var s = document.createElement('style');
      s.id = _CSS_ID;
      s.textContent = _CSS;
      document.head.appendChild(s);
    }
    this._panel = document.createElement('div');
    this._panel.id = 'orbital-fx-panel';
    this._panel.innerHTML = this._buildHTML();
    document.body.appendChild(this._panel);
    this._bindEvents();
  };

  OrbitalFxPanel.prototype._buildHTML = function () {
    var presets = SBE.OrbitalPresetRegistry ? SBE.OrbitalPresetRegistry.listPresetNames() : [];
    var camModes   = ['lock', 'drift', 'orbit'];
    var ctrlModes  = ['passive', 'perform', 'auto'];

    var html = '<div class="ofx-header"><span class="ofx-title">ORBITAL FX</span><span class="ofx-close">✕</span></div>';
    html += '<div class="ofx-body">';

    // Mode
    html += '<div class="ofx-section"><div class="ofx-section-lbl">MODE</div><div class="ofx-btn-row" data-group="controlMode">';
    ctrlModes.forEach(function (m) {
      html += '<button class="ofx-btn" data-val="' + m + '">' + m.toUpperCase() + '</button>';
    });
    html += '</div></div>';

    // Preset
    html += '<div class="ofx-section"><div class="ofx-section-lbl">PRESET</div><div class="ofx-btn-row" data-group="preset">';
    presets.forEach(function (p) {
      var label = SBE.OrbitalPresetRegistry ? SBE.OrbitalPresetRegistry.getPresetLabel(p) : p;
      html += '<button class="ofx-btn" data-val="' + p + '">' + label + '</button>';
    });
    html += '</div></div>';

    // Camera
    html += '<div class="ofx-section"><div class="ofx-section-lbl">CAMERA</div><div class="ofx-btn-row" data-group="cameraMode">';
    camModes.forEach(function (m) {
      html += '<button class="ofx-btn" data-val="' + m + '">' + m.toUpperCase() + '</button>';
    });
    html += '</div></div>';

    html += '<div class="ofx-sep"></div>';

    // Effect sliders — grouped by section
    var sections = [
      { id: 'scene',  label: 'SCENE' },
      { id: 'motion', label: 'MOTION' },
      { id: 'visual', label: 'VISUAL' }
    ];
    sections.forEach(function (sec) {
      var group = _SLIDERS.filter(function (s) { return s.section === sec.id; });
      if (!group.length) return;
      html += '<div class="ofx-section"><div class="ofx-section-lbl">' + sec.label + '</div>';
      group.forEach(function (s) {
        html += '<div class="ofx-slider-row">';
        html += '<span class="ofx-slider-lbl">' + s.label + '</span>';
        html += '<input class="ofx-slider" type="range" min="0" max="100" step="1" data-key="' + s.key + '">';
        html += '<span class="ofx-val" data-val-key="' + s.key + '">--</span>';
        html += '</div>';
      });
      html += '</div>';
    });

    html += '<div class="ofx-sep"></div>';

    // Camera framing presets — Orbital Earth
    html += '<div class="ofx-section"><div class="ofx-section-lbl">CAM PRESET</div><div class="ofx-btn-row" data-group="camPreset">';
    html += '<button class="ofx-btn" data-val="readable_orbit">Readable</button>';
    html += '<button class="ofx-btn" data-val="broadcast_orbit">Broadcast</button>';
    html += '<button class="ofx-btn" data-val="deep_orbit">Deep</button>';
    html += '<button class="ofx-btn" data-val="cinematic_crop">Crop</button>';
    html += '</div>';
    html += '<div class="ofx-action-row" style="margin-top:4px">';
    html += '<button class="ofx-action" data-cam-action="fitGlobe">Fit Globe</button>';
    html += '<button class="ofx-action" data-cam-action="restoreView">Restore View</button>';
    html += '</div></div>';

    html += '<div class="ofx-sep"></div>';

    // Earth Readability — visual presets
    html += '<div class="ofx-section"><div class="ofx-section-lbl">EARTH PRESET</div><div class="ofx-btn-row" data-group="earthPreset">';
    _EARTH_PRESETS.forEach(function (p) {
      html += '<button class="ofx-btn" data-val="' + p.key + '">' + p.label + '</button>';
    });
    html += '</div></div>';

    // Earth Readability — individual sliders
    html += '<div class="ofx-section"><div class="ofx-section-lbl">READABILITY</div>';
    _EARTH_SLIDERS.forEach(function (s) {
      html += '<div class="ofx-slider-row">';
      html += '<span class="ofx-slider-lbl">' + s.label + '</span>';
      html += '<input class="ofx-slider ofx-earth-slider" type="range" min="0" max="100" step="1" data-earth-key="' + s.key + '">';
      html += '<span class="ofx-val" data-earth-val-key="' + s.key + '">--</span>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="ofx-sep"></div>';

    // Toggles
    html += '<div class="ofx-section"><div class="ofx-section-lbl">TOGGLES</div><div class="ofx-toggle-row">';
    html += '<button class="ofx-btn" data-toggle="trackCardVisible">Track Card</button>';
    html += '<button class="ofx-btn" data-toggle="hudSafeMode">HUD Safe</button>';
    html += '<button class="ofx-btn" data-toggle="audioReactive">Audio Rx</button>';
    html += '<button class="ofx-btn" data-toggle="staticBackgroundEnabled">Static BG</button>';
    html += '</div></div>';

    // Actions
    html += '<div class="ofx-section"><div class="ofx-action-row">';
    html += '<button class="ofx-action" data-action="freeze">Freeze</button>';
    html += '<button class="ofx-action" data-action="reset">Reset</button>';
    html += '</div><div class="ofx-action-row">';
    html += '<button class="ofx-action ofx-action--danger" data-action="exit">Return to Map</button>';
    html += '</div></div>';

    html += '</div>'; // .ofx-body
    return html;
  };

  OrbitalFxPanel.prototype._bindEvents = function () {
    var self = this;
    var p = this._panel;

    // Close button
    var closeBtn = p.querySelector('.ofx-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });

    // Group buttons (mode / preset / camera / earthPreset)
    p.querySelectorAll('[data-group]').forEach(function (group) {
      group.addEventListener('click', function (e) {
        var btn = e.target.closest('.ofx-btn');
        if (!btn) return;
        var key = group.dataset.group;
        var val = btn.dataset.val;
        if (!val) return;
        if (key === 'preset') {
          self._applyPreset(val);
        } else if (key === 'earthPreset') {
          var em = SBE.OrbitalEarthMode;
          if (em && em.setVisualPreset) em.setVisualPreset(val);
        } else if (key === 'camPreset') {
          var em2 = SBE.OrbitalEarthMode;
          if (em2 && em2.setCameraPreset) em2.setCameraPreset(val);
        } else {
          self._emit({ [key]: val });
        }
        self._setActive(group, btn);
      });
    });

    // Camera action buttons (Fit Globe / Restore View)
    p.querySelectorAll('[data-cam-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.dataset.camAction;
        var em = SBE.OrbitalEarthMode;
        if (!em) return;
        if (action === 'fitGlobe' && em.fitGlobeToViewport) {
          em.fitGlobeToViewport(em.getCameraPreset ? em.getCameraPreset() : 'readable_orbit', 0);
        } else if (action === 'restoreView' && em.restoreMapCameraState) {
          em.restoreMapCameraState();
        }
      });
    });

    // Scene/visual sliders (orbital Three.js controls)
    p.querySelectorAll('.ofx-slider:not(.ofx-earth-slider)').forEach(function (slider) {
      slider.addEventListener('input', function () {
        var key = slider.dataset.key;
        var v   = slider.value / 100;
        var valEl = p.querySelector('[data-val-key="' + key + '"]');
        if (valEl) valEl.textContent = Math.round(v * 100) + '%';
        var partial = {};
        partial[key] = v;
        self._emit(partial);
      });
    });

    // Earth readability sliders — forward to OrbitalEarthMode
    p.querySelectorAll('.ofx-earth-slider').forEach(function (slider) {
      slider.addEventListener('input', function () {
        var key = slider.dataset.earthKey;
        var v   = slider.value / 100;
        var valEl = p.querySelector('[data-earth-val-key="' + key + '"]');
        if (valEl) valEl.textContent = Math.round(v * 100) + '%';
        var em = SBE.OrbitalEarthMode;
        if (em && em.setReadabilityToken) em.setReadabilityToken(key, v);
      });
    });

    // Toggles
    p.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.toggle;
        btn.classList.toggle('active');
        var partial = {};
        partial[key] = btn.classList.contains('active');
        self._emit(partial);
      });
    });

    // Actions
    p.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (self._onAction) self._onAction(btn.dataset.action);
      });
    });
  };

  OrbitalFxPanel.prototype._emit = function (partial) {
    if (this._onStateChange) this._onStateChange(partial);
  };

  OrbitalFxPanel.prototype._applyPreset = function (name) {
    var reg = SBE.OrbitalPresetRegistry;
    if (!reg) return;
    var preset = reg.getPreset(name);
    this._emit(Object.assign({}, preset, { activePreset: name }));
    this.syncToState(Object.assign({}, preset, { activePreset: name }));
    // Highlight preset button
    var group = this._panel.querySelector('[data-group="preset"]');
    if (group) {
      var btn = group.querySelector('[data-val="' + name + '"]');
      if (btn) this._setActive(group, btn);
    }
  };

  OrbitalFxPanel.prototype._setActive = function (group, activeBtn) {
    group.querySelectorAll('.ofx-btn').forEach(function (b) { b.classList.remove('active'); });
    if (activeBtn) activeBtn.classList.add('active');
  };

  OrbitalFxPanel.prototype.syncToState = function (effectState) {
    if (!this._panel) return;
    var p = this._panel;

    // Sliders
    _SLIDERS.forEach(function (s) {
      var slider = p.querySelector('[data-key="' + s.key + '"]');
      var valEl  = p.querySelector('[data-val-key="' + s.key + '"]');
      if (slider && effectState[s.key] !== undefined) {
        slider.value = Math.round(effectState[s.key] * 100);
        if (valEl) valEl.textContent = Math.round(effectState[s.key] * 100) + '%';
      }
    });

    // Toggles
    ['trackCardVisible', 'hudSafeMode', 'audioReactive', 'staticBackgroundEnabled'].forEach(function (key) {
      var btn = p.querySelector('[data-toggle="' + key + '"]');
      if (btn) btn.classList.toggle('active', !!effectState[key]);
    });

    // Group active states
    ['controlMode', 'cameraMode'].forEach(function (groupKey) {
      var group = p.querySelector('[data-group="' + groupKey + '"]');
      if (!group) return;
      var active = group.querySelector('[data-val="' + effectState[groupKey] + '"]');
      if (active) {
        group.querySelectorAll('.ofx-btn').forEach(function (b) { b.classList.remove('active'); });
        active.classList.add('active');
      }
    });

    // Preset
    if (effectState.activePreset) {
      var presetGroup = p.querySelector('[data-group="preset"]');
      if (presetGroup) {
        var activePresetBtn = presetGroup.querySelector('[data-val="' + effectState.activePreset + '"]');
        if (activePresetBtn) {
          presetGroup.querySelectorAll('.ofx-btn').forEach(function (b) { b.classList.remove('active'); });
          activePresetBtn.classList.add('active');
        }
      }
    }
  };

  OrbitalFxPanel.prototype.open  = function () { if (this._panel) { this._panel.classList.add('ofx--open'); this._open = true; } };
  OrbitalFxPanel.prototype.close = function () { if (this._panel) { this._panel.classList.remove('ofx--open'); this._open = false; } };
  OrbitalFxPanel.prototype.toggle = function () { this._open ? this.close() : this.open(); };
  OrbitalFxPanel.prototype.isOpen = function () { return this._open; };

  OrbitalFxPanel.prototype.dispose = function () {
    if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    this._panel = null;
    var css = document.getElementById(_CSS_ID);
    if (css) css.parentNode.removeChild(css);
  };

  SBE.OrbitalFxPanel = OrbitalFxPanel;

})(window);
