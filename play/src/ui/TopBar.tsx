import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlayProject } from "../data/playProjectTypes";
import { parseCsvTracks } from "../data/importCsv";
import { readPlayProjectExportFile } from "../data/playProjectExport";
import type { Track } from "../data/trackTypes";

export type WorkspaceMode = "flow_curve" | "scheduler" | "broadcast_hud";

export type ImportDestination = "library" | "archive" | "playlist" | "group";

export type PageMenuItem = { label: string; action: () => void; disabled?: boolean; sep?: boolean };

type Props = {
  onTracksImported: (tracks: Track[], destination: ImportDestination) => void;
  onProjectLoaded: (p: PlayProject) => void;
  onExportProject: () => void;
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
  { value: "reference",  label: "Reference Library",    desc: "sourceOwner=reference · reference only" },
  { value: "playlist",   label: "Current Playlist",     desc: "Add to library + active playlist" },
  { value: "group",      label: "Library Group",        desc: "Add to library and tag with a group" },
];

// Map source → ImportDestination for backward compat with handleTracksImported
function sourceToDestination(src: ImportSource): ImportDestination {
  if (src === "playlist") return "playlist";
  if (src === "group") return "group";
  return "library"; // studiorich / external / reference all go to library
}

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
        <div className="import-dest-title">Import CSV — choose destination</div>
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

export function TopBar({
  onTracksImported,
  onProjectLoaded,
  onExportProject,
  workspaceMode,
  onWorkspaceModeChange,
  lastExportedAt,
  isProjectDirty,
  rightSlot,
  pageMenuItems = [],
}: Props) {
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
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
      defaultSourceLibrary: "Reference",
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
        onProjectLoaded(p);
        showFlash("Project imported");
      })
      .catch((err: Error) => {
        showFlash(err.message.split("\n")[0]);
      });
    e.target.value = "";
  }

  function handleExport() {
    onExportProject();
    showFlash("Project exported");
  }

  // ── Storage status label ──────────────────────────────────────────────────
  let statusLabel: string;
  let statusMod: string;
  if (lastExportedAt === null) {
    statusLabel = "Project not exported yet";
    statusMod = "never";
  } else if (isProjectDirty) {
    statusLabel = "Unsaved to project file";
    statusMod = "dirty";
  } else {
    statusLabel = `Project file exported · ${formatExportTime(lastExportedAt)}`;
    statusMod = "clean";
  }

  const [showProject, setShowProject] = useState(false);

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
      <header className="top-bar" onClick={() => setShowProject(false)}>
        {/* Left: logo */}
        <div className="tb-section tb-identity">
          <span className="tb-logo">◇</span>
          <span className="tb-brand">MUSIC</span>
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
          <div className="tb-mode-switch">
            <button
              className={`tb-mode-btn${workspaceMode === "flow_curve" ? " active" : ""}`}
              onClick={() => onWorkspaceModeChange("flow_curve")}
              title="Flow-Curve Editor"
            >
              Library
            </button>
            <button
              className={`tb-mode-btn${workspaceMode === "scheduler" ? " active" : ""}`}
              onClick={() => onWorkspaceModeChange("scheduler")}
              title="Scheduler / TV Guide"
            >
              Scheduler
            </button>
            <button
              className={`tb-mode-btn${workspaceMode === "broadcast_hud" ? " active" : ""}`}
              onClick={() => onWorkspaceModeChange("broadcast_hud")}
              title="Broadcast HUD Mode"
            >
              Broadcast
            </button>
          </div>
          <div className="ph-dropdown" onClick={(e) => e.stopPropagation()}>
            <button
              className="tb-icon-btn"
              onClick={() => setShowProject((v) => !v)}
              title="Project — export / import JSON"
            >
              ···
            </button>
            {showProject && (
              <div
                className="ph-dropdown-panel ph-dropdown-panel-right"
                style={{ top: 32, minWidth: 220 }}
              >
                {pageMenuItems.length > 0 && (
                  <>
                    <div className="ph-dropdown-label">Page Actions</div>
                    {pageMenuItems.map((item, i) =>
                      item.sep ? (
                        <div key={`psep-${i}`} className="ph-dropdown-sep" />
                      ) : (
                        <button
                          key={`pact-${i}`}
                          className="tb-btn"
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
                <div className="ph-dropdown-label">Project File</div>
                <div
                  className={`tb-save-status tb-save-status--${statusMod}`}
                  style={{ fontSize: 11, padding: "4px 0" }}
                >
                  {statusLabel}
                </div>
                <div className="ph-dropdown-label" style={{ marginTop: 12 }}>
                  Tracks
                </div>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => {
                    setShowProject(false);
                    setShowSourcePicker(true);
                  }}
                >
                  Import CSV
                </button>
                <div className="ph-dropdown-label" style={{ marginTop: 12 }}>
                  Project File
                </div>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => {
                    handleExport();
                    setShowProject(false);
                  }}
                >
                  Export Project JSON
                </button>
                <button
                  className="tb-btn"
                  style={{ marginTop: 6, width: "100%" }}
                  onClick={() => {
                    jsonRef.current?.click();
                    setShowProject(false);
                  }}
                >
                  Import Project JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
