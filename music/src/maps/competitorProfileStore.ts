// ── competitorProfileStore.ts — in-memory cache over competitorProfileStorage.ts ─
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime, corrected 0805F
//
// Same synchronous list()/subscribe(fn) shape as gameFormatStore.ts.
//
// REQUIRED CORRECTION (0805F): reconciles against the LIVE Orb catalog on
// every hydrate/retry/Orb-change, not a one-shot "seed only if the whole
// store is empty." reconcileWithOrbs() ensures every real Orb Profile has a
// matching CompetitorProfile (by orbProfileId) — it only ever CREATES a
// competitor for an Orb missing one; it never overwrites an existing
// competitor record and never deletes one (an Orb that's since been removed
// leaves its competitor record in place, untouched — no pruning). Running it
// any number of times converges to the same set, never duplicates.
//
// Read via the existing wallOrbProfileBridge.ts (real Orb ids, never
// hardcoded, since they're runtime-generated). Writes a slim, read-only
// catalog mirror to `wos:competitor:catalog` localStorage on every change —
// this is how wall/'s RACETRACK runtime browses Competitors without a new
// writable bridge; wall/ resolves the actual Orb visuals itself via its own,
// unchanged OrbProfileAuthority. No create/rename exports exist yet since no
// UI calls them in this build.

import type { CompetitorProfile } from "../data/competitorProfileTypes";
import { listCompetitorProfilesFromDB, saveCompetitorProfileToDB } from "./competitorProfileStorage";
import * as wallOrbProfileBridge from "./wallOrbProfileBridge";

const CATALOG_MIRROR_KEY = "wos:competitor:catalog";
const ORB_BRIDGE_RETRY_MS = 500;
const ORB_BRIDGE_RETRY_MAX_ATTEMPTS = 40; // ~20s bounded — the Orb bridge script loads via the /wall-app proxy and may not be ready yet at MUSIC's own startup

export interface CompetitorCatalogEntry {
  id: string;
  name: string;
  team: string;
  orbProfileId: string;
}

let _competitors: CompetitorProfile[] = [];
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
let _retryTimer: ReturnType<typeof setInterval> | null = null;
let _orbSubscribed = false;
let _unsubscribeOrbs: (() => void) | null = null;
const _listeners: Array<() => void> = [];

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

function writeCatalogMirror(): void {
  const entries: CompetitorCatalogEntry[] = _competitors.map((c) => ({
    id: c.id, name: c.name, team: c.team, orbProfileId: c.orbProfileId,
  }));
  try {
    localStorage.setItem(CATALOG_MIRROR_KEY, JSON.stringify(entries));
  } catch {
    /* best-effort mirror — not load-bearing for this tab's own state */
  }
}

function notify(): void {
  writeCatalogMirror();
  _listeners.slice().forEach((fn) => {
    try { fn(); } catch (e) { console.warn("[competitorProfileStore] subscriber threw:", e); }
  });
}

const NAME_POOL = ["Halo Signal", "Night Vector", "Amber Current", "Iron Meridian", "Violet Static"];
const SEED_TEAM = "StudioRich Racing";

// Picks the first NAME_POOL entry not already in use by any current
// competitor (across the whole store, not just this reconcile batch), so an
// Orb added long after the initial seed still gets a distinct name rather
// than colliding via a positional i % length scheme.
function _pickName(usedNames: Set<string>): string {
  for (const candidate of NAME_POOL) {
    if (!usedNames.has(candidate)) return candidate;
  }
  let n = 1;
  let candidate = `${NAME_POOL[0]} ${n}`;
  while (usedNames.has(candidate)) {
    n += 1;
    candidate = `${NAME_POOL[n % NAME_POOL.length]} ${Math.floor(n / NAME_POOL.length) + 1}`;
  }
  return candidate;
}

// Ensures every real Orb has a matching CompetitorProfile. Idempotent and
// non-destructive: only ever creates a competitor for an orbProfileId not
// already represented; never touches an existing record (whether its Orb
// still exists or not). Returns true if it actually created anything.
async function reconcileWithOrbs(): Promise<boolean> {
  const orbResult = wallOrbProfileBridge.listOrbProfiles();
  if (!orbResult.ok) return false; // bridge not up yet — the retry loop tries again

  const existingOrbIds = new Set(_competitors.map((c) => c.orbProfileId));
  const missing = orbResult.data.filter((orb) => !existingOrbIds.has(orb.id));
  if (missing.length === 0) return false;

  const now = Date.now();
  const usedNames = new Set(_competitors.map((c) => c.name));
  const created: CompetitorProfile[] = [];
  for (const orb of missing) {
    const name = _pickName(usedNames);
    usedNames.add(name);
    const record: CompetitorProfile = {
      id: genId("competitor"), name, team: SEED_TEAM, orbProfileId: orb.id, createdAt: now, updatedAt: now,
    };
    await saveCompetitorProfileToDB(record);
    created.push(record);
  }
  _competitors = [..._competitors, ...created];
  return true;
}

function _ensureOrbSubscription(): void {
  if (_orbSubscribed) return;
  if (!wallOrbProfileBridge.isBridgeAvailable()) return;
  _orbSubscribed = true;
  _unsubscribeOrbs = wallOrbProfileBridge.subscribe(() => {
    reconcileWithOrbs().then((changed) => { if (changed) notify(); });
  });
}

function _scheduleRetry(): void {
  if (_retryTimer) return;
  let attempts = 0;
  _retryTimer = setInterval(() => {
    attempts += 1;
    _ensureOrbSubscription();
    reconcileWithOrbs().then((changed) => {
      if (changed) notify();
      if (_orbSubscribed || attempts >= ORB_BRIDGE_RETRY_MAX_ATTEMPTS) {
        if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }
        if (!_orbSubscribed) {
          console.warn("[competitorProfileStore] gave up waiting for the Orb bridge to become available");
        }
      }
    });
  }, ORB_BRIDGE_RETRY_MS);
}

async function hydrateNow(): Promise<void> {
  _competitors = await listCompetitorProfilesFromDB();
  await reconcileWithOrbs();
  _hydrated = true;
}

export function hydrate(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_hydrating) return _hydrating;
  _hydrating = hydrateNow()
    .then(() => {
      notify();
      _ensureOrbSubscription();
      if (!_orbSubscribed) _scheduleRetry();
    })
    .catch((e) => {
      console.warn("[competitorProfileStore] hydrate failed:", e);
      _hydrated = true; // fail open to an empty list, don't retry forever
      notify();
      _scheduleRetry();
    });
  return _hydrating;
}

hydrate();

export function isHydrated(): boolean {
  return _hydrated;
}

export function listCompetitorProfiles(): CompetitorProfile[] {
  return _competitors.slice();
}

export function getCompetitorProfile(id: string): CompetitorProfile | null {
  return _competitors.find((c) => c.id === id) ?? null;
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

// Test-only — never used by production code.
export const __test = {
  reconcileWithOrbs,
  resetForTests(): void {
    _competitors = [];
    _hydrated = false;
    _hydrating = null;
    _orbSubscribed = false;
    if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }
    if (_unsubscribeOrbs) { _unsubscribeOrbs(); _unsubscribeOrbs = null; }
  },
};
