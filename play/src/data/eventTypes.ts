// Broadcast event model — event-first programming foundation (0623C).
// Events are the promoted programming object; playlists are reusable music engines.

export type BroadcastEventStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "completed"
  | "archived";

export type BroadcastEventRecurrence = {
  frequency: "none" | "daily" | "weekly" | "monthly";
  interval?: number;
  byWeekday?: Array<"MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU">;
  untilIso?: string;
  count?: number;
};

export type BroadcastEvent = {
  id: string;
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  recurrence?: BroadcastEventRecurrence;
  // Attached playlist or template
  playlistId?: string;
  playlistTemplateId?: string;
  sourcePoolId?: string;
  // Presentation
  presentationMode?: string;
  mapStyleId?: string;
  smartGridPresetId?: string;
  // Promo assets
  promoImageUrl?: string;
  coverImageUrl?: string;
  backgroundImageUrl?: string;
  // Taxonomy
  tags?: string[];
  genres?: string[];
  moodTags?: string[];
  locationTags?: string[];
  status: BroadcastEventStatus;
  createdAt: string;
  updatedAt: string;
};
