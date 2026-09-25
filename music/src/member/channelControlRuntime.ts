/**
 * Batch 02Q/02R -- RADIO Channel Control: Bootstrap + Rotation Editor
 * (checkpoint 1) plus the ON AIR/NEXT diagnostic (checkpoint 2). Create
 * the first Channel, edit its rotation (add/remove/reorder), Save
 * Rotation, Activate/Deactivate, Start/Restart Rotation Now, and see what
 * the deterministic Channel clock says is on air right now. No audio.
 *
 * AUTHORITY: reuses the SAME Firebase Auth (Google sign-in) Member
 * identity Event Radio Control already uses -- no second identity
 * system. `OPERATOR_EMAILS` here is a client-side UX gate ONLY; the real
 * authority boundary is firestore.rules' own operator allowlist,
 * enforced server-side regardless of what this file does or doesn't
 * check -- same disclosed posture as eventControlRuntime.ts's own.
 *
 * ANCHOR PRESERVATION: every write this file issues is built by
 * `channelRotationEditorState.ts`'s own pure functions -- see that
 * module's own doc for exactly which operations preserve `anchorAtMs`
 * and which one (Start/Restart only) deliberately changes it.
 *
 * DIAGNOSTIC REFRESH (Batch 02R): a periodic re-resolution for DISPLAY
 * ONLY -- every tick just asks `resolveChannelTrackBroadcast` "what owns
 * Date.now() right now," the exact same deterministic question any other
 * caller would ask. No cursor, no stored offset, no Channel document, and
 * no `eventProgram/current` document is ever written by this refresh.
 */

import {
  createFirebaseEventRadioRepository,
  createFirebaseMemberIdentityAuthority,
  createFirebaseRadioChannelRepository,
  type EventRadioRepository,
  type MemberIdentityState,
  type RadioChannel,
  type RadioChannelRepository,
  type RadioProgramSummary,
} from "@studiorich/member-identity";
import type { RadioWebManifest } from "../data/radioWebBundleTypes";
import { slugifyStationTitle } from "../logic/radio/radioWebBundlePlan";
import { resolveChannelTrackBroadcast } from "../logic/radio/channelTrackBroadcast";
import { buildChannelDiagnosticDisplay } from "../logic/radio/channelDiagnosticDisplay";
import {
  addProgramToRotation,
  buildActivateChannelUpdate,
  buildDeactivateChannelUpdate,
  buildRotationDisplayEntries,
  buildSaveRotationUpdate,
  buildStartRestartRotationUpdate,
  computeRotationLengthSeconds,
  moveProgramDown,
  moveProgramUp,
  removeProgramFromRotation,
} from "../logic/radio/channelRotationEditorState";

/** Same re-resolution interval-only-affects-display posture, roughly matching eventMusicRuntime.ts's own 20s drift-check cadence order of magnitude but tighter since this is the operator's own live diagnostic, not a listener's background drift check. */
const DIAGNOSTIC_REFRESH_INTERVAL_MS = 5000;

/** Same path-string fetch convention radioPlayerMain.ts/eventMusicRuntime.ts already use -- see channelTrackBroadcast.ts's own recon note on why no {stationId,bundleVersion}->URL routing exists yet. */
async function fetchManifest(manifestBaseUrl: string): Promise<RadioWebManifest> {
  const response = await fetch(`${manifestBaseUrl}radio-manifest.json`);
  if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
  return (await response.json()) as RadioWebManifest;
}

/** Client-side UX gate only -- see this module's own doc. Must match firestore.rules' own operator allowlist. */
const OPERATOR_EMAILS = ["whatsup@richielau.com"];

/** V1 assumes exactly one Channel identity -- see this batch's own scope note; a future multi-Channel picker is out of scope here. */
const FIRST_CHANNEL_ID = "studiorich-radio";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }

const signedOutEl = required(document.querySelector<HTMLElement>("#signed-out"), "channel_control_surface_missing");
const notAuthorizedEl = required(document.querySelector<HTMLElement>("#not-authorized"), "channel_control_surface_missing");
const createFormEl = required(document.querySelector<HTMLElement>("#create-channel-form"), "channel_control_surface_missing");
const editorEl = required(document.querySelector<HTMLElement>("#channel-editor"), "channel_control_surface_missing");
const diagnosticEl = required(document.querySelector<HTMLElement>("#channel-diagnostic"), "channel_control_surface_missing");

