// RADIO-04E -- trivial by design: display title/name only. `channelId` is
// never touched or re-derived (unlike RadioNewChannelDialog.tsx's create
// path, where `channelId` is derived once from the title at creation
// time) -- renaming an EXISTING Channel must never change its stable
// identity. Rotation, schedules, history, and status are all preserved
// automatically: `updateRadioChannel` only overwrites the fields actually
// present in its input (see firestoreRadioChannelRepository.ts's own
// `input.rotation ?? current.rotation` etc.), and this dialog's input
// carries `title` alone. No Program selection, no republishing, no
// approval step.

import { useState } from "react";
import {
  createFirebaseMemberIdentityAuthority,
  type RadioChannel,
  type RadioChannelRepository,
} from "@studiorich/member-identity";

interface Props {
  channel: RadioChannel;
  getChannelRepository: () => RadioChannelRepository;
  onClose: () => void;
  onRenamed: (channel: RadioChannel) => void;
}

let cachedMemberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority> | null = null;
function getMemberIdentity() {
  cachedMemberIdentity ??= createFirebaseMemberIdentityAuthority(import.meta.env);
  return cachedMemberIdentity;
}

type SaveState = { status: "idle" } | { status: "pending" } | { status: "error"; message: string };

export function RadioRenameChannelDialog({ channel, getChannelRepository, onClose, onRenamed }: Props) {
  const [title, setTitle] = useState(channel.title);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const trimmedTitle = title.trim();

  async function handleSave() {
    if (!trimmedTitle) return;
    setSaveState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const updatedByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      const updated = await getChannelRepository().updateRadioChannel(
        { channelId: channel.channelId, title: trimmedTitle },
        updatedByMemberId,
      );
      onRenamed(updated);
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog radio-new-channel-dialog">
        <div className="radio-dialog-header-row">
          <h3>Rename Channel</h3>
          <button className="radio-overlay-close" onClick={onClose}>✕</button>
        </div>
        <div className="radio-schedule-block-form">
          <label>
            Name
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          {saveState.status === "error" && <p className="radio-diff-note">{saveState.message}</p>}
          <div className="radio-dialog-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
            <button
              className="npw-btn npw-btn--primary"
              onClick={handleSave}
              disabled={!trimmedTitle || saveState.status === "pending"}
            >
              {saveState.status === "pending" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
