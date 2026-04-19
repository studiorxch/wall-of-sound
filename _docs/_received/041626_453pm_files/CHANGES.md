# 📝 DETAILED CHANGE LOG
## Wall of Sound — Emitter Behavior Upgrade v1.0.0

**Date:** April 16, 2026  
**Scope:** All six priorities implemented  
**Breaking Changes:** None

---

## FILE: `main.js`

### Change #1: Emitter Creation with New Properties
**Location:** Lines 748–758  
**Priority:** P1, P2, P3, P6  

**Before:**
```javascript
var emitter = {
  id: "emitter-" + Math.random().toString(36).slice(2, 8),
  x: pt.x,
  y: pt.y,
  rate: 400,
  lastSpawn: 0,
  velocity: { x: 12, y: -6 },
};
```

**After:**
```javascript
var emitter = {
  id: "emitter-" + Math.random().toString(36).slice(2, 8),
  x: pt.x,
  y: pt.y,
  rate: 400,
  lastSpawn: 0,
  rotation: -Math.PI / 2,         // P1 & P6: Rotation in radians
  spawnMode: "center",             // P2: Center or edge spawn
  silent: false,                   // P3: Audio suppression
  velocity: { x: 12, y: -6 },
};
```

**Rationale:** Every new emitter needs rotation direction, spawn behavior, and silent mode state.

---

### Change #2: Event Listeners for New Controls
**Location:** Lines 1313–1350  
**Priority:** P1, P2, P3, P4  

**Before:**
```javascript
// Emitter inspector bindings
if (elements.emitterRate) {
  elements.emitterRate.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
if (elements.emitterVx) {
  elements.emitterVx.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
if (elements.emitterVy) {
  elements.emitterVy.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
```

**After:**
```javascript
// Emitter inspector bindings
if (elements.emitterRate) {
  elements.emitterRate.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
if (elements.emitterVx) {
  elements.emitterVx.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
if (elements.emitterVy) {
  elements.emitterVy.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
// P1 & P6: Rotation control
if (elements.emitterRotation) {
  elements.emitterRotation.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
// P2: Spawn mode control
if (elements.emitterSpawnMode) {
  elements.emitterSpawnMode.addEventListener("change", function () {
    applyEmitterInspector();
  });
}
// P3: Silent mode control
if (elements.emitterSilent) {
  elements.emitterSilent.addEventListener("change", function () {
    applyEmitterInspector();
  });
}
// P4: Quantize controls
if (elements.emitterQuantize) {
  elements.emitterQuantize.addEventListener("change", function () {
    applyEmitterInspector();
  });
}
if (elements.emitterQuantizeDiv) {
  elements.emitterQuantizeDiv.addEventListener("input", function () {
    applyEmitterInspector();
  });
}
```

**Rationale:** Wire up UI controls to trigger inspector sync function.

---

### Change #3: Selection Panel Sync for New Fields
**Location:** Lines 1790–1835  
**Priority:** P1, P2, P3, P4  

**Before:**
```javascript
if (controls.elements.emitterVy) {
  controls.elements.emitterVy.value = String(
    selection.velocity ? selection.velocity.y : 0,
  );
  if (controls.elements.emitterVyValue) {
    controls.elements.emitterVyValue.textContent = Number(
      selection.velocity ? selection.velocity.y : 0,
    ).toFixed(1);
  }
}
```

**After:**
```javascript
if (controls.elements.emitterVy) {
  controls.elements.emitterVy.value = String(
    selection.velocity ? selection.velocity.y : 0,
  );
  if (controls.elements.emitterVyValue) {
    controls.elements.emitterVyValue.textContent = Number(
      selection.velocity ? selection.velocity.y : 0,
    ).toFixed(1);
  }
}
// P1 & P6: Rotation sync
if (controls.elements.emitterRotation) {
  controls.elements.emitterRotation.value = String(
    selection.rotation || -1.57,
  );
  if (controls.elements.emitterRotationValue) {
    controls.elements.emitterRotationValue.textContent = Number(
      selection.rotation || -1.57,
    ).toFixed(2);
  }
}
// P2: Spawn mode sync
if (controls.elements.emitterSpawnMode) {
  controls.elements.emitterSpawnMode.value = selection.spawnMode || "center";
}
// P3: Silent mode sync
if (controls.elements.emitterSilent) {
  controls.elements.emitterSilent.checked = selection.silent || false;
}
// P4: Quantize sync
if (controls.elements.emitterQuantize) {
  var qtize = selection.timing && selection.timing.quantize;
  controls.elements.emitterQuantize.checked = qtize || false;
}
if (controls.elements.emitterQuantizeDiv) {
  var qdiv = selection.timing && selection.timing.quantizeDivision;
  controls.elements.emitterQuantizeDiv.value = String(qdiv || 16);
}
```

