/**
 * Event Radio Turnkey Operations V1 -- the smallest StudioRich-owned
 * operator control: choose an existing published program, choose
 * PERSONAL vs CLOCK, set a Clock start time, set event status, Apply.
 * "Apply" means exactly one thing: write the `eventProgram` Firestore
 * document -- never a source edit, AI action, build, or deploy.
 *
 * AUTHORITY (requirement 5): reuses the SAME Firebase Auth (Google
 * sign-in) Member identity already uses -- no second identity system.
 * `OPERATOR_EMAILS` here is a client-side UX gate ONLY (hides the form
 * and shows "not authorized" quickly); the REAL authority boundary is
 * `firestore.rules`' own operator allowlist, enforced server-side
 * regardless of what this file does or doesn't check.
 */

import {
  createFirebaseEventRadioRepository,
  createFirebaseMemberIdentityAuthority,
  type EventPlaybackMode,
  type EventStatus,
  type MemberIdentityState,
  type RadioProgramSummary,
} from "@studiorich/member-identity";

/** Client-side UX gate only -- see this module's own doc. Must match firestore.rules' own operator allowlist. */
const OPERATOR_EMAILS = ["whatsup@richielau.com"];

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }

const signedOutEl = required(document.querySelector<HTMLElement>("#signed-out"), "event_control_surface_missing");
const notAuthorizedEl = required(document.querySelector<HTMLElement>("#not-authorized"), "event_control_surface_missing");
const formEl = required(document.querySelector<HTMLElement>("#operator-form"), "event_control_surface_missing");
const signInButton = required(document.querySelector<HTMLButtonElement>("#sign-in"), "event_control_surface_missing");
const signOutButton = required(document.querySelector<HTMLButtonElement>("#sign-out"), "event_control_surface_missing");
const signOutUnauthorizedButton = required(document.querySelector<HTMLButtonElement>("#sign-out-unauthorized"), "event_control_surface_missing");
const programSelect = required(document.querySelector<HTMLSelectElement>("#program-select"), "event_control_surface_missing");
const modePersonalButton = required(document.querySelector<HTMLButtonElement>("#mode-personal"), "event_control_surface_missing");
const modeClockButton = required(document.querySelector<HTMLButtonElement>("#mode-clock"), "event_control_surface_missing");
const clockFields = required(document.querySelector<HTMLElement>("#clock-fields"), "event_control_surface_missing");
const startInput = required(document.querySelector<HTMLInputElement>("#start-input"), "event_control_surface_missing");
const statusButtons = {
  inactive: required(document.querySelector<HTMLButtonElement>("#status-inactive"), "event_control_surface_missing"),
  ready: required(document.querySelector<HTMLButtonElement>("#status-ready"), "event_control_surface_missing"),
  active: required(document.querySelector<HTMLButtonElement>("#status-active"), "event_control_surface_missing"),
};
const applyButton = required(document.querySelector<HTMLButtonElement>("#apply"), "event_control_surface_missing");
const messageEl = required(document.querySelector<HTMLElement>("#message"), "event_control_surface_missing");
const currentStateEl = required(document.querySelector<HTMLElement>("#current-state"), "event_control_surface_missing");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const repository = createFirebaseEventRadioRepository(import.meta.env);

let memberState: MemberIdentityState = memberIdentity.getState();
let programs: readonly RadioProgramSummary[] = [];
let mode: EventPlaybackMode = "personal";
let status: EventStatus = "inactive";

function isAuthorizedOperator(state: MemberIdentityState): boolean {
  return state.status === "signedIn" && OPERATOR_EMAILS.includes(state.authUser.email ?? "");
}

function setMessage(text: string, kind: "info" | "success" | "error" = "info"): void {
  messageEl.textContent = text;
  messageEl.dataset.kind = kind;
}

function setMode(next: EventPlaybackMode): void {
  mode = next;
  modePersonalButton.setAttribute("aria-pressed", String(next === "personal"));
  modeClockButton.setAttribute("aria-pressed", String(next === "clock"));
  clockFields.hidden = next !== "clock";
}

