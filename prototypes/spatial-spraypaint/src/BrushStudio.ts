import {
  getSprayPropertyGroups,
  isSprayBrushModified,
  resolveEffectiveSprayStyle,
  type SprayPropertyKey,
  type SprayPropertyOverride,
} from "./BrushProperties";
import { renderMarkerBrushStudioPreview, renderSprayBrushStudioPreview, renderTrackMarksFlairPreview } from "./BrushPreview";
import {
  getFlairPropertyRows,
  isFlairModeModified,
  isFlairPropertyModified,
  resolveEffectiveFlairParams,
  type FlairOverrideStore,
  type FlairParameterOverride,
  type FlairPropertyKey,
  type FlairPropertyRow,
} from "./FlairProperties";
import { resolveTrackMarksFlairSizeRange } from "./FlairCurves";
import { type FlairModeId } from "./ToolTaxonomy";
import {
  duplicateSprayBrush,
  renameCustomSprayBrush,
  type BrushProvenance,
  type CustomSprayBrush,
  type CustomSprayBrushRegistry,
  classifySprayCapId,
  createCustomSprayBrushId,
} from "./CustomBrush";
import { type DrawingToolId, type MarkerVariantId } from "./DrawingTool";
import { getMarkerVariant, MARKER_VARIANTS, type MarkerVariantDefinition } from "./PaintMarkerEngine";
import { getSprayCapPreset, SPRAY_CAP_PRESETS, type SprayCapFamily, type SprayCapId, type SprayCapPreset } from "./SprayCapPresets";
import { PLUME_MAX_ANGLE_DEGREES } from "./SprayBrushEngine";

/**
 * Pure list/grouping/labeling logic for Brush Studio's middle (Brushes)
 * column. Kept separate from DOM wiring (`BrushStudioController` below) so
 * the actual data shape — which brushes exist, how they're grouped, what
 * they're called — is unit-testable without a DOM environment, matching how
 * the rest of this codebase tests logic and leaves DOM glue to live
 * verification.
 */

export interface SprayFamilyGroup {
  family: SprayCapFamily;
  label: string;
  presets: readonly SprayCapPreset[];
}

const SPRAY_FAMILY_ORDER: ReadonlyArray<{ family: SprayCapFamily; label: string }> = [
  { family: "fat", label: "Fat" },
  { family: "thin", label: "Thin" },
  { family: "specialty", label: "Specialty" },
];

export function groupSprayPresetsByFamily(presets: readonly SprayCapPreset[]): SprayFamilyGroup[] {
  return SPRAY_FAMILY_ORDER
    .map(({ family, label }) => ({ family, label, presets: presets.filter((preset) => preset.family === family) }))
    .filter((group) => group.presets.length > 0);
}

export type MarkerFamily = "round" | "chisel" | "mop";

export function markerFamilyFor(id: MarkerVariantId): MarkerFamily {
  if (id === "round") return "round";
  if (id === "mop" || id === "drip-mop") return "mop";
  return "chisel";
}

export interface MarkerFamilyGroup {
  family: MarkerFamily;
  label: string;
  variants: readonly MarkerVariantDefinition[];
}

const MARKER_FAMILY_ORDER: ReadonlyArray<{ family: MarkerFamily; label: string }> = [
  { family: "round", label: "Round" },
  { family: "chisel", label: "Chisel" },
  { family: "mop", label: "Mop" },
];

export function groupMarkerVariantsByFamily(
  variants: readonly MarkerVariantDefinition[] = MARKER_VARIANTS,
): MarkerFamilyGroup[] {
  return MARKER_FAMILY_ORDER
    .map(({ family, label }) => ({
      family,
      label,
      variants: variants.filter((variant) => markerFamilyFor(variant.id) === family),
    }))
    .filter((group) => group.variants.length > 0);
}

export function provenanceLabel(provenance: BrushProvenance): string {
  switch (provenance) {
    case "physical-reference": return "Physical reference";
    case "digital-effect": return "Digital effect";
    case "custom-studio-brush": return "Custom brush";
  }
}

