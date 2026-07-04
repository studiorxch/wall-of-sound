// Scheduler foundation (0621G).
// Playlist = content unit · Scheduler = time structure · Smart Grid = presentation.
// Schedule state persists inside the existing PlayProject model.

export type ScheduleBlockRole =
  | "main_block"
  | "bumper"
  | "interruption"
  | "replay"
  | "event";

export type ScheduleDisplayMode =
  | "full_scene"
  | "overlay"
  | "grid"
  | "map_channel";

export type ScheduleBlock = {
  blockId: string;
  playlistId: string;
  title: string;
  startTimeIso: string;
  endTimeIso: string;
  durationMinutes: number;
  role: ScheduleBlockRole;
  displayMode: ScheduleDisplayMode;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleState = {
  scheduleId: string;
  title: string;
  blocks: ScheduleBlock[];
  timezone?: string;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedSchedule = {
  now: ScheduleBlock | null;
  next: ScheduleBlock | null;
  later: ScheduleBlock[];
};

export const SCHEDULE_BLOCK_ROLES: ScheduleBlockRole[] = [
  "main_block", "bumper", "interruption", "replay", "event",
];

export const SCHEDULE_DISPLAY_MODES: ScheduleDisplayMode[] = [
  "full_scene", "overlay", "grid", "map_channel",
];

export const ROLE_LABELS: Record<ScheduleBlockRole, string> = {
  main_block:   "Main Block",
  bumper:       "Bumper",
  interruption: "Interruption",
  replay:       "Replay",
  event:        "Event",
};

export const DISPLAY_MODE_LABELS: Record<ScheduleDisplayMode, string> = {
  full_scene:  "Full Scene",
  overlay:     "Overlay",
  grid:        "Grid",
  map_channel: "Map Channel",
};
