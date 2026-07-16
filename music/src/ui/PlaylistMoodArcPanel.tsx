import { useState, useMemo } from "react";
import type { Track } from "../data/trackTypes";
import type {
  PlaylistArcConfig,
  PlaylistArcSection,
  PlaylistEnergyTarget,
  PlaylistTransitionIntent,
  PlaylistSectionWeightMode,
} from "../data/playlistArcTypes";
import {
  DEFAULT_THREE_PART_SECTIONS,
  DEFAULT_FOUR_PART_SECTIONS,
  ARC_PRESETS,
  makeDefaultMiddleChildren,
} from "../data/playlistArcTypes";
import {
  collectDistinctCrateValues,
  trackMatchesCrate,
  selectCandidatesForSection,
  resolveArcLeafSections,
} from "../logic/playlistArcBuilder";

const ENERGY_TARGETS: PlaylistEnergyTarget[] = ["auto", "low", "medium_low", "medium", "medium_high", "high"];
const ENERGY_LABELS: Record<PlaylistEnergyTarget, string> = {
  auto: "Auto", low: "Low", medium_low: "Med-Low", medium: "Medium", medium_high: "Med-High", high: "High",
};

const TRANSITION_INTENTS: PlaylistTransitionIntent[] = ["auto", "smooth", "deepen", "lift", "contrast", "reset", "exit"];
const TRANSITION_LABELS: Record<PlaylistTransitionIntent, string> = {
  auto: "Auto", smooth: "Smooth", deepen: "Deepen", lift: "Lift", contrast: "Contrast", reset: "Reset", exit: "Exit",
};

const BUDGET_MODES: PlaylistSectionWeightMode[] = ["percent", "duration", "track_count"];
const BUDGET_MODE_LABELS: Record<PlaylistSectionWeightMode, string> = {
  percent: "Percent", duration: "Duration", track_count: "Track Count",
};

type Props = {
  libraryTracks: Track[];
  config: PlaylistArcConfig;
  totalTrackCount: number;
  onChange: (config: PlaylistArcConfig) => void;
};

