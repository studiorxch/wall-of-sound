import { AnonymityProcessor } from "./AnonymityProcessor";
import { getSprayBackground, type SprayBackground } from "./Backgrounds";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import { CommandRegistry } from "./CommandRegistry";
import { DripAccumulator } from "./DripLogic";
import { HandTracker, type HandTrackingDiagnostics, type HandTrackingResult } from "./HandTracker";
import { PerformanceRecorder } from "./PerformanceRecorder";
import { INITIAL_PLAYER_STATE, reducePlayerState, type PlayerAction, type PlayerState } from "./PlayerState";
import { cameraTreatmentForInputMode, INITIAL_SETTINGS_STATE, reduceSettingsState, type SettingsAction, type SettingsState } from "./SettingsState";
import { SprayBrushEngine } from "./SprayBrushEngine";
import { SprayCanAudio } from "./SprayCanAudio";
import { getSprayCapPreset, type SprayCapPreset } from "./SprayCapPresets";
import { StrokeHistory, type RecordedStroke } from "./StrokeHistory";
import { StrokeSmoother } from "./StrokeSmoother";
import { type AnonymityMode, type InputSourceMode } from "./types";

class SpatialSpraypaintApp {
  private readonly compositeCanvas: HTMLCanvasElement;
  private readonly compositeCtx: CanvasRenderingContext2D;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly paintCtx: CanvasRenderingContext2D;

  private readonly strokeManager = new CanonicalStrokeManager();
  private readonly strokeSmoother = new StrokeSmoother();
  private readonly brushEngine = new SprayBrushEngine();
  private readonly dripAccumulator = new DripAccumulator();
  private readonly strokeHistory = new StrokeHistory(40);
  private readonly handTracker = new HandTracker();
  private readonly anonymityProcessor = new AnonymityProcessor();
  private readonly recorder = new PerformanceRecorder();
  private readonly sprayCanAudio = new SprayCanAudio();
  private readonly commandRegistry: CommandRegistry;