const signInButton = required(document.querySelector<HTMLButtonElement>("#sign-in"), "channel_control_surface_missing");
const signOutButton = required(document.querySelector<HTMLButtonElement>("#sign-out"), "channel_control_surface_missing");
const signOutUnauthorizedButton = required(document.querySelector<HTMLButtonElement>("#sign-out-unauthorized"), "channel_control_surface_missing");

const createTitleInput = required(document.querySelector<HTMLInputElement>("#create-title"), "channel_control_surface_missing");
const createChannelIdInput = required(document.querySelector<HTMLInputElement>("#create-channel-id"), "channel_control_surface_missing");
const createProgramSelect = required(document.querySelector<HTMLSelectElement>("#create-program-select"), "channel_control_surface_missing");
const createChannelButton = required(document.querySelector<HTMLButtonElement>("#create-channel"), "channel_control_surface_missing");
const createMessageEl = required(document.querySelector<HTMLElement>("#create-message"), "channel_control_surface_missing");

const channelTitleEl = required(document.querySelector<HTMLElement>("#channel-title"), "channel_control_surface_missing");
const channelStatusBadgeEl = required(document.querySelector<HTMLElement>("#channel-status-badge"), "channel_control_surface_missing");
const rotationListEl = required(document.querySelector<HTMLElement>("#rotation-list"), "channel_control_surface_missing");
const addProgramSelect = required(document.querySelector<HTMLSelectElement>("#add-program-select"), "channel_control_surface_missing");
const addProgramButton = required(document.querySelector<HTMLButtonElement>("#add-program"), "channel_control_surface_missing");
const rotationLengthEl = required(document.querySelector<HTMLElement>("#rotation-length"), "channel_control_surface_missing");
const saveRotationButton = required(document.querySelector<HTMLButtonElement>("#save-rotation"), "channel_control_surface_missing");
const messageEl = required(document.querySelector<HTMLElement>("#message"), "channel_control_surface_missing");
const activateButton = required(document.querySelector<HTMLButtonElement>("#activate-channel"), "channel_control_surface_missing");
const deactivateButton = required(document.querySelector<HTMLButtonElement>("#deactivate-channel"), "channel_control_surface_missing");
const startRestartButton = required(document.querySelector<HTMLButtonElement>("#start-restart"), "channel_control_surface_missing");

const diagnosticHeadlineEl = required(document.querySelector<HTMLElement>("#diagnostic-headline"), "channel_control_surface_missing");
const diagnosticDetailEl = required(document.querySelector<HTMLElement>("#diagnostic-detail"), "channel_control_surface_missing");
const diagnosticOnAirFieldsEl = required(document.querySelector<HTMLElement>("#diagnostic-on-air-fields"), "channel_control_surface_missing");
const diagnosticProgramTitleEl = required(document.querySelector<HTMLElement>("#diagnostic-program-title"), "channel_control_surface_missing");
const diagnosticTrackLabelEl = required(document.querySelector<HTMLElement>("#diagnostic-track-label"), "channel_control_surface_missing");
const diagnosticProgramPositionEl = required(document.querySelector<HTMLElement>("#diagnostic-program-position"), "channel_control_surface_missing");
const diagnosticProgramEndsInEl = required(document.querySelector<HTMLElement>("#diagnostic-program-ends-in"), "channel_control_surface_missing");
const diagnosticTrackPositionEl = required(document.querySelector<HTMLElement>("#diagnostic-track-position"), "channel_control_surface_missing");
const diagnosticNextTitleEl = required(document.querySelector<HTMLElement>("#diagnostic-next-title"), "channel_control_surface_missing");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const channelRepository: Pick<RadioChannelRepository, "getRadioChannel" | "createRadioChannel" | "updateRadioChannel"> =
  createFirebaseRadioChannelRepository(import.meta.env);
const eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms"> = createFirebaseEventRadioRepository(import.meta.env);

