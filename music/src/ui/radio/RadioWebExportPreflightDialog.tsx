// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §9 — the Web Bundle
// export preflight/confirm/result dialog. MUST NEVER claim the export
// uploads, hosts, or deploys anything — the literal statement below is a
// hard requirement (see radioWebBundleExportLanguage.test.ts).

import { useEffect, useMemo, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { RadioPlaylist, RadioPlaylistEntry, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import type { RadioTrackPackageManifest } from "../../data/radioTrackPackageTypes";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";
import { buildWebBundlePlan, slugifyStationTitle, buildWebBundleExportRequest, type EntryPlanInput } from "../../logic/radio/radioWebBundlePlan";
import { runWebBundleExport, exportWebBundleViaFetch } from "../../logic/radio/radioWebBundleExportOrchestrator";
import { fetchTrackPackageManifest } from "../../logic/radio/radioTrackPreparationOrchestrator";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  radioPlaylist: RadioPlaylist;
  entries: RadioPlaylistEntry[];
  entryTrack: Map<string, Track | undefined>;
  preparationStateByEntryId: Map<string, RadioEntryPreparationState>;
  radioWebExports: RadioWebExportRecord[];
  onExported: (record: RadioWebExportRecord) => void;
  onClose: () => void;
}

type Phase = "preflight" | "exporting" | "unchanged" | "result";

export function RadioWebExportPreflightDialog({
  radioPlaylist, entries, entryTrack, preparationStateByEntryId, radioWebExports, onExported, onClose,
}: Props) {
  const [manifestsByEntryId, setManifestsByEntryId] = useState<Map<string, RadioTrackPackageManifest>>(new Map());
  const [loadingManifests, setLoadingManifests] = useState(true);
  const [slug, setSlug] = useState(() => slugifyStationTitle(radioPlaylist.title));
  const [phase, setPhase] = useState<Phase>("preflight");
  const [issues, setIssues] = useState<string[]>([]);
  const [exportedRecord, setExportedRecord] = useState<RadioWebExportRecord | null>(null);
  const [existingVersionOnUnchanged, setExistingVersionOnUnchanged] = useState<number | undefined>(undefined);
  const [revealNote, setRevealNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const readyEntries = entries.filter((e) => preparationStateByEntryId.get(e.id) === "READY" && e.trackBinding);
    // Every setState call below runs inside a .then() callback, never
    // synchronously in the effect body itself — Promise.all([]) still
    // resolves asynchronously, so no early-return special case is needed.
    Promise.resolve().then(() => { if (!cancelled) setLoadingManifests(true); });
    Promise.all(readyEntries.map(async (e) => {
      const b = e.trackBinding!;
      const manifest = await fetchTrackPackageManifest(b.radioTrackId, b.packageVersion);
      return [e.id, manifest] as const;
    })).then((pairs) => {
      if (cancelled) return;
      const next = new Map<string, RadioTrackPackageManifest>();
      for (const [id, m] of pairs) if (m) next.set(id, m);
      setManifestsByEntryId(next);
      setLoadingManifests(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioPlaylist.id]);

  const plan = useMemo(() => {
    const inputs: EntryPlanInput[] = entries.map((entry) => ({
      entry, track: entryTrack.get(entry.id),
      state: preparationStateByEntryId.get(entry.id) ?? "NOT_APPROVED",
      packageManifest: manifestsByEntryId.get(entry.id) ?? null,
    }));
    return buildWebBundlePlan(radioPlaylist, inputs);
  }, [radioPlaylist, entries, entryTrack, preparationStateByEntryId, manifestsByEntryId]);

  const previousVersion = useMemo(() => {
    const versions = radioWebExports.filter((r) => r.radioPlaylistId === radioPlaylist.id).map((r) => r.bundleVersion);
    return versions.length > 0 ? Math.max(...versions) : undefined;
  }, [radioWebExports, radioPlaylist.id]);

  const artworkDataUrl = radioPlaylist.coverImage?.src?.startsWith("data:") ? radioPlaylist.coverImage.src : undefined;

  async function handleExport(force?: boolean) {
    setPhase("exporting");
    const request = buildWebBundleExportRequest(plan, slug, artworkDataUrl, force);
    const outcome = await runWebBundleExport(request, radioPlaylist.id, { exportBundle: exportWebBundleViaFetch });
    if (outcome.unchanged) {
      setExistingVersionOnUnchanged(outcome.response.existingVersion);
      setPhase("unchanged");
      return;
    }
    if (outcome.record) {
      onExported(outcome.record);
      setExportedRecord(outcome.record);
      setPhase("result");
      return;
    }
    setIssues(outcome.response.issues.map((i) => i.message));
    setPhase("result");
  }

  async function handleReveal() {
    if (!exportedRecord) return;
    try {
      const resp = await fetch("/radio-web-bundle-reveal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: exportedRecord.slug, bundleVersion: exportedRecord.bundleVersion }),
      });
      const json = await resp.json();
      setRevealNote(json.ok ? "Revealed in Finder." : "Couldn't reveal — open the export path manually.");
    } catch {
      setRevealNote("Couldn't reveal — open the export path manually.");
    }
  }

  async function handleCopyPath() {
    if (!exportedRecord) return;
    try {
      await navigator.clipboard.writeText(exportedRecord.exportPath);
      setRevealNote("Export path copied.");
    } catch {
      setRevealNote("Couldn't copy — select the path manually.");
    }
  }

  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog radio-web-export-dialog">
        <div className="radio-dialog-header-row">
          <h3>Export Web Bundle — {radioPlaylist.title}</h3>
          <button className="radio-overlay-close" onClick={onClose}>✕</button>
        </div>

        <p className="radio-publish-notice">Creates a local web bundle. Does not upload or deploy.</p>

        {phase === "preflight" && (
          <div className="radio-web-export-preflight">
            <label className="radio-web-export-slug">
              Station slug
              <input value={slug} onChange={(e) => setSlug(slugifyStationTitle(e.target.value))} />
            </label>
            <ul className="radio-web-export-counts">
              <li>Ready: {plan.counts.ready}</li>
              <li>Needs approval: {plan.counts.notApproved}</li>
              <li>Needs preparation: {plan.counts.needsPreparation}</li>
              <li>Stale/failed: {plan.counts.stale + plan.counts.failed}</li>
              <li>Excluded: {plan.counts.excluded}</li>
            </ul>
            <p>Estimated size: {formatBytes(plan.estimatedTotalBytes)}{plan.artworkAvailable ? " (includes artwork)" : ""}</p>
            <p>Destination: <code>library/music/RadioWebExports/{slug}/v{(previousVersion ?? 0) + 1}/</code></p>
            {previousVersion != null && <p>Previous export: v{previousVersion}</p>}
            {loadingManifests && <p>Loading package details…</p>}
            {plan.blockers.length > 0 && (
              <div className="radio-web-export-blockers">
                <h4>Blocking issues ({plan.blockers.length})</h4>
                <ul>{plan.blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
              </div>
            )}
            <div className="radio-dialog-actions">
              <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="npw-btn npw-btn--primary" disabled={!plan.canExport || loadingManifests} onClick={() => handleExport()}>
                Export Web Bundle…
              </button>
            </div>
          </div>
        )}

        {phase === "exporting" && <p>Exporting…</p>}

        {phase === "unchanged" && (
          <div>
            <p>No changes since v{existingVersionOnUnchanged}. Export a new version anyway?</p>
            <div className="radio-dialog-actions">
              <button className="npw-btn npw-btn--ghost" onClick={() => setPhase("preflight")}>Cancel</button>
              <button className="npw-btn npw-btn--primary" onClick={() => handleExport(true)}>Export anyway</button>
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="radio-web-export-result">
            {exportedRecord ? (
              <>
                <p>Exported v{exportedRecord.bundleVersion} — {exportedRecord.entryCount} tracks, {formatBytes(exportedRecord.totalByteSize)}.</p>
                <p><code>{exportedRecord.exportPath}</code></p>
                {revealNote && <p className="radio-diff-note">{revealNote}</p>}
                <div className="radio-dialog-actions">
                  <button className="npw-btn npw-btn--ghost" onClick={handleReveal}>Reveal in Finder</button>
                  <button className="npw-btn npw-btn--ghost" onClick={handleCopyPath}>Copy export path</button>
                  <button className="npw-btn npw-btn--primary" onClick={onClose}>Done</button>
                </div>
              </>
            ) : (
              <>
                <h4>Export failed</h4>
                <ul>{issues.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
                <div className="radio-dialog-actions">
                  <button className="npw-btn npw-btn--ghost" onClick={() => setPhase("preflight")}>Back</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
