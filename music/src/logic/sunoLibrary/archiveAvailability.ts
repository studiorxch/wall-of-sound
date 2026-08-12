// Suno Library Manifest Integration — archive availability check.
//
// Thin client-side wrapper around GET /suno-archive-availability. Never
// receives or stores a raw filesystem path (spec: "archiveRoot... never
// persisted to PlayProject" — this build doesn't even fetch it; the route
// itself only ever returns online/offline).

import type { SunoArchiveAvailability } from "../../data/sunoLibraryTypes";

export async function checkSunoArchiveAvailability(): Promise<SunoArchiveAvailability> {
  try {
    const res = await fetch("/suno-archive-availability");
    if (!res.ok) return { state: "unknown", checkedAt: new Date().toISOString(), archiveRoot: null };
    const body = (await res.json()) as { state: "online" | "offline"; checkedAt: string };
    return { state: body.state, checkedAt: body.checkedAt, archiveRoot: null };
  } catch {
    return { state: "unknown", checkedAt: new Date().toISOString(), archiveRoot: null };
  }
}