export interface SprayBrushListEntry {
  id: string;
  preset: SprayCapPreset | CustomSprayBrush["preset"];
  provenance: BrushProvenance;
  isCustom: boolean;
}

export interface SprayBrushListGroup {
  key: string;
  label: string;
  entries: SprayBrushListEntry[];
}

/**
 * The full Spray brush list for Brush Studio's Brushes column: every
 * built-in cap grouped Fat/Thin/Specialty (unchanged from the compact
 * chooser's existing groups), plus a trailing "Custom" group only when the
 * user has actually duplicated a brush this session — never an empty group.
 */
export function buildSprayBrushList(
  builtIns: readonly SprayCapPreset[],
  customRegistry: CustomSprayBrushRegistry,
): SprayBrushListGroup[] {
  const groups: SprayBrushListGroup[] = groupSprayPresetsByFamily(builtIns).map((group) => ({
    key: group.family,
    label: group.label,
    entries: group.presets.map((preset) => ({
      id: preset.id,
      preset,
      provenance: classifySprayCapId(preset.id),
      isCustom: false,
    })),
  }));
  if (customRegistry.length > 0) {
    groups.push({
      key: "custom",
      label: "Custom",
      entries: customRegistry.map((brush) => ({
        id: brush.preset.id,
        preset: brush.preset,
        provenance: "custom-studio-brush",
        isCustom: true,
      })),
    });
  }
  return groups;
}

/** Finds a Spray preset by id across both the built-in array and the custom registry. */
export function findSprayBrushPreset(
  builtIns: readonly SprayCapPreset[],
  customRegistry: CustomSprayBrushRegistry,
  id: string,
): SprayCapPreset | CustomSprayBrush["preset"] | undefined {
  return builtIns.find((preset) => preset.id === id) ?? customRegistry.find((brush) => brush.preset.id === id)?.preset;
}

// ---------------------------------------------------------------------------
// DOM controller. Deliberately thin — every decision above this point (which
// brushes exist, how they group, what a brush's effective properties are) is
// pure and unit-tested; this class only wires that data to elements and
// events, exercised by live browser verification like the rest of this
// codebase's DOM-wiring layer (main.ts itself has no unit tests either).

export interface BrushStudioDeps {
  getToolSelection: () => { selectedToolId: DrawingToolId; sprayCapId: SprayCapId; markerVariantId: MarkerVariantId };
  getSprayOverrides: () => Record<string, SprayPropertyOverride>;
  getMarkerWidths: () => Record<MarkerVariantId, number>;
  getCustomSprayRegistry: () => CustomSprayBrushRegistry;
  selectTool: (toolId: DrawingToolId) => void;
  selectSprayCap: (capId: SprayCapId) => void;
  selectMarkerVariant: (id: MarkerVariantId) => void;
  setSprayProperty: (capId: string, patch: SprayPropertyOverride) => void;
  resetSprayProperty: (capId: string, key: SprayPropertyKey) => void;
  resetSprayBrush: (capId: string) => void;
  /**
   * Track Marks' own Flair session state (Brush Studio Flair Controls build
   * brief). `getTrackMarksFlairMode`/`setTrackMarksFlairMode` are a single
   * current-mode pointer (not per-cap — only Track Marks consumes Flair at
   * runtime in this pass, see the checkpoint doc); `getFlairOverrides` and
   * the three mutators below key by BOTH cap id and mode (see
   * `FlairProperties.ts`) so one mode's session tweaks never leak into
   * another mode's defaults.
   */
  getFlairOverrides: () => FlairOverrideStore;
  getTrackMarksFlairMode: () => FlairModeId;
  setTrackMarksFlairMode: (mode: FlairModeId) => void;
  setFlairProperty: (capId: string, mode: FlairModeId, patch: FlairParameterOverride) => void;
  resetFlairProperty: (capId: string, mode: FlairModeId, key: FlairPropertyKey) => void;
  resetFlairMode: (capId: string, mode: FlairModeId) => void;
  setMarkerWidth: (id: MarkerVariantId, width: number) => void;
  setCustomSprayRegistry: (registry: CustomSprayBrushRegistry) => void;
  /** Opens the Spray Cap Calibration Bench with the given cap as its Left brush. Spray-only — see `renderMarkerProperties`, which disables the button entirely. */
  openCalibrationBench: (capId: string) => void;
}

