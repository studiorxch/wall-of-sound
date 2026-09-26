/**
 * β0.1 PRODUCT CONVERGENCE -- the ADMIN shell's own auth gate. UI-level
 * only, same pattern as eventControlRuntime.ts/channelControlRuntime.ts's
 * own OPERATOR_EMAILS check -- the real authority is firestore.rules'
 * isEventOperator(), enforced inside each iframed page regardless of what
 * this file does. This module owns NO RADIO/Program/Channel logic at all;
 * it only shows/hides the shell and its tabs.
 */
import {
  createFirebaseMemberIdentityAuthority,
  STUDIO_RICH_OPERATOR_EMAILS,
  type MemberIdentityState,
} from "@studiorich/member-identity";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }

const signedOutEl = required(document.querySelector<HTMLElement>("#signed-out"), "admin_shell_surface_missing");
const notAuthorizedEl = required(document.querySelector<HTMLElement>("#not-authorized"), "admin_shell_surface_missing");
const shellEl = required(document.querySelector<HTMLElement>("#admin-shell"), "admin_shell_surface_missing");
const signInButton = required(document.querySelector<HTMLButtonElement>("#sign-in"), "admin_shell_surface_missing");
const signOutButton = required(document.querySelector<HTMLButtonElement>("#sign-out-admin"), "admin_shell_surface_missing");
const signOutUnauthorizedButton = required(document.querySelector<HTMLButtonElement>("#sign-out-unauthorized"), "admin_shell_surface_missing");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);

function isAuthorizedOperator(state: MemberIdentityState): boolean {
  return state.status === "signedIn" && STUDIO_RICH_OPERATOR_EMAILS.includes(state.authUser.email ?? "");
}

// Batch-only, current scope: a single RADIO tab. Wired as real tab
// switching (not a static single panel) so a future tab only needs a new
// button + panel, never a rewrite of this switching logic.
function initTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".admin-tab"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".admin-panel"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      panels.forEach((panel) => panel.setAttribute("data-active", String(panel.dataset.panel === targetId)));
    });
  });
}
initTabs();

signInButton.addEventListener("click", () => void memberIdentity.signInWithGoogle());
signOutButton.addEventListener("click", () => void memberIdentity.signOut());
signOutUnauthorizedButton.addEventListener("click", () => void memberIdentity.signOut());

memberIdentity.subscribe((state) => {
  if (state.status === "signedIn" && isAuthorizedOperator(state)) {
    signedOutEl.hidden = true;
    notAuthorizedEl.hidden = true;
    shellEl.hidden = false;
  } else if (state.status === "signedIn") {
    signedOutEl.hidden = true;
    shellEl.hidden = true;
    notAuthorizedEl.hidden = false;
  } else {
    signedOutEl.hidden = false;
    shellEl.hidden = true;
    notAuthorizedEl.hidden = true;
  }
});

void memberIdentity.start();
