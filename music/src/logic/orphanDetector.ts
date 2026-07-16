import type { OrphanReason, OrphanTrack } from "../data/playlistTypes";

const REASON_LABELS: Record<OrphanReason, string> = {
  BPM_TOO_LOW: "BPM too low for any slot in this curve",
  BPM_TOO_HIGH: "BPM too high for any slot in this curve",
  ENERGY_TOO_LOW: "Energy too low for any available slot",
  ENERGY_TOO_HIGH: "Energy too high for any available slot",
  KEY_TOO_RISKY: "Camelot key transition is too risky at every placement",
  NO_VALID_SLOT: "No valid slot remaining",
  LOCK_CONFLICT: "Conflicts with a locked track assignment",
};

export function buildOrphanTrack(params: {
  track: { trackId: string };
  reasons: OrphanReason[];
}): OrphanTrack {
  const { track, reasons } = params;
  const explanation = reasons.map((r) => REASON_LABELS[r]).join("; ");
  return { trackId: track.trackId, reasons, explanation };
}