const PROPERTY_GROUP_LABELS: ReadonlyArray<{ key: "general" | "shape" | "paint" | "motion"; label: string }> = [
  { key: "general", label: "General" },
  { key: "shape", label: "Shape" },
  { key: "paint", label: "Paint" },
  { key: "motion", label: "Motion" },
];

/** Section 8 of the build brief: Brush Studio's Mode selector is the primary way to change Flair, not the "F" shortcut (kept only as a secondary accelerator — see `main.ts`'s `cycleTrackMarksFlairMode`). */
const FLAIR_MODE_SELECT_OPTIONS: ReadonlyArray<{ id: FlairModeId; label: string }> = [
  { id: "off", label: "Off" },
  { id: "wall", label: "Wall" },
  { id: "blackbook", label: "Blackbook" },
  { id: "wild", label: "Wild" },
];

/** Flair Stabilization build brief, section A2: which simulated-distance direction produces a WIDER spray. */
const FLAIR_DEPTH_RESPONSE_SELECT_OPTIONS: ReadonlyArray<{ id: "far-wide" | "near-wide"; label: string }> = [
  { id: "far-wide", label: "Far → Wide" },
  { id: "near-wide", label: "Near → Wide" },
];

export class BrushStudioController {
  private readonly deps: BrushStudioDeps;
  /** The Studio's OWN browsing selection — independent of live-paint selection while looking at a custom brush (see selectSprayRow). */
  private selectedSprayCapId: string;
  private isOpenState = false;

  constructor(deps: BrushStudioDeps) {
    this.deps = deps;
    this.selectedSprayCapId = deps.getToolSelection().sprayCapId;
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Brush Studio: missing element #${id}`);
    return found as T;
  }

  public isOpen(): boolean {
    return this.isOpenState;
  }

  public open(): void {
    this.isOpenState = true;
    this.selectedSprayCapId = this.deps.getToolSelection().sprayCapId;
    this.el("brush-studio-overlay").classList.add("open");
    this.render();
  }

  public close(): void {
    this.isOpenState = false;
    this.el("brush-studio-overlay").classList.remove("open");
  }

  /** Full rebuild: tool state, brush list, property panel, preview. Call after any selection/tool change. */
  public render(): void {
    if (!this.isOpenState) return;
    const selection = this.deps.getToolSelection();
    const spraySelected = selection.selectedToolId === "spray-can";
    this.el("brush-studio-brushes-spray").toggleAttribute("hidden", !spraySelected);
    this.el("brush-studio-brushes-marker").toggleAttribute("hidden", spraySelected);
    if (spraySelected) this.renderSprayBrushList();
    else this.renderMarkerBrushList();
    this.renderPropertiesPanel();
  }

  private renderSprayBrushList(): void {
    const registry = this.deps.getCustomSprayRegistry();
    const groups = buildSprayBrushList(SPRAY_CAP_PRESETS, registry);
    const container = this.el("brush-studio-brushes-spray");
    container.replaceChildren(...groups.flatMap((group) => [
      this.buildFamilyLabel(group.label),
      ...group.entries.map((entry) => this.buildSprayRow(entry)),
    ]));
  }

  private buildFamilyLabel(label: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "brush-family-label";
    el.textContent = label;
    return el;
  }

  private buildSprayRow(entry: SprayBrushListEntry): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "brush-studio-row";
    button.classList.toggle("selected", entry.id === this.selectedSprayCapId);
    button.setAttribute("aria-pressed", (entry.id === this.selectedSprayCapId).toString());

    const canvas = document.createElement("canvas");
    canvas.className = "brush-studio-row-preview";
    canvas.width = 44;
    canvas.height = 18;
    const ctx = canvas.getContext("2d");
    if (ctx) renderSprayBrushStudioPreview(ctx, 44, 18, entry.preset as SprayCapPreset);

