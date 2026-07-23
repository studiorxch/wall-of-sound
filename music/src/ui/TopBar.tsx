import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlayProject } from "../data/playProjectTypes";
import { parseCsvTracks } from "../data/importCsv";
import { readPlayProjectExportFile } from "../data/playProjectExport";
import type { Track } from "../data/trackTypes";
import { navigationItems } from "./topBarNavigation";
import type { NavigationLink } from "./topBarNavigation";
import studioRichLogo from "../assets/studiorich-logo.svg";

export type { WorkspaceMode } from "./topBarNavigation";
import type { WorkspaceMode } from "./topBarNavigation";

export type ImportDestination = "library" | "archive" | "playlist" | "group";

export type PageMenuItem = { label: string; action: () => void; disabled?: boolean; sep?: boolean };

type Props = {
  onTracksImported: (tracks: Track[], destination: ImportDestination) => void;
  onProjectLoaded: (p: PlayProject) => void;
  onExportProject: () => void;
  /** Opens the Version History screen (0712_MUSIC_Library_Overflow_Menu_Pruning §6/§8). */
  onOpenVersionHistory?: () => void;
  currentProjectSummary?: { playlistCount: number; crateCount: number; trackCount: number };
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (m: WorkspaceMode) => void;
  lastExportedAt: string | null;
  isProjectDirty: boolean;
  rightSlot?: ReactNode;
  pageMenuItems?: PageMenuItem[];
};

function formatExportTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Source destination options for CSV import — must pick before file picker opens
type ImportSource = "studiorich" | "external" | "reference" | "playlist" | "group";

const SOURCE_IMPORT_OPTIONS: { value: ImportSource; label: string; desc: string }[] = [
  { value: "studiorich", label: "Catalog",   desc: "sourceOwner=studiorich · internal use" },
  { value: "external",   label: "External Library",     desc: "sourceOwner=external · Mixcloud / reference" },
  { value: "reference",  label: "Sounds Library",       desc: "sourceOwner=reference · reference only" },
  { value: "playlist",   label: "Current Playlist",     desc: "Add to library + active playlist" },
  { value: "group",      label: "Library Group",        desc: "Add to library and tag with a group" },
];

