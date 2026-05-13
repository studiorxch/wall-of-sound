0430_WOS_ChannelVoicingSystem_v1.0.0
Version: 1.0.0
Date: 2026-05-01
System: WOS Audio Engine
Component: Channel Routing / Voicing
Status: DRAFT

---

# 🎯 PURPOSE

Introduce structured channel-based voicing to the WOS system.

Goal:
Separate sound roles (percussion, melodic, ambient)
without increasing complexity in the event system.

---

# 🧠 DESIGN PRINCIPLE

Events remain simple.

Voicing is applied AFTER event emission.

---

# 🔩 CURRENT STATE

Event system already outputs:

event.type
event.channel
event.energy

Mapped through:

CHANNEL_MAP → MIDI channel

---

# ⚠️ LIMITATION

All sounds currently behave similarly:

- Same gain logic
- Same sample resolution
- No role separation

---

# ✅ SOLUTION — CHANNEL VOICING LAYER

Introduce per-channel behavior shaping.

---

# 🧱 CHANNEL DEFINITIONS

```js
const CHANNEL_PROFILES = {
  default: {
    gainScale: 1.0,
    velocityCurve: 1.5,
    allowStack: true,
    densitySensitivity: 1.0,
  },

  percussion: {
    gainScale: 1.2,
    velocityCurve: 1.2,
    allowStack: false,
    densitySensitivity: 1.4,
  },

  melodic: {
    gainScale: 0.9,
    velocityCurve: 1.6,
    allowStack: true,
    densitySensitivity: 0.8,
  },

  ambient: {
    gainScale: 0.6,
    velocityCurve: 2.0,
    allowStack: true,
    densitySensitivity: 0.5,
  },
};
```
