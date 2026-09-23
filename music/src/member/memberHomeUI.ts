import type { Artwork, MemberIdentityAuthority, MemberIdentityState, StudioRichMember } from "@studiorich/member-identity";
import { deriveArtworkSurfaceLabel, deriveArtworkTitle, formatArtworkUpdatedAt, formatMemberSince, sortArtworksByRecency } from "./artworkGallery";
import { drawArtworkThumbnail } from "./artworkThumbnail";

/**
 * Member V1A -- Member Home: the signed-in person's persistent StudioRich
 * destination (MEMBER button opens this instead of immediately signing
 * out). Pure DOM wiring; all decision logic (sorting, labels, thumbnail
 * pixels, bounds math) lives in the already-tested pure modules this file
 * imports. No second Artwork repository, no new persistence -- `getOwnedArtworks`
 * is expected to return the SAME in-memory list `subwayMemberRuntime.ts`
 * already hydrates at sign-in, so opening Member Home triggers zero
 * additional Firestore reads or writes.
 */

const RECENT_ARTWORK_LIMIT = 6;
const THUMBNAIL_SIZE = { width: 156, height: 110 } as const;

type Screen = "home" | "artwork" | "profile" | "settings";

export interface MemberHomeOptions {
  readonly authority: MemberIdentityAuthority;
  readonly getOwnedArtworks: () => readonly Artwork[];
  readonly onOpenArtwork: (artwork: Artwork) => void;
  /** Optional: wires the existing `deleteOwnedArtwork` behavior behind an explicit confirmation. Omitted entirely (no delete control rendered) if the caller cannot safely expose it. */
  readonly onDeleteArtwork?: (artwork: Artwork) => Promise<void>;
}