export function PlaylistMoodArcPanel({ libraryTracks, config, totalTrackCount, onChange }: Props) {
  const [presetId, setPresetId] = useState("");

  const crateValues = useMemo(() => collectDistinctCrateValues(libraryTracks), [libraryTracks]);
  const eligibleLibrary = useMemo(
    () => libraryTracks.filter((t) => t.sourceOwner !== "reference" && (t.audioLinked || t.objectUrl)),
    [libraryTracks],
  );
  const leaves = useMemo(() => {
    const allSections = config.sections.flatMap((s) => [s, ...(s.children ?? [])]);
    const pools = new Map(allSections.map((s) => [s.id, selectCandidatesForSection(eligibleLibrary, s, new Set())]));
    return resolveArcLeafSections({
      sections: config.sections,
      targetTrackCount: totalTrackCount,
      candidatePoolsBySectionId: pools,
    }).leaves;
  }, [eligibleLibrary, config.sections, totalTrackCount]);
  const leafById = useMemo(() => new Map(leaves.map((l) => [l.id, l])), [leaves]);
  // Count shown on a parent-with-children card is the sum of its (estimated)
  // children counts — the parent itself is never a generation leaf.
  const countForSection = (section: PlaylistArcSection): number => {
    const enabledChildren = (section.children ?? []).filter((c) => c.enabled !== false);
    if (enabledChildren.length > 0) {
      return enabledChildren.reduce((sum, c) => sum + (leafById.get(c.id)?.targetTrackCount ?? 0), 0);
    }
    return leafById.get(section.id)?.targetTrackCount ?? 0;
  };

  function setMode(mode: PlaylistArcConfig["mode"]) {
    const sections =
      mode === "three_part" ? DEFAULT_THREE_PART_SECTIONS.map((s) => ({ ...s })) :
      mode === "four_part" ? DEFAULT_FOUR_PART_SECTIONS.map((s) => ({ ...s })) :
      config.sections;
    onChange({ mode, sections });
    setPresetId("");
  }

  function updateSection(id: string, patch: Partial<PlaylistArcSection>) {
    onChange({
      ...config,
      sections: config.sections.map((s) => s.id === id ? { ...s, ...patch } : s),
    });
  }

  // ── Middle sub-sections (0711_MUSIC_Nested_Middle_Section_Generator) ──────

  function enableMiddleChildren(parentId: string) {
    updateSection(parentId, { children: makeDefaultMiddleChildren() });
  }

  function disableMiddleChildren(parentId: string) {
    updateSection(parentId, { children: undefined });
  }

  function updateChild(parentId: string, childId: string, patch: Partial<PlaylistArcSection>) {
    onChange({
      ...config,
      sections: config.sections.map((s) =>
        s.id === parentId
          ? { ...s, children: (s.children ?? []).map((c) => c.id === childId ? { ...c, ...patch } : c) }
          : s
      ),
    });
  }

  function addChild(parentId: string) {
    const parent = config.sections.find((s) => s.id === parentId);
    if (!parent) return;
    const children = parent.children ?? [];
    const next = children.length + 1;
    const child: PlaylistArcSection = {
      id: `${parentId}_c${Date.now().toString(36)}`,
      name: "middle",
      label: `${parent.label} ${String.fromCharCode(64 + next)}`,
      weight: 0.2,
      primaryCrate: "",
      energyTarget: "auto",
      transitionIntent: "smooth",
      locked: false,
      enabled: true,
    };
    updateSection(parentId, { children: [...children, child] });
  }

  function removeChild(parentId: string, childId: string) {
    const parent = config.sections.find((s) => s.id === parentId);
    if (!parent) return;
    updateSection(parentId, { children: (parent.children ?? []).filter((c) => c.id !== childId) });
  }

  function duplicateChild(parentId: string, childId: string) {
    const parent = config.sections.find((s) => s.id === parentId);
    if (!parent) return;
    const src = (parent.children ?? []).find((c) => c.id === childId);
    if (!src) return;
    const copy: PlaylistArcSection = { ...src, id: `${parentId}_c${Date.now().toString(36)}`, label: `${src.label} copy` };
    const idx = (parent.children ?? []).findIndex((c) => c.id === childId);
    const children = [...(parent.children ?? [])];
    children.splice(idx + 1, 0, copy);
    updateSection(parentId, { children });
  }

  function normalizeMiddleWeights(parentId: string) {
    const parent = config.sections.find((s) => s.id === parentId);
    if (!parent) return;
    const children = parent.children ?? [];
    const enabled = children.filter((c) => c.enabled !== false && (c.weightMode ?? "percent") === "percent");
    const total = enabled.reduce((s, c) => s + c.weight, 0);
    if (total <= 0) return;
    updateSection(parentId, {
      children: children.map((c) =>
        c.enabled !== false && (c.weightMode ?? "percent") === "percent"
          ? { ...c, weight: c.weight / total }
          : c
      ),
    });
  }

  function applyPreset(id: string) {
    const preset = ARC_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    onChange({ ...preset.config, sections: preset.config.sections.map((s) => ({ ...s })) });
    setPresetId(id);
  }

  // Per-section pool size estimate
  function poolSize(section: PlaylistArcSection): number {
    return libraryTracks.filter(
      (t) =>
        t.sourceOwner !== "reference" &&
        (t.audioLinked || t.objectUrl) &&
        (trackMatchesCrate(t, section.primaryCrate) ||
          (section.secondaryCrate ? trackMatchesCrate(t, section.secondaryCrate) : false))
    ).length;
  }

  return (
    <div className="arc-panel">
      {/* Mode toggle + preset */}
      <div className="arc-top-bar">
        <div className="arc-mode-group">
          <span className="arc-mode-label">Mood Arc</span>
          {(["three_part", "four_part"] as const).map((m) => (
            <button
              key={m}
              className={`arc-mode-btn${config.mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "three_part" ? "3-Part" : "4-Part"}
            </button>
          ))}
        </div>
        <div className="arc-preset-group">
          <span className="arc-preset-label">Preset</span>
          <select
            className="arc-preset-select"
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">— choose —</option>
            {ARC_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {presetId && (() => {
        const p = ARC_PRESETS.find((x) => x.id === presetId);
        return p ? <div className="arc-preset-desc">{p.description}</div> : null;
      })()}

      {/* Section cards */}
      <div className={`arc-sections arc-sections-${config.sections.length}`}>
        {config.sections.map((section) => {
          const count = countForSection(section);
          const pool = poolSize(section);
          const isShort = section.primaryCrate && pool < count;
          const hasChildren = (section.children ?? []).length > 0;

          return (
            <div key={section.id} className={`arc-section-card${section.locked ? " locked" : ""}`}>
              <div className="arc-section-header">
                <input
                  className="arc-section-name"
                  value={section.label}
                  onChange={(e) => updateSection(section.id, { label: e.target.value })}
                />
                <div className="arc-section-meta">
                  <span className="arc-section-pct">
                    {(section.weightMode ?? "percent") === "percent" ? `${Math.round(section.weight * 100)}%`
                      : section.weightMode === "duration" ? `${section.durationMinutes ?? 10}m`
                      : `${section.trackCount ?? 5}t`}
                  </span>
                  <button
                    className={`arc-lock-btn${section.locked ? " active" : ""}`}
                    title="Lock section"
                    onClick={() => updateSection(section.id, { locked: !section.locked })}
                  >
                    {section.locked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              {/* Budget mode */}
              <div className="arc-field-row">
                <label className="arc-field-label">Budget</label>
                <div className="arc-budget-mode-group">
                  {BUDGET_MODES.map((m) => (
                    <button
                      key={m}
                      className={`arc-budget-mode-btn${(section.weightMode ?? "percent") === m ? " active" : ""}`}
                      disabled={section.locked}
                      onClick={() => updateSection(section.id, { weightMode: m })}
                    >
                      {BUDGET_MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget value — only the active mode's input is shown; the other
                  two values are preserved untouched so switching modes doesn't lose them. */}
              {(section.weightMode ?? "percent") === "percent" && (
                <div className="arc-field-row">
                  <label className="arc-field-label">Weight</label>
                  <input
                    className="arc-weight-slider"
                    type="range" min={5} max={60} step={5}
                    value={Math.round(section.weight * 100)}
                    disabled={section.locked}
                    onChange={(e) =>
                      updateSection(section.id, { weight: Number(e.target.value) / 100 })
                    }
                  />
                  <span className="arc-track-est">{count} track{count !== 1 ? "s" : ""}</span>
                </div>
              )}
              {section.weightMode === "duration" && (
                <div className="arc-field-row">
                  <label className="arc-field-label">Minutes</label>
                  <input
                    className="arc-num-input"
                    type="number" min={1} max={180}
                    value={section.durationMinutes ?? 10}
                    disabled={section.locked}
                    onChange={(e) => updateSection(section.id, { durationMinutes: Math.max(1, Number(e.target.value)) })}
                  />
                  <span className="arc-track-est">~{count} track{count !== 1 ? "s" : ""}</span>
                </div>
              )}
              {section.weightMode === "track_count" && (
                <div className="arc-field-row">
                  <label className="arc-field-label">Tracks</label>
                  <input
                    className="arc-num-input"
                    type="number" min={1} max={200}
                    value={section.trackCount ?? 5}
                    disabled={section.locked}
                    onChange={(e) => updateSection(section.id, { trackCount: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
              )}

              {/* Primary crate */}
              <div className="arc-field-row">
                <label className="arc-field-label">Crate</label>
                <input
                  className="arc-crate-input"
                  list={`arc-crate-list-${section.id}`}
                  placeholder="mood / grouping…"
                  value={section.primaryCrate}
                  onChange={(e) => updateSection(section.id, { primaryCrate: e.target.value })}
                />
                <datalist id={`arc-crate-list-${section.id}`}>
                  {crateValues.map((v) => <option key={v} value={v} />)}
                </datalist>
              </div>

              {/* Secondary crate + blend */}
              <div className="arc-field-row">
                <label className="arc-field-label">+ Crate</label>
                <input
                  className="arc-crate-input arc-crate-secondary"
                  list={`arc-crate-sec-${section.id}`}
                  placeholder="optional"
                  value={section.secondaryCrate ?? ""}
                  onChange={(e) =>
                    updateSection(section.id, { secondaryCrate: e.target.value || undefined })
                  }
                />
                <datalist id={`arc-crate-sec-${section.id}`}>
                  {crateValues.map((v) => <option key={v} value={v} />)}
                </datalist>
                {section.secondaryCrate && (
                  <input
                    className="arc-blend-slider"
                    type="range" min={30} max={90} step={5}
                    title={`Primary: ${Math.round((section.crateBlend ?? 0.7) * 100)}% / Secondary: ${Math.round((1 - (section.crateBlend ?? 0.7)) * 100)}%`}
                    value={Math.round((section.crateBlend ?? 0.7) * 100)}
                    onChange={(e) =>
                      updateSection(section.id, { crateBlend: Number(e.target.value) / 100 })
                    }
                  />
                )}
              </div>

              {/* Energy target */}
              <div className="arc-field-row">
                <label className="arc-field-label">Energy</label>
                <select
                  className="arc-select"
                  value={section.energyTarget}
                  onChange={(e) =>
                    updateSection(section.id, { energyTarget: e.target.value as PlaylistEnergyTarget })
                  }
                >
                  {ENERGY_TARGETS.map((t) => (
                    <option key={t} value={t}>{ENERGY_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Transition intent */}
              <div className="arc-field-row">
                <label className="arc-field-label">→ Next</label>
                <select
                  className="arc-select"
                  value={section.transitionIntent}
                  onChange={(e) =>
                    updateSection(section.id, { transitionIntent: e.target.value as PlaylistTransitionIntent })
                  }
                >
                  {TRANSITION_INTENTS.map((t) => (
                    <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Pool size indicator */}
              <div className="arc-pool-row">
                {section.primaryCrate ? (
                  <span className={`arc-pool-count${isShort ? " arc-pool-warn" : ""}`}>
                    {pool} eligible
                    {isShort && ` — needs ${count}, only ${pool} match`}
                  </span>
                ) : (
                  <span className="arc-pool-hint">Enter a crate to see matches</span>
                )}
              </div>

              {/* Middle sub-sections (0711_MUSIC_Nested_Middle_Section_Generator) —
                  only the Middle section supports children, one level deep. */}
              {section.name === "middle" && (
                <div className="arc-middle-children">
                  {!hasChildren ? (
                    <button
                      type="button"
                      className="arc-middle-enable-btn"
                      onClick={() => enableMiddleChildren(section.id)}
                    >
                      + Enable Middle Subsections
                    </button>
                  ) : (
                    <>
                      <div className="arc-middle-children-header">
                        <span className="arc-middle-children-label">Middle Subsections</span>
                        <button type="button" onClick={() => addChild(section.id)}>+ Add Subsection</button>
                        <button type="button" onClick={() => enableMiddleChildren(section.id)}>Preset: A/B/C Split</button>
                        <button type="button" onClick={() => normalizeMiddleWeights(section.id)}>Normalize Weights</button>
                        <button type="button" onClick={() => disableMiddleChildren(section.id)}>Disable Subsections</button>
                      </div>
                      {(section.children ?? []).map((child) => {
                        const childCount = leafById.get(child.id)?.targetTrackCount ?? 0;
                        const childPool = poolSize(child);
                        const childShort = !!child.primaryCrate && childPool < childCount;
                        return (
                          <div key={child.id} className={`arc-section-card arc-middle-child${child.enabled === false ? " disabled" : ""}`}>
                            <div className="arc-section-header">
                              <input
                                className="arc-section-name"
                                value={child.label}
                                onChange={(e) => updateChild(section.id, child.id, { label: e.target.value })}
                              />
                              <div className="arc-section-meta">
                                <span className="arc-section-pct">
                                  {(child.weightMode ?? "percent") === "percent" ? `${Math.round(child.weight * 100)}%`
                                    : child.weightMode === "duration" ? `${child.durationMinutes ?? 10}m`
                                    : `${child.trackCount ?? 5}t`}
                                </span>
                                <button
                                  type="button"
                                  title={child.enabled === false ? "Enable subsection" : "Disable subsection"}
                                  onClick={() => updateChild(section.id, child.id, { enabled: child.enabled === false })}
                                >
                                  {child.enabled === false ? "Off" : "On"}
                                </button>
                              </div>
                            </div>

                            <div className="arc-field-row">
                              <label className="arc-field-label">Budget</label>
                              <div className="arc-budget-mode-group">
                                {BUDGET_MODES.map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    className={`arc-budget-mode-btn${(child.weightMode ?? "percent") === m ? " active" : ""}`}
                                    onClick={() => updateChild(section.id, child.id, { weightMode: m })}
                                  >
                                    {BUDGET_MODE_LABELS[m]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {(child.weightMode ?? "percent") === "percent" && (
                              <div className="arc-field-row">
                                <label className="arc-field-label">Weight</label>
                                <input
                                  className="arc-weight-slider"
                                  type="range" min={5} max={90} step={5}
                                  value={Math.round(child.weight * 100)}
                                  onChange={(e) => updateChild(section.id, child.id, { weight: Number(e.target.value) / 100 })}
                                />
                                <span className="arc-track-est">{childCount} track{childCount !== 1 ? "s" : ""}</span>
                              </div>
                            )}
                            {child.weightMode === "duration" && (
                              <div className="arc-field-row">
                                <label className="arc-field-label">Minutes</label>
                                <input
                                  className="arc-num-input"
                                  type="number" min={1} max={180}
                                  value={child.durationMinutes ?? 10}
                                  onChange={(e) => updateChild(section.id, child.id, { durationMinutes: Math.max(1, Number(e.target.value)) })}
                                />
                                <span className="arc-track-est">~{childCount} track{childCount !== 1 ? "s" : ""}</span>
                              </div>
                            )}
                            {child.weightMode === "track_count" && (
                              <div className="arc-field-row">
                                <label className="arc-field-label">Tracks</label>
                                <input
                                  className="arc-num-input"
                                  type="number" min={1} max={200}
                                  value={child.trackCount ?? 5}
                                  onChange={(e) => updateChild(section.id, child.id, { trackCount: Math.max(1, Number(e.target.value)) })}
                                />
                              </div>
                            )}

                            <div className="arc-field-row">
                              <label className="arc-field-label">Crate</label>
                              <input
                                className="arc-crate-input"
                                list={`arc-crate-list-${child.id}`}
                                placeholder="mood / grouping…"
                                value={child.primaryCrate}
                                onChange={(e) => updateChild(section.id, child.id, { primaryCrate: e.target.value })}
                              />
                              <datalist id={`arc-crate-list-${child.id}`}>
                                {crateValues.map((v) => <option key={v} value={v} />)}
                              </datalist>
                            </div>

                            <div className="arc-field-row">
                              <label className="arc-field-label">Energy</label>
                              <select
                                className="arc-select"
                                value={child.energyTarget}
                                onChange={(e) => updateChild(section.id, child.id, { energyTarget: e.target.value as PlaylistEnergyTarget })}
                              >
                                {ENERGY_TARGETS.map((t) => (
                                  <option key={t} value={t}>{ENERGY_LABELS[t]}</option>
                                ))}
                              </select>
                            </div>

                            <div className="arc-field-row">
                              <label className="arc-field-label">→ Next</label>
                              <select
                                className="arc-select"
                                value={child.transitionIntent}
                                onChange={(e) => updateChild(section.id, child.id, { transitionIntent: e.target.value as PlaylistTransitionIntent })}
                              >
                                {TRANSITION_INTENTS.map((t) => (
                                  <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>
                                ))}
                              </select>
                            </div>

                            <div className="arc-pool-row">
                              {child.primaryCrate ? (
                                <span className={`arc-pool-count${childShort ? " arc-pool-warn" : ""}`}>
                                  {childPool} eligible
                                  {childShort && ` — needs ${childCount}, only ${childPool} match`}
                                </span>
                              ) : (
                                <span className="arc-pool-hint">Enter a crate to see matches</span>
                              )}
                            </div>

                            <div className="arc-middle-child-actions">
                              <button type="button" onClick={() => duplicateChild(section.id, child.id)}>Duplicate</button>
                              <button type="button" onClick={() => removeChild(section.id, child.id)}>Remove</button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
