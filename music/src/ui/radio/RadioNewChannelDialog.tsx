// RADIO-04C -- the smallest direct Channel-creation affordance: Name +
// Initial Program. `RadioChannelRotation`'s own schema
// (`shared/member-identity/src/firebase/firestoreRadioChannelRepository.ts`'s
// `isValidRotationShape`) rejects an empty `programIds` array, so "Name
// only" cannot safely supply every field the way a defaults-only form
// could -- an Initial Program is a genuine, unavoidable requirement, not
// scope creep. This exact minimal field set (Title + Initial Program,
// `channelId` derived rather than operator-typed, `status: "inactive"`,
// `rotation.anchorAtMs: Date.now()`) already exists as
// `channel-control.html`'s own "Create First Channel" form
// (`channelControlRuntime.ts`) -- this dialog reuses the SAME
// `RadioChannelRepository.createRadioChannel` call and the SAME
// `slugifyStationTitle` helper, never a second Channel model/store.
// Advanced Channel configuration (rotation editing, Activate/Deactivate,
// Start/Restart Rotation Now) stays in Channel Control -- not duplicated
// here.

import { useEffect, useState } from "react";
import {
  createFirebaseMemberIdentityAuthority,
  type EventRadioRepository,
  type RadioChannel,
  type RadioChannelRepository,
  type RadioProgramSummary,
} from "@studiorich/member-identity";
import { slugifyStationTitle } from "../../logic/radio/radioWebBundlePlan";

interface Props {
  getChannelRepository: () => RadioChannelRepository;
  getEventRadioRepository: () => EventRadioRepository;
  onClose: () => void;
  onCreated: (channel: RadioChannel) => void;
}

let cachedMemberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority> | null = null;
function getMemberIdentity() {
  cachedMemberIdentity ??= createFirebaseMemberIdentityAuthority(import.meta.env);
  return cachedMemberIdentity;
}

type SaveState = { status: "idle" } | { status: "pending" } | { status: "error"; message: string };

export function RadioNewChannelDialog({ getChannelRepository, getEventRadioRepository, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [programId, setProgramId] = useState("");
  const [programs, setPrograms] = useState<readonly RadioProgramSummary[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  // Fetched independently of the parent's channel-scoped Program list --
  // the bootstrap case this dialog exists for (zero Channels yet) means
  // there is no selected Channel for that list to be scoped to at all.
  useEffect(() => {
    let cancelled = false;
    getEventRadioRepository()
      .listRadioPrograms()
      .then((list) => {
        if (cancelled) return;
        setPrograms(list);
        setProgramId((prev) => prev || list[0]?.id || "");
      })
      .catch((error) => {
        if (!cancelled) setSaveState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [getEventRadioRepository]);

  const trimmedTitle = title.trim();
  const channelId = trimmedTitle ? slugifyStationTitle(trimmedTitle) : "";

  async function handleCreate() {
    if (!trimmedTitle || !channelId || !programId) return;
    setSaveState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const createdByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      const created = await getChannelRepository().createRadioChannel(
        { channelId, title: trimmedTitle, status: "inactive", rotation: { anchorAtMs: Date.now(), programIds: [programId] } },
        createdByMemberId,
      );
      onCreated(created);
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog radio-new-channel-dialog">
        <div className="radio-dialog-header-row">
          <h3>New Channel</h3>
          <button className="radio-overlay-close" onClick={onClose}>✕</button>
        </div>
        <div className="radio-schedule-block-form">
          <label>
            Name
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Late Night FM" autoFocus />
          </label>
          <label>
            Initial Program
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={!programs || programs.length === 0}>
              {!programs && <option value="">Loading…</option>}
              {programs?.length === 0 && <option value="">No Programs exist yet — schedule one on an existing Channel first</option>}
              {programs?.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
          {saveState.status === "error" && <p className="radio-diff-note">{saveState.message}</p>}
          <div className="radio-dialog-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
            <button
              className="npw-btn npw-btn--primary"
              onClick={handleCreate}
              disabled={!trimmedTitle || !programId || saveState.status === "pending"}
            >
              {saveState.status === "pending" ? "Creating…" : "Create Channel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
