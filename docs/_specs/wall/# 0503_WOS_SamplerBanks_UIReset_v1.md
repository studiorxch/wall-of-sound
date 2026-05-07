# 0503_WOS_SamplerBanks_UIReset_v1.0.0

## 🎯 Objective

Replace the legacy **note meter / note grid UI** with a **bank-based sampler UI**.

New system:

- fixed number of **empty banks (16)**
- banks hold samples (not notes)
- banks visually indicate:
  - empty vs filled
- a **single active color swatch** controls note assignment for new objects

---

## 🧠 Core Model

### Before (REMOVE)

- note grid ("skittles")
- per-note sample mapping UI
- note meter display

### After (NEW)

```text
[ Bank 01 ] [ Bank 02 ] ... [ Bank 16 ]

(visual state: empty / filled)

[ Active Color Swatch ]
🧱 State

Add:

state.banks = Array.from({ length: 16 }, (_, i) => ({
  id: `bank_${i}`,
  samples: [],     // array of AudioBuffers or sample refs
  color: null      // assigned color (optional)
}));

state.activeBankId = "bank_0";

state.activeColor = "#ff4d4d"; // current drawing color
🎛️ Bank Behavior
Empty Bank
bank.samples.length === 0
Filled Bank
bank.samples.length > 0
🎨 UI Rendering
Bank Grid
16 square cells
no text labels (remove note letters)
minimal design
Visual States
Empty
low opacity
thin border
Filled
brighter
subtle glow or fill
const isFilled = bank.samples.length > 0;

ctx.globalAlpha = isFilled ? 1.0 : 0.2;
Active Bank
if (bank.id === state.activeBankId) {
  drawHighlightOutline(bank);
}
🖱️ Interaction
Select Bank
onClick(bank):
  state.activeBankId = bank.id
Assign Sample (existing drop logic)

When dropping audio:

const bank = getActiveBank();
bank.samples.push(decodedBuffer);
🎨 Active Color Swatch
State
state.activeColor = "#ff4d4d";
UI
single circular swatch
positioned below bank grid
Behavior
clicking swatch → opens color picker
selected color becomes:
stroke.color = state.activeColor;
🎯 Color ↔ Note Mapping

Important:

color still maps to note
BUT:
notes are no longer UI-visible
mapping is internal only
function colorToNote(color) {
  return hashColorToMidi(color); // existing logic
}
🔥 Key Change

Banks hold samples
Color controls pitch (note)
Notes are NOT UI objects anymore

🚫 Remove Completely
note grid UI
note labels (C, D, E…)
note meter visualization
per-note sample drop targets
⚠️ Constraints
DO
keep UI minimal
prioritize clarity of filled vs empty
maintain existing audio routing
DO NOT
reintroduce note-based UI
mix bank + note concepts visually
attach banks to MIDI directly
🧪 Test
Load app
See 16 empty banks
Drop sample → bank becomes filled
Select bank
Draw stroke → uses:
bank samples
active color → pitch
✅ Expected Result
clear bank-based workflow
no note confusion
faster mental model
cleaner UI
🚀 Implementation Guide
where
UI panel (replace note grid)
state initialization
drop handler (route to active bank)
what to run
load → drop samples → select bank → draw
what to expect
immediate clarity
simplified workflow
correct audio behavior

---

# 🧠 Why this is the right move

You’re fixing a **conceptual mismatch**:

### Old system
- UI showed notes
- but behavior was sample-driven

### New system
- UI shows **what actually matters**
  - sample containers (banks)
  - pitch control (color)

---

# 🔥 What this unlocks next

Once this is stable:

- multi-sample banks (round robin / stack)
- bank presets
- MIDI → bank routing (cleaner now)

---

# 🚀 Quick Implementation Notes (real-world)

- Don’t delete old note system immediately—just **hide UI first**
- Keep `sampleMap` working under the hood until fully replaced
- Start visual-only → then refactor logic
```
