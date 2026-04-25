0409_WALL_OF_SOUND_GravityChoir_Translation_v1.0.0
Generated: 04/09/2026

---

## Assumptions

- You want translation → system, not inspiration only
- Must map cleanly into:
  - ShapeSystem (Monoliths)
  - Swarm / Balls (Orbitals)
  - Collision + Behavior (forces)
- No rewrite of core engine — only layered mechanics
- Audio still follows:
  interaction → event → sound

---

# SYSTEM EXTRACTION (FROM GEMINI)

Core Mapping

Concept → Engine Mapping
Monolith → Shape (non-colliding, force emitter)
Orbital → Ball / agent
Flux Field → Global modifier (velocity damping)
Orbit → Emergent path

---

# MINIMUM IMPLEMENTATION

## Monolith = Gravitational Shape

type ShapeBehavior =
| "none"
| "attract"
| "repel"
| "orbit_gravity";

function applyGravity(ball, monolith) {
const dx = monolith.position.x - ball.x;
const dy = monolith.position.y - ball.y;

const distSq = dx _ dx + dy _ dy;
const dist = Math.sqrt(distSq);

if (dist < 1) return;

const force = monolith.strength / distSq;

ball.vx += (dx / dist) _ force;
ball.vy += (dy / dist) _ force;
}

---

## Orbital Stability Detection

function getOrbitStability(ball, monolith) {
const dx = ball.x - monolith.position.x;
const dy = ball.y - monolith.position.y;

const radialVelocity =
(ball.vx _ dx + ball.vy _ dy) / Math.sqrt(dx _ dx + dy _ dy);

return Math.abs(radialVelocity);
}

---

## Sound Mapping

function mapOrbitToSound(ball, monolith) {
const dx = ball.x - monolith.position.x;
const dy = ball.y - monolith.position.y;
const dist = Math.sqrt(dx _ dx + dy _ dy);

const pitch = 1 / Math.max(dist, 0.001);
const stability = getOrbitStability(ball, monolith);

const timbre = Math.min(stability \* 5, 1);

return { pitch, timbre };
}

---

# VISUAL RULES

- Stable orbit → clean circular trail
- Unstable orbit → chaotic path
- Velocity → color shift

---

# NON-OBVIOUS MECHANIC

System naturally destabilizes:

- orbitals influence each other
- perfect harmony collapses over time

Chaos = musical climax
