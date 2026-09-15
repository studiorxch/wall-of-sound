import { buildSprayBrushList, findSprayBrushPreset, type SprayBrushListGroup } from "./BrushStudio";
import {
  buildCalibrationDifferenceSummary,
  buildCalibrationPropertyReadout,
  buildCalibrationSnapshotText,
  CALIBRATION_MATRIX,
  CALIBRATION_NOTE_FIELDS,
  CALIBRATION_SAMPLE_HEIGHT,
  CALIBRATION_SAMPLE_WIDTH,
  EMPTY_CALIBRATION_REFERENCE_NOTES,
  mergeCalibrationPropertyRows,
  renderCalibrationSample,
  resolveCalibrationEffectiveRadius,
  resolveMatchedWidthRadius,
  type CalibrationPreset,
  type CalibrationReferenceNotes,
  type CalibrationWidthMode,
} from "./CalibrationBench";
import { type CustomSprayBrushRegistry } from "./CustomBrush";
import { calibrationClassificationLabel, getSprayCapClassification } from "./SprayCapCalibrationStatus";
import { SPRAY_CAP_PRESETS } from "./SprayCapPresets";

/**
 * DOM controller for the Spray Cap Calibration Bench. Deliberately thin, same
 * split as `BrushStudioController`: every decision that matters (matrix
 * definitions, width resolution, property/diff computation) lives in
 * `CalibrationBench.ts` and is unit-tested there; this class only wires that
 * pure data to elements and events, exercised by live browser verification.
 */

export interface CalibrationBenchDeps {
  getCustomSprayRegistry: () => CustomSprayBrushRegistry;
}

const DEFAULT_RIGHT_CAP_ID = "new-york-fat";
const FALLBACK_LEFT_CAP_ID = "astro-fat";

export class CalibrationBenchController {
  private readonly deps: CalibrationBenchDeps;
  private isOpenState = false;
  private boundOnce = false;
  private leftCapId: string = FALLBACK_LEFT_CAP_ID;
  private rightCapId: string = DEFAULT_RIGHT_CAP_ID;
  private widthMode: CalibrationWidthMode = "native";
  private notes: CalibrationReferenceNotes = EMPTY_CALIBRATION_REFERENCE_NOTES;

  constructor(deps: CalibrationBenchDeps) {
    this.deps = deps;
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Calibration Bench: missing element #${id}`);
    return found as T;
  }

  public isOpen(): boolean {
    return this.isOpenState;
  }

  /** Opens the Bench. `capId` (the brush open in Brush Studio) becomes Left; Right defaults to New York Fat, or Astro Fat if Left already IS New York Fat. */
  public open(capId?: string): void {
    if (!this.boundOnce) {
      this.bindStatic();
      this.boundOnce = true;
    }
    if (capId) {
      this.leftCapId = capId;
      this.rightCapId = capId === DEFAULT_RIGHT_CAP_ID ? FALLBACK_LEFT_CAP_ID : DEFAULT_RIGHT_CAP_ID;
    }
    this.widthMode = "native";
    this.notes = EMPTY_CALIBRATION_REFERENCE_NOTES;
    this.isOpenState = true;
    this.el("calibration-bench-overlay").classList.add("open");
    this.render();
  }

  public close(): void {
    this.isOpenState = false;
    this.el("calibration-bench-overlay").classList.remove("open");
  }

  private findPreset(id: string): CalibrationPreset {
    return findSprayBrushPreset(SPRAY_CAP_PRESETS, this.deps.getCustomSprayRegistry(), id) ?? SPRAY_CAP_PRESETS[0];
  }