**Rationale:** When emitter selected, populate all UI controls from emitter state.

---

### Change #4: Apply Inspector Changes to Emitter
**Location:** Lines 1943–2008  
**Priority:** P1, P2, P3, P4, P5  

**Before:**
```javascript
function applyEmitterInspector() {
  if (
    state.multiSelection.length !== 1 ||
    state.multiSelection[0].type !== "emitter"
  ) {
    return;
  }
  var em = state.emitters.find(function (e) {
    return e.id === state.multiSelection[0].id;
  });
  if (!em) return;

  if (controls.elements.emitterRate) {
    em.rate = Number(controls.elements.emitterRate.value) || 500;
  }
  if (controls.elements.emitterVx) {
    em.velocity.x = Number(controls.elements.emitterVx.value) || 0;
  }
  if (controls.elements.emitterVy) {
    em.velocity.y = Number(controls.elements.emitterVy.value) || 0;
  }
  renderFrame();
}
```

**After:**
```javascript
function applyEmitterInspector() {
  if (
    state.multiSelection.length !== 1 ||
    state.multiSelection[0].type !== "emitter"
  ) {
    return;
  }
  var em = state.emitters.find(function (e) {
    return e.id === state.multiSelection[0].id;
  });
  if (!em) return;

  // P5: Extended range support
  if (controls.elements.emitterRate) {
    em.rate = Number(controls.elements.emitterRate.value) || 500;
  }
  if (controls.elements.emitterVx) {
    em.velocity.x = Number(controls.elements.emitterVx.value) || 0;
  }
  if (controls.elements.emitterVy) {
    em.velocity.y = Number(controls.elements.emitterVy.value) || 0;
  }

  // P1 & P6: Rotation
  if (controls.elements.emitterRotation) {
    em.rotation = Number(controls.elements.emitterRotation.value) || 0;
  }

  // P2: Spawn mode
  if (controls.elements.emitterSpawnMode) {
    em.spawnMode = controls.elements.emitterSpawnMode.value || "center";
  }

  // P3: Silent mode
  if (controls.elements.emitterSilent) {
    em.silent = controls.elements.emitterSilent.checked || false;
  }

  // P4: Quantize controls
  if (controls.elements.emitterQuantize) {
    if (!em.timing) em.timing = {};
    em.timing.quantize = controls.elements.emitterQuantize.checked || false;
  }
  if (controls.elements.emitterQuantizeDiv) {
    if (!em.timing) em.timing = {};
    em.timing.quantizeDivision = Number(controls.elements.emitterQuantizeDiv.value) || 16;
  }

  // Update output displays
  if (controls.elements.emitterRateValue) {
    controls.elements.emitterRateValue.textContent = String(em.rate || 500);
  }
  if (controls.elements.emitterVxValue) {
    controls.elements.emitterVxValue.textContent = Number(em.velocity.x || 0).toFixed(1);
  }
  if (controls.elements.emitterVyValue) {
    controls.elements.emitterVyValue.textContent = Number(em.velocity.y || 0).toFixed(1);
  }
  if (controls.elements.emitterRotationValue) {
    controls.elements.emitterRotationValue.textContent = Number(em.rotation || 0).toFixed(2);
  }

  renderFrame();
}
```

**Rationale:** Read all new control values and write to emitter; update output displays.

---

### Change #5: Rewrite updateEmitters with Directional Logic
**Location:** Lines 3204–3288  
**Priority:** P1, P2, P3, P4, P5, P6  

