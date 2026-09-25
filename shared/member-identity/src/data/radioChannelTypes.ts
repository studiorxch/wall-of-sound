/**
 * Batch 02L -- RADIO Channel + Rotation Persistence: the minimum durable
 * Firestore authority for a Channel and its ordered Program rotation, so
 * RADIO no longer needs an implicit singleton architecture (unlike
 * `eventProgram/current`, a fixed-path singleton document, `radioChannels`
 * is a real collection keyed by an explicit `channelId` -- V1 has exactly
 * one Channel, but nothing about this schema assumes that).
 *
 * PERSISTED IDENTITY, NOT HYDRATED RESOLVER INPUT: `RadioChannelRotation`
 * stores `programIds` (an ordered list of ids) and `anchorAtMs` only --
 * deliberately NOT `durationSeconds` per Program. Program duration is
 * already authoritative at `radioPrograms/{programId}.totalDurationSeconds`
 * (see `RadioProgramSummary`); duplicating it here would create a second,
 * driftable copy. A future runtime hydrates this persisted rotation into
 * `channelRotation.ts`'s own `ChannelRotation`/`RotationEntry[]` shape
 * (`{programId, durationSeconds}[]`) by joining each `programId` against
 * `radioPrograms` immediately before calling the pure resolver -- this
 * module and the pure resolver remain fully decoupled; NEITHER imports
 * the other.
 */

/**
 * Deliberately narrower than `EventStatus` (`"inactive"|"ready"|"active"`):
 * a Channel has no "configured but not yet live" operator workflow to
 * model yet (that three-state lifecycle belongs to `eventProgram/current`,
 * a single OPERATIONAL config an operator stages then activates). A
 * Channel is either broadcasting or it isn't -- "ready" has no meaning
 * here today. Named/spelled identically to `EventStatus`'s own two
 * shared values on purpose ("compatible vocabulary"), not merged into one
 * type, since the two concepts are allowed to diverge independently later
 * without one accidentally constraining the other.
 */
export type RadioChannelStatus = "active" | "inactive";

export interface RadioChannelRotation {
  /** Epoch milliseconds -- the fixed instant `programIds[0]` begins its first cycle. Same field name/meaning as `channelRotation.ts`'s own `ChannelRotation.anchorAtMs`. */
  readonly anchorAtMs: number;
  /** Ordered `radioPrograms/{programId}` references. Array order IS the rotation order -- no separate `order` field, matching `channelRotation.ts`'s own Batch 02K decision. */
  readonly programIds: readonly string[];
}

export interface RadioChannel {
  readonly channelId: string;
  readonly title: string;
  readonly status: RadioChannelStatus;
  readonly rotation: RadioChannelRotation;
  readonly updatedAt: Date | null;
  /** The operator's own member id (Firebase Auth uid) -- an audit trail, never used for authorization (Firestore rules are the actual authority gate). Same convention as `EventProgramState.updatedBy`. */
  readonly updatedBy: string | null;
}

export interface CreateRadioChannelInput {
  readonly channelId: string;
  readonly title: string;
  readonly status: RadioChannelStatus;
  readonly rotation: RadioChannelRotation;
}

/** Every field but `channelId` is optional -- an update may retitle, restage the rotation, or flip status independently, without needing to resupply the others. */
export interface UpdateRadioChannelInput {
  readonly channelId: string;
  readonly title?: string;
  readonly status?: RadioChannelStatus;
  readonly rotation?: RadioChannelRotation;
}

export interface RadioChannelRepository {
  /** Public read, matches `radioPrograms`/`eventProgram`'s own "PUBLIC/MEMBER read" authority rule. `null` if the channel has never been created. */
  getRadioChannel(channelId: string): Promise<RadioChannel | null>;
  /** Authorized-operator-only in Firestore rules. Create-only -- a `channelId` collision throws rather than overwriting. Validates every referenced `programId` against the real `radioPrograms` catalog before writing. */
  createRadioChannel(input: CreateRadioChannelInput, createdByMemberId: string): Promise<RadioChannel>;
  /** Authorized-operator-only in Firestore rules. The channel must already exist -- this never creates one. Validates the same way `createRadioChannel` does. */
  updateRadioChannel(input: UpdateRadioChannelInput, updatedByMemberId: string): Promise<RadioChannel>;
}
