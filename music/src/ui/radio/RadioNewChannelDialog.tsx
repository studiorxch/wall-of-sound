// RADIO-04D -- reduced to the true minimum: Name only. An `inactive`
// Channel may now have an empty `rotation.programIds`
// (`shared/member-identity/src/firebase/firestoreRadioChannelRepository.ts`'s
// status-aware `isValidRotationShape` -- only `active` still requires at
// least one Program), so this dialog no longer has any reason to ask for
// one, fetch the Program catalog, or depend on `EventRadioRepository` at
// all. `channelId` is derived via the existing, already-tested
// `slugifyStationTitle` helper (never operator-typed); `status: "inactive"`
// and `rotation.anchorAtMs: Date.now()` reuse the same defaults
// `channel-control.html`'s own "Create First Channel" form already uses.
// Same `RadioChannelRepository.createRadioChannel` call, never a second
// Channel model/store. No Program is fabricated, defaulted, or
// auto-selected -- an empty rotation is written exactly as such. Advanced
// Channel configuration (adding Programs to the rotation, Activate/
// Deactivate, Start/Restart Rotation Now) stays in Channel Control.

import { useState } from "react";
import {
  createFirebaseMemberIdentityAuthority,
  type RadioChannel,
  type RadioChannelRepository,
} from "@studiorich/member-identity";
import { slugifyStationTitle } from "../../logic/radio/radioWebBundlePlan";

interface Props {
  getChannelRepository: () => RadioChannelRepository;
  onClose: () => void;
  onCreated: (channel: RadioChannel) => void;
}

let cachedMemberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority> | null = null;
function getMemberIdentity() {
  cachedMemberIdentity ??= createFirebaseMemberIdentityAuthority(import.meta.env);
  return cachedMemberIdentity;
}

type SaveState = { status: "idle" } | { status: "pending" } | { status: "error"; message: string };

export function RadioNewChannelDialog({ getChannelRepository, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const trimmedTitle = title.trim();
  const channelId = trimmedTitle ? slugifyStationTitle(trimmedTitle) : "";

  async function handleCreate() {
    if (!trimmedTitle || !channelId) return;
    setSaveState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const createdByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      const created = await getChannelRepository().createRadioChannel(
        { channelId, title: trimmedTitle, status: "inactive", rotation: { anchorAtMs: Date.now(), programIds: [] } },
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
          {saveState.status === "error" && <p className="radio-diff-note">{saveState.message}</p>}
          <div className="radio-dialog-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
            <button
              className="npw-btn npw-btn--primary"
              onClick={handleCreate}
              disabled={!trimmedTitle || saveState.status === "pending"}
            >
              {saveState.status === "pending" ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