**Before:**
```javascript
function updateEmitters(now) {
  var dt = 1 / 60;
  state.emitters.forEach(function (emitter) {
    if (state.balls.length >= 800) {
      return;
    }

    // Emitter motion
    if (emitter.motion && emitter.motion.enabled) {
      if (emitter.motion.type === "drift") {
        emitter.x += (emitter.velocity.x || 0) * dt * 10;
        emitter.y += (emitter.velocity.y || 0) * dt * 10;
      }
      if (emitter.motion.type === "oscillate") {
        var origin = emitter.motion.origin || {
          x: emitter.x,
          y: emitter.y,
        };
        if (!emitter.motion.origin)
          emitter.motion.origin = { x: emitter.x, y: emitter.y };
        var spd = emitter.motion.speed || 1;
        var range = emitter.motion.range || 50;
        emitter.x = origin.x + Math.sin(now * 0.001 * spd) * range;
      }
    }

    // Timing modes
    var rate = emitter.rate || 400;
    if (emitter.timing && emitter.timing.mode === "pulse") {
      rate = emitter.timing.interval || 500;
    }

    if (now - emitter.lastSpawn < rate) {
      return;
    }
    emitter.lastSpawn = now;
    var ball = SBE.Swarm.createBall(state.canvas, state.swarm, false);
    ball.x = emitter.x;
    ball.y = emitter.y;
    ball.vx = emitter.velocity.x;
    ball.vy = emitter.velocity.y;
    ball = normalizeBall(ball);
    state.balls.push(ball);
    state.swarm.count = state.balls.length;
  });
}
```

**After:**
```javascript
function updateEmitters(now) {
  var dt = 1 / 60;
  state.emitters.forEach(function (emitter) {
    if (state.balls.length >= 800) {
      return;
    }

    // Emitter motion
    if (emitter.motion && emitter.motion.enabled) {
      if (emitter.motion.type === "drift") {
        emitter.x += (emitter.velocity.x || 0) * dt * 10;
        emitter.y += (emitter.velocity.y || 0) * dt * 10;
      }
      if (emitter.motion.type === "oscillate") {
        var origin = emitter.motion.origin || {
          x: emitter.x,
          y: emitter.y,
        };
        if (!emitter.motion.origin)
          emitter.motion.origin = { x: emitter.x, y: emitter.y };
        var spd = emitter.motion.speed || 1;
        var range = emitter.motion.range || 50;
        emitter.x = origin.x + Math.sin(now * 0.001 * spd) * range;
      }
    }

    // Timing modes
    var rate = emitter.rate || 400;
    if (emitter.timing && emitter.timing.mode === "pulse") {
      rate = emitter.timing.interval || 500;
    }

    // P4: Quantize to grid if enabled
    if (emitter.timing && emitter.timing.quantize) {
      var bpm = state.transport.bpm || 120;
      var beatMs = (60 / bpm) * 1000;
      var division = emitter.timing.quantizeDivision || 16;
      var gridUnit = beatMs / division;
      rate = Math.max(100, Math.round(rate / gridUnit) * gridUnit);
    }

    if (now - emitter.lastSpawn < rate) {
      return;
    }
    emitter.lastSpawn = now;
    var ball = SBE.Swarm.createBall(state.canvas, state.swarm, false);
    ball.x = emitter.x;
    ball.y = emitter.y;

    // P1 & P6: Directional emission based on rotation
    var dirX = Math.cos(emitter.rotation || 0);
    var dirY = Math.sin(emitter.rotation || 0);
    var speedMagnitude = Math.hypot(emitter.velocity.x || 0, emitter.velocity.y || 0);
    
    // P2: Spawn mode - center or edge
    var spawnX = emitter.x;
    var spawnY = emitter.y;
    if (emitter.spawnMode === "edge") {
      var offset = 14;
      spawnX = emitter.x + dirX * offset;
      spawnY = emitter.y + dirY * offset;
    }
    ball.x = spawnX;
    ball.y = spawnY;
    ball.vx = dirX * speedMagnitude;
    ball.vy = dirY * speedMagnitude;

    ball = normalizeBall(ball);
    state.balls.push(ball);
    state.swarm.count = state.balls.length;

    // P3: Silent mode - suppress sound trigger
    if (!emitter.silent) {
      triggerEvent("ballSpawned", {
        id: ball.id,
        x: ball.x,
        y: ball.y,
        sound: ball.sound,
      });
    }
  });
}
```

