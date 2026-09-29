// MAP × BLACKBOOK × RADIO -- the ONE shared bootstrap script both `wall/`
// (MAP) and `blackbook.html` (BLACKBOOK) load, publishing
// window.SBE.RadioChannelReceiver (control) and
// window.SBE.RadioChannelReceiverState (read-only snapshot), same
// convention subwayMemberRuntime.ts already uses for MemberIdentityState.
//
// RADIO-01 -- standalone/embedded (not HOME-hosted) behavior is completely
// unchanged: constructs its own local `createRadioChannelReceiver()`
// instance, exactly as this file did before extraction. When HOME-hosted,
// this document's own receiver is a thin proxy for HOME's ONE persistent
// session (`getRadioSession`) instead of a second, competing engine --
// never a silent fallback to a local engine on rejection; see
// `createFailedRadioChannelReceiver`'s own doc.

import { createRadioChannelReceiver, createFailedRadioChannelReceiver, type RadioChannelReceiver, type RadioChannelReceiverState } from "../logic/radio/createRadioChannelReceiver";
import type { HomeMountIdentity } from "../home/homeSurfaceContract";

export type { RadioChannelReceiver, RadioChannelReceiverState };

interface RootWithSBE {
  SBE?: {
    RadioChannelReceiver?: unknown;
    RadioChannelReceiverState?: RadioChannelReceiverState;
  };
}

const root = window as unknown as RootWithSBE;
root.SBE = root.SBE || {};

interface HomeHost {
  version: 1;
  getRadioSession(source: Document, identity: HomeMountIdentity): RadioChannelReceiver | null;
}

/**
 * Explicit, query-based HOME-hosting detection -- deliberately never bare
 * `window.self !== window.top`, since this document can have other iframe
 * consumers. Self-contained (not shared with `blackbookHomeSurface.ts`'s
 * own equivalent check) because this script runs standalone in BOTH the
 * MAP and BLACKBOOK documents, independent of either surface's own
 * TS/plain-JS adapter module.
 */
function detectHomeMount(): HomeMountIdentity | null {
  try {
    const params = new URLSearchParams(location.search);
    const runtimeId = params.get("homeRuntime");
    const navigationId = Number(params.get("homeNavigation"));
    if (params.get("host") !== "home" || window.parent === window) return null;
    if (window.parent.location.origin !== location.origin) return null;
    const host = (window.parent as unknown as { StudioRichHome?: HomeHost }).StudioRichHome;
    if (host?.version !== 1 || !runtimeId || !Number.isSafeInteger(navigationId) || navigationId < 1) return null;
    return { runtimeId, navigationId };
  } catch {
    return null;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * This script's own `<script type="module">` tag runs as soon as it's
 * parsed -- typically well BEFORE HOME's own readiness handshake completes
 * (MAP's own `homeMapSurface.js` waits for the real
 * `MapboxViewportRuntime.onReady`; BLACKBOOK waits for its own first
 * stable state). A single, immediate `getRadioSession()` call would almost
 * always be rejected simply because HOME's navigation phase is still
 * "mounting", not "active" yet -- not a real stale/wrong identity. Retries
 * with the same bounded budget `blackbookRadioUI.ts`'s own
 * `window.SBE.RadioChannelReceiver` polling already uses (100 x 50ms = 5s)
 * before settling on the explicit failed stand-in. `radioChannelHud.js`/
 * `blackbookRadioUI.ts` already tolerate `window.SBE.RadioChannelReceiver`
 * not existing yet (their own equivalent retry loop) -- so simply not
 * publishing it until resolution finishes is sufficient; no separate
 * "not ready" UI state is needed.
 */
async function resolveReceiver(): Promise<RadioChannelReceiver> {
  const identity = detectHomeMount();
  if (!identity) return createRadioChannelReceiver(); // standalone/embedded -- unchanged behavior
  const host = (window.parent as unknown as { StudioRichHome?: HomeHost }).StudioRichHome!;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const session = host.getRadioSession(document, identity);
    if (session) return session;
    await wait(50);
  }
  // Fail closed: a hosted document whose session request is STILL rejected
  // after that whole window (genuinely stale/wrong runtime, or HOME never
  // reached "active") NEVER falls back to a locally-owned engine -- that
  // would be exactly the "duplicate playback ownership" this checkpoint
  // exists to prevent.
  return createFailedRadioChannelReceiver("stale_identity");
}

void resolveReceiver().then((receiver) => {
  root.SBE!.RadioChannelReceiver = receiver;
  receiver.subscribe((state) => { root.SBE!.RadioChannelReceiverState = state; });
});