let memberState: MemberIdentityState = memberIdentity.getState();
let programs: readonly RadioProgramSummary[] = [];
let programsById = new Map<string, RadioProgramSummary>();
let channel: RadioChannel | null = null;
/** Locally-edited-but-not-yet-saved rotation order -- kept separate from `channel.rotation.programIds` until "Save Rotation" per this batch's own "edit locally until explicitly saved" instruction. */
let draftProgramIds: string[] = [];
let diagnosticIntervalId: ReturnType<typeof setInterval> | null = null;

function isAuthorizedOperator(state: MemberIdentityState): boolean {
  return state.status === "signedIn" && OPERATOR_EMAILS.includes(state.authUser.email ?? "");
}

function setMessage(el: HTMLElement, text: string, kind: "info" | "success" | "error" = "info"): void {
  el.textContent = text;
  el.dataset.kind = kind;
}

function populateProgramSelect(select: HTMLSelectElement): void {
  select.replaceChildren(...programs.map((program) => {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = `${program.title} (${program.trackCount} tracks)`;
    return option;
  }));
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function renderRotationList(): void {
  rotationListEl.replaceChildren();
  const entries = buildRotationDisplayEntries(draftProgramIds, programsById);
  entries.forEach((entry, index) => {
    const li = document.createElement("li");

    const position = document.createElement("span");
    position.className = "rotation-position";
    position.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("span");
    title.className = "rotation-title";
    title.textContent = entry.title;

    const controls = document.createElement("span");
    controls.className = "rotation-row-controls";

    const upButton = document.createElement("button");
    upButton.textContent = "▲";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => {
      const result = moveProgramUp(draftProgramIds, index);
      if (result.moved) { draftProgramIds = [...result.programIds]; renderRotationList(); }
    });

    const downButton = document.createElement("button");
    downButton.textContent = "▼";
    downButton.disabled = index === entries.length - 1;
    downButton.addEventListener("click", () => {
      const result = moveProgramDown(draftProgramIds, index);
      if (result.moved) { draftProgramIds = [...result.programIds]; renderRotationList(); }
    });

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      const result = removeProgramFromRotation(draftProgramIds, entry.programId);
      if (result.ok) { draftProgramIds = [...result.programIds]; renderRotationList(); }
      else setMessage(messageEl, "Cannot remove the final remaining Program in a rotation.", "error");
    });

    controls.append(upButton, downButton, removeButton);
    li.append(position, title, controls);
    rotationListEl.appendChild(li);
  });

  rotationLengthEl.textContent = `Rotation Length: ${formatDuration(computeRotationLengthSeconds(draftProgramIds, programsById))}`;
}

/**
 * Batch 02R -- the ONE place this page calls `resolveChannelTrackBroadcast`.
 * Reuses the SAME `channelRepository`/`eventRadioRepository` instances
 * already constructed for the rotation editor (no second repository
 * abstraction), and the SAME `programsById` catalog the editor already
 * loads -- refreshed here too, since the catalog can change independently
 * of the Channel document. Read-only: `resolveChannelTrackBroadcast`
 * itself performs no writes, and neither does anything in this function.
 */
async function refreshDiagnostic(): Promise<void> {
  if (diagnosticEl.hidden) return;
  const nowMs = Date.now();
  let result: Awaited<ReturnType<typeof resolveChannelTrackBroadcast>>;
  try {
    result = await resolveChannelTrackBroadcast({
      channelId: FIRST_CHANNEL_ID,
      nowMs,
      radioChannelRepository: channelRepository,
      eventRadioRepository,
      fetchManifest,
    });
  } catch (error) {
    diagnosticHeadlineEl.textContent = "ERROR";
    diagnosticHeadlineEl.dataset.kind = "error";
    diagnosticDetailEl.textContent = error instanceof Error ? error.message : String(error);
    diagnosticOnAirFieldsEl.hidden = true;
    return;
  }

  const display = buildChannelDiagnosticDisplay(result, programsById, nowMs);
  diagnosticHeadlineEl.textContent = display.headline;
  diagnosticHeadlineEl.dataset.kind = display.kind;
  diagnosticDetailEl.textContent = display.detail;
  diagnosticNextTitleEl.textContent = display.nextProgramTitle ?? "—";

  if (display.kind === "on-air") {
    diagnosticOnAirFieldsEl.hidden = false;
    diagnosticProgramTitleEl.textContent = display.programTitle ?? "";
    diagnosticTrackLabelEl.textContent = display.trackLabel ?? "";
    diagnosticProgramPositionEl.textContent = display.programPosition ?? "";
    diagnosticProgramEndsInEl.textContent = display.programEndsIn ?? "";
    diagnosticTrackPositionEl.textContent = display.trackPosition ?? "";
  } else {
    diagnosticOnAirFieldsEl.hidden = true;
  }
}

