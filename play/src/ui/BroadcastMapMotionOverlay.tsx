// Animated route/motion overlay — CSS-driven, no vehicles or GPS needed.
// Shows a looping route pulse + signal dot above the map surface.

type Props = {
  accent?: string;
  glow?: string;
  visible?: boolean;
};

export function BroadcastMapMotionOverlay({
  accent = "var(--play-map-accent, #5f73ff)",
  glow = "var(--play-map-glow, #00d5ff)",
  visible = true,
}: Props) {
  if (!visible) return null;

  return (
    <div className="bmo-overlay" aria-hidden="true">
      <svg className="bmo-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Grid shimmer — faint city-grid feel */}
        {[20, 40, 60, 80].map((x) => (
          <line key={`gv${x}`} className="bmo-shimmer-v" x1={x} y1={0} x2={x} y2={100}
            stroke={accent} strokeWidth="0.12" vectorEffect="non-scaling-stroke" />
        ))}
        {[33, 66].map((y) => (
          <line key={`gh${y}`} className="bmo-shimmer-h" x1={0} y1={y} x2={100} y2={y}
            stroke={accent} strokeWidth="0.12" vectorEffect="non-scaling-stroke" />
        ))}

        {/* Secondary drift route — dashed */}
        <path className="bmo-route-secondary"
          d="M5 90 C15 78 28 72 42 68 C56 64 65 58 78 52 C88 48 94 42 98 38"
          fill="none" stroke={accent} strokeWidth="0.2"
          strokeDasharray="1.5 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {/* Main route */}
        <path className="bmo-route"
          d="M8 88 C18 72 30 62 42 56 C52 51 58 44 68 39 C78 34 84 28 92 18"
          fill="none" stroke={accent} strokeWidth="0.35" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />

        {/* Glow pulse on route */}
        <path className="bmo-route-glow"
          d="M8 88 C18 72 30 62 42 56 C52 51 58 44 68 39 C78 34 84 28 92 18"
          fill="none" stroke={glow} strokeWidth="0.7" strokeLinecap="round"
          strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />

        {/* Signal dot — moves along route */}
        <circle className="bmo-dot" r="1.1" fill={glow}>
          <animateMotion dur="9s" repeatCount="indefinite"
            path="M8 88 C18 72 30 62 42 56 C52 51 58 44 68 39 C78 34 84 28 92 18" />
        </circle>

        {/* Pulse ring around dot */}
        <circle className="bmo-dot-ring" r="2.5" fill="none" stroke={glow} strokeWidth="0.4">
          <animateMotion dur="9s" repeatCount="indefinite"
            path="M8 88 C18 72 30 62 42 56 C52 51 58 44 68 39 C78 34 84 28 92 18" />
        </circle>
      </svg>
    </div>
  );
}