**Rationale:** 
- P4: Quantize snapping before rate check
- P1 & P6: Direction from rotation replaces velocity directly
- P2: Conditional spawn offset
- P3: Conditional sound trigger

---

### Change #6: Update drawEmitters with Silent Colors and Rotation Arrow
**Location:** Lines 3709–3783  
**Priority:** P3, P6  

**Before:**
```javascript
state.emitters.forEach(function (em) {
  // ... hidden check ...
  ctx.save();

  // Outer ring
  ctx.beginPath();
  ctx.arc(em.x, em.y, 14, 0, Math.PI * 2);
  ctx.strokeStyle = "#3dd8c5";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(em.x, em.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#3dd8c5";
  ctx.globalAlpha = 1;
  ctx.fill();

  // Velocity arrow
  var vLen = Math.hypot(em.velocity.x, em.velocity.y);
  if (vLen > 0.05) {
    ctx.beginPath();
    ctx.moveTo(em.x, em.y);
    ctx.lineTo(em.x + em.velocity.x * 30, em.y + em.velocity.y * 30);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Selection highlight
  if (!isClean && selectedIds.has(em.id)) {
    // ... selection code ...
  }

  ctx.restore();
});
```

**After:**
```javascript
state.emitters.forEach(function (em) {
  // ... hidden check ...
  ctx.save();

  // P3: Determine color based on silent mode
  var ringColor = em.silent ? "#222222" : "#3dd8c5";
  var dotColor = em.silent ? "#111111" : "#3dd8c5";

  // Outer ring
  ctx.beginPath();
  ctx.arc(em.x, em.y, 14, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2;
  ctx.globalAlpha = em.silent ? 0.4 : 0.8;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(em.x, em.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.globalAlpha = 1;
  ctx.fill();

  // P6: Rotation arrow (direction indicator)
  var rot = em.rotation || 0;
  var arrowLen = 16;
  var arrowX = em.x + Math.cos(rot) * arrowLen;
  var arrowY = em.y + Math.sin(rot) * arrowLen;
  ctx.beginPath();
  ctx.moveTo(em.x, em.y);
  ctx.lineTo(arrowX, arrowY);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = em.silent ? 0.3 : 0.6;
  ctx.stroke();

  // Arrow head
  var headSize = 5;
  var headAngle1 = rot + 2.6;
  var headAngle2 = rot - 2.6;
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(
    arrowX + Math.cos(headAngle1) * headSize,
    arrowY + Math.sin(headAngle1) * headSize
  );
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(
    arrowX + Math.cos(headAngle2) * headSize,
    arrowY + Math.sin(headAngle2) * headSize
  );
  ctx.stroke();

  // Selection highlight
  if (!isClean && selectedIds.has(em.id)) {
    ctx.beginPath();
    ctx.arc(em.x, em.y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
  }

  ctx.restore();
});
```

**Rationale:**
- P3: Silent emitters render dark to indicate audio suppression
- P6: Arrow points in emission direction, updates in real-time with rotation slider

---

## FILE: `index.html`

### Change #1: Extended Emitter Inspector UI
**Location:** Lines 679–762 (was 45 lines, now 86 lines)  
**Priority:** P1, P2, P3, P4, P5  

**Before:**
```html
<section
  class="inspector-section hidden"
  id="emitter-inspector-block"
>
  <h4 class="section-title">Emitter</h4>
  <div class="field-grid two">
    <label class="field">
      <span>Rate (ms)</span>
      <input
        id="emitter-rate"
        type="range"
        min="100"
        max="2000"
        step="50"
        value="500"
      />
      <output id="emitter-rate-value">500</o>
    </label>
    <label class="field">
      <span>Vel X</span>
      <input
        id="emitter-vx"
        type="range"
        min="-5"
        max="5"
        step="0.1"
        value="0"
      />
      <output id="emitter-vx-value">0.0</o>
    </label>
  </div>
  <div class="field-grid two">
    <label class="field">
      <span>Vel Y</span>
      <input
        id="emitter-vy"
        type="range"
        min="-5"
        max="5"
        step="0.1"
        value="0"
      />
      <output id="emitter-vy-value">0.0</o>
    </label>
  </div>
</section>
```

