// Global nav data (0722_MUSIC_Global_Navigation_Dropdowns): Studio ▾ / Library / Broadcast ▾.
// Single source of truth so desktop and any future responsive renderer stay in sync.

export type WorkspaceMode = "flow_curve" | "scheduler" | "broadcast_hud";

export type NavigationLink =
  | { label: string; kind: "internal"; mode: WorkspaceMode; title?: string }
  | { label: string; kind: "external"; href: string };

export type NavigationItem =
  | { label: string; kind: "internal"; mode: WorkspaceMode; title?: string; top: true }
  | { label: string; id: "studio" | "broadcast"; children: readonly NavigationLink[] };

export const navigationItems: readonly NavigationItem[] = [
  {
    label: "Studio",
    id: "studio",
    children: [
      { label: "Scheduler", kind: "internal", mode: "scheduler", title: "Scheduler / TV Guide" },
      { label: "Promoter", kind: "external", href: "https://studiorich-promoter.studiorich.chatgpt.site/" },
    ],
  },
  { label: "Library", kind: "internal", mode: "flow_curve", title: "Flow-Curve Editor", top: true },
  {
    label: "Broadcast",
    id: "broadcast",
    children: [
      // Labeled "Maps" per user direction — internal route/state (mode: "broadcast_hud")
      // is unchanged; only the nav label differs from the raw workspace mode name.
      { label: "Maps", kind: "internal", mode: "broadcast_hud", title: "Broadcast HUD Mode" },
      { label: "Radio", kind: "external", href: "https://radio.studiorich.tv/" },
    ],
  },
] as const;
