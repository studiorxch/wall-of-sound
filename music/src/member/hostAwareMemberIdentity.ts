// MEMBER-01A -- the ONE shared MEMBER identity resolution both MAP
// (`subwayMemberRuntime.ts`) and BLACKBOOK (`blackbookRuntime.ts`) call,
// same "self-contained HOME detection" posture
// `radioChannelReceiverRuntime.ts` already established for RADIO
// (deliberately NOT shared with `blackbookHomeSurface.ts`'s own equivalent
// check -- this needs to work identically for MAP, which has no access to
// that TS module at all).
//
// Standalone/embedded (not HOME-hosted): returns `createLocalAuthority()`
// UNCHANGED -- the exact same object standalone code has always used, zero
// added indirection, zero behavior change.
//
// HOME-hosted: NEVER constructs/starts a local Firebase Auth instance at
// all. Returns a proxy that starts in "initializing", resolves HOME's ONE
// persistent hosted authority via the `getMemberIdentity` bridge (same
// bounded retry budget RADIO-01's own `resolveReceiver` uses -- HOME's
// navigation phase is typically still "mounting", not "active", the
// instant this script's own module body runs), and forwards every
// subsequent call to it. A caller that invokes a write method (sign in,
// sign out, update profile) before resolution completes gets an explicit
// rejection, never a silently-queued or silently-dropped action -- write
// actions are only ever reachable from UI the avatar/menu itself gates on
// a resolved, actionable state to begin with.
import { createFirebaseMemberIdentityAuthority, type MemberIdentityAuthority, type MemberIdentityError, type MemberIdentityState, type MemberIdentityStateListener } from "@studiorich/member-identity";
import type { HomeMountIdentity } from "../home/homeSurfaceContract";

interface HomeHost {
  version: 1;
  getMemberIdentity(source: Document, identity: HomeMountIdentity): MemberIdentityAuthority | null;
}

/**
 * Self-contained on purpose (see this module's own header doc) -- never
 * imports `blackbookHomeSurface.ts`'s own detection, since this same
 * function must also work for MAP, which cannot import that TS module.
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

const INITIALIZING_STATE: MemberIdentityState = { status: "initializing", authUser: null, member: null, error: null };

function hostUnavailableError(code: string): MemberIdentityError {
  return { scope: "session", code: `member/${code}`, message: "StudioRich sign-in is temporarily unavailable." };
}

function notResolvedRejection(): Promise<never> {
  return Promise.reject(new Error("member_identity_host_not_resolved_yet"));
}

/**
 * `createLocalAuthority` defaults to the real standalone factory (matches
 * every other consumer's own default), injectable for tests.
 */
export function createHostAwareMemberIdentity(
  createLocalAuthority: () => MemberIdentityAuthority = () => createFirebaseMemberIdentityAuthority(import.meta.env),
): MemberIdentityAuthority {
  const identity = detectHomeMount();
  if (!identity) return createLocalAuthority(); // standalone/embedded -- unchanged

  let resolved: MemberIdentityAuthority | null = null;
  let current: MemberIdentityState = INITIALIZING_STATE;
  const listeners = new Set<MemberIdentityStateListener>();
  let startPromise: Promise<void> | null = null;

  function setState(next: MemberIdentityState): void {
    current = next;
    listeners.forEach((listener) => listener(current));
  }

  async function resolveHostedAuthority(): Promise<void> {
    const host = (window.parent as unknown as { StudioRichHome?: HomeHost }).StudioRichHome;
    if (!host) {
      setState({ status: "error", authUser: null, member: null, error: hostUnavailableError("host_unavailable") });
      return;
    }
    // Same 100 x 50ms (5s) budget radioChannelReceiverRuntime.ts already
    // uses -- HOME's own readiness handshake (Mapbox viewport / BLACKBOOK's
    // first stable state) routinely outlasts this script's own module-load
    // timing, so the very first attempt failing is expected, not an error.
    //
    // HOST-03B Member Identity Diagnostic V1 -- temporary, read-only,
    // dev-gated (`import.meta.env.DEV` -- this file, unlike homeRuntime.ts,
    // ships in the real BLACKBOOK production bundle, so the gate is
    // required here). Logs each attempt's own granted/denied result and
    // the terminal outcome, with zero change to the resolution logic
    // itself -- the loop body below is unchanged, only wrapped with a log
    // line before/after. See getMemberIdentity's own matching diagnostic
    // in homeRuntime.ts for the HOME-side half of this same trace.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const authority = host.getMemberIdentity(document, identity);
      if (import.meta.env.DEV) console.log("[HOST-03B Member Identity Diagnostic] resolveHostedAuthority attempt", { attempt, granted: authority !== null, identity });
      if (authority) {
        resolved = authority;
        resolved.subscribe(setState);
        await resolved.start();
        if (import.meta.env.DEV) console.log("[HOST-03B Member Identity Diagnostic] resolveHostedAuthority resolved", { attempt, finalState: current });
        return;
      }
      await wait(50);
    }
    // Fail closed: never falls back to constructing a local authority --
    // that would recreate the exact nested-popup risk HOST-03B exists to
    // avoid, and would mean two live authorities disagreeing about who is
    // signed in.
    setState({ status: "error", authUser: null, member: null, error: hostUnavailableError("stale_identity") });
    if (import.meta.env.DEV) console.log("[HOST-03B Member Identity Diagnostic] resolveHostedAuthority exhausted retries -- settled to error/stale_identity", { identity });
  }

  return {
    getState: () => current,
    subscribe(listener: MemberIdentityStateListener): () => void {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    start(): Promise<void> {
      startPromise ??= resolveHostedAuthority();
      return startPromise;
    },
    stop(): void {
      // The PARENT owns the underlying authority's lifecycle -- a hosted
      // consumer going away (surface swap) must never stop the ONE
      // persistent session for every other consumer of it.
    },
    signInWithEmailPassword: (email, password) => resolved ? resolved.signInWithEmailPassword(email, password) : notResolvedRejection(),
    createAccountWithEmailPassword: (email, password) => resolved ? resolved.createAccountWithEmailPassword(email, password) : notResolvedRejection(),
    signInWithGoogle: () => resolved ? resolved.signInWithGoogle() : notResolvedRejection(),
    signInWithCredential: (serialized) => resolved ? resolved.signInWithCredential(serialized) : notResolvedRejection(),
    signOut: () => resolved ? resolved.signOut() : notResolvedRejection(),
    updateProfile: (displayName) => resolved ? resolved.updateProfile(displayName) : notResolvedRejection(),
  };
}
