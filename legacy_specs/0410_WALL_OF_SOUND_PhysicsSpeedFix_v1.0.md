0410_WALL_OF_SOUND_PhysicsSpeedFix_v1.0.0

We already switched to real-time dt, but motion is still too slow.

Root issue:
Velocity was originally tuned for per-frame motion, but now uses dt (seconds), causing extremely small displacement.

Make the following exact changes:

1. In tick(), replace position integration:

FROM:
ball.x += ball.vx * dt;
ball.y += ball.vy * dt;

TO:
const MOTION_SCALE = 60;
ball.x += ball.vx * dt * MOTION_SCALE;
ball.y += ball.vy * dt * MOTION_SCALE;

2. Reduce damping:

FROM:
damping: 0.9999

TO:
damping: 0.996

3. Increase emitter default velocity:

FROM:
velocity: { x: 3, y: -2 }

TO:
velocity: { x: 12, y: -6 }

Do not modify:
- collision system
- emitter timing
- world mode logic

Goal:
Restore responsive, fast motion while keeping dt-based simulation.