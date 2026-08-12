import { useRef, useState } from "react";
import type {
  MachineLifeDisposition,
  MachineLifeLifeScore,
  MachineLifeProxyLibrary,
  MachineLifeRecording,
  MachineLifeRecordingReview,
} from "../../data/machineLifeTypes";
import { createEmptyMachineLifeReview } from "../../data/machineLifeTypes";
import { directSourceLineage, preLifeProxyAvailable, rawProxyAvailable } from "../../logic/machineLife/machineLifeSelectors";
import { machineLifeProxyPlayUrl } from "../../logic/machineLife/machineLifeProxyImport";

const LIFE_SCORES: MachineLifeLifeScore[] = [0, 1, 2];
const DISPOSITIONS: MachineLifeDisposition[] = ["preserve", "extract", "develop", "resident-seed", "system-clue", "dormant"];

interface Props {
  recording: MachineLifeRecording;
  review: MachineLifeRecordingReview | undefined;
  proxyLibrary: MachineLifeProxyLibrary | undefined;
  mirrorRootAbsPath: string | null; // fetched once, used only to render evidence <img> src for this render — never persisted
  onSaveReview(review: MachineLifeRecordingReview): void;
}

// Keyed by recording.id from the parent (same remount-to-reset idiom as
// DjTrackEditWorkspace.tsx's DjTrackEditor) — resets `draft` naturally on
// selection change without a setState-in-effect sync.
export function MachineLifeRecordingDetail({ recording, review, proxyLibrary, mirrorRootAbsPath, onSaveReview }: Props) {
  const [draft, setDraft] = useState<MachineLifeRecordingReview>(review ?? createEmptyMachineLifeReview(recording.id));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const proxy = proxyLibrary?.proxies.find((p) => p.kind === "pre-life" && p.stem === recording.canonicalFilename.replace(/\.[^.]+$/, ""));
  const audioAvailable = preLifeProxyAvailable(recording, proxyLibrary);
  const lineage = directSourceLineage(recording);
  const rawLineage = lineage.filter((u) => u.collection === "studiorich-raw");

  function save(patch: Partial<MachineLifeRecordingReview>) {
    const next: MachineLifeRecordingReview = { ...draft, ...patch, reviewedAt: new Date().toISOString() };
    setDraft(next);
    onSaveReview(next);
  }

  function captureStrongestStart() {
    save({ strongestMomentStartSeconds: audioRef.current?.currentTime ?? currentTime });
  }
  function captureStrongestEnd() {
    save({ strongestMomentEndSeconds: audioRef.current?.currentTime ?? currentTime });
  }

  function evidenceUrl(relPath: string | undefined): string | null {
    if (!mirrorRootAbsPath || !relPath) return null;
    const absPath = `${mirrorRootAbsPath}/REFERENCE/EVIDENCE/${relPath}`;
    return `/machine-life-evidence-data?path=${encodeURIComponent(absPath)}`;
  }
  const waveformSrc = evidenceUrl(recording.waveformEvidencePath);
  const spectrogramSrc = evidenceUrl(recording.spectrogramEvidencePath);

  return (
    <section className="ml-detail">
      <header className="ml-detail-header">
        <h2>{recording.id}</h2>
        <span className="ml-detail-badge">{recording.category} / {recording.mode}</span>
        <span className="ml-detail-provenance">Deterministic Pre-Life recording — procedural collage, not a trained-model output.</span>
      </header>

      <section className="ml-detail-panel">
        <h3>Playback</h3>
        {audioAvailable && proxy ? (
          <audio
            ref={audioRef}
            controls
            src={machineLifeProxyPlayUrl(proxy)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            style={{ width: "100%" }}
          />
        ) : (
          <p className="ml-detail-unavailable">No Pre-Life audition proxy imported for this recording. Audio-only proxy — never a canonical WAV substitute.</p>
        )}
        <div className="ml-detail-actions">
          <button onClick={captureStrongestStart} disabled={!audioAvailable}>Capture strongest-moment start ({currentTime.toFixed(2)}s)</button>
          <button onClick={captureStrongestEnd} disabled={!audioAvailable}>Capture strongest-moment end ({currentTime.toFixed(2)}s)</button>
        </div>
        <p className="ml-detail-strongest">
          Strongest moment: {draft.strongestMomentStartSeconds ?? "—"}s to {draft.strongestMomentEndSeconds ?? "—"}s
        </p>
      </section>

      <section className="ml-detail-panel">
        <h3>Canonical Identity <span className="ml-detail-canonical-tag">canonical, not proxy</span></h3>
        <dl className="ml-detail-facts">
          <div><dt>Seed</dt><dd>{recording.seed}</dd></div>
          <div><dt>Duration</dt><dd>{recording.durationSeconds}s</dd></div>
          <div><dt>Construction mode</dt><dd>{recording.mode}</dd></div>
          <div><dt>Canonical filename</dt><dd>{recording.canonicalFilename}</dd></div>
          <div><dt>Canonical checksum (SHA-256)</dt><dd className="ml-detail-checksum">{recording.canonicalChecksumSha256}</dd></div>
        </dl>
      </section>

      <section className="ml-detail-panel">
        <h3>Direct Source Relationships</h3>
        <p className="ml-detail-provenance">Direct sources only — ancestry is not expanded beyond what this manifest proves.</p>
        <ul className="ml-detail-lineage">
          {lineage.map((use, i) => (
            <li key={i}>
              <span className="ml-detail-lineage-collection">{use.collection}</span> {use.filename} @ {use.startSeconds.toFixed(3)}s
              <span className="ml-detail-checksum"> {use.sha256.slice(0, 12)}…</span>
            </li>
          ))}
        </ul>
        {rawLineage.length > 0 && (
          <div className="ml-detail-raw-audition">
            <h4>Raw source audition</h4>
            {rawLineage.map((use, i) => {
              const rawProxy = proxyLibrary?.proxies.find((p) => p.kind === "raw" && p.stem === use.filename.replace(/\.[^.]+$/, ""));
              const available = rawProxyAvailable(use.filename, proxyLibrary);
              return (
                <div key={i} className="ml-detail-raw-audition-row">
                  <span>{use.filename}</span>
                  {available && rawProxy ? (
                    <audio controls src={machineLifeProxyPlayUrl(rawProxy)} style={{ width: "260px" }} />
                  ) : (
                    <span className="ml-detail-unavailable">No raw audition proxy imported.</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="ml-detail-panel">
        <h3>Evidence</h3>
        <div className="ml-detail-evidence-row">
          <figure>
            <figcaption>Waveform</figcaption>
            {waveformSrc ? <img src={waveformSrc} alt={`Waveform for ${recording.id}`} /> : <p className="ml-detail-unavailable">Not loaded.</p>}
          </figure>
          <figure>
            <figcaption>Spectrogram</figcaption>
            {spectrogramSrc ? <img src={spectrogramSrc} alt={`Spectrogram for ${recording.id}`} /> : <p className="ml-detail-unavailable">Not loaded.</p>}
          </figure>
        </div>
        <p className="ml-detail-provenance">Recipe: {recording.recipeEvidencePath ?? "not referenced"}</p>
      </section>

      <section className="ml-detail-panel ml-detail-review">
        <h3>Pass 1 — Immediate Listening</h3>
        <label>First image
          <input type="text" value={draft.firstImage} onChange={(e) => save({ firstImage: e.target.value })} />
        </label>
        <label>Immediate note
          <textarea value={draft.immediateNote} onChange={(e) => save({ immediateNote: e.target.value })} />
        </label>
        <div className="ml-detail-field-row">
          <label>Life score
            <select value={draft.lifeScore ?? ""} onChange={(e) => save({ lifeScore: e.target.value === "" ? null : (Number(e.target.value) as MachineLifeLifeScore) })}>
              <option value="">Unreviewed</option>
              {LIFE_SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Replay
            <select value={draft.replay === null ? "" : draft.replay ? "yes" : "no"} onChange={(e) => save({ replay: e.target.value === "" ? null : e.target.value === "yes" })}>
              <option value="">Unreviewed</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <p className="ml-detail-provenance">Life measures sustained apparent behavior, not consciousness, intention, or quality. Replay is independent from Life — Life 2 + Replay No and Life 1 + Replay Yes are both valid.</p>
      </section>

      <section className="ml-detail-panel ml-detail-review">
        <h3>Pass 2 — Source-Lineage Review</h3>
        <label>Useful source relationship
          <textarea value={draft.usefulSourceRelationship} onChange={(e) => save({ usefulSourceRelationship: e.target.value })} />
        </label>
        <label>Behavior discovered
          <textarea value={draft.behaviorDiscovered} onChange={(e) => save({ behaviorDiscovered: e.target.value })} />
        </label>
        <div className="ml-detail-field-row">
          <label>Disposition
            <select value={draft.disposition ?? ""} onChange={(e) => save({ disposition: e.target.value === "" ? null : (e.target.value as MachineLifeDisposition) })}>
              <option value="">None</option>
              {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <label>Next action
          <textarea value={draft.nextAction} onChange={(e) => save({ nextAction: e.target.value })} />
        </label>
        {draft.reviewedAt && <p className="ml-detail-provenance">Last saved {new Date(draft.reviewedAt).toLocaleString()}.</p>}
      </section>
    </section>
  );
}