function ImportSourcePicker({
  onConfirm,
  onCancel,
}: {
  onConfirm: (src: ImportSource) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ImportSource>("studiorich");

  return (
    <div className="import-dest-overlay" onClick={onCancel}>
      <div className="import-dest-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="import-dest-title">Import metadata CSV — choose destination</div>
        <div className="import-dest-label" style={{ marginTop: 0, marginBottom: 6, fontSize: 11, color: "var(--text-dim)" }}>
          Select where the imported tracks will land before choosing a file.
        </div>
        <div className="import-dest-options">
          {SOURCE_IMPORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`import-dest-opt${selected === opt.value ? " selected" : ""}`}
              onClick={() => setSelected(opt.value)}
            >
              <span className="import-dest-opt-label">{opt.label}</span>
              <span className="import-dest-opt-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
        <div className="import-dest-actions">
          <button className="tb-btn" onClick={onCancel}>Cancel</button>
          <button className="tb-btn ph-btn-primary" onClick={() => onConfirm(selected)}>
            Choose File →
          </button>
        </div>
      </div>
    </div>
  );
}

const DESTINATION_OPTIONS: { value: ImportDestination; label: string; desc: string }[] = [
  { value: "library",  label: "Library",  desc: "Add to library — does not affect active playlist" },
  { value: "archive",  label: "Archive",  desc: "Add to library, mark as curated/trusted" },
  { value: "playlist", label: "Playlist", desc: "Add to library and append to active playlist" },
  { value: "group",    label: "Group",    desc: "Add to library and tag with a library group" },
];

function ImportDestinationDialog({
  trackCount,
  fileName,
  onConfirm,
  onCancel,
}: {
  trackCount: number;
  fileName: string;
  onConfirm: (dest: ImportDestination) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ImportDestination>("library");

  return (
    <div className="import-dest-overlay" onClick={onCancel}>
      <div className="import-dest-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="import-dest-title">Import {trackCount} tracks</div>
        <div className="import-dest-file">{fileName}</div>
        <div className="import-dest-label">Choose destination:</div>
        <div className="import-dest-options">
          {DESTINATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`import-dest-opt${selected === opt.value ? " selected" : ""}`}
              onClick={() => setSelected(opt.value)}
            >
              <span className="import-dest-opt-label">{opt.label}</span>
              <span className="import-dest-opt-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
        <div className="import-dest-actions">
          <button className="tb-btn" onClick={onCancel}>Cancel</button>
          <button className="tb-btn ph-btn-primary" onClick={() => onConfirm(selected)}>
            Import to {selected.charAt(0).toUpperCase() + selected.slice(1)}
          </button>
        </div>
      </div>
    </div>
  );
}

// Studio / Broadcast nav dropdowns (0722_MUSIC_Global_Navigation_Dropdowns).
// Click-to-open (not hover), so pointer travel between trigger and menu needs
// no special handling — only toggle, outside click, Escape, and item
// selection ever close it.
function NavDropdown({
  id,
  label,
  items,
  workspaceMode,
  onWorkspaceModeChange,
  isOpen,
  onToggle,
  onClose,
}: {
  id: "studio" | "broadcast";
  label: string;
  items: readonly NavigationLink[];
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (m: WorkspaceMode) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `tb-nav-menu-${id}`;
  const isActive = items.some((link) => link.kind === "internal" && link.mode === workspaceMode);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [isOpen]);

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (!nodes.length) return;
      const currentIndex = nodes.indexOf(document.activeElement as HTMLElement);
      const nextIndex = e.key === "ArrowDown"
        ? (currentIndex + 1) % nodes.length
        : (currentIndex - 1 + nodes.length) % nodes.length;
      nodes[nextIndex]?.focus();
    }
  }

  return (
    <div
      className="tb-nav-dropdown"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`tb-mode-btn tb-nav-trigger${isActive ? " active" : ""}`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={onToggle}
      >
        {label}
        <span className={`tb-nav-chevron${isOpen ? " open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          className="tb-nav-menu"
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((link) =>
            link.kind === "internal" ? (
              <button
                key={link.label}
                type="button"
                role="menuitem"
                className={`tb-nav-menu-item${workspaceMode === link.mode ? " active" : ""}`}
                title={link.title}
                onClick={() => {
                  onWorkspaceModeChange(link.mode);
                  onClose();
                }}
              >
                {link.label}
              </button>
            ) : (
              <a
                key={link.label}
                role="menuitem"
                className="tb-nav-menu-item"
                href={link.href}
                onClick={onClose}
              >
                {link.label}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar({
  onTracksImported,
  onProjectLoaded,
  onExportProject,
  onOpenVersionHistory,
  currentProjectSummary,
  workspaceMode,
  onWorkspaceModeChange,
  lastExportedAt,
  isProjectDirty,
  rightSlot,
  pageMenuItems = [],
}: Props) {
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const overflowPanelRef = useRef<HTMLDivElement>(null);
  const navGroupRef = useRef<HTMLDivElement>(null);
  const [openNavMenu, setOpenNavMenu] = useState<"studio" | "broadcast" | null>(null);
  const [flash, setFlash] = useState("");
  const [pendingImport, setPendingImport] = useState<{
    tracks: Track[];
    fileName: string;
  } | null>(null);
  // Destination must be chosen BEFORE file picker opens (0701E)
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [pendingSource, setPendingSource] = useState<ImportSource | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 3000);
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;

    // Build source-specific parse opts based on pendingSource
    const src = pendingSource;
    const opts = src === "studiorich" ? {
      defaultSourceOwner: "studiorich" as const,
      defaultSourceLibrary: "Catalog",
      defaultPlatformUse: ["internal", "studiorich_stream"] as Track["platformUse"],
      defaultAnalysisStatus: "partial" as const,
      defaultAnalysisSources: ["import", "external_tool"] as Track["analysisSources"],
    } : src === "external" ? {
      defaultSourceOwner: "external" as const,
      defaultSourceLibrary: "External",
      defaultPlatformUse: ["mixcloud", "reference_only"] as Track["platformUse"],
      defaultAnalysisStatus: "partial" as const,
      defaultAnalysisSources: ["import", "external_tool"] as Track["analysisSources"],
    } : src === "reference" ? {
      defaultSourceOwner: "reference" as const,
      defaultSourceLibrary: "Sounds",
      defaultPlatformUse: ["reference_only"] as Track["platformUse"],
      defaultAnalysisStatus: "partial" as const,
      defaultAnalysisSources: ["import", "external_tool"] as Track["analysisSources"],
    } : {};

    const reader = new FileReader();
    reader.onload = (ev) => {
      const { tracks, errors } = parseCsvTracks(ev.target?.result as string, opts);
      if (errors.length) showFlash(`${errors.length} parse error(s)`);
      if (tracks.length) {
        if (src === "playlist" || src === "group") {
          // Destination is already determined — skip the dialog
          const dest: ImportDestination = src;
          onTracksImported(tracks, dest);
          showFlash(`+${tracks.length} tracks → ${dest}`);
        } else {
          // Library sources use destination dialog for final placement
          setPendingImport({ tracks, fileName });
        }
      } else {
        showFlash("No tracks found in CSV");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
    setPendingSource(null);
  }

  function handleSourcePickerConfirm(src: ImportSource) {
    setPendingSource(src);
    setShowSourcePicker(false);
    // Now trigger file picker
    setTimeout(() => csvRef.current?.click(), 50);
  }

  function handleDestinationConfirm(dest: ImportDestination) {
    if (!pendingImport) return;
    onTracksImported(pendingImport.tracks, dest);
    showFlash(`+${pendingImport.tracks.length} tracks → ${dest}`);
    setPendingImport(null);
  }

  function handleJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    readPlayProjectExportFile(file)
      .then((p) => {
        setPendingProjectImport(p);
      })
      .catch((err: Error) => {
        showFlash(err.message.split("\n")[0]);
      });
    e.target.value = "";
  }

  function handleExport() {
    onExportProject();
    showFlash("Library exported");
  }

  // ── Storage status label ──────────────────────────────────────────────────
  let statusLabel: string;
  let statusMod: string;
  if (lastExportedAt === null) {
    statusLabel = "Library not exported yet";
    statusMod = "never";
  } else if (isProjectDirty) {
    statusLabel = "Unsaved library changes";
    statusMod = "dirty";
  } else {
    statusLabel = `Library exported · ${formatExportTime(lastExportedAt)}`;
    statusMod = "clean";
  }

  const [showProject, setShowProject] = useState(false);
  const [pendingProjectImport, setPendingProjectImport] = useState<PlayProject | null>(null);

  // Clicking anywhere outside the Studio/Broadcast nav group closes whichever
  // dropdown is open (0722_MUSIC_Global_Navigation_Dropdowns §6).
  useEffect(() => {
    if (!openNavMenu) return;
    function handlePointerDown(e: MouseEvent) {
      if (navGroupRef.current && !navGroupRef.current.contains(e.target as Node)) {
        setOpenNavMenu(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openNavMenu]);

  // Move focus into the menu when it opens via keyboard (Enter/Space/ArrowDown
  // on the trigger) so Arrow-key navigation has something to start from.
  useEffect(() => {
    if (!showProject) return;
    const first = overflowPanelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    first?.focus();
  }, [showProject]);

  // Overflow menu keyboard behavior (0712_MUSIC_Library_Overflow_Menu_Pruning
  // §10): Escape closes and returns focus to the trigger; Arrow keys move
  // focus among the menu's items (Enter/Space to open is native <button>
  // behavior, handled on the trigger itself).
  function handleOverflowMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setShowProject(false);
      overflowTriggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(
        overflowPanelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = e.key === "ArrowDown"
        ? (currentIndex + 1) % items.length
        : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    }
  }

  return (
    <>
      {showSourcePicker && (
        <ImportSourcePicker
          onConfirm={handleSourcePickerConfirm}
          onCancel={() => setShowSourcePicker(false)}
        />
      )}
      {pendingImport && (
        <ImportDestinationDialog
          trackCount={pendingImport.tracks.length}
          fileName={pendingImport.fileName}
          onConfirm={handleDestinationConfirm}
          onCancel={() => setPendingImport(null)}
        />
      )}
      {pendingProjectImport && (
        <div className="import-dest-overlay" onClick={() => setPendingProjectImport(null)}>
          <div className="import-dest-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="import-dest-title">Replace library?</div>
            <div className="import-dest-label" style={{ marginTop: 4, marginBottom: 12, fontSize: 11, color: "var(--text-dim)" }}>
              This will replace your current library with the imported file. Your playlists, crates, and tracks will be overwritten.
            </div>
            {currentProjectSummary && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12, background: "var(--surface-raised, rgba(0,0,0,0.15))", padding: "6px 10px", borderRadius: 4 }}>
                Current: {currentProjectSummary.playlistCount} playlist{currentProjectSummary.playlistCount !== 1 ? "s" : ""}, {currentProjectSummary.crateCount} crate{currentProjectSummary.crateCount !== 1 ? "s" : ""}, {currentProjectSummary.trackCount} track{currentProjectSummary.trackCount !== 1 ? "s" : ""}
              </div>
            )}
            {pendingProjectImport.playlists && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 16, background: "var(--surface-raised, rgba(0,0,0,0.15))", padding: "6px 10px", borderRadius: 4 }}>
                Importing: {pendingProjectImport.playlists.length} playlist{pendingProjectImport.playlists.length !== 1 ? "s" : ""}, {(pendingProjectImport as unknown as { crates?: unknown[] }).crates?.length ?? 0} crate{((pendingProjectImport as unknown as { crates?: unknown[] }).crates?.length ?? 0) !== 1 ? "s" : ""}, {pendingProjectImport.libraryTracks?.length ?? 0} track{(pendingProjectImport.libraryTracks?.length ?? 0) !== 1 ? "s" : ""}
              </div>
            )}
            <div className="import-dest-actions">
              <button className="tb-btn" onClick={() => setPendingProjectImport(null)}>Cancel</button>
              <button
                className="ph-btn-danger"
                style={{ marginLeft: 8, padding: "5px 14px", borderRadius: 4, fontSize: 12, background: "var(--danger, #c0392b)", color: "#fff", border: "none", cursor: "pointer" }}
                onClick={() => {
                  onProjectLoaded(pendingProjectImport);
                  setPendingProjectImport(null);
                  showFlash("Library imported");
                }}
              >
                Replace library
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="top-bar" onClick={() => setShowProject(false)}>
        {/* Left: logo. The MUSIC product label moved to the top of the
            left-panel sidebar (FileManager.tsx's .fm-brand) — this stays
            the logo's only appearance anywhere in the nav. */}
        <div className="tb-section tb-identity">
          <img src={studioRichLogo} alt="StudioRich" className="tb-logo" />
          <input
            ref={csvRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleCsv}
          />
          <input
            ref={jsonRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleJson}
          />
          {flash && <span className="tb-flash">{flash}</span>}
        </div>

        {/* Right: mode toggles + project menu */}
        <div className="tb-section tb-right">
          {rightSlot && (
            <>
              {rightSlot}
              <div className="tb-divider" />
            </>
          )}
          <div className="tb-mode-switch" ref={navGroupRef}>
            {navigationItems.map((item) =>
              "children" in item ? (
                <NavDropdown
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  items={item.children}
                  workspaceMode={workspaceMode}
                  onWorkspaceModeChange={onWorkspaceModeChange}
                  isOpen={openNavMenu === item.id}
                  onToggle={() => setOpenNavMenu((cur) => (cur === item.id ? null : item.id))}
                  onClose={() => setOpenNavMenu(null)}
                />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  className={`tb-mode-btn${workspaceMode === item.mode ? " active" : ""}`}
                  onClick={() => onWorkspaceModeChange(item.mode)}
                  title={item.title}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
          <div className="ph-dropdown" onClick={(e) => e.stopPropagation()}>
            <button
              ref={overflowTriggerRef}
              className="tb-icon-btn"
              onClick={() => setShowProject((v) => !v)}
              onKeyDown={(e) => {
                // Enter/Space already open the menu via native button click
                // activation — only ArrowDown needs explicit handling here.
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setShowProject(true);
                }
              }}
              title="More Library Actions"
              aria-label="More Library Actions"
              aria-haspopup="menu"
              aria-expanded={showProject}
            >
              ···
            </button>
            {showProject && (
              <div
                ref={overflowPanelRef}
                className="ph-dropdown-panel ph-dropdown-panel-right"
                style={{ top: 32, minWidth: 220, maxHeight: "calc(100vh - 60px)", overflowY: "auto" }}
                role="menu"
                aria-label="More Library Actions"
                onKeyDown={handleOverflowMenuKeyDown}
              >
                {pageMenuItems.length > 0 && (
                  <>
                    <div className="ph-dropdown-label" role="group" aria-label="Page Actions">Page Actions</div>
                    {pageMenuItems.map((item, i) =>
                      item.sep ? (
                        <div key={`psep-${i}`} className="ph-dropdown-sep" />
                      ) : (
                        <button
                          key={`pact-${i}`}
                          className="tb-btn"
                          role="menuitem"
                          style={{ marginTop: 4, width: "100%" }}
                          disabled={item.disabled}
                          onClick={() => { item.action(); setShowProject(false); }}
                        >
                          {item.label}
                        </button>
                      )
                    )}
                    <div className="ph-dropdown-sep" style={{ marginTop: 8 }} />
                  </>
                )}

                <div
                  className={`tb-save-status tb-save-status--${statusMod}`}
                  style={{ fontSize: 11, padding: "4px 0" }}
                >
                  {statusLabel}
                </div>

                <div className="ph-dropdown-label" style={{ marginTop: 10 }} role="group" aria-label="Import">Import</div>
                <button
                  className="tb-btn"
                  role="menuitem"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => {
                    setShowProject(false);
                    setShowSourcePicker(true);
                  }}
                >
                  Import metadata CSV…
                </button>

                <div className="ph-dropdown-sep" style={{ marginTop: 12 }} />
                <div className="ph-dropdown-label" role="group" aria-label="Library">Library</div>
                <button
                  className="tb-btn"
                  role="menuitem"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => {
                    handleExport();
                    setShowProject(false);
                  }}
                >
                  Export library
                </button>
                <button
                  className="tb-btn"
                  role="menuitem"
                  style={{ marginTop: 6, width: "100%" }}
                  onClick={() => {
                    jsonRef.current?.click();
                    setShowProject(false);
                  }}
                >
                  Import library…
                </button>

                {onOpenVersionHistory && (
                  <>
                    <div className="ph-dropdown-sep" style={{ marginTop: 12 }} />
                    <div className="ph-dropdown-label" role="group" aria-label="Version History">Version history</div>
                    <button
                      className="tb-btn"
                      role="menuitem"
                      style={{ marginTop: 4, width: "100%" }}
                      onClick={() => {
                        onOpenVersionHistory();
                        setShowProject(false);
                      }}
                    >
                      Version history…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
