# 0430_WOS_AudioCoreExtraction_v1.0.0.md

**Date:** 04/30/2026
**System:** Wall of Sound (WOS)
**Domain:** Audio Engine
**Component:** Core Extraction (In-Place)
**Status:** Stable (Non-Breaking Refactor)

---

# 🧠 PURPOSE

Formalize the extraction of WOS audio logic from a monolithic handler into **discrete, testable functions**—without changing behavior.

This is a **structural milestone**, not a feature upgrade.

---

# 🎯 GOALS

- Isolate audio responsibilities into named functions
- Preserve 100% existing behavior
- Prepare system for future modular extraction
- Reduce cognitive load inside `oscillatorOutput.handle()`

---

# 🧱 CURRENT ARCHITECTURE (POST-EXTRACTION)

```text
handle()
  → resolveNoteAndSample()
  → computeVelocityGain()
    → computeDensityFactor()
  → playback
```

---

# 🧩 CORE FUNCTIONS

---

## 1. `resolveNoteAndSample(sourceObject)`

### Responsibility

Full resolution pipeline:

```text
note → quantize → solo gate → sample lookup → fallback → intelligent selection
```

---

### Input

```js
{
  sourceObject: {
    sound: {
      midi: {
        note: Number,
        velocity: Number
      }
    }
  }
}
```

---

### Output

```js
{
  (note, noteClass, resolvedClass, result); // AudioBuffer | AudioBuffer[]
}
```

OR

```js
null; // if no valid sample found
```

---

### Rules

- MUST handle fallback (±6 semitones)
- MUST preserve existing bank modes:
  - single
  - roundRobin
  - random
  - stack

- MUST contain all `state.sampleBanks` mutation
- MUST gate intelligent sampling via:

```js
state.audio.intelligentSampling === true;
```

---

### Notes

This function defines:

> **What sound is selected**

---

## 2. `computeDensityFactor(densityLevel, profile)`

### Responsibility

Translate system density into a gain multiplier.

---

### Input

```js
densityLevel: "low" | "mid" | "high";
profile: CHANNEL_PROFILES[channel];
```

---

### Output

```js
Number (0–1)
```

---

### Logic

```js
low  → 0
mid  → 0.15
high → 0.30

factor = 1 - (weight * profile.densitySensitivity)
```

---

### Rules

- MUST be pure (no state access)
- MUST NOT clamp (handled upstream)
- MUST NOT mutate anything

---

### Notes

This function defines:

> **How the environment affects sound**

---

## 3. `computeVelocityGain(velocity, profile, densityLevel)`

### Responsibility

Compute final gain from:

- velocity
- perceptual curve
- soft-knee
- channel voicing
- density

---

### Input

```js
velocity: Number (0–127)
profile: CHANNEL_PROFILES[channel]
densityLevel: "low" | "mid" | "high"
```

---

### Output

```js
Number (0–1)
```

---

### Logic

```js
normalized = velocity / 127

shaped  = pow(normalized, profile.velocityCurve)
boosted = normalized * 0.25

curved = max(shaped, boosted)

densityFactor = computeDensityFactor(...)

gain = (0.2 + curved * 0.8)
gain *= profile.gainScale
gain *= densityFactor

return clamp(gain, 0, 1)
```

---

### Rules

- MUST call `computeDensityFactor`
- MUST clamp final value
- MUST preserve 0.2 floor
- MUST remain deterministic

---

### Notes

This function defines:

> **How loud the sound should be**

---

# 🎛️ ORCHESTRATOR

## `oscillatorOutput.handle()`

### Responsibility

High-level routing only:

```text
resolve → compute → play
```

---

### Allowed Logic

- pitch calculation:

```js
pitch = Math.pow(2, (note - root) / 12);
```

- destructuring results
- debug logging
- calling `playSampleBuffer`

---

### Forbidden Logic

- ❌ sample selection logic
- ❌ velocity shaping logic
- ❌ density math
- ❌ channel voicing math

---

### Design Rule

> `handle()` must remain readable top-to-bottom in < 10 seconds

---

# 🧬 SYSTEM BOUNDARIES

| Function             | Owns                    | Must NOT Do    |
| -------------------- | ----------------------- | -------------- |
| resolveNoteAndSample | note + sample selection | gain logic     |
| computeVelocityGain  | gain shaping            | sample logic   |
| computeDensityFactor | density math            | state mutation |
| handle               | orchestration           | core logic     |

---

# 🔒 INVARIANTS

- No behavior changes from pre-extraction system
- Event → sound pipeline remains identical
- All randomness remains where originally defined
- All state mutations remain localized

---

# 🧪 TEST CASES

## 1. Low Velocity

- velocity < 20
- Result: audible but soft
- Sample: first sample

## 2. Mid Velocity

- velocity 50–70
- Result: controlled variation
- Sample: round robin

## 3. High Velocity

- velocity > 100
- Result: strong, expressive
- Sample: full bank behavior

## 4. High Density

- collisionCount high
- Result: reduced gain, no stack

---

# 🚀 FUTURE EXTRACTION PATH

Next step (when ready):

```text
/audio/core/
  velocity.js
  density.js
  sampling.js
```

Then:

```js
import { computeVelocityGain } from "./audio/core/velocity";
```

---

# 🚫 NON-GOALS

- No file splitting (yet)
- No async refactor
- No UI integration
- No new sound features

---

# 🧠 DESIGN PRINCIPLE

> Extraction without mutation

You are not changing behavior.
You are revealing structure.

---

# 🏁 SUMMARY

This extraction transforms:

```text
monolithic audio handler
```

into:

```text
modular audio pipeline
```

Without breaking a single feature.

---

# Implementation Guide

- **Where:** directly above `oscillatorOutput` in `main.js`
- **What to run:** collision + walker + emitter test across velocity ranges
- **What to expect:** identical sound, cleaner structure, easier iteration
