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
  generateRadioProgramId,
  STUDIO_RICH_OPERATOR_EMAILS,
  type EventPlaybackMode,
  type EventStatus,
  type MemberIdentityState,
  type RadioProgramSummary,
} from "@studiorich/member-identity";
import type { RadioWebManifest } from "../data/radioWebBundleTypes";
import {
  deriveCreateRadioProgramInputFromManifest,
  findExistingProgramForPackage,
  normalizePackageBaseUrl,
  type ProgramFromManifestResult,
} from "../logic/radio/programFromManifest";

/** Client-side UX gate only -- see this module's own doc. Must match firestore.rules' own operator allowlist. */
const OPERATOR_EMAILS = STUDIO_RICH_OPERATOR_EMAILS;

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

// Batch 03B.6 -- package bootstrap/recovery section.
const packageUrlInput = required(document.querySelector<HTMLInputElement>("#package-url-input"), "event_control_surface_missing");
const loadPackageButton = required(document.querySelector<HTMLButtonElement>("#load-package"), "event_control_surface_missing");
const packageLoadMessageEl = required(document.querySelector<HTMLElement>("#package-load-message"), "event_control_surface_missing");
const packagePreviewEl = required(document.querySelector<HTMLElement>("#package-preview"), "event_control_surface_missing");
const packagePreviewTitleEl = required(document.querySelector<HTMLElement>("#package-preview-title"), "event_control_surface_missing");
const packagePreviewDetailsEl = required(document.querySelector<HTMLElement>("#package-preview-details"), "event_control_surface_missing");
const createProgramFromPackageButton = required(document.querySelector<HTMLButtonElement>("#create-program-from-package"), "event_control_surface_missing");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const repository = createFirebaseEventRadioRepository(import.meta.env);

let memberState: MemberIdentityState = memberIdentity.getState();
let programs: readonly RadioProgramSummary[] = [];
let mode: EventPlaybackMode = "personal";
let status: EventStatus = "inactive";
// Batch 03B.6 -- the last successfully-validated package load, held only
// long enough for the operator's own explicit "Create Program" click. A
// fresh "Load Package" click (or a Program creation) always clears this --
// the write action never fires from stale state.
let loadedPackage: { readonly manifest: RadioWebManifest; readonly result: Extract<ProgramFromManifestResult, { status: "valid" }> } | null = null;

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

// Batch 03B.6 -- Load Package: fetches+validates only, writes nothing.
function formatPackagePreview(result: Extract<ProgramFromManifestResult, { status: "valid" }>): string {
  const minutes = Math.floor(result.input.totalDurationSeconds / 60);
  const seconds = Math.round(result.input.totalDurationSeconds % 60);
  return `${result.input.trackCount} tracks · ${minutes}m ${seconds}s · Package v${result.input.bundleVersion} · stationId: ${result.input.stationId}`;
}

const MANIFEST_LOAD_INVALID_REASON_LABEL: Record<string, string> = {
  invalid_url_not_https: "Package URL must be an absolute https:// URL.",
  invalid_manifest_not_object: "That URL did not return a valid manifest.",
  invalid_manifest_schema_version: "This manifest's schema version isn't supported.",
  invalid_manifest_missing_station_id: "Manifest is missing its stationId.",
  invalid_manifest_missing_title: "Manifest is missing a title.",
  invalid_manifest_invalid_bundle_version: "Manifest has an invalid bundleVersion.",
  invalid_manifest_empty_entries: "Manifest has no playable entries.",
  invalid_manifest_invalid_duration: "Manifest has an invalid totalDurationSeconds.",
};

loadPackageButton.addEventListener("click", () => {
  const normalized = normalizePackageBaseUrl(packageUrlInput.value);
  loadedPackage = null;
  packagePreviewEl.hidden = true;
  if (!normalized) {
    packageLoadMessageEl.textContent = "Enter a valid absolute https:// package URL.";
    packageLoadMessageEl.dataset.kind = "error";
    return;
  }
  loadPackageButton.disabled = true;
  packageLoadMessageEl.textContent = "Loading…";
  packageLoadMessageEl.dataset.kind = "info";
  fetch(`${normalized}radio-manifest.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
      return response.json();
    })
    .then((manifest: unknown) => {
      const result = deriveCreateRadioProgramInputFromManifest(manifest, normalized);
      if (result.status === "invalid") {
        packageLoadMessageEl.textContent = MANIFEST_LOAD_INVALID_REASON_LABEL[result.reason] ?? result.reason;
        packageLoadMessageEl.dataset.kind = "error";
        return;
      }
      const duplicate = findExistingProgramForPackage(programs, result.input.stationId, result.input.bundleVersion);
      if (duplicate) {
        packageLoadMessageEl.textContent = `Already has a Program: "${duplicate.title}" (${duplicate.id}). Not creating a duplicate.`;
        packageLoadMessageEl.dataset.kind = "error";
        return;
      }
      loadedPackage = { manifest: manifest as RadioWebManifest, result };
      packageLoadMessageEl.textContent = "";
      packagePreviewTitleEl.textContent = result.input.title;
      packagePreviewDetailsEl.textContent = formatPackagePreview(result);
      packagePreviewEl.hidden = false;
    })
    .catch((error) => {
      packageLoadMessageEl.textContent = error instanceof Error ? error.message : String(error);
      packageLoadMessageEl.dataset.kind = "error";
    })
    .finally(() => { loadPackageButton.disabled = false; });
});

// Batch 03B.6 -- Create Program: the explicit second action required
// before any write. Never fires from a stale/cleared loadedPackage.
createProgramFromPackageButton.addEventListener("click", () => {
  if (!loadedPackage) return;
  createProgramFromPackageButton.disabled = true;
  packageLoadMessageEl.textContent = "Creating Program…";
  packageLoadMessageEl.dataset.kind = "info";
  const input = { ...loadedPackage.result.input, programId: generateRadioProgramId() };
  repository.createRadioProgram(input)
    .then((created) => {
      packageLoadMessageEl.textContent = `Program created: ${created.id}`;
      packageLoadMessageEl.dataset.kind = "success";
      packagePreviewEl.hidden = true;
      loadedPackage = null;
      packageUrlInput.value = "";
      return loadPrograms();
    })
    .catch((error) => {
      packageLoadMessageEl.textContent = error instanceof Error ? error.message : String(error);
      packageLoadMessageEl.dataset.kind = "error";
    })
    .finally(() => { createProgramFromPackageButton.disabled = false; });
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