    const text = document.createElement("span");
    text.className = "brush-row-text";
    const name = document.createElement("span");
    name.className = "brush-row-name";
    name.textContent = entry.preset.name;
    const badge = document.createElement("span");
    badge.className = "brush-studio-provenance";
    badge.dataset.provenance = entry.provenance;
    badge.textContent = provenanceLabel(entry.provenance);
    text.append(name, badge);

    button.append(canvas, text);
    button.addEventListener("click", () => this.selectSprayRow(entry));
    return button;
  }

  /**
   * Selecting a built-in brush drives BOTH the live paint selection and the
   * Studio's own browsing state. Selecting a custom brush only drives the
   * Studio's browsing/preview state — custom brushes aren't wired into the
   * live paint pipeline yet (SprayCapId stays a closed union on purpose; see
   * checkpoint doc for why painting-integration is the documented next step
   * rather than a silent fallback to the wrong cap).
   */
  private selectSprayRow(entry: SprayBrushListEntry): void {
    this.selectedSprayCapId = entry.id;
    if (!entry.isCustom) this.deps.selectSprayCap(entry.id as SprayCapId);
    this.render();
  }

  private renderMarkerBrushList(): void {
    const groups = groupMarkerVariantsByFamily(MARKER_VARIANTS);
    const selection = this.deps.getToolSelection();
    const container = this.el("brush-studio-brushes-marker");
    container.replaceChildren(...groups.flatMap((group) => [
      this.buildFamilyLabel(group.label),
      ...group.variants.map((variant) => this.buildMarkerRow(variant, variant.id === selection.markerVariantId)),
    ]));
  }

  private buildMarkerRow(variant: MarkerVariantDefinition, selected: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "brush-studio-row";
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected.toString());

    const canvas = document.createElement("canvas");
    canvas.className = "brush-studio-row-preview";
    canvas.width = 44;
    canvas.height = 18;
    const ctx = canvas.getContext("2d");
    if (ctx) renderMarkerBrushStudioPreview(ctx, 44, 18, variant.id, this.deps.getMarkerWidths()[variant.id]);

    const text = document.createElement("span");
    text.className = "brush-row-text";
    const name = document.createElement("span");
    name.className = "brush-row-name";
    name.textContent = variant.name;
    text.append(name);

    button.append(canvas, text);
    button.addEventListener("click", () => {
      this.deps.selectMarkerVariant(variant.id);
      this.render();
    });
    return button;
  }

  private renderPropertiesPanel(): void {
    const selection = this.deps.getToolSelection();
    if (selection.selectedToolId === "spray-can") this.renderSprayProperties();
    else this.renderMarkerProperties();
  }

  private renderSprayProperties(): void {
    const registry = this.deps.getCustomSprayRegistry();
    const preset = findSprayBrushPreset(SPRAY_CAP_PRESETS, registry, this.selectedSprayCapId)
      ?? getSprayCapPreset(this.deps.getToolSelection().sprayCapId);
    const isCustom = classifySprayCapId(preset.id) === "custom-studio-brush";
    const override = isCustom ? {} : this.deps.getSprayOverrides()[preset.id] ?? {};
    const effective = resolveEffectiveSprayStyle(preset as SprayCapPreset, override);
    const provenance = classifySprayCapId(preset.id);

    this.el("brush-studio-selected-name").textContent = preset.name;
    const badge = this.el("brush-studio-selected-provenance");
    badge.textContent = provenanceLabel(provenance);
    badge.dataset.provenance = provenance;
    this.el("brush-studio-custom-note").toggleAttribute("hidden", !isCustom);

    this.renderPreviewCanvas(preset as SprayCapPreset, effective);

    const groups = getSprayPropertyGroups(preset as SprayCapPreset, effective, override);
    const body = this.el("brush-studio-property-groups");
    // FLAIR (Track Marks only — see `buildFlairSection`) is inserted right
    // after General and before Shape/Paint/Motion, per the build brief's
    // "dedicated FLAIR group." Every other cap's panel is byte-identical to
    // before this pass: `buildFlairSection` returns an empty array for them.
    const [generalLabel, ...restLabels] = PROPERTY_GROUP_LABELS;
    const generalRows = groups[generalLabel.key].length === 0 ? [] : [
      this.buildFamilyLabel(generalLabel.label),
      ...groups[generalLabel.key].map((row) => this.buildSprayPropertyRow(preset.id, row, isCustom)),
    ];
    const flairRows = preset.id === "track-marks" && !isCustom ? this.buildFlairSection(preset.id, preset as SprayCapPreset) : [];
    const restRows = restLabels.flatMap(({ key, label }) => {
      const rows = groups[key];
      if (rows.length === 0) return [];
      return [this.buildFamilyLabel(label), ...rows.map((row) => this.buildSprayPropertyRow(preset.id, row, isCustom))];
    });
    body.replaceChildren(...generalRows, ...flairRows, ...restRows);

    this.el<HTMLButtonElement>("brush-studio-reset-brush").disabled = isCustom || !isSprayBrushModified(override);
    this.el<HTMLButtonElement>("brush-studio-reset-brush").onclick = () => {
      this.deps.resetSprayBrush(preset.id);
      this.render();
    };
    this.el<HTMLButtonElement>("brush-studio-duplicate").disabled = false;
    this.el<HTMLButtonElement>("brush-studio-duplicate").onclick = () => this.duplicateSelectedSprayBrush(preset);
    this.el<HTMLButtonElement>("brush-studio-calibrate").disabled = false;
    this.el<HTMLButtonElement>("brush-studio-calibrate").onclick = () => this.deps.openCalibrationBench(preset.id);
  }

  /**
   * Renders the live preview canvas — the real `SprayBrushEngine` either
   * way. Track Marks with an active (non-off) Flair mode gets the
   * Flair-aware sweep (`renderTrackMarksFlairPreview`, build brief section
   * 5); every other cap, and Track Marks with Flair off, gets the exact
   * same `renderSprayBrushStudioPreview` call as before this pass.
   */
  private renderPreviewCanvas(preset: SprayCapPreset, effective: ReturnType<typeof resolveEffectiveSprayStyle>): void {
    const canvas = this.el<HTMLCanvasElement>("brush-studio-preview");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mode = this.deps.getTrackMarksFlairMode();
    if (preset.id === "track-marks" && mode !== "off") {
      const override = this.deps.getFlairOverrides()[preset.id]?.[mode] ?? {};
      const params = resolveEffectiveFlairParams(mode, override);
      renderTrackMarksFlairPreview(ctx, canvas.width, canvas.height, preset, mode, params);
      return;
    }
    renderSprayBrushStudioPreview(ctx, canvas.width, canvas.height, preset, effective);
  }

  /**
   * The FLAIR group — Track Marks only (build brief section 4/1). Returns an
   * empty array for a custom duplicate of Track Marks too (custom brushes
   * have no live-paint identity of their own yet — see `CustomBrush.ts` —
   * so Flair, which is keyed to the live `sprayCapId`, would have nothing
   * real to attach to). A Mode selector is always shown; the five session
   * controls and the Effective Range readout only render once a non-off
   * mode is active, keeping `off`'s panel quiet (Creative Interface
   * Doctrine: normal state stays visually quiet).
   */
  private buildFlairSection(capId: string, preset: SprayCapPreset): HTMLElement[] {
    const mode = this.deps.getTrackMarksFlairMode();
    const elements: HTMLElement[] = [this.buildFamilyLabel("Flair")];

    const modeRow = document.createElement("div");
    modeRow.className = "brush-studio-property-row";
    const modeLabel = document.createElement("span");
    modeLabel.className = "brush-studio-property-label";
    modeLabel.textContent = "Mode";
    const modeSelect = document.createElement("select");
    modeSelect.className = "flair-mode-select";
    modeSelect.setAttribute("aria-label", "Flair mode");
    for (const option of FLAIR_MODE_SELECT_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = option.id;
      opt.textContent = option.label;
      opt.selected = option.id === mode;
      modeSelect.append(opt);
    }
    modeSelect.addEventListener("change", () => {
      this.deps.setTrackMarksFlairMode(modeSelect.value as FlairModeId);
      this.render();
    });
    modeRow.append(modeLabel, modeSelect);
    elements.push(modeRow);

    if (mode === "off") return elements;

    const override = this.deps.getFlairOverrides()[capId]?.[mode] ?? {};
    const effective = resolveEffectiveFlairParams(mode, override);

    elements.push(this.buildDepthResponseRow(capId, mode, preset, effective, override));

    for (const row of getFlairPropertyRows(effective, override)) {
      elements.push(this.buildFlairPropertyRow(capId, mode, preset, row));
    }

    const range = resolveTrackMarksFlairSizeRange(mode, effective);
    const rangeRow = document.createElement("div");
    rangeRow.className = "brush-studio-property-row readonly";
    const rangeLabel = document.createElement("span");
    rangeLabel.className = "brush-studio-property-label";
    rangeLabel.textContent = "Effective Range";
    const rangeValue = document.createElement("span");
    rangeValue.className = "brush-studio-property-value";
    rangeValue.textContent = `${Math.round(range.min)}–${Math.round(range.max)} wall units`;
    rangeRow.append(rangeLabel, rangeValue);
    elements.push(rangeRow);
    // Build brief section 7: "ensure Brush Studio displays the true
    // effective Track Marks width/range without lying/clamping." The
    // compact `#brush-radius` slider's own max="72" HTML attribute still
    // visually clamps its display for Wild (a shared control every physical
    // cap also uses, correctly, at 72 — see the checkpoint doc for why it
    // wasn't widened); this readout, and Duplicate/Reset above it, are
    // never bound to that slider, so they show the true value regardless.
    if (range.max > 72) {
      const note = document.createElement("div");
      note.className = "fill-mode-note";
      note.textContent = "Exceeds the compact Size slider's own 72-unit display — this is the true value used when painting.";
      elements.push(note);
    }

    const resetFlairButton = document.createElement("button");
    resetFlairButton.className = "brush-studio-property-reset";
    resetFlairButton.textContent = "Reset Flair";
    resetFlairButton.disabled = !isFlairModeModified(override);
    resetFlairButton.addEventListener("click", () => {
      this.deps.resetFlairMode(capId, mode);
      this.render();
    });
    elements.push(resetFlairButton);

    return elements;
  }

  /**
   * Depth Response (Flair Stabilization build brief, section A2/B) — a
   * mapping POLARITY select, not a numeric slider, so it gets its own row
   * rather than joining `getFlairPropertyRows`'s five sliders. Same
   * modified-dot + per-property Reset pattern as every other Flair row.
   */
  private buildDepthResponseRow(
    capId: string,
    mode: FlairModeId,
    preset: SprayCapPreset,
    effective: ReturnType<typeof resolveEffectiveFlairParams>,
    override: FlairParameterOverride,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "brush-studio-property-row";

    const label = document.createElement("span");
    label.className = "brush-studio-property-label";
    label.textContent = "Depth Response";
    wrap.append(label);

    const select = document.createElement("select");
    select.className = "flair-depth-response-select";
    select.setAttribute("aria-label", "Flair depth response");
    for (const option of FLAIR_DEPTH_RESPONSE_SELECT_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = option.id;
      opt.textContent = option.label;
      opt.selected = option.id === effective.depthResponse;
      select.append(opt);
    }
    select.addEventListener("change", () => {
      this.deps.setFlairProperty(capId, mode, { depthResponse: select.value as "far-wide" | "near-wide" });
      const nextOverride = this.deps.getFlairOverrides()[capId]?.[mode] ?? {};
      const params = resolveEffectiveFlairParams(mode, nextOverride);
      const canvas = this.el<HTMLCanvasElement>("brush-studio-preview");
      const ctx = canvas.getContext("2d");
      if (ctx) renderTrackMarksFlairPreview(ctx, canvas.width, canvas.height, preset, mode, params);
      this.render();
    });
    wrap.append(select);

    if (isFlairPropertyModified(override, "depthResponse")) {
      const dot = document.createElement("span");
      dot.className = "brush-studio-modified-dot";
      dot.title = "Modified from mode default";
      wrap.append(dot);
      const resetButton = document.createElement("button");
      resetButton.className = "brush-studio-property-reset";
      resetButton.textContent = "Reset";
      resetButton.addEventListener("click", () => {
        this.deps.resetFlairProperty(capId, mode, "depthResponse");
        this.render();
      });
      wrap.append(resetButton);
    }

    return wrap;
  }

  private buildFlairPropertyRow(capId: string, mode: FlairModeId, preset: SprayCapPreset, row: FlairPropertyRow): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "brush-studio-property-row";

    const label = document.createElement("span");
    label.className = "brush-studio-property-label";
    label.textContent = row.label;
    wrap.append(label);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(row.min);
    input.max = String(row.max);
    input.step = String(row.step);
    input.value = String(row.value);
    const readout = document.createElement("span");
    readout.className = "brush-studio-property-value";
    readout.textContent = row.value.toFixed(2);
    input.addEventListener("input", () => {
      const numeric = Number.parseFloat(input.value);
      readout.textContent = numeric.toFixed(2);
      this.deps.setFlairProperty(capId, mode, { [row.key]: numeric });
      const override = this.deps.getFlairOverrides()[capId]?.[mode] ?? {};
      const params = resolveEffectiveFlairParams(mode, override);
      const canvas = this.el<HTMLCanvasElement>("brush-studio-preview");
      const ctx = canvas.getContext("2d");
      if (ctx) renderTrackMarksFlairPreview(ctx, canvas.width, canvas.height, preset, mode, params);
    });
    input.addEventListener("change", () => this.render());
    wrap.append(input, readout);

    if (row.modified) {
      const dot = document.createElement("span");
      dot.className = "brush-studio-modified-dot";
      dot.title = "Modified from mode default";
      wrap.append(dot);
      const resetButton = document.createElement("button");
      resetButton.className = "brush-studio-property-reset";
      resetButton.textContent = "Reset";
      resetButton.addEventListener("click", () => {
        this.deps.resetFlairProperty(capId, mode, row.key);
        this.render();
      });
      wrap.append(resetButton);
    }

    return wrap;
  }

  private buildSprayPropertyRow(capId: string, row: ReturnType<typeof getSprayPropertyGroups>["general"][number], isCustom: boolean): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = `brush-studio-property-row${row.kind === "readonly" ? " readonly" : ""}`;

    const label = document.createElement("span");
    label.className = "brush-studio-property-label";
    label.textContent = row.label;
    wrap.append(label);

    if (row.kind === "readonly") {
      const value = document.createElement("span");
      value.className = "brush-studio-property-value";
      value.textContent = `${row.value}${row.unit ? ` ${row.unit}` : ""}`;
      wrap.append(value);
      return wrap;
    }

    if (row.kind === "editable-boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = row.value === true;
      input.disabled = isCustom;
      input.addEventListener("change", () => {
        this.deps.setSprayProperty(capId, { fillMode: input.checked });
        this.render();
      });
      wrap.append(input);
    } else {
      const input = document.createElement("input");
      input.type = "range";
      input.disabled = isCustom;
      if (row.key === "size") { input.min = "4"; input.max = "72"; input.step = "1"; }
      if (row.key === "coverage") { input.min = "20"; input.max = "100"; input.step = "5"; }
      if (row.key === "sprayAngle") { input.min = "0"; input.max = String(PLUME_MAX_ANGLE_DEGREES); input.step = "1"; }
      input.value = String(row.value);
      const readout = document.createElement("span");
      readout.className = "brush-studio-property-value";
      readout.textContent = `${row.value}${row.unit ? row.unit : ""}`;
      input.addEventListener("input", () => {
        const numeric = Number.parseFloat(input.value);
        readout.textContent = `${numeric}${row.unit ? row.unit : ""}`;
        const patch: SprayPropertyOverride = row.key === "size"
          ? { size: numeric }
          : row.key === "coverage"
          ? { coverage: numeric / 100 }
          : { sprayAngle: numeric };
        this.deps.setSprayProperty(capId, patch);
        const canvas = this.el<HTMLCanvasElement>("brush-studio-preview");
        const ctx = canvas.getContext("2d");
        const preset = getSprayCapPreset(capId);
        if (ctx) {
          renderSprayBrushStudioPreview(ctx, canvas.width, canvas.height, preset, resolveEffectiveSprayStyle(
            preset,
            this.deps.getSprayOverrides()[capId] ?? {},
          ));
        }
      });
      input.addEventListener("change", () => this.render());
      wrap.append(input, readout);
    }

    if (row.modified) {
      const dot = document.createElement("span");
      dot.className = "brush-studio-modified-dot";
      dot.title = "Modified from brush default";
      wrap.append(dot);
      const resetButton = document.createElement("button");
      resetButton.className = "brush-studio-property-reset";
      resetButton.textContent = "Reset";
      resetButton.addEventListener("click", () => {
        this.deps.resetSprayProperty(capId, row.key as SprayPropertyKey);
        this.render();
      });
      wrap.append(resetButton);
    }

    return wrap;
  }

  private duplicateSelectedSprayBrush(source: SprayCapPreset | CustomSprayBrush["preset"]): void {
    const name = window.prompt("Name for the new custom brush", `${source.name} Copy`);
    if (!name) return;
    const custom = duplicateSprayBrush(source as SprayCapPreset, name, createCustomSprayBrushId());
    this.deps.setCustomSprayRegistry([...this.deps.getCustomSprayRegistry(), custom]);
    this.selectedSprayCapId = custom.preset.id;
    this.render();
  }

  private renderMarkerProperties(): void {
    const selection = this.deps.getToolSelection();
    const variant = getMarkerVariant(selection.markerVariantId);
    const width = this.deps.getMarkerWidths()[variant.id];

    this.el("brush-studio-selected-name").textContent = variant.name;
    const badge = this.el("brush-studio-selected-provenance");
    badge.textContent = "Physical reference";
    badge.dataset.provenance = "physical-reference";
    this.el("brush-studio-custom-note").toggleAttribute("hidden", true);

    const canvas = this.el<HTMLCanvasElement>("brush-studio-preview");
    const ctx = canvas.getContext("2d");
    if (ctx) renderMarkerBrushStudioPreview(ctx, canvas.width, canvas.height, variant.id, width);

    const body = this.el("brush-studio-property-groups");
    const rows: HTMLElement[] = [this.buildFamilyLabel("General")];

    const sizeRow = document.createElement("div");
    sizeRow.className = "brush-studio-property-row";
    const sizeLabel = document.createElement("span");
    sizeLabel.textContent = "Size";
    const sizeInput = document.createElement("input");
    sizeInput.type = "range";
    sizeInput.min = "4";
    sizeInput.max = "72";
    sizeInput.value = String(width);
    const sizeReadout = document.createElement("span");
    sizeReadout.className = "brush-studio-property-value";
    sizeReadout.textContent = `${width} wall units`;
    sizeInput.addEventListener("input", () => {
      const numeric = Number.parseInt(sizeInput.value, 10);
      sizeReadout.textContent = `${numeric} wall units`;
      this.deps.setMarkerWidth(variant.id, numeric);
      const ctx2 = canvas.getContext("2d");
      if (ctx2) renderMarkerBrushStudioPreview(ctx2, canvas.width, canvas.height, variant.id, numeric);
    });
    sizeRow.append(sizeLabel, sizeInput, sizeReadout);
    rows.push(sizeRow);

    rows.push(this.buildFamilyLabel("Tip"));
    const materialRow = document.createElement("div");
    materialRow.className = "brush-studio-property-row readonly";
    materialRow.innerHTML = `<span>Material</span><span class="brush-studio-property-value">${variant.material}</span>`;
    rows.push(materialRow);
    const dripRow = document.createElement("div");
    dripRow.className = "brush-studio-property-row readonly";
    dripRow.innerHTML = `<span>Drip tendency</span><span class="brush-studio-property-value">${variant.dripTendency}</span>`;
    rows.push(dripRow);

    body.replaceChildren(...rows);
    this.el<HTMLButtonElement>("brush-studio-reset-brush").disabled = true;
    this.el<HTMLButtonElement>("brush-studio-duplicate").disabled = true;
    // Calibration Bench V1 is Spray-focused (see checkpoint doc); disabled rather than hidden so the action row's layout stays stable when switching tools.
    this.el<HTMLButtonElement>("brush-studio-calibrate").disabled = true;
  }
}
