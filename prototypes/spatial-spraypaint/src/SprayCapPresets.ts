export type SprayCapId =
  | "new-york-fat"
  | "pink-dot-fat"
  | "astro-fat"
  | "german-fat"
  | "lego-thin"
  | "universal-thin"
  | "level-1"
  | "new-york-thin"
  | "calligraphy"
  | "transversal-slot"
  | "needle"
  | "wiggly-needle"
  | "soft-fade"
  | "fuzz-fat"
  | "ring-donut"
  | "dry-streak";

export type SprayCapFamily = "fat" | "thin" | "specialty";
export type EndpointBehavior = "settled" | "tapered" | "punchy" | "raw";

export interface SprayCapPreset {
  id: SprayCapId;
  name: string;
  family: SprayCapFamily;
  baseRadius: number;
  coreDensity: number;
  coreOpacity: number;
  edgeFalloff: number;
  particleCount: number;
  particleSpread: number;
  particleSize: number;
  particleOpacity: number;
  flowRate: number;
  accumulationRate: number;
  velocityResponse: number;
  jitter: number;
  endpointBehavior: EndpointBehavior;
  splatterProbability: number;
  dripTendency: number;
  anisotropy: number;
  /**
   * Relative multiplier of the resolved deposition radius for a soft outer
   * "halo" ring drawn beneath the core (see `SprayBrushEngine.renderHalo`).
   * 0 means no halo layer at all — most caps. Distinct from overspray
   * particles: a continuous soft radial field, not speckle, so a "loaded
   * dot" cap (Pink Dot) reads as a recognizable core+halo bloom rather than
   * a blurred fat dot.
   */
  haloRadius: number;
  /** Peak per-draw alpha of the halo layer above. 0 disables it. */
  haloOpacity: number;
  /**
   * Relative multiplier of the resolved deposition radius for a deterministic
   * lateral oscillation applied to the drawn path (see
   * `SprayBrushEngine.renderSegment`). 0 means no wiggle — every cap except
   * the dedicated `wiggly-needle` specialty identity. Kept separate from
   * `jitter`, which is per-draw-call random noise, not a smooth path wander.
   */
  wiggleAmplitude: number;
  /** Oscillation rate against `StrokePoint.timestamp` (radians/ms). 0 when wiggleAmplitude is 0. */
  wiggleFrequency: number;
  /**
   * How the core deposits itself. "line" is every existing cap's original
   * mechanism (a width-modulated stroked line — see `SprayBrushEngine`).
   * "oval"/"slot" stamp a genuinely elongated, fixed-orientation shape
   * (ellipse or rounded rectangle) repeatedly along the path instead, so a
   * directional cap's wide/narrow response falls out of real shape geometry
   * rather than a line-width trick. "ring" stamps a genuine annular gradient
   * (see `SprayBrushEngine.resolveRingProfile`) instead of a filled core.
   * "streak" replaces the concentric-pass core entirely with a deterministic
   * multi-lane, gap-gated core (see `SprayBrushEngine.resolveStreakGate`).
   * "plume" (Pink Dot Fat only) replaces the concentric-pass LINE core with a
   * unified, dab-spaced center+ring+mist STAMP resolved as one coherent state
   * by `SprayBrushEngine.resolvePinkDotPlume` — core, ring, and mist share the
   * same distance/angle/velocity response and the same deposit spacing,
   * instead of a generic core stroke with an independently-timed halo layered
   * on top (see the `plume*` fields below).
   */
  depositionShape: "line" | "oval" | "slot" | "ring" | "streak" | "plume";
  /**
   * Brush Studio's PRESET DEFAULT for the Fill-mode property. Every current
   * cap keeps this false — Fill mode's own opt-in-per-stroke behavior
   * (SprayBrushEngine's fillLocalSaturation ceiling) is completely unchanged;
   * this only changes what a freshly-selected brush's Fill toggle starts at.
   * A future fill-oriented cap could set this true without touching the fill
   * engine itself. See BrushProperties.resolveEffectiveSprayStyle.
   */
  defaultFillMode: boolean;
  /**
   * Ring/Donut archetype fields (see `SprayBrushEngine.resolveRingProfile`).
   * All 0 except on `depositionShape: "ring"` caps. `ringRadius`/
   * `ringThickness` are multipliers of the resolved deposition radius;
   * `ringOpacity` is the peak alpha at the annular band; `centerOpacity` is
   * the faint alpha at dead center — deliberately LOWER than `ringOpacity`,
   * the defining "hollow" structure this archetype targets.
   */
  ringRadius: number;
  ringThickness: number;
  ringOpacity: number;
  centerOpacity: number;
  /**
   * Dry/Streak archetype field (see `SprayBrushEngine.resolveStreakGate`).
   * Number of parallel deterministic lanes; 0 on every cap except
   * `depositionShape: "streak"` ones. Each lane's visibility gates on/off
   * along the travel direction via a fixed, position-derived formula — no
   * `Math.random()` involved, so the gap pattern replays identically.
   */
  streakLanes: number;
  /**
   * Pink Dot Fat correction fields (see `SprayBrushEngine.renderHalo` and its
   * `resolveHalo*` helpers). All 0 on every cap without a halo (`haloRadius`
   * 0), and 0 is always a safe/neutral value even on a halo cap — each field
   * independently reduces to the ORIGINAL pre-correction halo behavior at 0.
   *
   * `haloDistanceGain` — how strongly the resolved size (the live Size
   * control, session-adjustable, already live-previewed in Brush Studio) as a
   * ratio of the cap's own `baseRadius` scales halo radius/opacity. 0 = halo
   * strength is constant regardless of size (legacy). >0 = a small
   * resolved size (proxy for spraying close to the wall) suppresses the halo
   * toward a clean hot dot/line, while a large resolved size (proxy for
   * pulling back) amplifies it toward a pronounced center+halo bloom.
   */
  haloDistanceGain: number;
  /**
   * `haloFlareAnisotropy` — 0 = the halo is always a perfect circle
   * (legacy). >0 = at higher point velocity the halo elongates into an
   * ellipse along the travel direction (an oblique-spray flare), while a
   * stationary dwell (near-zero velocity) still renders circular regardless
   * of this value.
   */
  haloFlareAnisotropy: number;
  /**
   * `haloDabSpacing` — 0 = the halo is drawn at every segment endpoint along
   * a path, same as every other continuous-line mechanism in this engine
   * (legacy). >0 = a multiplier of the resolved radius; while a segment has
   * real travel distance, halo draws are gated until that much distance has
   * accumulated since the last one, producing discrete overlapping dabs
   * along a moving stroke instead of one continuous smeared bar. A true
   * dwell (repeated zero-distance points at the same spot) is NEVER gated by
   * this — it always draws, preserving the existing "dwell strengthens the
   * halo" behavior untouched.
   */
  haloDabSpacing: number;
  /**
   * `haloRingBias` — 0 = a single smooth alpha-to-zero radial fade (legacy).
   * >0 = the gradient gains a soft moat then a brighter outer band, so a
   * large resolved halo reads as a genuine center-plus-ring bloom instead of
   * a single continuous glow. The core disc underneath stays fully opaque
   * regardless — this never creates a hollow center, keeping Pink Dot
   * structurally distinct from Ring/Donut's genuinely hollow annular core.
   *
   * NOTE: as of the Pink Dot unified-plume build, `haloRadius`/`haloOpacity`/
   * `haloDistanceGain`/`haloFlareAnisotropy`/`haloDabSpacing`/`haloRingBias`
   * are 0 on EVERY cap including Pink Dot Fat, which now uses the dedicated
   * `depositionShape: "plume"` mechanism below instead (core+ring+mist drawn
   * from one resolved state, not a generic core stroke plus a separately-
   * timed halo). This generic halo mechanism is preserved, tested, and fully
   * functional — dormant infrastructure for a possible future halo-only cap,
   * not dead code — see the Visual Audit's P2 "Loaded Dot/Halo as a general
   * reusable trait" item.
   */
  haloRingBias: number;
  /**
   * Pink Dot Fat's unified plume fields (see `SprayBrushEngine.resolvePinkDotPlume`
   * and `renderPinkDotPlume`) — the core, ring, and mist of a `"plume"`
   * deposition cap are resolved together from ONE state and drawn as one
   * dab-spaced stamp, so distance/angle/velocity response is coherent across
   * all three layers instead of a generic line core plus an independently
   * timed halo overlay. All 0 on every cap except Pink Dot Fat, and each
   * field is independently a no-op at 0.
   *
   * `plumeRingRadius`/`plumeRingThickness`/`plumeRingOpacity` — the ring
   * band's radius (a multiplier of the resolved core radius), how much of
   * that radius stays at peak opacity before fading (higher = thicker band),
   * and its peak alpha. Drawn UNDER the core, so the core's own opaque disc
   * naturally covers the ring's inner portion — the "ring" read falls out of
   * two stacked circles, not a separate moat-gradient trick.
   */
  plumeRingRadius: number;
  plumeRingThickness: number;
  plumeRingOpacity: number;
  /** `plumeMistRadius`/`plumeMistOpacity` — a third, wider/fainter atmospheric layer beyond the ring, drawn under both. */
  plumeMistRadius: number;
  plumeMistOpacity: number;
  /**
   * `plumeDistanceGain` — how strongly the live resolved size (relative to
   * this cap's own `baseRadius`, the V1 distance-from-wall proxy) amplifies
   * ring+mist beyond their own already-proportional size scaling. The core
   * itself scales with resolved size directly (same as every cap) — this
   * field only adds EXTRA amplification to ring/mist so "far" reads as
   * disproportionately more atmospheric, not just uniformly bigger.
   */
  plumeDistanceGain: number;
  /**
   * `plumeFlareStrength` — how strongly the plume elongates into an ellipse.
   * The actual elongation amount is `flareFactor` (the stronger of an
   * explicit simulated spray-ANGLE input and point velocity — either alone
   * can drive it, they do not stack into an exaggerated combined effect),
   * scaled by this field. Applies uniformly to core, ring, AND mist via one
   * shared transform, so the whole plume tilts together.
   */
  plumeFlareStrength: number;
  /**
   * `plumeDabSpacing` — a multiplier of the resolved core radius: while a
   * segment has real travel distance, the WHOLE plume stamp (core+ring+mist
   * together) is gated until that much distance has accumulated since the
   * last dab, so a moving stroke deposits discrete overlapping plumes
   * instead of a smooth core tube next to separately-dabbed ring blobs. A
   * true dwell (zero travel distance) is never gated. 0 disables gating —
   * the plume draws at every segment endpoint, same as a normal line cap.
   */
  plumeDabSpacing: number;
}