function startDiagnosticRefresh(): void {
  diagnosticEl.hidden = false;
  void refreshDiagnostic();
  if (diagnosticIntervalId !== null) return;
  diagnosticIntervalId = setInterval(() => void refreshDiagnostic(), DIAGNOSTIC_REFRESH_INTERVAL_MS);
}

function stopDiagnosticRefresh(): void {
  diagnosticEl.hidden = true;
  if (diagnosticIntervalId !== null) {
    clearInterval(diagnosticIntervalId);
    diagnosticIntervalId = null;
  }
}

async function loadProgramsAndBuildIndex(): Promise<void> {
  programs = await eventRadioRepository.listRadioPrograms();
  programsById = new Map(programs.map((program) => [program.id, program]));
}

async function showCreateChannelForm(): Promise<void> {
  signedOutEl.hidden = true;
  notAuthorizedEl.hidden = true;
  editorEl.hidden = true;
  createFormEl.hidden = false;
  stopDiagnosticRefresh();
  setMessage(createMessageEl, "");
  await loadProgramsAndBuildIndex();
  populateProgramSelect(createProgramSelect);
}

function renderChannelEditor(): void {
  if (!channel) return;
  channelTitleEl.textContent = channel.title;
  channelStatusBadgeEl.textContent = channel.status;
  channelStatusBadgeEl.dataset.status = channel.status;
  populateProgramSelect(addProgramSelect);
  renderRotationList();
}

async function showChannelEditor(): Promise<void> {
  signedOutEl.hidden = true;
  notAuthorizedEl.hidden = true;
  createFormEl.hidden = true;
  editorEl.hidden = false;
  setMessage(messageEl, "");
  await loadProgramsAndBuildIndex();
  draftProgramIds = channel ? [...channel.rotation.programIds] : [];
  renderChannelEditor();
  startDiagnosticRefresh();
}

