import { AdaptiveCurveReconstructor, type CurveInputSample } from "./AdaptiveCurveReconstructor";
import { getSprayBackground, type SprayBackground } from "./Backgrounds";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import { CommandRegistry } from "./CommandRegistry";
import { DripAccumulator } from "./DripLogic";
import { HandTracker, type HandTrackingDiagnostics, type HandTrackingResult } from "./HandTracker";
import {
  shouldBridgeMissingHandSample,
  shouldResumeHandDrawingAfterPan,
} from "./HandTrackingReliability";
import { PerformanceRecorder } from "./PerformanceRecorder";
import { INITIAL_PLAYER_STATE, reducePlayerState, type PlayerAction, type PlayerState } from "./PlayerState";
import { INITIAL_SETTINGS_STATE, reduceSettingsState, type SettingsAction, type SettingsState } from "./SettingsState";
import { createStrokeRandom, SprayBrushEngine } from "./SprayBrushEngine";
import { SprayCanAudio } from "./SprayCanAudio";
import { getSprayCapPreset, type SprayCapPreset } from "./SprayCapPresets";
import { StrokeHistory, type RecordedStroke } from "./StrokeHistory";
import { StrokeSmoother } from "./StrokeSmoother";
import { type InputSourceMode, type StrokePoint } from "./types";
import { resolveWallComposition, type WallEnvironmentMode } from "./WallComposition";
import {
  applyPan,
  applyZoomAroundPoint,
  beginPanInteraction,
  cancelPanInteraction,
  effectiveTool,
  endPanInteraction,
  resetPanInteraction,
  resetWallView,
  resolveWheelPan,
  screenToWall,
  setSpacePanHeld,
  shouldPanPointer,
  toggleQuickZoom,
  type PanInteractionState,
  type PanCancellationReason,
  type WallPoint,
  type WallViewState,
} from "./WallView";

const MIN_DEPOSIT_INTERVAL_MS = 16;
class SpatialSpraypaintApp {
  private readonly compositeCanvas: HTMLCanvasElement;
  private readonly compositeCtx: CanvasRenderingContext2D;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly paintCtx: CanvasRenderingContext2D;

  private readonly strokeManager = new CanonicalStrokeManager();
  private readonly strokeSmoother = new StrokeSmoother();
  private readonly curveReconstructor = new AdaptiveCurveReconstructor();
  private readonly brushEngine = new SprayBrushEngine();
  private readonly dripAccumulator = new DripAccumulator();
  private readonly strokeHistory = new StrokeHistory(40);
  private readonly handTracker = new HandTracker();
  private readonly recorder = new PerformanceRecorder();
  private readonly sprayCanAudio = new SprayCanAudio();
  private readonly commandRegistry: CommandRegistry;

  private inputMode: InputSourceMode = "mouse";
  private wallEnvironmentMode: WallEnvironmentMode = "wall";
  private wallEnvironmentColor = "#171822";
  private wallEnvironmentImage: HTMLImageElement | null = null;
  private wallEnvironmentImageUrl: string | null = null;
  private selectedColor = "#e92f3d";
  private selectedCap: SprayCapPreset = getSprayCapPreset("new-york-fat");
  private selectedBackground: SprayBackground = getSprayBackground("black");
  private settings: SettingsState = { ...INITIAL_SETTINGS_STATE };
  private player: PlayerState = { ...INITIAL_PLAYER_STATE };
  private baseRadius = this.selectedCap.baseRadius;
  private isSpraying = false;
  private webcamActive = false;
  private lastHandResult: HandTrackingResult | null = null;
  private activeWallPoint: WallPoint | null = null;
  private wallView: WallViewState = resetWallView();
  private quickZoomRestore: WallViewState | null = null;
  private lastScreenPoint: WallPoint | null = null;
  private panInteraction: PanInteractionState = resetPanInteraction();
  private panPointerId: number | null = null;
  private lastPanScreen: WallPoint | null = null;
  private lastDepositTimestamp = 0;
  private mappedPointLogged = false;
  private sprayDeliveryLogged = false;
  private hasPinchSprayed = false;
  private lastPinchingAt = 0;
  private lastDeliveredWallPoint: WallPoint | null = null;
  private lastDeliveredAt = 0;
  private activeStrokeRandom: (() => number) | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioObjectUrl: string | null = null;

  constructor() {
    this.compositeCanvas = this.requireElement<HTMLCanvasElement>("composite-canvas");
    this.compositeCtx = this.compositeCanvas.getContext("2d")!;
    this.paintCanvas = document.createElement("canvas");
    this.paintCtx = this.paintCanvas.getContext("2d")!;
    this.commandRegistry = new CommandRegistry({
      undo: () => this.undoLastStroke(),
      clear: () => this.clearAllStrokes(),
      pan: () => this.setPanModifier(true),
      "quick-zoom": () => this.quickZoom(),
      "zoom-in": () => this.zoomBy(1.25),
      "zoom-out": () => this.zoomBy(0.8),
      "reset-view": () => this.resetView(),
      settings: () => this.setSettings({ type: "toggle" }),
      record: () => this.toggleRecording(),
      "close-settings": () => {
        this.setSettings({ type: "close" });
        this.cancelPan("escape");
      },
    }, {
      pan: () => this.setPanModifier(false),
    });

    this.initResize();
    this.bindControls();
    this.bindPhysicalInput();
    this.bindCommandSystem();
    this.renderShortcutReference();
    this.updateSettingsUi();
    this.updatePlayerUi();
    this.updateUndoControl();
    this.updateNavigationUi();
    this.updateTrackingOverlay(null);
    this.updateTrackingVisibility();
    this.startRenderLoop();
  }

