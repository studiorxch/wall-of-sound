// Global nav data (0722_MUSIC_Global_Navigation_Dropdowns): Studio ▾ / Library ▾ / Broadcast ▾.
// Single source of truth so desktop and any future responsive renderer stay in sync.
//
// 0729_STUDIORICH_Navigation_Consolidation — Library and Broadcast are both
// dropdowns now (previously Library was a single top-level button and
// Broadcast's second item was an internal "Maps" HUD mode mislabeled to read
// like the palette product). Canonical structure:
//   Library   -> MUSIC, MAPS        (authoring/library domain)
//   Broadcast -> RADIO, LIVE MAP    (live presentation domain)
// localhost:5176 is the single canonical entry point; LIVE MAP opens the
// same-origin /wall-app/ runtime (see vite.config.ts's proxy) — never the
// standalone :5500 server, which is deprecated/unsupported for normal use.
//
// workspaceMode "broadcast_hud" (the DJ/audio broadcast HUD, BroadcastHudShell)
// is intentionally no longer linked from top nav per this consolidation — its
// component and App.tsx wiring are untouched, just not nav-reachable here.

export type WorkspaceMode = "flow_curve" | "scheduler" | "broadcast_hud" | "maps";

export type NavigationAction = "openRacetrack";

export type NavigationLink =
  | { label: string; kind: "internal"; mode: WorkspaceMode; title?: string }
  | { label: string; kind: "external"; href: string; title?: string; newTab?: boolean }
  // 0805F — for links that trigger a real cross-context bridge call (e.g.
  // named-window open/focus) rather than either an in-app mode switch or a
  // plain anchor navigation. Kept as a plain string tag (never a live
  // function reference) so this file stays pure data; TopBar.tsx maps
  // `action` to the real handler.
  | { label: string; kind: "action"; action: NavigationAction; title?: string };

export type NavigationItem = {
  label: string;
  id: "studio" | "library" | "broadcast";
  children: readonly NavigationLink[];
};

export const navigationItems: readonly NavigationItem[] = [
  {
    label: "Studio",
    id: "studio",
    children: [
      { label: "Scheduler", kind: "internal", mode: "scheduler", title: "Scheduler / TV Guide" },
      { label: "Promoter", kind: "external", href: "https://studiorich-promoter.studiorich.chatgpt.site/" },
    ],
  },
  {
    label: "Library",
    id: "library",
    children: [
      { label: "MUSIC", kind: "internal", mode: "flow_curve", title: "Flow-Curve Editor" },
      { label: "MAPS", kind: "internal", mode: "maps", title: "MAPS Geographic Library" },
    ],
  },
  {
    label: "Broadcast",
    id: "broadcast",
    children: [
      { label: "RADIO", kind: "external", href: "https://radio.studiorich.tv/" },
      // Same-origin proxied Wall runtime (vite.config.ts server.proxy) —
      // localhost:5176 is the canonical MUSIC entry point; opens in a new
      // tab so the Library session stays open alongside it.
      { label: "LIVE MAP", kind: "external", href: "http://localhost:5176/wall-app/", title: "Wall — live Broadcast presentation", newTab: true },
      // 0805F — RACETRACK is a mode on the SAME wall/ runtime, not a
      // separate page, so it can't be a plain href like the entries above
      // (a generic `target="_blank"` anchor opens a NEW tab every click,
      // never reusing one). Dispatches to wallRacetrackBridge.ts's
      // openOrFocusRacetrack(), which reuses LIVE MAP's own named window.
      { label: "RACETRACK", kind: "action", action: "openRacetrack", title: "Racetrack — cached course presentation" },
    ],
  },
] as const;
