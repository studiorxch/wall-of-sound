/**
 * Event Radio Turnkey Operations V1 -- the PROGRAM CONFIG this build's own
 * brief asks to keep separate from PLAYBACK MODE and from CODE. Primary
 * authority is now the StudioRich-owned `eventProgram`/`radioPrograms`
 * Firestore collections (see `@studiorich/member-identity`'s
 * `EventRadioRepository`) -- the SAME data layer Member/Artwork already
 * use, editable by an authorized operator via ordinary Firestore access
 * (Console, or the small operator control this build adds), with zero
 * source-code edit, zero AI coding agent involvement, and zero application
 * rebuild/redeploy.
 *
 * `loadEventProgramConfig` only resolves a program when its stored
 * `status` is `"active"` -- requirement 9's own rule that a listener must
 * never receive an operator's still-being-configured ("inactive"/"ready")
 * event. Falls back, in order, to the legacy static `/event-program.json`
 * resource (kept only as an offline/pre-Firestore-rules-publish safety net
 * from the prior build) and finally to `DEFAULT_EVENT_PROGRAM_CONFIG` --
 * Blackbook's music feature must never be fully broken merely because an
 * operator hasn't configured an event yet.
 */
import { createFirebaseEventRadioRepository, type StudioRichFirebaseEnvironment } from "@studiorich/member-identity";

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

/** Legacy static-file fallback (from the prior build) -- kept only as an offline/pre-Firestore-rules-publish safety net, never the primary source anymore. */
async function loadStaticFallbackConfig(): Promise<EventProgramConfig> {
  try {
    const response = await fetch("/event-program.json", { cache: "no-store" });
    if (!response.ok) return DEFAULT_EVENT_PROGRAM_CONFIG;
    return parseEventProgramConfig(await response.json());
  } catch {
    return DEFAULT_EVENT_PROGRAM_CONFIG;
  }
}

/**
 * Resolves the active event's playable config: reads the operator-owned
 * `eventProgram` document and joins it against `radioPrograms` (both
 * Firestore, both StudioRich-owned data -- see this module's own doc) to
 * turn a human-chosen `programId` into the `manifestBaseUrl` the player
 * actually needs. Only ever resolves a program whose `status` is
 * `"active"`; "inactive"/"ready" (or no document at all, e.g. the
 * `eventProgram`/`radioPrograms` Firestore rules haven't been published
 * yet in this environment) fall through to the legacy static-file
 * fallback and finally to the hardcoded safe default. Never throws.
 *
 * LIVE CONFIG CHANGES (requirement 18): resolved ONCE, at load time --
 * the smallest predictable V1 behavior. An operator's change takes effect
 * the next time a client loads Blackbook, never retroactively for an
 * already-open tab; no realtime listener/polling is introduced.
 */
export async function loadEventProgramConfig(environment: StudioRichFirebaseEnvironment): Promise<EventProgramConfig> {
  try {
    const repository = createFirebaseEventRadioRepository(environment);
    const [state, programs] = await Promise.all([repository.getEventProgram(), repository.listRadioPrograms()]);
    if (state && state.status === "active" && state.programId) {
      const program = programs.find((candidate) => candidate.id === state.programId);
      if (program) {
        return {
          schemaVersion: "1.0.0",
          manifestBaseUrl: program.manifestBaseUrl,
          playbackMode: state.playbackMode,
          startAtMs: state.startAtMs,
          endPolicy: state.endPolicy,
        };
      }
    }
  } catch {
    // Firestore unreachable or rules not yet published -- fall through.
  }
  return loadStaticFallbackConfig();
}
