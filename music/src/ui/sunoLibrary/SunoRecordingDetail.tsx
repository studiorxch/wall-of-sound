// Suno Library — recording detail (spec §10.4/§10.5). All human metadata
// mutations write to canonicalRecordingId, never an encoded-location ID
// (spec §5: "must attach to the canonical recording ID, never merely the
// currently playing encoded-location ID").

import { useRef, useState } from "react";
import type {
  SunoAssetKind,
  SunoCanonicalRecording,
  SunoEncodedLocation,
  SunoInterestMarker,
  SunoInterestMarkerLabel,
  SunoLibraryImportResult,
  SunoListeningRecord,
  SunoListeningStatus,
  SunoSuggestedUse,
} from "../../data/sunoLibraryTypes";
import { encodedLocationsForCanonicalRecording } from "../../logic/sunoLibrary/selectors";
import { validateMarkerRange } from "../../logic/sunoLibrary/reviews";
import type { SunoCanonicalExclusionSummary } from "../../data/sunoTrainingExclusionTypes";

type LoadedResult = Extract<SunoLibraryImportResult, { status: "PASS" | "PASS_WITH_LIMITATION" }>;

export interface SunoRecordingDetailProps {
  canonicalRecordingId: string;
  result: LoadedResult;
  locationsById: Map<string, SunoEncodedLocation>;
  canonicalById: Map<string, SunoCanonicalRecording>;
  listeningRecordsByCanonicalId: Map<string, SunoListeningRecord>;
  interestMarkers: SunoInterestMarker[];
  archiveOnline: boolean | null;
  // 0812C — undefined when this recording is not excluded (or exclusion
  // data hasn't finished computing yet); present only for a genuinely
  // excluded canonical recording.
  trainingExclusion: SunoCanonicalExclusionSummary | undefined;
  onBack: () => void;
  onSetListeningStatus: (canonicalRecordingId: string, snapshotId: string, status: SunoListeningStatus) => void;
  onSetAssetKind: (canonicalRecordingId: string, snapshotId: string, assetKind: SunoAssetKind) => void;
  onToggleSuggestedUse: (canonicalRecordingId: string, snapshotId: string, use: SunoSuggestedUse) => void;
  onSetNotes: (canonicalRecordingId: string, snapshotId: string, notes: string) => void;
  onUpsertInterestMarker: (marker: SunoInterestMarker) => void;
  onRemoveInterestMarker: (markerId: string) => void;
}

