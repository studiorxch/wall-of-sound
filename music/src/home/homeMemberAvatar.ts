import type { MemberIdentityAuthority, MemberIdentityState } from "@studiorich/member-identity";
import { deriveMemberAvatarDisplay } from "../logic/home/memberAvatarPresentation";

// MEMBER-01A -- the ONE persistent avatar/account control. Pure DOM
// construction/wiring only (see memberAvatarPresentation.ts for the
// actual state->display logic this renders) -- never React, matching
// homeRuntime.ts's own style throughout this tree. Mounted once into a
// container the caller places OUTSIDE `#surface` (home-dev.html's own
// `#member-avatar-root`), so iframe surface replacement structurally
// cannot ever touch it -- this is what makes "stays mounted across MAP ->
// BLACKBOOK -> MAP" true by DOM placement alone, not by any special
// protection logic. This represents MEMBER/account identity only --
// deliberately no MAP/RADIO/BLACKBOOK/MUSIC navigation links live here.

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Called once, for the lifetime of the HOME document -- there is exactly one persistent avatar, never remounted per surface swap. */
export function renderMemberAvatar(container: HTMLElement, authority: MemberIdentityAuthority): void {
  container.innerHTML = "";
  const root = el("div", "member-avatar");
  const button = el("button", "member-avatar-button");
  button.type = "button";
  button.setAttribute("aria-haspopup", "menu");
  const menu = el("div", "member-avatar-menu");
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  root.append(button, menu);
  container.append(root);

  let menuOpen = false;
  let editingProfile = false;

  function closeMenu(): void {
    menuOpen = false;
    editingProfile = false;
    menu.hidden = true;
  }

  function renderMenuContents(state: MemberIdentityState): void {
    menu.innerHTML = "";
    if (state.status !== "signedIn") return;
    const name = el("p", "member-avatar-menu-name");
    name.textContent = state.member.displayName ?? state.authUser.displayName ?? "StudioRich Member";
    menu.append(name);
    if (state.authUser.email) {
      const email = el("p", "member-avatar-menu-email");
      email.textContent = state.authUser.email;
      menu.append(email);
    }

    if (editingProfile) {
      const form = el("form", "member-avatar-edit-form");
      const input = el("input", "member-avatar-edit-input");
      input.type = "text";
      input.value = state.member.displayName ?? "";
      input.setAttribute("aria-label", "Display name");
      const actions = el("div", "member-avatar-edit-actions");
      const save = el("button", "member-avatar-menu-item");
      save.type = "submit";
      save.textContent = "Save";
      const cancel = el("button", "member-avatar-menu-item");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      actions.append(save, cancel);
      form.append(input, actions);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value.trim();
        editingProfile = false;
        if (value) void authority.updateProfile(value);
        else renderMenuContents(authority.getState());
      });
      cancel.addEventListener("click", () => {
        editingProfile = false;
        renderMenuContents(authority.getState());
      });
      menu.append(form);
      window.setTimeout(() => input.focus(), 0);
    } else {
      const editButton = el("button", "member-avatar-menu-item");
      editButton.type = "button";
      editButton.setAttribute("role", "menuitem");
      editButton.textContent = "Edit Profile";
      editButton.addEventListener("click", () => {
        editingProfile = true;
        renderMenuContents(authority.getState());
      });
      const signOutButton = el("button", "member-avatar-menu-item");
      signOutButton.type = "button";
      signOutButton.setAttribute("role", "menuitem");
      signOutButton.textContent = "Sign Out";
      signOutButton.addEventListener("click", () => {
        closeMenu();
        void authority.signOut();
      });
      menu.append(editButton, signOutButton);
    }
  }

  function render(state: MemberIdentityState): void {
    const display = deriveMemberAvatarDisplay(state);
    button.dataset.state = display.kind;
    button.innerHTML = "";
    if (display.kind === "signed-in" && display.photoURL) {
      const img = el("img", "member-avatar-photo");
      img.src = display.photoURL;
      img.alt = "";
      img.addEventListener("error", () => {
        img.remove();
        button.textContent = display.initials ?? "•";
      });
      button.append(img);
    } else if (display.kind === "signed-in") {
      button.textContent = display.initials ?? "•";
    } else if (display.kind === "initializing") {
      button.textContent = "…";
    } else {
      button.textContent = "•";
    }
    button.setAttribute(
      "aria-label",
      display.kind === "signed-in"
        ? `Account menu — signed in as ${display.displayName ?? display.email ?? "StudioRich member"}`
        : display.kind === "initializing"
          ? "StudioRich account — loading"
          : "Sign in to StudioRich",
    );
    if (state.status !== "signedIn" && menuOpen) closeMenu();
    renderMenuContents(state);
  }

  button.addEventListener("click", () => {
    const state = authority.getState();
    if (state.status === "initializing") return; // never actionable while auth is unresolved
    if (state.status !== "signedIn") {
      void authority.signInWithGoogle().catch(() => { /* failure surfaces via the authority's own state (status "error") */ });
      return;
    }
    menuOpen = !menuOpen;
    menu.hidden = !menuOpen;
  });

  document.addEventListener("click", (event) => {
    if (!menuOpen) return;
    if (root.contains(event.target as Node)) return;
    closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen) {
      closeMenu();
      button.focus();
    }
  });

  authority.subscribe(render);
  void authority.start();
}