  private inputMode: InputSourceMode = "mouse";
  private anonymityMode: AnonymityMode = "hidden";
  private selectedColor = "#e92f3d";
  private selectedCap: SprayCapPreset = getSprayCapPreset("new-york-fat");
  private selectedBackground: SprayBackground = getSprayBackground("black");
  private settings: SettingsState = { ...INITIAL_SETTINGS_STATE };
  private player: PlayerState = { ...INITIAL_PLAYER_STATE };
  private baseRadius = this.selectedCap.baseRadius;
  private isSpraying = false;
  private webcamActive = false;
  private lastHandResult: HandTrackingResult | null = null;
  private activeSprayPoint: { x: number; y: number } | null = null;
  private lastDepositTimestamp = 0;
  private mappedPointLogged = false;
  private sprayDeliveryLogged = false;
  private hasPinchSprayed = false;
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
      settings: () => this.setSettings({ type: "toggle" }),
      record: () => this.toggleRecording(),
      "play-pause": () => this.togglePlayback(),
      "close-settings": () => this.setSettings({ type: "close" }),
    });

    this.initResize();
    this.bindControls();
    this.bindMouseInput();
    this.bindCommandSystem();
    this.renderShortcutReference();
    this.updateSettingsUi();
    this.updatePlayerUi();
    this.updateUndoControl();
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
      const temporaryCanvas = document.createElement("canvas");
      temporaryCanvas.width = this.paintCanvas.width;
      temporaryCanvas.height = this.paintCanvas.height;
      if (temporaryCanvas.width && temporaryCanvas.height) {
        temporaryCanvas.getContext("2d")?.drawImage(this.paintCanvas, 0, 0);
      }

      this.compositeCanvas.width = window.innerWidth;
      this.compositeCanvas.height = window.innerHeight;
      this.paintCanvas.width = window.innerWidth;
      this.paintCanvas.height = window.innerHeight;
      this.brushEngine.resize(window.innerWidth, window.innerHeight);
      if (temporaryCanvas.width && temporaryCanvas.height) {
        this.paintCtx.drawImage(temporaryCanvas, 0, 0);
      }
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
    this.requireElement<HTMLSelectElement>("anonymity-mode").addEventListener("change", (event) => {
      this.anonymityMode = (event.target as HTMLSelectElement).value as AnonymityMode;
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

  private bindMouseInput(): void {
    this.compositeCanvas.addEventListener("mousedown", (event) => {
      if (this.inputMode !== "mouse" || event.button !== 0) return;
      this.closeToolChoosers();
      if (this.settings.isOpen) this.setSettings({ type: "close" });
      this.strokeManager.reset();
      this.strokeSmoother.reset();
      this.dripAccumulator.reset();
      this.activeSprayPoint = { x: event.clientX, y: event.clientY };
      this.lastDepositTimestamp = 0;
      this.setSprayActive(true);
      this.depositActivePoint(performance.now());
    });
    window.addEventListener("mousemove", (event) => {
      if (this.inputMode === "mouse" && this.isSpraying) {
        this.activeSprayPoint = { x: event.clientX, y: event.clientY };
      }
    });
    window.addEventListener("mouseup", () => {
      if (this.inputMode !== "mouse" || !this.isSpraying) return;
      this.depositActivePoint(performance.now(), true);
      this.setSprayActive(false);
      this.resetStrokeInput();
    });
  }

  private bindCommandSystem(): void {
    window.addEventListener("keydown", (event) => this.commandRegistry.handleKeyboardEvent(event));
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
    this.inputMode = mode;
    this.anonymityMode = cameraTreatmentForInputMode(mode, this.anonymityMode);
    this.requireElement<HTMLSelectElement>("anonymity-mode").value = this.anonymityMode;
    this.lastHandResult = null;
    this.activeSprayPoint = null;
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

  private handleHandTrackingResult(result: HandTrackingResult | null): void {
    if (this.inputMode !== "spatial") return;
    this.lastHandResult = result;
    this.updateTrackingOverlay(result);
    if (!result) {
      this.activeSprayPoint = null;
      this.setSprayActive(false);
      this.resetStrokeInput(false);
      return;
    }

    const x = result.x * this.compositeCanvas.width;
    const y = result.y * this.compositeCanvas.height;
    this.activeSprayPoint = { x, y };
    this.setTrackingStage("mapping", "pass", `${Math.round(x)}, ${Math.round(y)}`);
    if (!this.mappedPointLogged) {
      this.mappedPointLogged = true;
      console.info(`[Spatial Spraypaint] Fingertip mapped to canvas (${Math.round(x)}, ${Math.round(y)})`);
    }

    this.setSprayActive(result.isPinching);
    if (result.isPinching) {
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
    this.setTrackingStage("library", diagnostics.libraryLoaded ? "pass" : "waiting", diagnostics.libraryLoaded ? "LOADED" : "WAITING");
    this.setTrackingStage("frames", diagnostics.videoFramesReceived > 0 ? "pass" : "waiting", diagnostics.videoFramesReceived > 0 ? diagnostics.videoFramesReceived.toString() : "WAITING");
    this.setTrackingStage("callback", diagnostics.resultsCallbacks > 0 ? "pass" : "waiting", diagnostics.resultsCallbacks > 0 ? diagnostics.resultsCallbacks.toString() : "WAITING");
    this.setTrackingStage("landmarks", diagnostics.landmarksDetected ? "pass" : "waiting", diagnostics.landmarksDetected ? "DETECTED" : "WAITING");

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
    this.isSpraying = active;
    if (active) {
      this.strokeHistory.begin({ color: this.selectedColor, capId: this.selectedCap.id });
    } else {
      this.strokeHistory.finalize();
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
    this.dripAccumulator.reset();
    if (clearActivePoint) this.activeSprayPoint = null;
  }

  private depositActivePoint(now: number, force = false): void {
    if (!this.isSpraying || !this.activeSprayPoint || (!force && now - this.lastDepositTimestamp < 28)) return;
    this.lastDepositTimestamp = now;
    const smoothed = this.strokeSmoother.smooth(this.activeSprayPoint, this.settings.smoothing);
    const { point, interpolated, previous } = this.strokeManager.createPoint(smoothed.x, smoothed.y, this.baseRadius, 0, now);
    let segmentStart = previous;
    for (const segmentEnd of [...interpolated, point]) {
      this.brushEngine.renderSegment(this.paintCtx, segmentStart, segmentEnd, this.selectedColor, this.selectedCap);
      this.strokeHistory.appendPoint(segmentEnd);
      segmentStart = segmentEnd;
    }
    if (this.inputMode === "spatial" && !this.hasPinchSprayed) {
      this.hasPinchSprayed = true;
      this.requireElement("hand-first-use-cue").classList.remove("visible");
    }
    const drip = this.dripAccumulator.observe({
      x: point.x,
      y: point.y,
      radius: point.width,
      timestamp: now,
      dripTendency: this.selectedCap.dripTendency,
      enabled: this.settings.dripsEnabled,
    });
    if (drip) {
      this.brushEngine.startDrip(drip, this.selectedColor, now);
      this.strokeHistory.appendDrip(drip);
    }
  }

  private undoLastStroke(): void {
    this.finishActiveStroke();
    if (!this.strokeHistory.canUndo()) return;
    const retainedStrokes = this.strokeHistory.undo();
    this.replayStrokes(retainedStrokes);
    this.updateUndoControl();
  }

  private replayStrokes(strokes: RecordedStroke[]): void {
    this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
    this.brushEngine.clear();
    for (const stroke of strokes) {
      const cap = getSprayCapPreset(stroke.capId);
      let previous = null;
      for (const point of stroke.points) {
        this.brushEngine.renderSegment(this.paintCtx, previous, point, stroke.color, cap);
        previous = point;
      }
      for (const drip of stroke.drips) this.brushEngine.renderCompletedDrip(this.paintCtx, drip, stroke.color);
    }
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
      this.brushEngine.advanceDrips(this.paintCtx, now);
      this.compositeCtx.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
      this.compositeCtx.fillStyle = this.selectedBackground.color;
      this.compositeCtx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
      if (this.webcamActive && this.inputMode === "spatial") {
        this.anonymityProcessor.processFrame(
          this.compositeCtx,
          this.handTracker.getVideoElement(),
          this.anonymityMode,
          this.compositeCanvas.width,
          this.compositeCanvas.height,
        );
      }
      this.compositeCtx.drawImage(this.paintCanvas, 0, 0);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
}

window.addEventListener("DOMContentLoaded", () => new SpatialSpraypaintApp());
