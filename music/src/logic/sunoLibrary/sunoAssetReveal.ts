// Suno Archive Readiness Dashboard (MUSIC Suno Phase 1) — client wrapper for
// POST /suno-asset-reveal, mirroring stemClient.ts's revealStemSetInFinder
// exactly. One reveal authority (server/radio/radioPackageReveal.ts's
// revealDirectoryInFinder) behind every "reveal in Finder" control in the
// app — this file adds no new implementation, just the fetch call for the
// new route.

export interface SunoAssetRevealResult {
  ok: boolean;
  reason?: "unsupported_platform" | "not_found" | "exec_failed";
  stderrTail?: string;
}

export async function revealSunoAssetInFinder(archiveAssetId: string): Promise<SunoAssetRevealResult> {
  const res = await fetch("/suno-asset-reveal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archiveAssetId }),
  });
  return res.json();
}
