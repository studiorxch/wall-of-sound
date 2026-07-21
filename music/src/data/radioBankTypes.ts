// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §4 — the RADIO Bank
// model: a received, reusable performance kit sent from a MUSIC Sampler
// Bank (a PlaylistRecord with playlistKind: "reference_overlay"). No
// lifecycle state machine, no publish concept — banks are out of scope for
// publication this build (spec §4/§6/§11). Deliberately minimal: MUSIC's
// own Sampler Bank grid has no artwork/accent-color/duration concept, so
// RadioBank snapshots only what MUSIC actually tracks. Pure — no DOM, no
// Node.

export type RadioBankEntry = {
  id: string;
  inboxItemId: string;
  order: number;
  locked: boolean;
  notes?: string;
};

// sourceMusicBankRevision mirrors RadioPlaylist.sourceMusicPlaylistRevision —
// a computed ordered-assigned-trackId-sequence signature used only for
// synchronization/comparison, never for display.
export type RadioBank = {
  id: string;
  sourceMusicBankId?: string;
  sourceMusicBankRevision?: string;
  title: string;
  entries: RadioBankEntry[];
  createdAt: string;
  updatedAt: string;
};