async function showOperatorSurface(): Promise<void> {
  try {
    channel = await channelRepository.getRadioChannel(FIRST_CHANNEL_ID);
  } catch (error) {
    setMessage(messageEl, `Couldn't load Channel: ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }
  if (!channel) {
    void showCreateChannelForm();
  } else {
    void showChannelEditor();
  }
}

createTitleInput.addEventListener("input", () => {
  createChannelIdInput.value = slugifyStationTitle(createTitleInput.value || "StudioRich Radio");
});

createChannelButton.addEventListener("click", () => {
  if (memberState.status !== "signedIn") return;
  const title = createTitleInput.value.trim();
  const channelId = createChannelIdInput.value.trim();
  const initialProgramId = createProgramSelect.value;
  if (!title || !channelId || !initialProgramId) {
    setMessage(createMessageEl, "Title, Channel ID, and an initial Program are all required.", "error");
    return;
  }
  createChannelButton.disabled = true;
  setMessage(createMessageEl, "Creating…");
  channelRepository.createRadioChannel(
    { channelId, title, status: "inactive", rotation: { anchorAtMs: Date.now(), programIds: [initialProgramId] } },
    memberState.member.uid,
  )
    .then((created) => {
      channel = created;
      setMessage(createMessageEl, "Channel created.", "success");
      void showChannelEditor();
    })
    .catch((error) => {
      setMessage(createMessageEl, error instanceof Error ? error.message.replace(/_/g, " ") : "Create failed", "error");
    })
    .finally(() => { createChannelButton.disabled = false; });
});

addProgramButton.addEventListener("click", () => {
  const programId = addProgramSelect.value;
  if (!programId) return;
  const result = addProgramToRotation(draftProgramIds, programId);
  if (result.ok) { draftProgramIds = [...result.programIds]; renderRotationList(); }
  else setMessage(messageEl, "That Program is already in the rotation.", "error");
});

saveRotationButton.addEventListener("click", () => {
  if (!channel || memberState.status !== "signedIn") return;
  saveRotationButton.disabled = true;
  setMessage(messageEl, "Saving…");
  const update = buildSaveRotationUpdate(channel.channelId, draftProgramIds, channel.rotation.anchorAtMs);
  channelRepository.updateRadioChannel(update, memberState.member.uid)
    .then((updated) => {
      channel = updated;
      setMessage(messageEl, "Rotation saved.", "success");
      renderChannelEditor();
      void refreshDiagnostic();
    })
    .catch((error) => {
      setMessage(messageEl, error instanceof Error ? error.message.replace(/_/g, " ") : "Save failed", "error");
    })
    .finally(() => { saveRotationButton.disabled = false; });
});

activateButton.addEventListener("click", () => {
  if (!channel || memberState.status !== "signedIn") return;
  channelRepository.updateRadioChannel(buildActivateChannelUpdate(channel.channelId), memberState.member.uid)
    .then((updated) => { channel = updated; renderChannelEditor(); setMessage(messageEl, "Channel activated.", "success"); void refreshDiagnostic(); })
    .catch((error) => setMessage(messageEl, error instanceof Error ? error.message.replace(/_/g, " ") : "Activate failed", "error"));
});

deactivateButton.addEventListener("click", () => {
  if (!channel || memberState.status !== "signedIn") return;
  channelRepository.updateRadioChannel(buildDeactivateChannelUpdate(channel.channelId), memberState.member.uid)
    .then((updated) => { channel = updated; renderChannelEditor(); setMessage(messageEl, "Channel deactivated.", "success"); void refreshDiagnostic(); })
    .catch((error) => setMessage(messageEl, error instanceof Error ? error.message.replace(/_/g, " ") : "Deactivate failed", "error"));
});

startRestartButton.addEventListener("click", () => {
  if (!channel || memberState.status !== "signedIn") return;
  const confirmed = window.confirm(
    "This resets the Channel clock — Program 01 will begin immediately at offset 0, replacing whatever is currently on air. Continue?",
  );
  if (!confirmed) return;
  startRestartButton.disabled = true;
  const persistedProgramIds = channel.rotation.programIds;
  const update = buildStartRestartRotationUpdate(channel.channelId, persistedProgramIds, Date.now());
  channelRepository.updateRadioChannel(update, memberState.member.uid)
    .then((updated) => {
      channel = updated;
      draftProgramIds = [...updated.rotation.programIds];
      renderChannelEditor();
      setMessage(messageEl, "Rotation restarted — Program 01 is on air now.", "success");
      void refreshDiagnostic();
    })
    .catch((error) => setMessage(messageEl, error instanceof Error ? error.message.replace(/_/g, " ") : "Start/Restart failed", "error"))
    .finally(() => { startRestartButton.disabled = false; });
});

signInButton.addEventListener("click", () => void memberIdentity.signInWithGoogle());
signOutButton.addEventListener("click", () => void memberIdentity.signOut());
signOutUnauthorizedButton.addEventListener("click", () => void memberIdentity.signOut());

memberIdentity.subscribe((state) => {
  memberState = state;
  if (state.status === "signedIn" && isAuthorizedOperator(state)) {
    void showOperatorSurface();
  } else if (state.status === "signedIn") {
    signedOutEl.hidden = true;
    createFormEl.hidden = true;
    editorEl.hidden = true;
    notAuthorizedEl.hidden = false;
    stopDiagnosticRefresh();
  } else {
    signedOutEl.hidden = false;
    createFormEl.hidden = true;
    editorEl.hidden = true;
    notAuthorizedEl.hidden = true;
    stopDiagnosticRefresh();
  }
});

void memberIdentity.start();