  private bindStatic(): void {
    this.el("calibration-bench-close").addEventListener("click", () => this.close());
    this.el("calibration-bench-overlay").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.close();
    });
    this.el<HTMLSelectElement>("calibration-left-select").addEventListener("change", (event) => {
      this.leftCapId = (event.target as HTMLSelectElement).value;
      this.render();
    });
    this.el<HTMLSelectElement>("calibration-right-select").addEventListener("change", (event) => {
      this.rightCapId = (event.target as HTMLSelectElement).value;
      this.render();
    });
    this.el<HTMLButtonElement>("calibration-width-native").addEventListener("click", () => {
      this.widthMode = "native";
      this.render();
    });
    this.el<HTMLButtonElement>("calibration-width-matched").addEventListener("click", () => {
      this.widthMode = "matched";
      this.render();
    });
    this.el<HTMLButtonElement>("calibration-copy-snapshot").addEventListener("click", () => this.copySnapshot());
    this.buildNoteFields();
  }

  private buildNoteFields(): void {
    const container = this.el("calibration-notes");
    container.replaceChildren(...CALIBRATION_NOTE_FIELDS.map(({ key, label }) => {
      const wrap = document.createElement("label");
      wrap.className = "calibration-note-field";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const input = document.createElement("textarea");
      input.rows = key === "calibrationConclusions" || key === "oversprayNotes" ? 2 : 1;
      input.value = this.notes[key];
      input.addEventListener("input", () => {
        this.notes = { ...this.notes, [key]: input.value };
      });
      wrap.append(labelEl, input);
      return wrap;
    }));
  }

  public render(): void {
    if (!this.isOpenState) return;

    const leftPreset = this.findPreset(this.leftCapId);
    const rightPreset = this.findPreset(this.rightCapId);

    this.renderSelectOptions(this.el<HTMLSelectElement>("calibration-left-select"), leftPreset.id);
    this.renderSelectOptions(this.el<HTMLSelectElement>("calibration-right-select"), rightPreset.id);

    const matchedWidth = resolveMatchedWidthRadius(leftPreset, rightPreset);
    const leftRadius = resolveCalibrationEffectiveRadius(leftPreset, this.widthMode, matchedWidth);
    const rightRadius = resolveCalibrationEffectiveRadius(rightPreset, this.widthMode, matchedWidth);

    this.el<HTMLButtonElement>("calibration-width-native").setAttribute("aria-pressed", (this.widthMode === "native").toString());
    this.el<HTMLButtonElement>("calibration-width-matched").setAttribute("aria-pressed", (this.widthMode === "matched").toString());

    this.renderStatusBadge("calibration-left-status", leftPreset.id);
    this.renderStatusBadge("calibration-right-status", rightPreset.id);

    this.renderMatrix(leftPreset, rightPreset, leftRadius, rightRadius);
    this.renderProperties(leftPreset, rightPreset, leftRadius, rightRadius);
    this.renderDiff(leftPreset, rightPreset, leftRadius, rightRadius);

    this.el("calibration-snapshot-status").textContent = "";
  }

  private renderSelectOptions(select: HTMLSelectElement, selectedId: string): void {
    const groups: SprayBrushListGroup[] = buildSprayBrushList(SPRAY_CAP_PRESETS, this.deps.getCustomSprayRegistry());
    select.replaceChildren(...groups.map((group) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      optgroup.append(...group.entries.map((entry) => {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.preset.name;
        return option;
      }));
      return optgroup;
    }));
    select.value = selectedId;
  }

  private renderStatusBadge(elementId: string, capId: string): void {
    const status = getSprayCapClassification(capId);
    const badge = this.el(elementId);
    badge.textContent = calibrationClassificationLabel(status);
    badge.dataset.status = status;
  }

  private renderMatrix(leftPreset: CalibrationPreset, rightPreset: CalibrationPreset, leftRadius: number, rightRadius: number): void {
    const container = this.el("calibration-matrix");
    const header = document.createElement("div");
    header.className = "calibration-matrix-row calibration-matrix-header";
    header.innerHTML = `<span></span><span>${leftPreset.name}</span><span>${rightPreset.name}</span>`;

    const rows = CALIBRATION_MATRIX.map((sample) => {
      const row = document.createElement("div");
      row.className = "calibration-matrix-row";
      const label = document.createElement("span");
      label.className = "calibration-matrix-label";
      label.textContent = sample.label;

      const leftCanvas = this.buildSampleCanvas();
      const rightCanvas = this.buildSampleCanvas();
      const leftCtx = leftCanvas.getContext("2d");
      const rightCtx = rightCanvas.getContext("2d");
      if (leftCtx) renderCalibrationSample(leftCtx, sample.id, leftPreset, leftRadius);
      if (rightCtx) renderCalibrationSample(rightCtx, sample.id, rightPreset, rightRadius);

      row.append(label, leftCanvas, rightCanvas);
      return row;
    });

    container.replaceChildren(header, ...rows);
  }

  private buildSampleCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.className = "calibration-sample-canvas";
    canvas.width = CALIBRATION_SAMPLE_WIDTH;
    canvas.height = CALIBRATION_SAMPLE_HEIGHT;
    return canvas;
  }

  private renderProperties(leftPreset: CalibrationPreset, rightPreset: CalibrationPreset, leftRadius: number, rightRadius: number): void {
    const merged = mergeCalibrationPropertyRows(
      buildCalibrationPropertyReadout(leftPreset, leftRadius),
      buildCalibrationPropertyReadout(rightPreset, rightRadius),
    );
    const container = this.el("calibration-property-table");
    const header = document.createElement("div");
    header.className = "calibration-property-row calibration-property-header";
    header.innerHTML = `<span>Property</span><span>${leftPreset.name}</span><span>${rightPreset.name}</span>`;
    const rows = merged.map((row) => {
      const el = document.createElement("div");
      el.className = "calibration-property-row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const left = document.createElement("span");
      left.textContent = row.leftValue === undefined ? "—" : `${row.leftValue}${row.unit ?? ""}`;
      const right = document.createElement("span");
      right.textContent = row.rightValue === undefined ? "—" : `${row.rightValue}${row.unit ?? ""}`;
      el.append(label, left, right);
      return el;
    });
    container.replaceChildren(header, ...rows);
  }

  private renderDiff(leftPreset: CalibrationPreset, rightPreset: CalibrationPreset, leftRadius: number, rightRadius: number): void {
    const rows = buildCalibrationDifferenceSummary(leftPreset, rightPreset, leftRadius, rightRadius);
    const container = this.el("calibration-diff-table");
    container.replaceChildren(...rows.map((row) => {
      const el = document.createElement("div");
      el.className = "calibration-diff-row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const value = document.createElement("span");
      if (row.kind === "categorical") {
        value.textContent = `${row.leftValue} vs ${row.rightValue}`;
      } else {
        const delta = row.percentDelta;
        value.textContent = delta === null ? "n/a" : `${delta > 0 ? "+" : ""}${delta}%`;
        value.classList.toggle("positive", (delta ?? 0) > 0);
        value.classList.toggle("negative", (delta ?? 0) < 0);
      }
      el.append(label, value);
      return el;
    }));
  }

  private copySnapshot(): void {
    const leftPreset = this.findPreset(this.leftCapId);
    const rightPreset = this.findPreset(this.rightCapId);
    const matchedWidth = resolveMatchedWidthRadius(leftPreset, rightPreset);
    const leftRadius = resolveCalibrationEffectiveRadius(leftPreset, this.widthMode, matchedWidth);
    const rightRadius = resolveCalibrationEffectiveRadius(rightPreset, this.widthMode, matchedWidth);
    const text = buildCalibrationSnapshotText(
      leftPreset,
      rightPreset,
      this.widthMode,
      leftRadius,
      rightRadius,
      calibrationClassificationLabel(getSprayCapClassification(leftPreset.id)),
      calibrationClassificationLabel(getSprayCapClassification(rightPreset.id)),
      this.notes,
    );
    const status = this.el("calibration-snapshot-status");
    navigator.clipboard.writeText(text).then(
      () => { status.textContent = "Copied."; },
      () => { status.textContent = "Copy failed — select and copy manually."; },
    );
  }
}