  private requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Spatial Spraypaint UI is missing #${id}.`);
    return element as T;
  }

  private initResize(): void {
    const handleResize = () => {
      this.finishActiveStroke();
      this.compositeCanvas.width = window.innerWidth;
      this.compositeCanvas.height = window.innerHeight;
      this.paintCanvas.width = window.innerWidth;
      this.paintCanvas.height = window.innerHeight;
      this.brushEngine.resize(window.innerWidth, window.innerHeight);
      this.replayStrokes(this.strokeHistory.snapshot());
    };
    window.addEventListener("resize", handleResize);
    handleResize();
  }

  private bindControls(): void {
    this.requireElement("color-control").addEventListener("click", () => {
      this.toggleToolChooser("color-chooser");
    });
    this.requireElement("cap-control").addEventListener("click", () => {
      this.toggleToolChooser("cap-chooser");
    });
    document.querySelectorAll<HTMLButtonElement>(".cap-choice").forEach((choice) => {
      choice.addEventListener("click", () => {
        this.finishActiveStroke();
        this.selectedCap = getSprayCapPreset(choice.dataset.cap ?? "new-york-fat");
        if (this.settings.radiusOverride === null) this.baseRadius = this.selectedCap.baseRadius;
        document.querySelectorAll<HTMLButtonElement>(".cap-choice").forEach((candidate) => {
          candidate.classList.toggle("selected", candidate.dataset.cap === this.selectedCap.id);
        });
        const capControl = this.requireElement("cap-control");
        capControl.setAttribute("title", `Cap: ${this.selectedCap.name}`);
        this.updateRadiusUi();
        this.closeToolChoosers();
      });
    });

    document.querySelectorAll<HTMLButtonElement>(".swatch").forEach((swatch) => {
      swatch.addEventListener("click", () => {
        this.finishActiveStroke();
        this.selectedColor = swatch.dataset.color ?? this.selectedColor;
        document.querySelectorAll<HTMLButtonElement>(".swatch").forEach((candidate) => {
          candidate.classList.toggle("selected", candidate.dataset.color === this.selectedColor);
        });
        const colorControl = this.requireElement<HTMLElement>("color-control");
        colorControl.style.setProperty("--current-color", this.selectedColor);
        colorControl.setAttribute("title", `Color: ${swatch.getAttribute("aria-label") ?? "selected"}`);
        this.closeToolChoosers();
      });
    });

    this.requireElement("undo-stroke").addEventListener("click", () => this.undoLastStroke());
    this.requireElement("clear-strokes").addEventListener("click", () => this.clearAllStrokes());
    this.requireElement("reset-view").addEventListener("click", () => this.resetView());
    this.requireElement("settings-toggle").addEventListener("click", () => this.setSettings({ type: "toggle" }));
    this.requireElement("settings-close").addEventListener("click", () => this.setSettings({ type: "close" }));
    this.requireElement<HTMLSelectElement>("smoothing-level").addEventListener("change", (event) => {
      this.setSettings({ type: "smoothing", value: (event.target as HTMLSelectElement).value as SettingsState["smoothing"] });
      this.finishActiveStroke();
    });
    this.requireElement<HTMLInputElement>("drips-enabled").addEventListener("change", (event) => {
      this.setSettings({ type: "drips", value: (event.target as HTMLInputElement).checked });
      this.dripAccumulator.reset();
    });
    this.requireElement<HTMLInputElement>("brush-radius").addEventListener("input", (event) => {
      const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
      this.baseRadius = value;
      this.setSettings({ type: "radius", value });
      this.updateRadiusUi();
    });
    this.requireElement("radius-reset").addEventListener("click", () => {
      this.finishActiveStroke();
      this.baseRadius = this.selectedCap.baseRadius;
      this.setSettings({ type: "radius", value: null });
      this.updateRadiusUi();
    });
    this.requireElement<HTMLSelectElement>("background-preset").addEventListener("change", (event) => {
      this.selectedBackground = getSprayBackground((event.target as HTMLSelectElement).value);
    });
    this.requireElement<HTMLSelectElement>("wall-environment").addEventListener("change", (event) => {
      this.wallEnvironmentMode = (event.target as HTMLSelectElement).value as WallEnvironmentMode;
      this.updateWallEnvironmentUi();
      if (this.wallEnvironmentMode === "image" && !this.wallEnvironmentImage) {
        this.requireElement<HTMLInputElement>("wall-image-file").click();
      }
    });
    this.requireElement<HTMLInputElement>("wall-solid-color").addEventListener("input", (event) => {
      this.wallEnvironmentColor = (event.target as HTMLInputElement).value;
    });
    this.requireElement<HTMLInputElement>("wall-image-file").addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void this.loadWallEnvironmentImage(file);
    });
    this.requireElement<HTMLInputElement>("tracking-debug-visible").addEventListener("change", (event) => {
      this.setSettings({ type: "tracking-debug", value: (event.target as HTMLInputElement).checked });
      this.updateTrackingVisibility();
    });

    this.requireElement("physical-input").addEventListener("click", () => void this.selectInputMode("mouse"));
    this.requireElement("hand-input").addEventListener("click", () => void this.selectInputMode("spatial"));

    this.requireElement<HTMLInputElement>("audio-file").addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) this.loadAudioFile(file);
    });
    this.requireElement("player-play-pause").addEventListener("click", () => void this.togglePlayback());
    this.requireElement<HTMLInputElement>("player-progress").addEventListener("input", (event) => {
      if (!this.audioElement || !this.player.duration) return;
      const ratio = Number.parseInt((event.target as HTMLInputElement).value, 10) / 1000;
      this.audioElement.currentTime = ratio * this.player.duration;
      this.setPlayer({ type: "seek", currentTime: this.audioElement.currentTime });
    });
    this.requireElement("player-loop").addEventListener("click", () => this.toggleLoop());

    this.requireElement("toggle-record").addEventListener("click", () => void this.toggleRecording());
    this.requireElement("shake-can").addEventListener("click", () => void this.playCanRattle());
    this.requireElement("clear-canvas").addEventListener("click", () => this.clearAllStrokes());
  }

  private bindPhysicalInput(): void {
    this.compositeCanvas.addEventListener("pointerdown", (event) => {
      const screenPoint = this.pointerScreenPoint(event);
      this.lastScreenPoint = screenPoint;
      if (shouldPanPointer(this.panInteraction.spaceHeld, event.button)) {
        event.preventDefault();
        this.beginPan(event.pointerId, screenPoint, event.button);
        return;
      }
      if (this.inputMode !== "mouse" || event.button !== 0) return;
      this.closeToolChoosers();
      if (this.settings.isOpen) this.setSettings({ type: "close" });
      this.strokeManager.reset();
      this.strokeSmoother.reset();
      this.curveReconstructor.reset();
      this.dripAccumulator.reset();
      this.activeWallPoint = screenToWall(this.wallView, screenPoint);
      this.lastDepositTimestamp = 0;
      this.setSprayActive(true);
      this.depositActivePoint(performance.now());
    });
    window.addEventListener("pointermove", (event) => {
      const screenPoint = this.pointerScreenPoint(event);
      this.lastScreenPoint = screenPoint;
      if (effectiveTool("draw", this.panInteraction) === "pan" && event.pointerId === this.panPointerId && this.lastPanScreen) {
        event.preventDefault();
        this.wallView = applyPan(
          this.wallView,
          screenPoint.x - this.lastPanScreen.x,
          screenPoint.y - this.lastPanScreen.y,
        );
        this.lastPanScreen = screenPoint;
        this.replayStrokes(this.strokeHistory.snapshot());
        this.updateNavigationUi();
        return;
      }
      if (this.inputMode === "mouse" && this.isSpraying) {
        this.activeWallPoint = screenToWall(this.wallView, screenPoint);
      }
    });
    window.addEventListener("pointerup", (event) => {
      if (effectiveTool("draw", this.panInteraction) === "pan" && event.pointerId === this.panPointerId) {
        this.endPan();
        return;
      }
      if (this.inputMode !== "mouse" || !this.isSpraying) return;
      this.depositActivePoint(performance.now(), true);
      this.setSprayActive(false);
      this.resetStrokeInput();
    });
    window.addEventListener("pointercancel", (event) => {
      if (event.pointerId === this.panPointerId) this.cancelPan("pointercancel");
      if (this.inputMode === "mouse" && this.isSpraying) {
        this.setSprayActive(false);
        this.resetStrokeInput();
      }
    });
    this.compositeCanvas.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId === this.panPointerId) this.cancelPan("lostpointercapture");
    });
  }

  private pointerScreenPoint(event: PointerEvent): WallPoint {
    const bounds = this.compositeCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (this.compositeCanvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (this.compositeCanvas.height / bounds.height),
    };
  }

  private beginPan(pointerId: number, screenPoint: WallPoint, button: number): void {
    this.finishActiveStroke();
    this.closeToolChoosers();
    if (this.settings.isOpen) this.setSettings({ type: "close" });
    this.panInteraction = beginPanInteraction(this.panInteraction, button);
    this.panPointerId = pointerId;
    this.lastPanScreen = screenPoint;
    this.compositeCanvas.setPointerCapture(pointerId);
    document.body.classList.add("panning");
  }

  private endPan(resumeHand = true): void {
    const pointerId = this.panPointerId;
    this.panInteraction = endPanInteraction(this.panInteraction);
    this.panPointerId = null;
    this.lastPanScreen = null;
    if (pointerId !== null && this.compositeCanvas.hasPointerCapture(pointerId)) {
      this.compositeCanvas.releasePointerCapture(pointerId);
    }
    document.body.classList.remove("panning");
    document.body.classList.toggle("pan-ready", this.panInteraction.spaceHeld);
    if (resumeHand) this.resumeHandAfterPan();
  }

  private cancelPan(reason: PanCancellationReason, resumeHand = true): void {
    const pointerId = this.panPointerId;
    const wasNavigationActive = this.panInteraction.spaceHeld
      || this.panInteraction.source !== null
      || pointerId !== null;
    this.panInteraction = cancelPanInteraction(this.panInteraction, reason);
    this.panPointerId = null;
    this.lastPanScreen = null;
    if (pointerId !== null && this.compositeCanvas.hasPointerCapture(pointerId)) {
      this.compositeCanvas.releasePointerCapture(pointerId);
    }
    document.body.classList.remove("panning", "pan-ready");
    if (resumeHand && wasNavigationActive) this.resumeHandAfterPan();
  }

  private setPanModifier(active: boolean): void {
    if (active && !this.panInteraction.spaceHeld) this.finishActiveStroke();
    if (!active) {
      this.cancelPan("space-keyup");
      return;
    }
    this.panInteraction = setSpacePanHeld(this.panInteraction, active);
    document.body.classList.toggle("pan-ready", active && this.panInteraction.source === null);
  }

  private bindCommandSystem(): void {
    window.addEventListener("keydown", (event) => this.commandRegistry.handleKeyboardEvent(event));
    window.addEventListener("keyup", (event) => this.commandRegistry.handleKeyUpEvent(event));
    window.addEventListener("blur", () => this.cancelPan("window-blur", false));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.cancelPan("visibilitychange", false);
    });
    this.compositeCanvas.addEventListener("wheel", (event) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      this.finishActiveStroke();
      this.cancelPan("wheel", false);
      const delta = resolveWheelPan(event, this.compositeCanvas.height);
      this.wallView = applyPan(this.wallView, delta.x, delta.y);
      this.replayStrokes(this.strokeHistory.snapshot());
      this.updateNavigationUi();
      this.resumeHandAfterPan();
    }, { passive: false });
  }

  private resumeHandAfterPan(): void {
    const sampleAgeMs = this.lastHandResult ? performance.now() - this.lastHandResult.timestamp : Number.POSITIVE_INFINITY;
    if (!shouldResumeHandDrawingAfterPan({
      isHandMode: this.inputMode === "spatial",
      isPinching: Boolean(this.lastHandResult?.isPinching),
      sampleAgeMs,
      panGestureActive: this.panInteraction.spaceHeld || this.panInteraction.source !== null,
    }) || !this.lastHandResult) return;
    const screenPoint = {
      x: this.lastHandResult.x * this.compositeCanvas.width,
      y: this.lastHandResult.y * this.compositeCanvas.height,
    };
    this.activeWallPoint = screenToWall(this.wallView, screenPoint);
    this.lastPinchingAt = this.lastHandResult.timestamp;
    this.setSprayActive(true);
  }

  private navigationAnchor(): WallPoint {
    return this.lastScreenPoint ?? {
      x: this.compositeCanvas.width / 2,
      y: this.compositeCanvas.height / 2,
    };
  }

  private zoomBy(factor: number): void {
    this.finishActiveStroke();
    this.wallView = applyZoomAroundPoint(
      this.wallView,
      this.wallView.zoom * factor,
      this.navigationAnchor(),
    );
    this.replayStrokes(this.strokeHistory.snapshot());
    this.updateNavigationUi();
  }

  private quickZoom(): void {
    this.finishActiveStroke();
    const next = toggleQuickZoom(
      { view: this.wallView, restoreView: this.quickZoomRestore },
      this.navigationAnchor(),
    );
    this.wallView = next.view;
    this.quickZoomRestore = next.restoreView;
    this.replayStrokes(this.strokeHistory.snapshot());
    this.updateNavigationUi();
  }

  private resetView(): void {
    this.finishActiveStroke();
    this.wallView = resetWallView();
    this.quickZoomRestore = null;
    this.replayStrokes(this.strokeHistory.snapshot());
    this.updateNavigationUi();
  }

  private updateNavigationUi(): void {
    const control = this.requireElement<HTMLButtonElement>("reset-view");
    const percentage = `${Math.round(this.wallView.zoom * 100)}%`;
    control.textContent = percentage;
    control.setAttribute("aria-label", `Reset wall view. Current zoom ${percentage}`);
    control.setAttribute("title", `Reset view · 0 · pan ${Math.round(this.wallView.panX)}, ${Math.round(this.wallView.panY)}`);
    control.classList.toggle("quick", this.quickZoomRestore !== null);
    const island = this.requireElement("navigation-island");
    island.dataset.zoom = this.wallView.zoom.toString();
    island.dataset.panX = this.wallView.panX.toString();
    island.dataset.panY = this.wallView.panY.toString();
    island.dataset.quickZoom = (this.quickZoomRestore !== null).toString();
  }

  private renderShortcutReference(): void {
    const list = this.requireElement("shortcut-list");
    for (const command of this.commandRegistry.list()) {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const shortcut = document.createElement("kbd");
      shortcut.textContent = command.shortcut;
      const description = document.createElement("span");
      description.textContent = `${command.label} — ${command.description}`;
      row.append(shortcut, description);
      list.append(row);
    }
  }

  private toggleToolChooser(id: "color-chooser" | "cap-chooser"): void {
    const target = this.requireElement(id);
    const shouldOpen = !target.classList.contains("open");
    this.closeToolChoosers();
    if (shouldOpen && this.settings.isOpen) this.setSettings({ type: "close" });
    target.classList.toggle("open", shouldOpen);
  }

  private closeToolChoosers(): void {
    this.requireElement("color-chooser").classList.remove("open");
    this.requireElement("cap-chooser").classList.remove("open");
  }

  private setSettings(action: SettingsAction): void {
    this.settings = reduceSettingsState(this.settings, action);
    if (this.settings.isOpen) this.closeToolChoosers();
    this.updateSettingsUi();
  }

  private updateSettingsUi(): void {
    const panel = this.requireElement("settings-panel");
    panel.classList.toggle("open", this.settings.isOpen);
    panel.setAttribute("aria-hidden", (!this.settings.isOpen).toString());
    const toggle = this.requireElement("settings-toggle");
    toggle.setAttribute("aria-pressed", this.settings.isOpen.toString());
    toggle.setAttribute("aria-label", this.settings.isOpen ? "Close settings" : "Open settings");
    this.requireElement<HTMLSelectElement>("smoothing-level").value = this.settings.smoothing;
    this.requireElement<HTMLInputElement>("drips-enabled").checked = this.settings.dripsEnabled;
    this.requireElement<HTMLInputElement>("tracking-debug-visible").checked = this.settings.trackingDebugVisible;
    this.updateWallEnvironmentUi();
    this.updateRadiusUi();
    this.updateTrackingVisibility();
  }

  private updateRadiusUi(): void {
    this.requireElement<HTMLInputElement>("brush-radius").value = this.baseRadius.toString();
    this.requireElement("radius-val").textContent = this.baseRadius.toString();
    this.requireElement("radius-reset").textContent = this.settings.radiusOverride === null ? "Using cap default" : "Use cap default";
  }

  private async selectInputMode(mode: InputSourceMode): Promise<void> {
    this.finishActiveStroke();
    this.cancelPan("mode-switch", false);
    this.inputMode = mode;
    this.lastHandResult = null;
    this.activeWallPoint = null;
    this.updateTrackingOverlay(null);
    this.updateInputModeUi(mode === "spatial" ? "STARTING…" : "READY");

    if (mode === "mouse") {
      if (this.webcamActive) await this.handTracker.stop();
      this.webcamActive = false;
      this.updateInputModeUi("READY");
      this.updateTrackingVisibility();
      return;
    }

    if (this.webcamActive) {
      this.updateInputModeUi("CAMERA ON");
      return;
    }

    const handButton = this.requireElement<HTMLButtonElement>("hand-input");
    handButton.disabled = true;
    try {
      this.resetTrackingDiagnostics();
      await this.sprayCanAudio.unlock();
      await this.handTracker.initialize(
        (result) => this.handleHandTrackingResult(result),
        (diagnostics) => this.handleHandTrackingDiagnostics(diagnostics),
      );
      await this.handTracker.start();
      this.webcamActive = true;
      this.updateInputModeUi("CAMERA ON");
    } catch {
      this.webcamActive = false;
      this.updateInputModeUi("RETRY CAMERA", true);
    } finally {
      handButton.disabled = false;
      this.updateTrackingVisibility();
    }
  }

  private updateInputModeUi(status: string, error = false): void {
    const physical = this.requireElement("physical-input");
    const hand = this.requireElement("hand-input");
    const isHand = this.inputMode === "spatial";
    physical.classList.toggle("selected", !isHand);
    hand.classList.toggle("selected", isHand);
    physical.setAttribute("aria-pressed", (!isHand).toString());
    hand.setAttribute("aria-pressed", isHand.toString());
    const statusElement = this.requireElement("input-status");
    statusElement.textContent = status;
    statusElement.classList.toggle("on", status === "CAMERA ON");
    statusElement.classList.toggle("error", error);
  }

  private updateWallEnvironmentUi(): void {
    this.requireElement<HTMLSelectElement>("wall-environment").value = this.wallEnvironmentMode;
    this.requireElement<HTMLInputElement>("wall-solid-color").value = this.wallEnvironmentColor;
    this.requireElement("wall-surface-row").toggleAttribute("hidden", this.wallEnvironmentMode !== "wall");
    this.requireElement("wall-solid-row").toggleAttribute("hidden", this.wallEnvironmentMode !== "solid");
    this.requireElement("wall-image-row").toggleAttribute("hidden", this.wallEnvironmentMode !== "image");
  }

  private async loadWallEnvironmentImage(file: File): Promise<void> {
    const image = new Image();
    const url = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The selected background image could not be decoded."));
        image.src = url;
      });
      if (this.wallEnvironmentImageUrl) URL.revokeObjectURL(this.wallEnvironmentImageUrl);
      this.wallEnvironmentImageUrl = url;
      this.wallEnvironmentImage = image;
      this.wallEnvironmentMode = "image";
      this.updateWallEnvironmentUi();
      const error = this.requireElement("wall-environment-error");
      error.textContent = "";
      error.classList.remove("visible");
    } catch (loadError) {
      URL.revokeObjectURL(url);
      this.wallEnvironmentMode = "wall";
      this.updateWallEnvironmentUi();
      const error = this.requireElement("wall-environment-error");
      error.textContent = loadError instanceof Error ? loadError.message : "The background image could not load.";
      error.classList.add("visible");
    }
  }

  private handleHandTrackingResult(result: HandTrackingResult | null): void {
    if (this.inputMode !== "spatial") return;
    if (this.panInteraction.source !== null && this.panPointerId === null) {
      this.cancelPan("hand-resume", false);
    }
    this.updateTrackingOverlay(result);
    if (!result) {
      const bridgeMissingSample = shouldBridgeMissingHandSample({
        wasPinching: Boolean(this.lastHandResult?.isPinching),
        lastPinchingAt: this.lastPinchingAt,
        now: performance.now(),
        navigationActive: this.panInteraction.spaceHeld || this.panInteraction.source !== null,
      });
      this.activeWallPoint = null;
      if (bridgeMissingSample) return;
      this.lastHandResult = null;
      this.setSprayActive(false);
      this.resetStrokeInput(false);
      return;
    }
    this.lastHandResult = result;

    const screenPoint = {
      x: result.x * this.compositeCanvas.width,
      y: result.y * this.compositeCanvas.height,
    };
    this.lastScreenPoint = screenPoint;
    const wallPoint = screenToWall(this.wallView, screenPoint);
    this.activeWallPoint = wallPoint;
    const deliveryInterval = this.lastDeliveredAt ? result.timestamp - this.lastDeliveredAt : null;
    const deliveryDistance = this.lastDeliveredWallPoint
      ? Math.hypot(wallPoint.x - this.lastDeliveredWallPoint.x, wallPoint.y - this.lastDeliveredWallPoint.y)
      : null;
    const deliveryDetail = deliveryInterval === null || deliveryDistance === null
      ? "FIRST POINT"
      : `Δ${Math.round(deliveryDistance)}u / ${Math.round(deliveryInterval)}ms`;
    this.setTrackingStage("mapping", "pass", `${Math.round(wallPoint.x)}, ${Math.round(wallPoint.y)} · ${deliveryDetail}`);
    this.lastDeliveredWallPoint = wallPoint;
    this.lastDeliveredAt = result.timestamp;
    if (!this.mappedPointLogged) {
      this.mappedPointLogged = true;
      console.info(`[Spatial Spraypaint] Fingertip mapped to wall (${Math.round(wallPoint.x)}, ${Math.round(wallPoint.y)})`);
    }

    if (result.isPinching) this.lastPinchingAt = result.timestamp;
    const drawingAvailable = !this.panInteraction.spaceHeld && this.panInteraction.source === null;
    this.setSprayActive(result.isPinching && drawingAvailable);
    if (result.isPinching && drawingAvailable) {
      this.setTrackingStage("spray", "pass", "POINT RECEIVED");
      if (!this.sprayDeliveryLogged) {
        this.sprayDeliveryLogged = true;
        console.info("[Spatial Spraypaint] Spray engine received tracked point");
      }
    } else {
      this.resetStrokeInput(false);
    }
  }

  private handleHandTrackingDiagnostics(diagnostics: HandTrackingDiagnostics): void {
    const cadence = (value: number | null) => value === null ? "—" : `${Math.round(value)}ms`;
    this.setTrackingStage("library", diagnostics.libraryLoaded ? "pass" : "waiting", diagnostics.libraryLoaded ? "LOADED" : "WAITING");
    this.setTrackingStage("frames", diagnostics.videoFramesReceived > 0 ? "pass" : "waiting", diagnostics.videoFramesReceived > 0 ? `${diagnostics.videoFramesReceived} · ${cadence(diagnostics.reliability.frameIntervalMs)}` : "WAITING");
    this.setTrackingStage("callback", diagnostics.resultsCallbacks > 0 ? "pass" : "waiting", diagnostics.resultsCallbacks > 0 ? `${diagnostics.resultsCallbacks} · ${cadence(diagnostics.reliability.resultIntervalMs)}` : "WAITING");
    this.setTrackingStage(
      "landmarks",
      diagnostics.landmarksDetected ? "pass" : "waiting",
      diagnostics.landmarksDetected
        ? `Δ${cadence(diagnostics.reliability.landmarkIntervalMs)} · MISS ${diagnostics.reliability.missingHandFrames}/${diagnostics.reliability.consecutiveMissingHandFrames} · PINCH ${diagnostics.reliability.pinchTransitions}`
        : "WAITING",
    );

    const status = diagnostics.error ? "TRACKER ERROR" : diagnostics.cameraStarted ? "CAMERA ON" : diagnostics.trackerInitialized ? "TRACKER READY" : diagnostics.libraryLoaded ? "LOADING MODEL" : "CAMERA OFF";
    this.updateInputModeUi(status, Boolean(diagnostics.error));
    this.requireElement("tracking-debug-runtime").textContent = status;

    const errorElement = this.requireElement("tracking-error");
    errorElement.textContent = diagnostics.error ?? "";
    errorElement.classList.toggle("visible", Boolean(diagnostics.error));
    if (diagnostics.error) {
      this.settings = reduceSettingsState(this.settings, { type: "tracking-debug", value: true });
      this.settings = reduceSettingsState(this.settings, { type: "open" });
      this.updateSettingsUi();
    }
  }

  private updateTrackingOverlay(result: HandTrackingResult | null): void {
    const detected = Boolean(result);
    const cursor = this.requireElement("tracking-cursor");
    cursor.classList.toggle("detected", detected);
    cursor.classList.toggle("pinching", Boolean(result?.isPinching));
    cursor.classList.toggle("spraying", Boolean(result?.isPinching));
    if (result) {
      cursor.style.left = `${result.x * 100}%`;
      cursor.style.top = `${result.y * 100}%`;
    }
    const handStatus = this.requireElement("hand-detection-status");
    handStatus.textContent = detected ? "HAND DETECTED" : "NO HAND";
    handStatus.classList.toggle("detected", detected);
    this.requireElement("tracking-confidence").textContent = result ? `${(result.confidence * 100).toFixed(1)}%` : "—";
    this.requireElement("pinch-distance").textContent = result ? result.pinchDist.toFixed(3) : "—";
    const pinch = this.requireElement("pinch-state");
    pinch.textContent = result?.isPinching ? "ACTIVE" : "OPEN";
    pinch.classList.toggle("active", Boolean(result?.isPinching));
    this.requireElement("hand-first-use-cue").classList.toggle("visible", detected && !this.hasPinchSprayed);
    this.setTrackingStage("pinch", result?.isPinching ? "active" : result ? "pass" : "waiting", result?.isPinching ? "ACTIVE" : result ? "OPEN" : "WAITING");
  }

  private updateTrackingVisibility(): void {
    this.requireElement("tracking-overlay").classList.toggle("visible", this.inputMode === "spatial");
    this.requireElement("tracking-debug-panel").classList.toggle("visible", this.inputMode === "spatial" && this.settings.trackingDebugVisible);
  }

  private setTrackingStage(stage: string, state: string, value: string): void {
    const row = document.querySelector<HTMLElement>(`[data-tracking-stage="${stage}"]`);
    if (!row) return;
    row.dataset.state = state;
    const valueElement = row.querySelector<HTMLElement>(".tracking-stage-value");
    if (valueElement) valueElement.textContent = value;
  }

  private resetTrackingDiagnostics(): void {
    this.mappedPointLogged = false;
    this.sprayDeliveryLogged = false;
    this.lastHandResult = null;
    this.lastPinchingAt = 0;
    this.lastDeliveredWallPoint = null;
    this.lastDeliveredAt = 0;
    this.updateTrackingOverlay(null);
    for (const stage of ["library", "frames", "callback", "landmarks", "mapping", "pinch", "spray"]) {
      this.setTrackingStage(stage, "waiting", "WAITING");
    }
    const errorElement = this.requireElement("tracking-error");
    errorElement.textContent = "";
    errorElement.classList.remove("visible");
  }

  private setSprayActive(active: boolean): void {
    if (this.isSpraying === active) return;
    if (!active) this.flushReconstructedPath();
    this.isSpraying = active;
    if (active) {
      const strokeId = this.strokeHistory.begin({ color: this.selectedColor, capId: this.selectedCap.id });
      this.activeStrokeRandom = createStrokeRandom(strokeId);
    } else {
      this.strokeHistory.finalize();
      this.activeStrokeRandom = null;
      this.updateUndoControl();
    }
    const audioStatus = this.requireElement("spray-audio-status");
    audioStatus.textContent = active ? "HISS" : "QUIET";
    audioStatus.classList.toggle("on", active);
    void this.sprayCanAudio.setSpraying(active).catch((error) => {
      console.error("[Spatial Spraypaint] Spray audio failed", error);
      audioStatus.textContent = "AUDIO ERROR";
      audioStatus.classList.add("error");
    });
  }

  private finishActiveStroke(): void {
    if (this.isSpraying) this.setSprayActive(false);
    this.resetStrokeInput();
  }

  private resetStrokeInput(clearActivePoint = true): void {
    this.strokeManager.reset();
    this.strokeSmoother.reset();
    this.curveReconstructor.reset();
    this.dripAccumulator.reset();
    if (clearActivePoint) this.activeWallPoint = null;
  }

  private depositActivePoint(now: number, force = false): void {
    if (
      !this.isSpraying
      || !this.activeWallPoint
      || this.panInteraction.spaceHeld
      || this.panInteraction.source !== null
      || (!force && now - this.lastDepositTimestamp < MIN_DEPOSIT_INTERVAL_MS)
    ) return;
    this.lastDepositTimestamp = now;
    const smoothed = this.strokeSmoother.smooth(this.activeWallPoint, this.settings.smoothing);
    const reconstructed = this.curveReconstructor.push(
      { ...smoothed, timestamp: now },
      { baseRadius: this.baseRadius },
    );
    const point = this.depositReconstructedPath(reconstructed);
    if (this.inputMode === "spatial" && !this.hasPinchSprayed) {
      this.hasPinchSprayed = true;
      this.requireElement("hand-first-use-cue").classList.remove("visible");
    }
    const drip = this.dripAccumulator.observe({
      x: point?.x ?? smoothed.x,
      y: point?.y ?? smoothed.y,
      radius: point?.width ?? this.baseRadius,
      timestamp: now,
      dripTendency: this.selectedCap.dripTendency,
      enabled: this.settings.dripsEnabled,
    });
    if (drip) {
      this.brushEngine.startDrip(drip, this.selectedColor, now);
      this.strokeHistory.appendDrip(drip);
    }
  }

  private flushReconstructedPath(): void {
    const remaining = this.curveReconstructor.finish({ baseRadius: this.baseRadius });
    this.depositReconstructedPath(remaining);
  }

  private depositReconstructedPath(samples: CurveInputSample[]): StrokePoint | null {
    let lastPoint: StrokePoint | null = null;
    this.withWallPaintTransform(() => {
      for (const sample of samples) {
        const { point, interpolated, previous } = this.strokeManager.createPoint(
          sample.x,
          sample.y,
          this.baseRadius,
          0,
          sample.timestamp,
        );
        let segmentStart = previous;
        for (const segmentEnd of [...interpolated, point]) {
          this.brushEngine.renderSegment(
            this.paintCtx,
            segmentStart,
            segmentEnd,
            this.selectedColor,
            this.selectedCap,
            this.activeStrokeRandom ?? Math.random,
          );
          this.strokeHistory.appendPoint(segmentEnd);
          segmentStart = segmentEnd;
        }
        lastPoint = point;
      }
    });
    return lastPoint;
  }

  private undoLastStroke(): void {
    this.finishActiveStroke();
    if (!this.strokeHistory.canUndo()) return;
    const retainedStrokes = this.strokeHistory.undo();
    this.replayStrokes(retainedStrokes);
    this.updateUndoControl();
  }

  private replayStrokes(strokes: RecordedStroke[]): void {
    this.paintCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
    this.brushEngine.clear();
    this.withWallPaintTransform(() => {
      for (const stroke of strokes) {
        const cap = getSprayCapPreset(stroke.capId);
        const random = createStrokeRandom(stroke.id);
        let previous = null;
        for (const point of stroke.points) {
          this.brushEngine.renderSegment(this.paintCtx, previous, point, stroke.color, cap, random);
          previous = point;
        }
        for (const drip of stroke.drips) this.brushEngine.renderCompletedDrip(this.paintCtx, drip, stroke.color);
      }
    });
  }

  private withWallPaintTransform(action: () => void): void {
    this.paintCtx.save();
    this.paintCtx.setTransform(
      this.wallView.zoom,
      0,
      0,
      this.wallView.zoom,
      this.wallView.panX,
      this.wallView.panY,
    );
    action();
    this.paintCtx.restore();
  }

  private renderWallBackground(): void {
    const composition = resolveWallComposition(
      this.wallEnvironmentMode,
      Boolean(this.wallEnvironmentImage),
    );
    this.compositeCtx.fillStyle = composition.environment === "solid"
      ? this.wallEnvironmentColor
      : this.selectedBackground.color;
    this.compositeCtx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);

    const topLeft = screenToWall(this.wallView, { x: 0, y: 0 });
    const bottomRight = screenToWall(this.wallView, {
      x: this.compositeCanvas.width,
      y: this.compositeCanvas.height,
    });
    const spacing = 160;
    const minX = Math.floor(topLeft.x / spacing) * spacing;
    const maxX = Math.ceil(bottomRight.x / spacing) * spacing;
    const minY = Math.floor(topLeft.y / spacing) * spacing;
    const maxY = Math.ceil(bottomRight.y / spacing) * spacing;

    this.compositeCtx.save();
    this.compositeCtx.setTransform(
      this.wallView.zoom,
      0,
      0,
      this.wallView.zoom,
      this.wallView.panX,
      this.wallView.panY,
    );
    if (composition.environment === "image" && this.wallEnvironmentImage) {
      const tileWidth = Math.max(640, Math.min(1920, this.wallEnvironmentImage.naturalWidth));
      const tileHeight = tileWidth * (this.wallEnvironmentImage.naturalHeight / this.wallEnvironmentImage.naturalWidth);
      const firstTileX = Math.floor(topLeft.x / tileWidth) * tileWidth;
      const firstTileY = Math.floor(topLeft.y / tileHeight) * tileHeight;
      for (let y = firstTileY; y <= bottomRight.y; y += tileHeight) {
        for (let x = firstTileX; x <= bottomRight.x; x += tileWidth) {
          this.compositeCtx.drawImage(this.wallEnvironmentImage, x, y, tileWidth, tileHeight);
        }
      }
    }
    this.compositeCtx.strokeStyle = this.selectedBackground.id === "off-white"
      ? "rgba(20, 20, 24, 0.045)"
      : "rgba(255, 255, 255, 0.045)";
    this.compositeCtx.lineWidth = 1 / this.wallView.zoom;
    this.compositeCtx.beginPath();
    for (let x = minX; x <= maxX; x += spacing) {
      this.compositeCtx.moveTo(x, minY);
      this.compositeCtx.lineTo(x, maxY);
    }
    for (let y = minY; y <= maxY; y += spacing) {
      this.compositeCtx.moveTo(minX, y);
      this.compositeCtx.lineTo(maxX, y);
    }
    this.compositeCtx.stroke();
    this.compositeCtx.restore();
  }

  private updateUndoControl(): void {
    const button = this.requireElement<HTMLButtonElement>("undo-stroke");
    button.disabled = !this.strokeHistory.canUndo();
    button.textContent = "↶";
    button.setAttribute("title", this.strokeHistory.canUndo() ? `Undo last stroke · ${this.strokeHistory.size()} available · ⌘/Ctrl Z` : "Undo last stroke · ⌘/Ctrl Z");
    this.requireElement<HTMLButtonElement>("clear-strokes").disabled = this.strokeHistory.snapshot().length === 0;
  }

  private clearAllStrokes(): void {
    this.finishActiveStroke();
    if (!this.strokeHistory.clearUndoably()) return;
    this.paintCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
    this.brushEngine.clear();
    this.updateUndoControl();
  }

  private loadAudioFile(file: File): void {
    this.audioElement?.pause();
    if (this.audioObjectUrl) URL.revokeObjectURL(this.audioObjectUrl);
    this.audioObjectUrl = URL.createObjectURL(file);
    const audio = new Audio(this.audioObjectUrl);
    audio.loop = this.player.loop;
    this.audioElement = audio;
    this.sprayCanAudio.attachMusicElement(audio);
    this.setPlayer({ type: "load", trackName: file.name });
    audio.addEventListener("loadedmetadata", () => this.setPlayer({ type: "time", currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
    audio.addEventListener("timeupdate", () => this.setPlayer({ type: "time", currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
    audio.addEventListener("play", () => this.setPlayer({ type: "play" }));
    audio.addEventListener("pause", () => this.setPlayer({ type: "pause" }));
    audio.addEventListener("ended", () => this.setPlayer({ type: "ended" }));
    audio.addEventListener("error", () => {
      console.error("[Spatial Spraypaint] The selected audio track could not be played.");
      this.requireElement("player-track-name").textContent = "Track could not be played";
    });
  }

  private setPlayer(action: PlayerAction): void {
    this.player = reducePlayerState(this.player, action);
    this.updatePlayerUi();
  }

  private async togglePlayback(): Promise<void> {
    if (!this.audioElement) return;
    try {
      if (this.audioElement.paused) {
        await this.sprayCanAudio.unlock();
        await this.audioElement.play();
      } else {
        this.audioElement.pause();
      }
    } catch (error) {
      console.error("[Spatial Spraypaint] Session soundtrack playback failed", error);
    }
  }

  private toggleLoop(): void {
    this.setPlayer({ type: "toggle-loop" });
    if (this.audioElement) this.audioElement.loop = this.player.loop;
  }

  private updatePlayerUi(): void {
    this.requireElement("player-island").classList.toggle("empty", this.player.status === "empty");
    this.requireElement("player-track-name").textContent = this.player.trackName;
    const playButton = this.requireElement<HTMLButtonElement>("player-play-pause");
    playButton.disabled = this.player.status === "empty";
    playButton.textContent = this.player.status === "playing" ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", this.player.status === "playing" ? "Pause soundtrack" : "Play soundtrack");
    const progress = this.requireElement<HTMLInputElement>("player-progress");
    progress.disabled = this.player.status === "empty" || this.player.duration <= 0;
    progress.value = this.player.duration > 0 ? Math.round((this.player.currentTime / this.player.duration) * 1000).toString() : "0";
    this.requireElement("player-time").textContent = `${this.formatTime(this.player.currentTime)} / ${this.formatTime(this.player.duration)}`;
    const loopButton = this.requireElement("player-loop");
    loopButton.setAttribute("aria-pressed", this.player.loop.toString());
    loopButton.textContent = "↻";
    loopButton.setAttribute("aria-label", this.player.loop ? "Disable soundtrack loop" : "Enable soundtrack loop");
  }

  private formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
  }

  private async playCanRattle(): Promise<void> {
    try {
      await this.sprayCanAudio.playRattle();
      const status = this.requireElement("spray-audio-status");
      status.textContent = "RATTLE";
      status.classList.add("on");
      window.setTimeout(() => {
        status.textContent = this.isSpraying ? "HISS" : "QUIET";
        status.classList.toggle("on", this.isSpraying);
      }, 480);
    } catch (error) {
      console.error("[Spatial Spraypaint] Can rattle audio failed", error);
    }
  }

  private async toggleRecording(): Promise<void> {
    const button = this.requireElement<HTMLButtonElement>("toggle-record");
    if (!this.recorder.getIsRecording()) {
      let audioStream: MediaStream | undefined;
      try {
        await this.sprayCanAudio.unlock();
        audioStream = this.sprayCanAudio.getRecordingStream();
      } catch (error) {
        console.error("[Spatial Spraypaint] Recording audio mix unavailable", error);
      }
      this.recorder.start(this.compositeCanvas, audioStream);
      console.info(`[Spatial Spraypaint] Recording started (${audioStream?.getAudioTracks().length ?? 0} mixed audio track)`);
      button.classList.add("recording");
      button.setAttribute("aria-label", "Stop and save recording");
      button.setAttribute("title", "Stop and save recording · R");
      return;
    }

    const blob = await this.recorder.stop();
    console.info(`[Spatial Spraypaint] Recording export ready (${blob.size} bytes, ${blob.type})`);
    button.classList.remove("recording");
    button.setAttribute("aria-label", "Start recording");
    button.setAttribute("title", "Record · R");
    this.downloadBlob(blob, `spatial-spraypaint-${Date.now()}.webm`);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private startRenderLoop(): void {
    const render = () => {
      const now = performance.now();
      this.depositActivePoint(now);
      this.withWallPaintTransform(() => this.brushEngine.advanceDrips(this.paintCtx, now));
      this.compositeCtx.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
      this.renderWallBackground();
      this.compositeCtx.drawImage(this.paintCanvas, 0, 0);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
}

window.addEventListener("DOMContentLoaded", () => new SpatialSpraypaintApp());