export interface MemberHomeController {
  open(): void;
  close(): void;
  render(): void;
  /** Member V1B -- re-renders only if Member Home is currently open; a no-op otherwise (the next `open()` already reads current state). Call this after the session-owned Artwork projection changes. */
  refresh(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createMemberHomeController({ authority, getOwnedArtworks, onOpenArtwork, onDeleteArtwork }: MemberHomeOptions): MemberHomeController {
  let screen: Screen = "home";
  let showAllArtwork = false;
  let profileEditing = false;
  let statusMessage = "";

  /**
   * Member V1B -- thumbnails are disposable and re-derived, but re-running
   * the composition render for every Artwork on every render() call (e.g.
   * on each live update while Member Home is open) is wasted work when only
   * one Artwork actually changed. Cached per Artwork id, keyed by its own
   * `updatedAt` -- a cache hit is only possible for an UNCHANGED Artwork; an
   * updated one gets a fresh authoritative `updatedAt` from the persistence
   * result and naturally misses. Pruned to the current owned set on every
   * render so a deleted Artwork's cache entry doesn't linger forever.
   */
  const thumbnailCache = new Map<string, { readonly updatedAtMs: number; readonly canvas: HTMLCanvasElement }>();

  function pruneThumbnailCache(currentIds: ReadonlySet<string>): void {
    for (const id of thumbnailCache.keys()) {
      if (!currentIds.has(id)) thumbnailCache.delete(id);
    }
  }

  function renderCachedThumbnail(artwork: Artwork): { readonly canvas: HTMLCanvasElement; readonly ok: boolean } {
    const updatedAtMs = artwork.updatedAt.getTime();
    const cached = thumbnailCache.get(artwork.id);
    if (cached && cached.updatedAtMs === updatedAtMs) {
      const canvas = el("canvas", "member-artwork-thumb");
      canvas.width = THUMBNAIL_SIZE.width;
      canvas.height = THUMBNAIL_SIZE.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(cached.canvas, 0, 0);
      return { canvas, ok: true };
    }
    const canvas = el("canvas", "member-artwork-thumb");
    canvas.width = THUMBNAIL_SIZE.width;
    canvas.height = THUMBNAIL_SIZE.height;
    const ctx = canvas.getContext("2d");
    const result = ctx ? drawArtworkThumbnail(ctx, artwork, THUMBNAIL_SIZE) : { ok: false };
    thumbnailCache.set(artwork.id, { updatedAtMs, canvas });
    return { canvas, ok: result.ok };
  }

  const dialog = el("dialog", "member-home-dialog");
  dialog.setAttribute("aria-label", "StudioRich Member Home");
  document.body.appendChild(dialog);

  function currentMember(): StudioRichMember | null {
    const state: MemberIdentityState = authority.getState();
    return state.status === "signedIn" ? state.member : null;
  }

  function setScreen(next: Screen): void {
    screen = next;
    statusMessage = "";
    render();
  }

  function renderHeader(title: string, showBack: boolean): HTMLElement {
    const header = el("div", "member-home-header");
    if (showBack) {
      const back = el("button", "member-home-back");
      back.type = "button";
      back.textContent = "‹ MEMBER";
      back.addEventListener("click", () => setScreen("home"));
      header.appendChild(back);
    }
    const heading = el("h2");
    heading.textContent = title;
    header.appendChild(heading);
    const close = el("button", "member-home-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close Member Home");
    close.textContent = "×";
    close.addEventListener("click", () => close_());
    header.appendChild(close);
    return header;
  }

  function close_(): void {
    dialog.close();
  }

  function renderArtworkCard(artwork: Artwork): HTMLElement {
    const card = el("button", "member-artwork-card");
    card.type = "button";
    const { canvas, ok } = renderCachedThumbnail(artwork);
    if (!ok) canvas.classList.add("member-artwork-thumb--empty");
    card.appendChild(canvas);
    const meta = el("div", "member-artwork-meta");
    const title = el("span", "member-artwork-title");
    title.textContent = deriveArtworkTitle(artwork);
    const updated = el("span", "member-artwork-updated");
    updated.textContent = formatArtworkUpdatedAt(artwork.updatedAt);
    const surface = el("span", "member-artwork-surface");
    surface.textContent = deriveArtworkSurfaceLabel(artwork.surfaceId);
    meta.append(title, updated, surface);
    card.appendChild(meta);
    card.addEventListener("click", () => onOpenArtwork(artwork));

    if (onDeleteArtwork) {
      const wrapper = el("div", "member-artwork-card-wrapper");
      const remove = el("button", "member-artwork-delete");
      remove.type = "button";
      remove.setAttribute("aria-label", "Delete this Artwork");
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!window.confirm("Delete this Artwork? This cannot be undone.")) return;
        void onDeleteArtwork(artwork).then(() => render());
      });
      wrapper.append(card, remove);
      return wrapper;
    }
    return card;
  }

  function renderHome(): void {
    const member = currentMember();
    dialog.replaceChildren(renderHeader("MEMBER", false));
    if (!member) return;

    const identity = el("div", "member-home-identity");
    const avatar = el("img", "member-home-avatar");
    avatar.src = member.photoURL ?? "";
    avatar.alt = "";
    avatar.hidden = !member.photoURL;
    const name = el("div", "member-home-name");
    name.textContent = member.displayName ?? "StudioRich Member";
    const since = el("div", "member-home-since");
    since.textContent = `Member since ${formatMemberSince(member.createdAt)}`;
    identity.append(avatar, name, since);
    dialog.appendChild(identity);

    const artworkSection = el("section", "member-home-section");
    const artworkHeading = el("h3");
    artworkHeading.textContent = "ARTWORK";
    artworkSection.appendChild(artworkHeading);
    const artworks = sortArtworksByRecency(getOwnedArtworks());
    pruneThumbnailCache(new Set(artworks.map((item) => item.id)));
    if (!artworks.length) {
      const empty = el("p", "member-home-empty");
      empty.textContent = "Nothing saved yet — draw on the map to start your first Artwork.";
      artworkSection.appendChild(empty);
    } else {
      const grid = el("div", "member-artwork-grid");
      artworks.slice(0, RECENT_ARTWORK_LIMIT).forEach((artwork) => grid.appendChild(renderArtworkCard(artwork)));
      artworkSection.appendChild(grid);
      if (artworks.length > RECENT_ARTWORK_LIMIT) {
        const viewAll = el("button", "member-home-link");
        viewAll.type = "button";
        viewAll.textContent = "VIEW ALL";
        viewAll.addEventListener("click", () => setScreen("artwork"));
        artworkSection.appendChild(viewAll);
      }
    }
    dialog.appendChild(artworkSection);

    const profileSection = el("section", "member-home-section");
    const profileHeading = el("h3");
    profileHeading.textContent = "PROFILE";
    const profileOpen = el("button", "member-home-link");
    profileOpen.type = "button";
    profileOpen.textContent = "OPEN / EDIT";
    profileOpen.addEventListener("click", () => setScreen("profile"));
    profileSection.append(profileHeading, profileOpen);
    dialog.appendChild(profileSection);

    const settingsSection = el("section", "member-home-section");
    const settingsHeading = el("h3");
    settingsHeading.textContent = "SETTINGS";
    const settingsOpen = el("button", "member-home-link");
    settingsOpen.type = "button";
    settingsOpen.textContent = "OPEN";
    settingsOpen.addEventListener("click", () => setScreen("settings"));
    settingsSection.append(settingsHeading, settingsOpen);
    dialog.appendChild(settingsSection);

    const signOut = el("button", "member-home-signout");
    signOut.type = "button";
    signOut.textContent = "SIGN OUT";
    signOut.addEventListener("click", () => {
      void authority.signOut();
      close_();
    });
    dialog.appendChild(signOut);
  }

  function renderArtworkScreen(): void {
    dialog.replaceChildren(renderHeader("ARTWORK", true));
    const artworks = sortArtworksByRecency(getOwnedArtworks());
    const visible = showAllArtwork ? artworks : artworks.slice(0, RECENT_ARTWORK_LIMIT);
    const grid = el("div", "member-artwork-grid");
    visible.forEach((artwork) => grid.appendChild(renderArtworkCard(artwork)));
    dialog.appendChild(grid);
    if (!showAllArtwork && artworks.length > RECENT_ARTWORK_LIMIT) {
      const viewAll = el("button", "member-home-link");
      viewAll.type = "button";
      viewAll.textContent = "VIEW ALL";
      viewAll.addEventListener("click", () => {
        showAllArtwork = true;
        render();
      });
      dialog.appendChild(viewAll);
    }
  }

  function renderProfileScreen(): void {
    dialog.replaceChildren(renderHeader("PROFILE", true));
    const member = currentMember();
    if (!member) return;

    const identity = el("div", "member-home-identity");
    const avatar = el("img", "member-home-avatar");
    avatar.src = member.photoURL ?? "";
    avatar.alt = "";
    avatar.hidden = !member.photoURL;
    identity.appendChild(avatar);
    dialog.appendChild(identity);

    const form = el("div", "member-profile-form");
    const label = el("label");
    label.textContent = "Display name";
    const input = el("input");
    input.type = "text";
    input.value = member.displayName ?? "";
    input.disabled = !profileEditing;
    label.appendChild(input);
    form.appendChild(label);

    const since = el("div", "member-home-since");
    since.textContent = `Member since ${formatMemberSince(member.createdAt)}`;
    form.appendChild(since);

    const status = el("p", "member-profile-status");
    status.textContent = statusMessage;
    form.appendChild(status);

    if (profileEditing) {
      const save = el("button", "member-home-link");
      save.type = "button";
      save.textContent = "SAVE";
      save.addEventListener("click", () => {
        const nextName = input.value.trim();
        if (!nextName) {
          statusMessage = "Display name cannot be empty.";
          render();
          return;
        }
        statusMessage = "Saving…";
        render();
        void authority
          .updateProfile(nextName)
          .then(() => {
            profileEditing = false;
            statusMessage = "";
            render();
          })
          .catch((error: unknown) => {
            statusMessage = error instanceof Error ? error.message : "Could not save your profile.";
            render();
          });
      });
      form.appendChild(save);
    } else {
      const edit = el("button", "member-home-link");
      edit.type = "button";
      edit.textContent = "EDIT";
      edit.addEventListener("click", () => {
        profileEditing = true;
        render();
      });
      form.appendChild(edit);
    }
    dialog.appendChild(form);
  }

  function renderSettingsScreen(): void {
    dialog.replaceChildren(renderHeader("SETTINGS", true));
    const member = currentMember();
    const state = authority.getState();

    const account = el("section", "member-home-section");
    const accountHeading = el("h3");
    accountHeading.textContent = "ACCOUNT";
    account.appendChild(accountHeading);
    if (state.status === "signedIn") {
      const identityLine = el("p", "member-settings-line");
      identityLine.textContent = state.authUser.email ?? "Signed in with Google";
      account.appendChild(identityLine);
    }
    const signOut = el("button", "member-home-link");
    signOut.type = "button";
    signOut.textContent = "SIGN OUT";
    signOut.addEventListener("click", () => {
      void authority.signOut();
      close_();
    });
    account.appendChild(signOut);
    dialog.appendChild(account);

    const profile = el("section", "member-home-section");
    const profileHeading = el("h3");
    profileHeading.textContent = "PROFILE";
    profile.appendChild(profileHeading);
    const profileOpen = el("button", "member-home-link");
    profileOpen.type = "button";
    profileOpen.textContent = "OPEN";
    profileOpen.addEventListener("click", () => setScreen("profile"));
    profile.appendChild(profileOpen);
    dialog.appendChild(profile);

    if (member) {
      const placeholder = el("p", "member-settings-placeholder");
      placeholder.textContent = "Map, Drawing, Music, and Privacy preferences are not yet configurable.";
      dialog.appendChild(placeholder);
    }
  }

  function render(): void {
    if (screen === "home") renderHome();
    else if (screen === "artwork") renderArtworkScreen();
    else if (screen === "profile") renderProfileScreen();
    else renderSettingsScreen();
  }

  return {
    open(): void {
      screen = "home";
      showAllArtwork = false;
      profileEditing = false;
      statusMessage = "";
      render();
      dialog.showModal();
    },
    close: close_,
    render,
    refresh(): void {
      if (dialog.open) render();
    },
  };
}