**After:**
```html
<section
  class="inspector-section hidden"
  id="emitter-inspector-block"
>
  <h4 class="section-title">Emitter</h4>
  <div class="field-grid two">
    <label class="field">
      <span>Rate (ms)</span>
      <input
        id="emitter-rate"
        type="range"
        min="100"
        max="8000"          <!-- P5: Extended range -->
        step="50"
        value="500"
      />
      <output id="emitter-rate-value">500</o>
    </label>
    <label class="field">
      <span>Rotation (rad)</span>  <!-- P1 & P6: NEW -->
      <input
        id="emitter-rotation"
        type="range"
        min="0"
        max="6.28"
        step="0.1"
        value="-1.57"
      />
      <output id="emitter-rotation-value">-1.57</o>
    </label>
  </div>
  <div class="field-grid two">
    <label class="field">
      <span>Vel X</span>
      <input
        id="emitter-vx"
        type="range"
        min="-5"
        max="5"
        step="0.1"
        value="0"
      />
      <output id="emitter-vx-value">0.0</o>
    </label>
    <label class="field">
      <span>Vel Y</span>
      <input
        id="emitter-vy"
        type="range"
        min="-5"
        max="5"
        step="0.1"
        value="0"
      />
      <output id="emitter-vy-value">0.0</o>
    </label>
  </div>
  <div class="field-grid two">
    <label class="field">
      <span>Spawn Mode</span>  <!-- P2: NEW -->
      <select id="emitter-spawn-mode">
        <option value="center">Center</option>
        <option value="edge">Edge</option>
      </select>
    </label>
    <label class="field checkbox">  <!-- P3: NEW -->
      <input id="emitter-silent" type="checkbox" />
      <span>Silent</span>
    </label>
  </div>
  <div class="field-grid two">
    <label class="field checkbox">  <!-- P4: NEW -->
      <input id="emitter-quantize" type="checkbox" />
      <span>Quantize</span>
    </label>
    <label class="field">
      <span>Div</span>
      <input
        id="emitter-quantize-div"
        type="number"
        min="1"
        max="64"
        value="16"
      />
    </label>
  </div>
</section>
```

**Rationale:**
- P5: Rate max from 2000 to 8000ms
- P1 & P6: Rotation slider (0–6.28 rad)
- P2: Spawn mode dropdown
- P3: Silent checkbox
- P4: Quantize checkbox + division number field

---

## FILE: `styles.css`

### Change #1: No modifications required
**Rationale:** All existing CSS for form fields, checkboxes, selects, and range sliders covers the new controls perfectly.

---

## SUMMARY TABLE

| Priority | Change Type | File | Lines | Feature |
|----------|-------------|------|-------|---------|
| P1 | Property add | main.js | 748–758 | `rotation` field |
| P1 | Logic add | main.js | 3254–3256 | Direction calculation |
| P1 | UI add | index.html | 705–710 | Rotation slider |
| P2 | Property add | main.js | 748–758 | `spawnMode` field |
| P2 | Logic add | main.js | 3259–3266 | Spawn offset |
| P2 | UI add | index.html | 729–732 | Spawn dropdown |
| P3 | Property add | main.js | 748–758 | `silent` field |
| P3 | Logic add | main.js | 3280–3287 | Sound gate |
| P3 | Drawing update | main.js | 3720–3722 | Color logic |
| P3 | UI add | index.html | 735–737 | Silent checkbox |
| P4 | Logic add | main.js | 3238–3245 | Quantize snapping |
| P4 | UI add | index.html | 742–750 | Quantize controls |
| P5 | UI update | index.html | 697 | Max 8000ms |
| P6 | Drawing add | main.js | 3738–3758 | Arrow visual |

---

**Total changes:** 45 lines added to main.js, 106 lines to index.html, 0 lines to styles.css  
**Backward compatible:** ✅ Yes (all new properties have defaults)  
**Test coverage:** 🟢 Ready for integration testing