const SUGGESTED_USES: SunoSuggestedUse[] = [
  "radio", "podcast", "video", "maps", "glyph", "resident-reference",
  "loop-source", "editing-source", "release-candidate", "research", "none",
];
const MARKER_LABELS: SunoInterestMarkerLabel[] = ["hook", "drop", "breakdown", "transition", "vocal-moment", "texture", "other"];
const ASSET_KINDS: SunoAssetKind[] = ["unknown", "song", "sound", "loop", "environment", "transition", "voice", "stem"];

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function SunoRecordingDetail(props: SunoRecordingDetailProps) {
  const { canonicalRecordingId, result, locationsById, canonicalById } = props;
  const canonical = canonicalById.get(canonicalRecordingId);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const review = props.listeningRecordsByCanonicalId.get(canonicalRecordingId);
  const markers = props.interestMarkers
    .filter((m) => m.canonicalRecordingId === canonicalRecordingId)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  // Resets the notes draft when the user navigates to a different
  // recording (or when a fresher notes value loads in for the same one),
  // without discarding in-progress typing on every keystroke. Adjusting
  // state during render — not inside a useEffect — is React's own
  // recommended pattern for this ("resetting state when a prop changes");
  // it avoids the extra render pass a useEffect-based reset would cause.
  const [notesDraft, setNotesDraft] = useState(review?.notes ?? "");
  const [notesResetKey, setNotesResetKey] = useState<string>(`${canonicalRecordingId}::${review?.notes ?? ""}`);
  const currentResetKey = `${canonicalRecordingId}::${review?.notes ?? ""}`;
  if (currentResetKey !== notesResetKey) {
    setNotesResetKey(currentResetKey);
    setNotesDraft(review?.notes ?? "");
  }

  if (!canonical) {
    return (
      <div className="suno-recording-detail">
        <button type="button" className="suno-breadcrumb-link" onClick={props.onBack}>
          ← Back
        </button>
        <p>Recording not found in the current snapshot.</p>
      </div>
    );
  }

  const members = encodedLocationsForCanonicalRecording(canonical, locationsById);
  const primaryMember = members[0];
  // Playback-state distinctions (spec §4 table):
  //   - direct: canonical.playableEncodedLocationId === primaryMember's own id and it's extracted
  //   - fallback: playableEncodedLocationId points at a DIFFERENT member than the one requested/primary
  //   - unavailable: playableEncodedLocationId is null (the one genuinely supplemental-unique case)
  const playableId = canonical.playableEncodedLocationId;
  const playableMember = playableId ? locationsById.get(playableId) : undefined;
  const isFallback = Boolean(playableMember && primaryMember && playableMember.archiveAssetId !== primaryMember.archiveAssetId);
  const isUnavailable = !playableMember;
  const archiveOffline = props.archiveOnline === false;
  const playbackDisabled = isUnavailable || archiveOffline;
  const audioSrc = playableMember && !archiveOffline ? `/suno-library-audio/${playableMember.archiveAssetId}` : undefined;

  const title = canonical.primaryTitleGuess ?? primaryMember?.filename ?? canonicalRecordingId;

  function captureMoment() {
    const startSeconds = audioRef.current?.currentTime ?? currentTime;
    const marker: SunoInterestMarker = {
      markerId: crypto.randomUUID(),
      canonicalRecordingId,
      startSeconds,
      endSeconds: null,
      label: "other",
      note: "",
      suggestedUses: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Non-null: this closure is only ever invoked after the !canonical
    // early-return below has already run for this render.
    const validation = validateMarkerRange(marker, canonical!.totalDurationSeconds || null);
    if (!validation.valid) return;
    props.onUpsertInterestMarker(marker);
  }

  return (
    <div className="suno-recording-detail">
      <button type="button" className="suno-breadcrumb-link" onClick={props.onBack}>
        ← Back
      </button>

      <h1 className="suno-detail-title">{title}</h1>
      {primaryMember?.filename && primaryMember.filename !== title && (
        <div className="suno-detail-original-filename">Original filename: {primaryMember.filename}</div>
      )}

      <div className="suno-detail-playback">
        {isUnavailable && (
          <div className="suno-playback-unavailable" role="status">
            Audio unavailable — supplemental source was not materialized into the extracted mirror
          </div>
        )}
        {!isUnavailable && archiveOffline && (
          <div className="suno-playback-unavailable" role="status">
            Archive offline — playback disabled. Browsing, reviews, and exports remain available.
          </div>
        )}
        {!isUnavailable && !archiveOffline && isFallback && (
          <div className="suno-playback-fallback-notice" role="status">
            Playing equivalent archived location
          </div>
        )}
        {!playbackDisabled && audioSrc && (
          <audio
            ref={audioRef}
            controls
            src={audioSrc}
            className="suno-audio-player"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
        )}
        {playbackDisabled && (
          <audio controls className="suno-audio-player" aria-label="Playback unavailable" data-disabled="true" />
        )}
      </div>

      <div className="suno-detail-grid">
        <div className="suno-detail-field">
          <span className="suno-detail-label">Workspace</span>
          <span className="suno-detail-value">{canonical.workspaceSlugs.join(", ") || "—"}</span>
        </div>
        <div className="suno-detail-field">
          <span className="suno-detail-label">Duration</span>
          <span className="suno-detail-value">{formatSeconds(canonical.totalDurationSeconds)}</span>
        </div>
        {primaryMember && (
          <>
            <div className="suno-detail-field">
              <span className="suno-detail-label">Codec / container</span>
              <span className="suno-detail-value">{primaryMember.technical.audioCodec} / {primaryMember.technical.containerFormat}</span>
            </div>
            <div className="suno-detail-field">
              <span className="suno-detail-label">Sample rate / channels</span>
              <span className="suno-detail-value">{primaryMember.technical.sampleRate ?? "—"} Hz / {primaryMember.technical.channelLayout ?? "—"}</span>
            </div>
          </>
        )}
        <div className="suno-detail-field">
          <span className="suno-detail-label">Suno UUID</span>
          <span className="suno-detail-value">
            {canonical.sunoUuid ? (
              <>
                {canonical.sunoUuid}{" "}
                <a href={canonical.sunoUrl ?? `https://suno.com/song/${canonical.sunoUuid}`} target="_blank" rel="noopener noreferrer" className="suno-link-icon">
                  Open on Suno
                </a>
              </>
            ) : (
              "Legacy — no embedded UUID"
            )}
          </span>
        </div>
        <div className="suno-detail-field">
          <span className="suno-detail-label">Provenance</span>
          <span className="suno-detail-value">Suno · snapshot {result.snapshot.snapshotId}</span>
        </div>
        <div className="suno-detail-field">
          <span className="suno-detail-label">Training status</span>
          <span className="suno-detail-value">excluded-suno-terms</span>
        </div>
      </div>

      {props.trainingExclusion && (() => {
        // "Propagated" means the recording's own PRIMARY displayed location
        // (the one its title/filename comes from) is not itself the reason
        // for exclusion — a co-grouped sibling member (real exact-duplicate/
        // alternate-encoding identity, e.g. a supplemental copy) is. Every
        // triggeringLocationId is necessarily a member of this same
        // canonical recording (exclude-on-any-source never reaches outside
        // one canonical group), so comparing against ALL members is always
        // true; comparing against just the primary member is the
        // meaningful, reachable distinction.
        const isPrimaryDirectlyExcluded = primaryMember
          ? props.trainingExclusion.triggeringLocationIds.includes(primaryMember.archiveAssetId)
          : false;
        const triggeringWorkspaces = Array.from(
          new Set(
            props.trainingExclusion.triggeringLocationIds
              .map((id) => locationsById.get(id)?.workspaceNameOriginal)
              .filter((n): n is string => Boolean(n)),
          ),
        );
        return (
          <div className="suno-detail-training-exclusion">
            <h2 className="suno-section-heading">Training eligibility exclusion</h2>
            <div className="suno-training-exclusion-reason">
              Excluded — generated within a workspace associated with the potentially pre-paid-plan period.
            </div>
            <div className="suno-training-exclusion-authority">Decision authority: human</div>
            {isPrimaryDirectlyExcluded && (
              <div className="suno-training-exclusion-origin">Originating workspace: {canonical.workspaceSlugs.join(", ") || "—"}</div>
            )}
            {!isPrimaryDirectlyExcluded && (
              <div className="suno-training-exclusion-propagation">
                Propagated: this recording's primary displayed location carries no excluded workspace of its own, but it shares a canonical identity with a location from {triggeringWorkspaces.join(", ") || "an excluded workspace"} — a real exact-duplicate/alternate-encoding relationship, never an invented one.
              </div>
            )}
          </div>
        );
      })()}

      {members.length > 1 && (
        <div className="suno-detail-locations">
          <h2 className="suno-section-heading">
            {canonical.identityBasis === "suno-uuid" ? "Alternate encodings" : "Duplicate/alternate encoded locations"}
            {" "}({members.length})
          </h2>
          <ul className="suno-location-list">
            {members.map((m) => (
              <li key={m.archiveAssetId} className={m.archiveAssetId === playableId ? "suno-location-item--playable" : ""}>
                {m.filename} — {m.technical.audioCodec}, {(m.technical.byteSize / 1024).toFixed(0)} KB
                {m.archiveAssetId === playableId ? " (playable)" : m.extractedRelativePath === null ? " (no extracted copy)" : ""}
                {m.collision.isCollisionRenamed && (
                  <span className="suno-collision-note"> — extracted as "{m.collision.derivedBasename}" (collision-safe rename; original name shown above remains primary)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="suno-detail-listening-controls">
        <h2 className="suno-section-heading">Listening party</h2>
        <div className="suno-listening-buttons">
          <button type="button" className={`suno-btn${review?.listeningStatus === "favorite" ? " suno-btn--active" : ""}`} onClick={() => props.onSetListeningStatus(canonicalRecordingId, result.snapshot.snapshotId, "favorite")}>
            Favorite
          </button>
          <button type="button" className={`suno-btn${review?.listeningStatus === "revisit" ? " suno-btn--active" : ""}`} onClick={() => props.onSetListeningStatus(canonicalRecordingId, result.snapshot.snapshotId, "revisit")}>
            Revisit
          </button>
          <button type="button" className={`suno-btn${review?.listeningStatus === "reject" ? " suno-btn--active" : ""}`} onClick={() => props.onSetListeningStatus(canonicalRecordingId, result.snapshot.snapshotId, "reject")}>
            Reject
          </button>
          <button type="button" className={`suno-btn${review?.assetKind === "sound" ? " suno-btn--active" : ""}`} onClick={() => props.onSetAssetKind(canonicalRecordingId, result.snapshot.snapshotId, "sound")}>
            Mark as Sound
          </button>
          <button type="button" className={`suno-btn${review?.suggestedUses.includes("radio") ? " suno-btn--active" : ""}`} onClick={() => props.onToggleSuggestedUse(canonicalRecordingId, result.snapshot.snapshotId, "radio")}>
            RADIO candidate
          </button>
          <button type="button" className={`suno-btn${review?.suggestedUses.includes("resident-reference") ? " suno-btn--active" : ""}`} onClick={() => props.onToggleSuggestedUse(canonicalRecordingId, result.snapshot.snapshotId, "resident-reference")}>
            Resident seed
          </button>
          <button type="button" className="suno-btn" onClick={captureMoment} disabled={playbackDisabled}>
            Capture interesting moment
          </button>
        </div>

        <div className="suno-asset-kind-select">
          <label htmlFor="suno-asset-kind">Asset kind</label>
          <select
            id="suno-asset-kind"
            value={review?.assetKind ?? "unknown"}
            onChange={(e) => props.onSetAssetKind(canonicalRecordingId, result.snapshot.snapshotId, e.target.value as SunoAssetKind)}
          >
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="suno-suggested-uses">
          <span className="suno-detail-label">Suggested uses (annotation only — no promotion, publish, copy, or training)</span>
          <div className="suno-suggested-use-chips">
            {SUGGESTED_USES.map((use) => (
              <button
                key={use}
                type="button"
                className={`suno-chip${review?.suggestedUses.includes(use) ? " suno-chip--active" : ""}`}
                aria-pressed={review?.suggestedUses.includes(use) ?? false}
                onClick={() => props.onToggleSuggestedUse(canonicalRecordingId, result.snapshot.snapshotId, use)}
              >
                {use}
              </button>
            ))}
          </div>
        </div>

        <div className="suno-notes-field">
          <label htmlFor="suno-notes">Notes</label>
          <textarea
            id="suno-notes"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => props.onSetNotes(canonicalRecordingId, result.snapshot.snapshotId, notesDraft)}
          />
        </div>
      </div>

      <div className="suno-detail-markers">
        <h2 className="suno-section-heading">Interest markers ({markers.length})</h2>
        <ul className="suno-marker-list">
          {markers.map((m) => (
            <li key={m.markerId} className="suno-marker-item">
              <span className="suno-marker-time">{formatSeconds(m.startSeconds)}</span>
              <select
                value={m.label}
                aria-label={`Label for marker at ${formatSeconds(m.startSeconds)}`}
                onChange={(e) => props.onUpsertInterestMarker({ ...m, label: e.target.value as SunoInterestMarkerLabel })}
              >
                {MARKER_LABELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button type="button" className="suno-btn suno-btn--small" onClick={() => props.onRemoveInterestMarker(m.markerId)}>
                Remove
              </button>
            </li>
          ))}
          {markers.length === 0 && <li className="suno-marker-empty">No markers captured yet.</li>}
        </ul>
      </div>
    </div>
  );
}
