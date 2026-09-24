/**
 * Event Music + Clock Radio Foundation V1 -- the PROGRAM CONFIG this build's
 * own brief asks to keep separate from PLAYBACK MODE and from CODE
 * (requirement 14/31): which playlist bundle plays, in which mode, and
 * (for CLOCK mode) when the program started. None of this is a compiled
 * constant -- it is fetched at runtime from a plain static JSON resource,
 * `/event-program.json`, precisely so an operator can change it by
 * replacing that one file on whatever host serves this app, with zero
 * source-code edit, zero AI coding agent involvement, and zero application
 * rebuild.
 *
 * KNOWN LIMITATION (reported, not solved here -- see this build's own
 * capacity/operator-dependency report): this repository has no configured
 * production static hosting today (`firebase.json` has no `hosting`
 * section), so "replace the file on the host" has no real host to target
 * yet in this environment. The mechanism itself -- fetch, not import -- is
 * what makes that operationally possible once hosting exists; this file
 * does not attempt to stand up that hosting.
 */

export type EventPlaybackMode = "personal" | "clock";
export type EventProgramEndPolicy = "stop" | "repeat";

export interface EventProgramConfig {
  readonly schemaVersion: string;
  /** Base URL the manifest and its audio/artwork are relative to -- e.g. "/radio-web-export/soft-motion-radio/v1/" (dev) or a future static-hosting path (production). Always ends with "/". */
  readonly manifestBaseUrl: string;
  readonly playbackMode: EventPlaybackMode;
  /** Epoch milliseconds, required and only meaningful for "clock" mode. Null for "personal". */
  readonly startAtMs: number | null;
  readonly endPolicy: EventProgramEndPolicy;
}

/**
 * The safe fallback used whenever `/event-program.json` is missing,
 * unreachable, or malformed -- Blackbook's music feature must never be
 * fully broken merely because the config resource hasn't been created yet
 * on a given deployment. Points at the real, already-published, real
 * 11-track "Soft Motion Radio" StudioRich playlist (see this build's own
 * recon) in ordinary continuous PERSONAL mode.
 */
export const DEFAULT_EVENT_PROGRAM_CONFIG: EventProgramConfig = Object.freeze({
  schemaVersion: "1.0.0",
  manifestBaseUrl: "/radio-web-export/soft-motion-radio/v1/",
  playbackMode: "personal",
  startAtMs: null,
  endPolicy: "stop",
});

function isEventPlaybackMode(value: unknown): value is EventPlaybackMode {
  return value === "personal" || value === "clock";
}
function isEventProgramEndPolicy(value: unknown): value is EventProgramEndPolicy {
  return value === "stop" || value === "repeat";
}

/**
 * Never throws -- an operator's malformed edit to the config resource must
 * degrade to the safe default, not take the whole event's music down.
 * Each field is validated independently so a single bad field doesn't
 * discard an otherwise-good config.
 */
export function parseEventProgramConfig(raw: unknown): EventProgramConfig {
  if (typeof raw !== "object" || raw === null) return DEFAULT_EVENT_PROGRAM_CONFIG;
  const data = raw as Record<string, unknown>;
  const manifestBaseUrlRaw = typeof data.manifestBaseUrl === "string" ? data.manifestBaseUrl : DEFAULT_EVENT_PROGRAM_CONFIG.manifestBaseUrl;
  const manifestBaseUrl = manifestBaseUrlRaw.endsWith("/") ? manifestBaseUrlRaw : `${manifestBaseUrlRaw}/`;
  const playbackMode = isEventPlaybackMode(data.playbackMode) ? data.playbackMode : DEFAULT_EVENT_PROGRAM_CONFIG.playbackMode;
  const startAtMs = typeof data.startAtMs === "number" && Number.isFinite(data.startAtMs) ? data.startAtMs : null;
  const endPolicy = isEventProgramEndPolicy(data.endPolicy) ? data.endPolicy : DEFAULT_EVENT_PROGRAM_CONFIG.endPolicy;
  return {
    schemaVersion: typeof data.schemaVersion === "string" ? data.schemaVersion : DEFAULT_EVENT_PROGRAM_CONFIG.schemaVersion,
    manifestBaseUrl,
    playbackMode,
    startAtMs,
    endPolicy,
  };
}

/** Fetches and validates `/event-program.json`; falls back to the safe default on any failure (network error, 404, invalid JSON, invalid shape). Never throws. */
export async function loadEventProgramConfig(): Promise<EventProgramConfig> {
  try {
    const response = await fetch("/event-program.json", { cache: "no-store" });
    if (!response.ok) return DEFAULT_EVENT_PROGRAM_CONFIG;
    const raw = await response.json();
    return parseEventProgramConfig(raw);
  } catch {
    return DEFAULT_EVENT_PROGRAM_CONFIG;
  }
}