function setStatus(next: EventStatus): void {
  status = next;
  statusButtons.inactive.setAttribute("aria-pressed", String(next === "inactive"));
  statusButtons.ready.setAttribute("aria-pressed", String(next === "ready"));
  statusButtons.active.setAttribute("aria-pressed", String(next === "active"));
}

/** datetime-local has no timezone of its own -- interpreted here as the OPERATOR'S OWN browser-local time (requirement 8's "clearly displayed, no ambiguity"), converted immediately to an absolute epoch-millisecond timestamp for storage, which has no timezone ambiguity by construction. */
function startInputToEpochMs(): number | null {
  if (!startInput.value) return null;
  const parsed = new Date(startInput.value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}
function epochMsToStartInputValue(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function refreshCurrentState(): Promise<void> {
  try {
    const current = await repository.getEventProgram();
    if (!current) {
      currentStateEl.textContent = "No event program has ever been configured.";
      return;
    }
    const program = programs.find((candidate) => candidate.id === current.programId);
    currentStateEl.textContent = [
      `Active config: ${program?.title ?? current.programId ?? "(none)"}`,
      `Mode: ${current.playbackMode}`,
      current.startAtMs ? `Start: ${new Date(current.startAtMs).toLocaleString()}` : null,
      `Status: ${current.status}`,
      current.updatedAt ? `Updated: ${current.updatedAt.toLocaleString()}` : null,
    ].filter(Boolean).join(" · ");
  } catch (error) {
    currentStateEl.textContent = `Couldn't load current state: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadPrograms(): Promise<void> {
  programs = await repository.listRadioPrograms();
  programSelect.replaceChildren(...programs.map((program) => {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = `${program.title} (${program.trackCount} tracks)`;
    return option;
  }));
}

async function showOperatorForm(): Promise<void> {
  signedOutEl.hidden = true;
  notAuthorizedEl.hidden = true;
  formEl.hidden = false;
  setMessage("");
  try {
    await loadPrograms();
    const current = await repository.getEventProgram();
    if (current) {
      if (current.programId) programSelect.value = current.programId;
      setMode(current.playbackMode);
      setStatus(current.status);
      if (current.startAtMs) startInput.value = epochMsToStartInputValue(current.startAtMs);
    }
  } catch (error) {
    setMessage(`Couldn't load programs: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
  void refreshCurrentState();
}

modePersonalButton.addEventListener("click", () => setMode("personal"));
modeClockButton.addEventListener("click", () => setMode("clock"));
statusButtons.inactive.addEventListener("click", () => setStatus("inactive"));
statusButtons.ready.addEventListener("click", () => setStatus("ready"));
statusButtons.active.addEventListener("click", () => setStatus("active"));

applyButton.addEventListener("click", () => {
  if (memberState.status !== "signedIn") return;
  const programId = programSelect.value;
  const startAtMs = mode === "clock" ? startInputToEpochMs() : null;
  applyButton.disabled = true;
  setMessage("Applying…");
  repository.setEventProgram({ programId, playbackMode: mode, startAtMs, endPolicy: "stop", status }, memberState.member.uid)
    .then(() => {
      setMessage("Applied — listeners resolve this on their next load.", "success");
      void refreshCurrentState();
    })
    .catch((error) => {
      setMessage(error instanceof Error ? error.message.replace(/_/g, " ") : "Apply failed", "error");
    })
    .finally(() => { applyButton.disabled = false; });
});

signInButton.addEventListener("click", () => void memberIdentity.signInWithGoogle());
signOutButton.addEventListener("click", () => void memberIdentity.signOut());
signOutUnauthorizedButton.addEventListener("click", () => void memberIdentity.signOut());

memberIdentity.subscribe((state) => {
  memberState = state;
  if (state.status === "signedIn" && isAuthorizedOperator(state)) {
    void showOperatorForm();
  } else if (state.status === "signedIn") {
    signedOutEl.hidden = true;
    formEl.hidden = true;
    notAuthorizedEl.hidden = false;
  } else {
    signedOutEl.hidden = false;
    formEl.hidden = true;
    notAuthorizedEl.hidden = true;
  }
});

void memberIdentity.start();
