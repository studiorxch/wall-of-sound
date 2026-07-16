// Music source pool — reusable track group for event/playlist generation (0623C).

export type MusicSourcePool = {
  id: string;
  title: string;
  description?: string;
  artistFilter?: string[];
  genreFilter?: string[];
  moodFilter?: string[];
  albumGroupIds?: string[];
  trackIds?: string[];
  defaultDurationMinutes?: number;
  defaultPresentationMode?: string;
  defaultMapStyleId?: string;
  createdAt: string;
  updatedAt: string;
};