export interface ResolvedSprayDynamics {
  radius: number;
  densityMultiplier: number;
  corePasses: number;
  coreOpacity: number;
  particleCount: number;
  particleSpread: number;
  particleSize: number;
  particleOpacity: number;
  jitter: number;
  anisotropy: number;
  splatterProbability: number;
}

export const SPRAY_CAP_PRESETS: readonly SprayCapPreset[] = [
  // New York/Pink Dot/Astro/German Fat default to Fill ON: dense normal-mode
  // Spray made these read as smooth solid monolines, when the characteristic
  // fat-cap use is the existing Throwie Fill deposition (partial single-sweep
  // coverage, visible overlap/back-and-forth build-up). Fill's own algorithm
  // (SprayBrushEngine's fillLocalSaturation ceiling) is unchanged — this only
  // changes what a freshly-selected fat brush's Fill toggle starts at; the
  // artist can still switch Fill OFF per brush for dense outline work.
  { id: "new-york-fat", name: "New York Fat", family: "fat", baseRadius: 32, coreDensity: 1.14, coreOpacity: 0.29, edgeFalloff: 0.7, particleCount: 18, particleSpread: 1.08, particleSize: 0.65, particleOpacity: 0.25, flowRate: 1.2, accumulationRate: 1.16, velocityResponse: 0.58, jitter: 0.08, endpointBehavior: "settled", splatterProbability: 0.08, dripTendency: 0.48, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: true, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Pink Dot Fat — unified plume. Was a generic line core plus an
  // independently-timed halo overlay (the old haloRadius/haloOpacity/
  // haloDistanceGain/haloFlareAnisotropy/haloDabSpacing/haloRingBias fields,
  // now retired to 0 here — that mechanism is preserved as generic dormant
  // infrastructure, see its own field docs). A moving stroke read as "two
  // independent systems" (a smooth core tube next to separately-dabbed ring
  // blobs) rather than one coherent physical spray. depositionShape "plume"
  // replaces the core loop entirely with SprayBrushEngine.resolvePinkDotPlume
  // — core, ring, and mist resolved together from one state and drawn as one
  // dab-spaced stamp, sharing the same distance/angle/velocity response and
  // the same deposit spacing. plumeRingRadius/Thickness/Opacity and
  // plumeMistRadius/Opacity size and shape the two atmospheric layers
  // (drawn UNDER the core, so the core's own opaque disc naturally produces
  // the "ring" read rather than a moat-gradient trick). plumeDistanceGain
  // amplifies ring+mist beyond their own proportional Size-driven scaling
  // (close -> clean hot dot/line; far -> pronounced center+ring+mist bloom).
  // plumeFlareStrength elongates the WHOLE plume into an ellipse, driven by
  // either a simulated spray angle (Brush Studio "Spray Angle" / Alt+wheel)
  // or point velocity — whichever is stronger, not both stacked. Core
  // physics (coreDensity/coreOpacity/edgeFalloff/velocityResponse) and every
  // other cap's rendering are untouched.
  { id: "pink-dot-fat", name: "Pink Dot Fat", family: "fat", baseRadius: 42, coreDensity: 1.46, coreOpacity: 0.34, edgeFalloff: 0.76, particleCount: 26, particleSpread: 1.2, particleSize: 0.72, particleOpacity: 0.29, flowRate: 1.48, accumulationRate: 1.38, velocityResponse: 0.42, jitter: 0.06, endpointBehavior: "punchy", splatterProbability: 0.14, dripTendency: 0.72, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "plume", defaultFillMode: true, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 1.7, plumeRingThickness: 0.55, plumeRingOpacity: 0.24, plumeMistRadius: 2.6, plumeMistOpacity: 0.07, plumeDistanceGain: 0.85, plumeFlareStrength: 0.55, plumeDabSpacing: 0.8 },
  // Astro Fat — corrected. At default velocity the OLD numbers resolved to a
  // core opacity only ~9% denser than New York Fat's despite nearly 2x the
  // radius (0.394 vs 0.432 resolved coreOpacity) — Astro read as "New York
  // Fat scaled up with more speckles," not a distinct personality. Corrected
  // within the audited field list only: coreDensity/coreOpacity/flowRate/
  // accumulationRate raised together (hotter core, one more corePass at
  // default velocity — resolved coreOpacity now ~0.60 vs New York Fat's
  // ~0.39, a real difference), edgeFalloff lowered (softer pass-to-pass
  // expansion — "broader bloom," via overspray/core softness, never a halo
  // or ring field — those stay 0 so Astro never duplicates Pink Dot Fat or
  // Ring/Donut's bloom mechanism), particleCount/particleSpread/
  // particleOpacity raised (wider, denser atmospheric footprint — kept
  // below Soft/Fade's particleSpread so the two "big broad" caps stay
  // distinguishable by their opposite core character: Astro hot/dense,
  // Soft/Fade deliberately weak), endpointBehavior "settled" -> "punchy"
  // (forceful dwell/load character, distinct from New York Fat's more
  // restrained start). velocityResponse (already low, stays aggressive
  // regardless of speed), baseRadius, jitter, splatterProbability, and
  // dripTendency are untouched — not in the audited field list.
  { id: "astro-fat", name: "Astro Fat", family: "fat", baseRadius: 62, coreDensity: 1.4, coreOpacity: 0.36, edgeFalloff: 0.56, particleCount: 46, particleSpread: 1.55, particleSize: 0.8, particleOpacity: 0.32, flowRate: 1.65, accumulationRate: 1.5, velocityResponse: 0.36, jitter: 0.1, endpointBehavior: "punchy", splatterProbability: 0.18, dripTendency: 0.66, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: true, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  { id: "german-fat", name: "German / Hardcore Fat", family: "fat", baseRadius: 38, coreDensity: 1.06, coreOpacity: 0.27, edgeFalloff: 0.54, particleCount: 32, particleSpread: 1.42, particleSize: 0.62, particleOpacity: 0.24, flowRate: 1.18, accumulationRate: 1.08, velocityResponse: 0.68, jitter: 0.18, endpointBehavior: "raw", splatterProbability: 0.28, dripTendency: 0.5, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: true, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  { id: "lego-thin", name: "Lego Thin", family: "thin", baseRadius: 14, coreDensity: 1.08, coreOpacity: 0.35, edgeFalloff: 0.84, particleCount: 8, particleSpread: 0.8, particleSize: 0.4, particleOpacity: 0.22, flowRate: 0.88, accumulationRate: 0.9, velocityResponse: 0.92, jitter: 0.04, endpointBehavior: "settled", splatterProbability: 0.03, dripTendency: 0.18, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  { id: "universal-thin", name: "Universal Thin", family: "thin", baseRadius: 11, coreDensity: 0.92, coreOpacity: 0.32, edgeFalloff: 0.78, particleCount: 7, particleSpread: 0.88, particleSize: 0.38, particleOpacity: 0.2, flowRate: 0.8, accumulationRate: 0.84, velocityResponse: 1, jitter: 0.07, endpointBehavior: "tapered", splatterProbability: 0.05, dripTendency: 0.12, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  { id: "level-1", name: "Level 1 / Skinny Cream", family: "thin", baseRadius: 6, coreDensity: 0.84, coreOpacity: 0.3, edgeFalloff: 0.88, particleCount: 4, particleSpread: 0.68, particleSize: 0.3, particleOpacity: 0.18, flowRate: 0.64, accumulationRate: 0.72, velocityResponse: 1, jitter: 0.03, endpointBehavior: "tapered", splatterProbability: 0.01, dripTendency: 0.06, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  { id: "new-york-thin", name: "New York Thin", family: "thin", baseRadius: 9, coreDensity: 1.2, coreOpacity: 0.38, edgeFalloff: 0.82, particleCount: 6, particleSpread: 0.76, particleSize: 0.34, particleOpacity: 0.2, flowRate: 0.82, accumulationRate: 0.92, velocityResponse: 0.86, jitter: 0.04, endpointBehavior: "punchy", splatterProbability: 0.04, dripTendency: 0.16, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Oval Calligraphy — same numbers as the original single "Calligraphy /
  // Transversal" cap, same stable `calligraphy` id (no persisted artwork
  // exists yet to break, matching the precedent already used for german-fat's
  // pre-fork numbers), now stamped as a genuinely elongated oval footprint
  // (depositionShape "oval") instead of a width-modulated line. See
  // SprayBrushEngine.resolveShapedStampGeometry.
  { id: "calligraphy", name: "Oval Calligraphy", family: "specialty", baseRadius: 25, coreDensity: 1.02, coreOpacity: 0.33, edgeFalloff: 0.74, particleCount: 10, particleSpread: 0.82, particleSize: 0.42, particleOpacity: 0.2, flowRate: 0.96, accumulationRate: 0.94, velocityResponse: 0.72, jitter: 0.04, endpointBehavior: "tapered", splatterProbability: 0.04, dripTendency: 0.22, anisotropy: 0.32, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "oval", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Rectangular / Slot Transversal — a NEW canonical id (never overwrites
  // "calligraphy"), stamped with depositionShape "slot" (a rotated rounded
  // rectangle, sharper corners than the oval) at a harder edgeFalloff and
  // slightly lower jitter for a more mechanical, "spray chisel nozzle" read.
  // Lower anisotropy than Oval Calligraphy gives its overspray plume a
  // stronger squash too, reinforcing the "more obvious wide/narrow contrast"
  // target relative to the oval sibling.
  { id: "transversal-slot", name: "Rectangular Transversal", family: "specialty", baseRadius: 25, coreDensity: 1.02, coreOpacity: 0.33, edgeFalloff: 0.85, particleCount: 10, particleSpread: 0.82, particleSize: 0.42, particleOpacity: 0.2, flowRate: 0.96, accumulationRate: 0.94, velocityResponse: 0.72, jitter: 0.03, endpointBehavior: "tapered", splatterProbability: 0.04, dripTendency: 0.22, anisotropy: 0.22, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "slot", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Needle — corrected. The prior numbers (edgeFalloff 0.92, particleSpread
  // 2.05, particleCount 15, particleOpacity 0.3, endpointBehavior "raw")
  // already gave a tight CORE (high edgeFalloff means LESS pass-to-pass core
  // bloom, not more) but paired it with the widest, most opaque overspray
  // field of any cap — that overspray, not the core, was what read as
  // "fuzzy". Corrected: particleSpread and particleOpacity cut sharply
  // (tight, faint mist instead of a bold wide cloud), particleCount reduced
  // (sparse rather than dense), coreOpacity raised slightly (hotter core),
  // edgeFalloff raised slightly (marginally tighter core still), and
  // endpointBehavior moved from "raw" (shared with Fuzz/German Fat) to
  // "tapered" (a clean, refined end distinct from Fuzz Fat's rough one).
  // splatterProbability, jitter, velocityResponse, dripTendency, flowRate,
  // and accumulationRate are untouched — not in the audited field list and
  // not identified as causes of the fuzzy read. wiggleAmplitude stays 0:
  // normal Needle must not wiggle.
  { id: "needle", name: "Needle", family: "specialty", baseRadius: 5, coreDensity: 1.58, coreOpacity: 0.48, edgeFalloff: 0.94, particleCount: 9, particleSpread: 0.65, particleSize: 0.26, particleOpacity: 0.16, flowRate: 1.12, accumulationRate: 1.6, velocityResponse: 0.9, jitter: 0.12, endpointBehavior: "tapered", splatterProbability: 0.24, dripTendency: 0.94, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Wiggly Needle — forked from the CORRECTED Needle above (every deposition
  // field identical), adding only the deterministic lateral wander. Keeping
  // this fork in place (rather than letting it silently retain the old fuzzy
  // numbers) is exactly what "inherits the corrected Needle personality"
  // requires.
  { id: "wiggly-needle", name: "Wiggly Needle", family: "specialty", baseRadius: 5, coreDensity: 1.58, coreOpacity: 0.48, edgeFalloff: 0.94, particleCount: 9, particleSpread: 0.65, particleSize: 0.26, particleOpacity: 0.16, flowRate: 1.12, accumulationRate: 1.6, velocityResponse: 0.9, jitter: 0.12, endpointBehavior: "tapered", splatterProbability: 0.24, dripTendency: 0.94, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0.6, wiggleFrequency: 0.02, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  { id: "soft-fade", name: "Soft / Fade", family: "specialty", baseRadius: 50, coreDensity: 0.36, coreOpacity: 0.13, edgeFalloff: 0.28, particleCount: 42, particleSpread: 1.6, particleSize: 0.38, particleOpacity: 0.14, flowRate: 0.68, accumulationRate: 0.52, velocityResponse: 0.82, jitter: 0.2, endpointBehavior: "settled", splatterProbability: 0.12, dripTendency: 0.04, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Forked verbatim from "german-fat" (see SprayCapProfile.ts) to freeze this fuzzy/dry-brush digital
  // behavior under its own permanent identity before "german-fat" is recalibrated to the real cap.
  { id: "fuzz-fat", name: "Fuzz Fat", family: "specialty", baseRadius: 38, coreDensity: 1.06, coreOpacity: 0.27, edgeFalloff: 0.54, particleCount: 32, particleSpread: 1.42, particleSize: 0.62, particleOpacity: 0.24, flowRate: 1.18, accumulationRate: 1.08, velocityResponse: 0.68, jitter: 0.18, endpointBehavior: "raw", splatterProbability: 0.28, dripTendency: 0.5, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "line", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Ring / Donut — StudioRich digital effect archetype, NOT a physical-cap
  // identity (no real cap this maps to; see checkpoint doc/Visual Audit).
  // depositionShape "ring" replaces the filled core entirely with a genuine
  // annular gradient (SprayBrushEngine.resolveRingProfile): centerOpacity
  // (0.05) is deliberately far below ringOpacity (0.4) — a real hollow, not
  // a blurred dot with a halo layered on top. Loaded-cap-scale coreDensity/
  // accumulationRate/dripTendency (a "ring" reads as a wet, loaded output,
  // similar territory to Pink Dot) but haloRadius stays 0 — the ring fields
  // ARE this cap's halo-equivalent, not a second stacked radial mechanism.
  // Fill mode default OFF: dot/dwell personality is the point, and the
  // fill-mode-only tests below already confirm the ring's own ceiling
  // integration works if the user opts in manually.
  { id: "ring-donut", name: "Ring / Donut", family: "specialty", baseRadius: 40, coreDensity: 1.2, coreOpacity: 0.3, edgeFalloff: 0.7, particleCount: 20, particleSpread: 1.15, particleSize: 0.6, particleOpacity: 0.22, flowRate: 1.2, accumulationRate: 1.2, velocityResponse: 0.5, jitter: 0.06, endpointBehavior: "punchy", splatterProbability: 0.1, dripTendency: 0.5, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "ring", defaultFillMode: false, ringRadius: 1.15, ringThickness: 0.4, ringOpacity: 0.4, centerOpacity: 0.05, streakLanes: 0, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
  // Dry / Streak — StudioRich digital effect archetype, NOT a physical-cap
  // identity. depositionShape "streak" replaces the concentric-pass core
  // with streakLanes (5) parallel deterministic lanes, each gated on/off
  // along the travel direction (SprayBrushEngine.resolveStreakGate — pure
  // trig on position + a fixed per-lane phase offset, no Math.random, so
  // gaps replay identically and are never confused with Fuzz Fat's
  // random-jitter-driven raggedness). coreOpacity/edgeFalloff sit near New
  // York Fat's territory (a normal-strength cap, just gapped/laned) rather
  // than Fuzz Fat's raw/splattery numbers. Fill default OFF: a genuinely dry
  // cap should feel deliberately under-loaded per stroke, with the
  // broken/textured character the point of a single pass — the user opts
  // into Fill for throwie-style repeated-pass buildup, same as any other cap.
  { id: "dry-streak", name: "Dry / Streak", family: "specialty", baseRadius: 34, coreDensity: 1.1, coreOpacity: 0.34, edgeFalloff: 0.66, particleCount: 14, particleSpread: 1, particleSize: 0.5, particleOpacity: 0.18, flowRate: 1, accumulationRate: 1, velocityResponse: 0.62, jitter: 0.05, endpointBehavior: "raw", splatterProbability: 0.06, dripTendency: 0.14, anisotropy: 1, haloRadius: 0, haloOpacity: 0, wiggleAmplitude: 0, wiggleFrequency: 0, depositionShape: "streak", defaultFillMode: false, ringRadius: 0, ringThickness: 0, ringOpacity: 0, centerOpacity: 0, streakLanes: 5, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0, plumeRingRadius: 0, plumeRingThickness: 0, plumeRingOpacity: 0, plumeMistRadius: 0, plumeMistOpacity: 0, plumeDistanceGain: 0, plumeFlareStrength: 0, plumeDabSpacing: 0 },
] as const;

const LEGACY_CAP_ALIASES: Record<string, SprayCapId> = {
  fat: "new-york-fat",
  skinny: "universal-thin",
  soft: "soft-fade",
  "high-pressure": "pink-dot-fat",
  "dust-fog": "soft-fade",
};

export function getSprayCapPreset(id: string): SprayCapPreset {
  const canonicalId = LEGACY_CAP_ALIASES[id] ?? id;
  return SPRAY_CAP_PRESETS.find((preset) => preset.id === canonicalId) ?? SPRAY_CAP_PRESETS[0];
}

export function mapVelocityToDensity(velocity: number, velocityResponse: number): number {
  const normalizedVelocity = Math.min(1, Math.max(0, velocity) / 1.5);
  const response = Math.min(1, Math.max(0, velocityResponse));
  return Math.min(1.48, Math.max(0.58, 1 + (0.44 - normalizedVelocity * 0.72) * response));
}

export function resolveSprayDynamics(preset: SprayCapPreset, velocity: number, radius: number): ResolvedSprayDynamics {
  const densityMultiplier = mapVelocityToDensity(velocity, preset.velocityResponse);
  const safeRadius = Math.max(1, radius);
  return {
    radius: safeRadius,
    densityMultiplier,
    corePasses: Math.max(1, Math.min(5, Math.round(preset.coreDensity * preset.flowRate * densityMultiplier * 1.65))),
    coreOpacity: Math.min(0.72, preset.coreOpacity * preset.accumulationRate * densityMultiplier),
    particleCount: Math.max(0, Math.round(preset.particleCount * preset.flowRate * (0.72 + densityMultiplier * 0.28))),
    particleSpread: safeRadius * preset.particleSpread * (1 + Math.min(0.3, Math.max(0, velocity) * 0.12 * preset.velocityResponse)),
    particleSize: preset.particleSize * (0.88 + Math.min(0.32, Math.max(0, velocity) * 0.08)),
    particleOpacity: Math.min(0.62, preset.particleOpacity * densityMultiplier),
    jitter: safeRadius * preset.jitter,
    anisotropy: preset.anisotropy,
    splatterProbability: preset.splatterProbability,
  };
}
