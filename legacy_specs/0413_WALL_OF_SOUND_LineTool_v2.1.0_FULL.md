# 0413_WALL_OF_SOUND_LineTool_v2.1.0

## 🧠 Assumptions

- Canvas-based 2D interaction system
- Existing render loop (`renderFrame`)
- Global `state` object
- Mouse + keyboard input system available
- Collision system already exists for shapes/balls
- Sound mapping handled via color (NOT in this spec)

---

# 🎯 Objective

Implement a precision-first Line Tool: - Two-click creation (Point A →
Point B) - Angle snapping (SHIFT / ALT+SHIFT) - Length input (typed
values) - Grouping support for reusable structures

---

# 📐 Data Model

```js
type Line = {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  length: number;
  angle: number;
  isStatic: boolean;
  restitution: number;
  friction: number;
  stroke: string;
  strokeWidth: number;
  groupId?: string;
};
```

---

# 🧱 State

```js
state.lines = [];
state.lineGroups = [];

state.currentTool = "line";

state.lineTool = {
  step: 0,
  startPoint: null,
  lengthInput: "",
  isTyping: false,
};
```

---

# 🖱️ Core Interaction

```js
function onCanvasClick(x, y) {
  if (state.currentTool !== "line") return;

  const tool = state.lineTool;

  if (tool.step === 0) {
    tool.startPoint = { x, y };
    tool.step = 1;
    return;
  }

  if (tool.step === 1) {
    const finalPoint = getFinalPoint(tool.startPoint, { x, y }, input);

    createLine(tool.startPoint, finalPoint);

    tool.step = 0;
    tool.startPoint = null;
    tool.lengthInput = "";
    tool.isTyping = false;

    renderFrame();
  }
}
```

---

# 🧱 Line Creation

```js
function createLine(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const line = {
    id: generateId(),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    length: Math.sqrt(dx * dx + dy * dy),
    angle: Math.atan2(dy, dx),
    isStatic: true,
    restitution: 0.8,
    friction: 0.2,
    stroke: "#ffffff",
    strokeWidth: 2,
  };

  state.lines.push(line);
}
```

---

# 📐 Angle Snapping

```js
const SNAP_ANGLE = Math.PI / 12;
const FINE_SNAP_ANGLE = Math.PI / 36;

function getSnappedPoint(start, current, isSnap, isFineSnap) {
  if (!isSnap) return current;

  const dx = current.x - start.x;
  const dy = current.y - start.y;

  const angle = Math.atan2(dy, dx);
  const length = Math.sqrt(dx * dx + dy * dy);

  const inc = isFineSnap ? FINE_SNAP_ANGLE : SNAP_ANGLE;
  const snappedAngle = Math.round(angle / inc) * inc;

  return {
    x: start.x + Math.cos(snappedAngle) * length,
    y: start.y + Math.sin(snappedAngle) * length,
  };
}
```

---

# 📏 Length Input

```js
function onKeyDown(e) {
  const tool = state.lineTool;

  if (state.currentTool !== "line") return;
  if (tool.step !== 1) return;

  if (!isNaN(e.key)) {
    tool.isTyping = true;
    tool.lengthInput += e.key;
    return;
  }

  if (e.key === ".") {
    tool.lengthInput += ".";
    return;
  }

  if (e.key === "Backspace") {
    tool.lengthInput = tool.lengthInput.slice(0, -1);
    return;
  }

  if (e.key === "Enter") {
    finalizeLineWithLength();
  }

  if (e.key === "Escape") {
    tool.lengthInput = "";
    tool.isTyping = false;
  }
}
```

---

# 📏 Length Constraint

```js
function applyLengthConstraint(start, current, lengthValue) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;

  const angle = Math.atan2(dy, dx);

  return {
    x: start.x + Math.cos(angle) * lengthValue,
    y: start.y + Math.sin(angle) * lengthValue,
  };
}
```

---

# 🧠 Combined Logic

```js
function getFinalPoint(start, current, input) {
  let point = current;

  point = getSnappedPoint(
    start,
    point,
    input.shiftKey,
    input.shiftKey && input.altKey,
  );

  const tool = state.lineTool;
  if (tool.isTyping && tool.lengthInput) {
    const length = parseFloat(tool.lengthInput);
    if (!isNaN(length)) {
      point = applyLengthConstraint(start, point, length);
    }
  }

  return point;
}
```

---

# 🎯 Visual Feedback

```js
function drawLinePreview(ctx, mouseX, mouseY) {
  const tool = state.lineTool;

  if (tool.step !== 1 || !tool.startPoint) return;

  const end = getFinalPoint(tool.startPoint, { x: mouseX, y: mouseY }, input);

  ctx.beginPath();
  ctx.moveTo(tool.startPoint.x, tool.startPoint.y);
  ctx.lineTo(end.x, end.y);

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  ctx.stroke();
  ctx.setLineDash([]);
}
```

---

# 🧩 Line Groups

```js
function createLineGroup(name, selectedLineIds) {
  const lines = state.lines.filter((l) => selectedLineIds.includes(l.id));

  const group = {
    id: generateId(),
    name,
    lines: JSON.parse(JSON.stringify(lines)),
  };

  state.lineGroups.push(group);
}
```

```js
function spawnLineGroup(groupId, offsetX, offsetY) {
  const group = state.lineGroups.find((g) => g.id === groupId);
  if (!group) return;

  const newLines = group.lines.map((line) => ({
    ...line,
    id: generateId(),
    x1: line.x1 + offsetX,
    y1: line.y1 + offsetY,
    x2: line.x2 + offsetX,
    y2: line.y2 + offsetY,
  }));

  state.lines.push(...newLines);
}
```

---

# ⚙️ Collision Hook

```js
function resolveBallLineCollision(ball, line) {
  // reflect velocity using line normal
}
```

---

# 🚫 Non-Goals

- No polylines
- No curves
- No drag drawing
- No auto connections

---

# ⚡ Implementation Guide

- where: input handler + render loop + collision system
- run: click A → move → SHIFT/length → click B or ENTER
- expect: precise, repeatable geometry for rhythm design
