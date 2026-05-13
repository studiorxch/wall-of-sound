# 0429_WOS_DeltaDuplicateSystem_v1.0.0

Goal:
Replace static offset duplication with **delta-based duplication**
that repeats last transform (move / rotate / scale).

---

## 1. Add duplication delta state

```js
state.duplication = {
  dx: 0,
  dy: 0,
  rotation: 0,
  scale: 1,
  valid: false,
};
```

---

## 2. Capture delta AFTER transform ends

On pointerup (end of move/rotate/scale):

```js
function recordDuplicationDelta(before, after) {
  state.duplication.dx = after.x - before.x;
  state.duplication.dy = after.y - before.y;

  state.duplication.rotation = after.rotation - before.rotation;
  state.duplication.scale = after.scale / before.scale;

  state.duplication.valid = true;
}
```

Call this inside transform end handler.

---

## 3. Modify duplicate behavior

Replace fixed offset logic.

```js
function duplicateWithDelta(targets) {
  if (!state.duplication.valid) {
    return duplicateWithDefaultOffset(targets);
  }

  const copies = [];

  targets.forEach((obj) => {
    const copy = clone(obj);

    // apply position delta
    moveStroke(copy, state.duplication.dx, state.duplication.dy);

    // apply rotation delta
    rotateStroke(copy, centerX, centerY, state.duplication.rotation);

    // apply scale delta
    scaleStroke(copy, center, state.duplication.scale);

    copies.push(copy);
  });

  return copies;
}
```

---

## 4. CRITICAL — chain from last duplicate

After duplication:

```js
state.selection = newlyCreatedObjects;
```

This ensures:

```text
A → B → C → D (not A → B, A → B, A → B)
```

---

## 5. Reset delta on new selection

```js
function clearDuplicationDelta() {
  state.duplication.valid = false;
}
```

Trigger when:

- new object drawn
- selection changed manually
- group created

---

## 6. Optional (recommended)

Visual hint:

- show ghost preview of next duplicate

---

# RESULT

User can:

• build grids without pattern tool
• build stars via rotation
• build spirals via move+rotate
• never guess spacing again

System becomes:
👉 interaction-driven replication engine
