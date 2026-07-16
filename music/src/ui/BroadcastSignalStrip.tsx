import { useState, useEffect } from "react";

// Protected broadcast signals — clock + atmospheric model.
//
// Clock: always available via JS Date.
//
// Weather source search results:
//   - WOS weather (realitySyncRuntime.js → world:weatherChanged) is real-time
//     from an external API, rendered inside WOS iframe (cross-origin, unreadable).
//   - atmosphereRuntime.js contains time-of-day phase baselines with normalized
//     humidity, temperature, and precipitation values (0–1 scale). This is the
//     same model WOS uses for cinematic atmospheric rendering. Used as PLAY-side
//     atmospheric approximation.
//   - No standalone weather API module exists in PLAY.
//
// Source label: ATMO / TIME-OF-DAY MODEL — honest about derivation.

type Props = {
  controlsVisible: boolean;
  // Optional overrides — if real weather data is bridged later, pass it here
  weatherLabel?: string;
  tempLabel?: string;
  humidityLabel?: string;
  precipLabel?: string;
  windLabel?: string;
};

// Phase baselines mirrored from atmosphereRuntime.js.
// Temperature: 0–1 → mapped to 45–90°F (NYC seasonal range).
// Humidity: 0–1 → percent. Precipitation: 0–1 → percent.
type PhaseName =
  | "deep_night" | "early_morning" | "morning_rush" | "midmorning"
  | "midday" | "afternoon" | "evening_rush" | "early_evening"
  | "late_evening" | "late_night";

type PhaseData = { label: string; temperature: number; humidity: number; precipitation: number };

const PHASE_DATA: Record<PhaseName, PhaseData> = {
  deep_night:    { label: "NIGHT",         temperature: 0.38, humidity: 0.50, precipitation: 0.00 },
  early_morning: { label: "EARLY MORNING", temperature: 0.42, humidity: 0.55, precipitation: 0.00 },
  morning_rush:  { label: "MORNING",       temperature: 0.55, humidity: 0.42, precipitation: 0.00 },
  midmorning:    { label: "MID MORNING",   temperature: 0.60, humidity: 0.38, precipitation: 0.00 },
  midday:        { label: "MIDDAY",        temperature: 0.68, humidity: 0.35, precipitation: 0.00 },
  afternoon:     { label: "AFTERNOON",     temperature: 0.65, humidity: 0.38, precipitation: 0.00 },
  evening_rush:  { label: "EVENING",       temperature: 0.58, humidity: 0.44, precipitation: 0.00 },
  early_evening: { label: "EARLY EVENING", temperature: 0.52, humidity: 0.48, precipitation: 0.00 },
  late_evening:  { label: "LATE EVENING",  temperature: 0.44, humidity: 0.52, precipitation: 0.00 },
  late_night:    { label: "LATE NIGHT",    temperature: 0.40, humidity: 0.52, precipitation: 0.00 },
};

function getPhase(hour: number): PhaseData {
  if (hour >= 0  && hour < 4)  return PHASE_DATA.deep_night;
  if (hour >= 4  && hour < 6)  return PHASE_DATA.early_morning;
  if (hour >= 6  && hour < 9)  return PHASE_DATA.morning_rush;
  if (hour >= 9  && hour < 11) return PHASE_DATA.midmorning;
  if (hour >= 11 && hour < 13) return PHASE_DATA.midday;
  if (hour >= 13 && hour < 17) return PHASE_DATA.afternoon;
  if (hour >= 17 && hour < 19) return PHASE_DATA.evening_rush;
  if (hour >= 19 && hour < 21) return PHASE_DATA.early_evening;
  if (hour >= 21 && hour < 23) return PHASE_DATA.late_evening;
  return PHASE_DATA.late_night;
}

function useClockTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function BroadcastSignalStrip({
  controlsVisible,
  weatherLabel,
  tempLabel,
  humidityLabel,
  precipLabel,
  windLabel,
}: Props) {
  const now = useClockTick();
  if (!controlsVisible) return null;

  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const timeStr = `${pad(h12)}:${pad(m)}:${pad(s)} ${ampm}`;
  const tzFull = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const tzShort = tzFull.split("/").pop()?.replace(/_/g, " ") ?? "LOCAL";

  // Derive atmospheric model from current phase
  const phase = getPhase(h);
  const tempF = Math.round(45 + phase.temperature * 45); // 45–90°F
  const humPct = Math.round(phase.humidity * 100);
  const precPct = Math.round(phase.precipitation * 100);

  const rows: { label: string; value: string; dim?: boolean }[] = [
    { label: "TIME", value: timeStr },
    { label: "ZONE", value: tzShort },
    // Weather: use prop overrides if provided (future bridge), else atmospheric model
    { label: "WX",   value: weatherLabel ?? phase.label },
    { label: "TEMP", value: tempLabel    ?? `${tempF}°F` },
    { label: "HUM",  value: humidityLabel ?? `${humPct}%` },
    { label: "PREC", value: precipLabel  ?? `${precPct}%` },
  ];

  // Wind: no WOS wind data accessible; show source note
  if (windLabel) {
    rows.push({ label: "WIND", value: windLabel });
  } else {
    rows.push({ label: "WIND", value: "N/A", dim: true });
  }

  // Source attribution — honest about where the atmospheric model comes from
  rows.push({ label: "SRC", value: "ATMO MODEL", dim: true });

  return (
    <div className="bss-strip">
      {rows.map(({ label, value, dim }) => (
        <div key={label} className="bss-row">
          <span className="bss-label">{label}</span>
          <span className={`bss-value${dim ? " bss-value--dim" : ""}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
