// ── MaritimeStyleRegistryDebug v1.0.1 ────────────────────────────────────────
// 0525B_WOS_MaritimeStyleRegistry_v1.0.1 — development companion
// Status: active
// Classification: debug-tooling (non-production critical path)
//
// Development-time diagnostics for MaritimeStyleRegistry.
//
// All functions are console-oriented and read-only with respect to runtime truth.
// Load-order safe — may be loaded before or after the main registry module
// as long as it is called after DOMContentLoaded.
//
// Usage (browser console):
//   _wos.maritimeStyle.palette()                    — color table of all classes
//   _wos.maritimeStyle.validate()                   — full registry integrity check
//   _wos.maritimeStyle.inspectClass("ferry")        — deep inspect one class
//   _wos.maritimeStyle.compareClasses("cargo","tug") — side-by-side diff
//   _wos.maritimeStyle.visibilityMatrix("ferry")    — show style across all vis classes
//   _wos.maritimeStyle.densityTest("cargo", 0.75)   — show style under density pressure
//   _wos.maritimeStyle.twinkleProfile()             — twinkle rate / strength table
//   _wos.maritimeStyle.scaleUsage()                 — compact/detailed scale table
//   _wos.maritimeStyle.hoverCardProfile()           — hover timing table
//
// Placement: wall/systems/presentation/maritimeStyleRegistryDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function _init() {
    var SBE = global.SBE;
    var MSR = SBE && SBE.MaritimeStyleRegistry;

    if (!MSR) {
      console.warn('[MaritimeStyleRegistryDebug] SBE.MaritimeStyleRegistry not found' +
        ' — load maritimeStyleRegistry.js first');
      return;
    }

    global._wos = global._wos || {};

    var C = MSR.CONSTANTS;

    // ── Palette ───────────────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.palette()
     *
     * Print a console.table of symbolic colors for all vessel classes.
     */
    function palette() {
      var reg   = MSR.getRegistry();
      var rows  = {};
      var classes = Object.keys(reg);
      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        var s   = reg[cls].symbolic;
        rows[cls] = {
          hull:               s.hullColorHex,
          deck:               s.deckColorHex,
          accent:             s.accentColorHex,
          strokePx:           s.strokeWidthPx,
          silhouetteWeight:   s.silhouetteWeight,
          markerRadiusPx:     s.markerRadiusPx,
          compactScale:       s.compactScaleMultiplier,
          detailedScale:      s.detailedScaleMultiplier,
        };
      }
      console.log('[MaritimeStyleRegistry] Vessel palette (' + classes.length + ' classes):');
      console.table(rows);
      return rows;
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.validate()
     *
     * Run validateRegistry() and log results.
     */
    function validate() {
      var result = MSR.validateRegistry();
      if (result.pass) {
        console.log('[MaritimeStyleRegistry] validateRegistry: PASS ✓ (' +
          result.classCount + ' classes)');
      } else {
        console.error('[MaritimeStyleRegistry] validateRegistry: FAIL ✗ (' +
          result.errors.length + ' errors)');
        for (var i = 0; i < result.errors.length; i++) {
          console.error('  ✗', result.errors[i]);
        }
      }
      return result;
    }

    // ── Inspect class ─────────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.inspectClass(classKey)
     *
     * Deep inspect all sections of one vessel class.
     *
     * @param {string} classKey
     */
    function inspectClass(classKey) {
      var result = MSR.resolveVesselStyle(classKey);
      console.group('[MaritimeStyleRegistry] Class: ' + result.resolvedClass +
        (result.usedFallback ? ' (fallback from "' + result.requestedClass + '")' : ''));

      var sections = ['symbolic','lighting','wakePresentation','motionPresentation',
                      'hoverCardPresentation','densityResponse'];
      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        console.group(sec);
        var obj = result.vesselStyle[sec];
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j++) {
          console.log('  ' + keys[j] + ':', obj[keys[j]]);
        }
        console.groupEnd();
      }
      console.groupEnd();
      return result;
    }

    // ── Compare classes ───────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.compareClasses(classA, classB)
     *
     * Side-by-side comparison of two vessel classes across key fields.
     *
     * @param {string} classA
     * @param {string} classB
     */
    function compareClasses(classA, classB) {
      var a = MSR.resolveVesselStyle(classA).vesselStyle;
      var b = MSR.resolveVesselStyle(classB).vesselStyle;

      var rows = {
        'hull color':        { [classA]: a.symbolic.hullColorHex,            [classB]: b.symbolic.hullColorHex },
        'accent color':      { [classA]: a.symbolic.accentColorHex,          [classB]: b.symbolic.accentColorHex },
        'compact scale':     { [classA]: a.symbolic.compactScaleMultiplier,  [classB]: b.symbolic.compactScaleMultiplier },
        'detailed scale':    { [classA]: a.symbolic.detailedScaleMultiplier, [classB]: b.symbolic.detailedScaleMultiplier },
        'marker radius px':  { [classA]: a.symbolic.markerRadiusPx,          [classB]: b.symbolic.markerRadiusPx },
        'far light alpha':   { [classA]: a.lighting.farLightAlpha,           [classB]: b.lighting.farLightAlpha },
        'far halo px':       { [classA]: a.lighting.farLightHaloPx,          [classB]: b.lighting.farLightHaloPx },
        'twinkle strength':  { [classA]: a.lighting.twinkleStrength,         [classB]: b.lighting.twinkleStrength },
        'twinkle Hz':        { [classA]: a.lighting.twinkleRateHz,           [classB]: b.lighting.twinkleRateHz },
        'wake alpha mult':   { [classA]: a.wakePresentation.visualAlphaMultiplier, [classB]: b.wakePresentation.visualAlphaMultiplier },
        'hover hold ms':     { [classA]: a.hoverCardPresentation.holdMs,     [classB]: b.hoverCardPresentation.holdMs },
        'heading smoothing': { [classA]: a.motionPresentation.headingVisualSmoothing, [classB]: b.motionPresentation.headingVisualSmoothing },
        'easing ms':         { [classA]: a.motionPresentation.visualEasingMs,[classB]: b.motionPresentation.visualEasingMs },
      };

      console.log('[MaritimeStyleRegistry] compareClasses: ' + classA + ' vs ' + classB);
      console.table(rows);
      return rows;
    }

    // ── Visibility matrix ─────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.visibilityMatrix(classKey)
     *
     * Show how style fields change across all six visibilityClass values.
     *
     * @param {string} classKey
     */
    function visibilityMatrix(classKey) {
      var base = MSR.resolveVesselStyle(classKey).vesselStyle;
      var vcls = ['FULL','REDUCED','SILHOUETTE','MARKER_ONLY','LIGHT_ONLY','ATMOSPHERIC_HIDDEN'];
      var rows = {};

      for (var i = 0; i < vcls.length; i++) {
        var vc  = vcls[i];
        var s   = MSR.applyVisibilityClassToStyle(base, vc);
        rows[vc] = {
          compactScale:   s.symbolic.compactScaleMultiplier,
          detailedScale:  s.symbolic.detailedScaleMultiplier,
          markerRadius:   s.symbolic.markerRadiusPx,
          farLightAlpha:  s.lighting.farLightAlpha,
          twinkle:        s.lighting.twinkleStrength,
          wakeAlpha:      s.wakePresentation.visualAlphaMultiplier,
        };
      }

      console.log('[MaritimeStyleRegistry] visibilityMatrix: ' + classKey);
      console.table(rows);
      return rows;
    }

    // ── Density test ──────────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.densityTest(classKey, clutterPressure)
     *
     * Show how style fields change under a given clutter pressure [0..1].
     *
     * @param {string} classKey
     * @param {number} clutterPressure — 0.0 to 1.0
     */
    function densityTest(classKey, clutterPressure) {
      var pressure = Math.max(0, Math.min(1, clutterPressure || 0));
      var base     = MSR.resolveVesselStyle(classKey).vesselStyle;
      var applied  = MSR.applyDensityPressureToStyle(base, pressure);

      var rows = {
        farLightAlpha: {
          base:     base.lighting.farLightAlpha,
          pressure: pressure,
          result:   applied.lighting.farLightAlpha,
        },
        wakeAlpha: {
          base:     base.wakePresentation.visualAlphaMultiplier,
          pressure: pressure,
          result:   applied.wakePresentation.visualAlphaMultiplier,
        },
        hoverGlow: {
          base:     base.hoverCardPresentation.glowStrength,
          pressure: pressure,
          result:   applied.hoverCardPresentation.glowStrength,
        },
      };

      console.log('[MaritimeStyleRegistry] densityTest: ' + classKey + ' @ pressure=' + pressure);
      console.table(rows);
      return rows;
    }

    // ── Twinkle profile ───────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.twinkleProfile()
     *
     * Print twinkle rate and strength for all classes.
     * Includes governance check: rate > 1.0 Hz flags urgency risk.
     */
    function twinkleProfile() {
      var reg   = MSR.getRegistry();
      var rows  = {};
      var classes = Object.keys(reg);
      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        var l   = reg[cls].lighting;
        var warn = l.twinkleRateHz > 1.0 ? '⚠ URGENCY RISK' : '';
        rows[cls] = {
          twinkleStrength:   l.twinkleStrength,
          twinkleRateHz:     l.twinkleRateHz,
          cycleSec:          (1 / l.twinkleRateHz).toFixed(1) + 's',
          farLightAlpha:     l.farLightAlpha,
          classTintStrength: l.classTintStrength,
          urgencyRisk:       warn,
        };
      }
      console.log('[MaritimeStyleRegistry] twinkleProfile' +
        ' (default rate: ' + C.DEFAULT_TWINKLE_RATE_HZ + ' Hz ≈ ' +
        (1 / C.DEFAULT_TWINKLE_RATE_HZ).toFixed(1) + 's/cycle):');
      console.table(rows);
      return rows;
    }

    // ── Scale usage ───────────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.scaleUsage()
     *
     * Print compact vs detailed scale multipliers for all classes.
     */
    function scaleUsage() {
      var reg   = MSR.getRegistry();
      var rows  = {};
      var classes = Object.keys(reg);
      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        var s   = reg[cls].symbolic;
        rows[cls] = {
          compactScale:    s.compactScaleMultiplier,
          detailedScale:   s.detailedScaleMultiplier,
          silhouetteWeight: s.silhouetteWeight,
          markerRadiusPx:  s.markerRadiusPx,
          strokeWidthPx:   s.strokeWidthPx,
        };
      }
      console.log('[MaritimeStyleRegistry] scaleUsage:');
      console.table(rows);
      return rows;
    }

    // ── Hover card profile ────────────────────────────────────────────────────
    /**
     * _wos.maritimeStyle.hoverCardProfile()
     *
     * Print hover card timing and visual parameters for all classes.
     * Flags holdMs > MAX_HOVER_HOLD_MS.
     */
    function hoverCardProfile() {
      var reg   = MSR.getRegistry();
      var rows  = {};
      var classes = Object.keys(reg);
      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        var h   = reg[cls].hoverCardPresentation;
        var warn = h.holdMs > C.MAX_HOVER_HOLD_MS ? '⚠ EXCEEDS MAX' : '';
        rows[cls] = {
          fadeInMs:           h.fadeInMs,
          holdMs:             h.holdMs,
          fadeOutMs:          h.fadeOutMs,
          totalMs:            h.fadeInMs + h.holdMs + h.fadeOutMs,
          backgroundAlpha:    h.backgroundAlpha,
          glowStrength:       h.glowStrength,
          classAccentStrength: h.classAccentStrength,
          maxWidthPx:         h.maxWidthPx,
          holdWarning:        warn,
        };
      }
      console.log('[MaritimeStyleRegistry] hoverCardProfile' +
        ' (max hold: ' + C.MAX_HOVER_HOLD_MS + 'ms):');
      console.table(rows);
      return rows;
    }

    // ── Export onto _wos.maritimeStyle ────────────────────────────────────────
    global._wos.maritimeStyle = Object.freeze({
      palette:          palette,
      validate:         validate,
      inspectClass:     inspectClass,
      compareClasses:   compareClasses,
      visibilityMatrix: visibilityMatrix,
      densityTest:      densityTest,
      twinkleProfile:   twinkleProfile,
      scaleUsage:       scaleUsage,
      hoverCardProfile: hoverCardProfile,

      // Direct pass-throughs for convenience
      resolveVesselStyle:          MSR.resolveVesselStyle,
      applyVisibilityClassToStyle: MSR.applyVisibilityClassToStyle,
      applyDensityPressureToStyle: MSR.applyDensityPressureToStyle,
      getRegistry:                 MSR.getRegistry,
      cubicGlide:                  MSR.cubicGlide,
    });

    console.log('[MaritimeStyleRegistryDebug] v' + C.VERSION +
      ' loaded — _wos.maritimeStyle ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})(window);
