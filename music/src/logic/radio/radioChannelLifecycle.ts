// RADIO-04E -- pure Channel lifecycle rules (Activate precondition, Delete
// precondition). No Firestore access here -- callers fetch whatever this
// needs (the Channel itself, its schedule blocks) and pass it in, same
// posture as channelRotationEditorState.ts/radioScheduleRecurrence.ts. The
// actual authority (createRadioChannel/updateRadioChannel/
// deleteRadioChannel + firestore.rules) is unchanged by this module --
// these are the friendly, pre-flight checks so an operator sees a concise
// reason instead of a generic permission/validation error, mirroring
// channelRotationEditorState.ts's own "cannot-remove-last-program" split
// between "rules permit it" and "application logic decides when it's
// actually a good idea."

import type { RadioChannel, RadioScheduleBlock } from "@studiorich/member-identity";

export type ActivateChannelResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Activation requires at least one default Program already in the
 * rotation -- the same rule RADIO-04D's own repository/rules layer
 * enforces authoritatively (an "active" Channel with an empty rotation is
 * rejected there too); this is the friendly pre-flight version so the
 * operator sees a concise, specific reason rather than a generic
 * validation/permission error after the write is attempted.
 */
export function canActivateChannel(channel: Pick<RadioChannel, "rotation">): ActivateChannelResult {
  if (channel.rotation.programIds.length === 0) {
    return {
      ok: false,
      reason: "This Channel has no default Program yet — add at least one in Channel Control before activating.",
    };
  }
  return { ok: true };
}

export type DeleteChannelResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Hard-delete is only safe when NOTHING references this Channel's
 * identity at all: any `radioScheduleBlock` -- past or future, scheduled
 * or cancelled -- would otherwise be left pointing at a channelId that no
 * longer exists (an orphaned reference for a future block, and a silent
 * loss of real broadcast history for a past/aired one). A genuinely
 * disposable Channel (created via RadioNewChannelDialog.tsx, never
 * actually scheduled) has zero such references, so this only blocks the
 * cases that would actually lose or orphan something -- it never
 * introduces an archive/retirement field or a second lifecycle state.
 * `active` is also refused outright: deactivating first is the one
 * required step, not a bypassable precondition.
 */
export function canDeleteChannel(
  channel: Pick<RadioChannel, "status">,
  scheduleBlocksForChannel: readonly Pick<RadioScheduleBlock, "id">[],
): DeleteChannelResult {
  if (channel.status === "active") {
    return { ok: false, reason: "Deactivate this Channel before deleting it." };
  }
  if (scheduleBlocksForChannel.length > 0) {
    return { ok: false, reason: "This Channel has schedule history and can't be deleted — deactivate it instead." };
  }
  return { ok: true };
}
