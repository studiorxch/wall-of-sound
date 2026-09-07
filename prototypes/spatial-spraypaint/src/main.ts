import { InputSourceMode, AnonymityMode } from "./types";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import { SprayBrushEngine } from "./SprayBrushEngine";
import {
  HandTracker,
  HandTrackingResult,
  HandTrackingDiagnostics,
} from "./HandTracker";
import { AnonymityProcessor } from "./AnonymityProcessor";
import { PerformanceRecorder } from "./PerformanceRecorder";
import {
  getSprayCapPreset,
  type SprayCapPreset,
} from "./SprayCapPresets";
import { SprayCanAudio } from "./SprayCanAudio";
import { StrokeSmoother, type SmoothingLevel } from "./StrokeSmoother";
import { DripAccumulator } from "./DripLogic";
import { getSprayBackground, type SprayBackground } from "./Backgrounds";

class SpatialSpraypaintApp {
  private compositeCanvas: HTMLCanvasElement;
  private compositeCtx: CanvasRenderingContext2D;

  // Separate persistent paint canvas
  private paintCanvas: HTMLCanvasElement;
  private paintCtx: CanvasRenderingContext2D;

  private strokeManager = new CanonicalStrokeManager();
  private brushEngine = new SprayBrushEngine();
  private handTracker = new HandTracker();
  private anonymityProcessor = new AnonymityProcessor();
  private recorder = new PerformanceRecorder();
  private sprayCanAudio = new SprayCanAudio();
  private strokeSmoother = new StrokeSmoother();
  private dripAccumulator = new DripAccumulator();

  private inputMode: InputSourceMode = "mouse";
  private anonymityMode: AnonymityMode = "hidden";
  private selectedColor = "#e92f3d";
  private selectedCap: SprayCapPreset = getSprayCapPreset("new-york-fat");
  private selectedBackground: SprayBackground = getSprayBackground("black");
  private smoothingLevel: SmoothingLevel = "medium";
  private dripsEnabled = true;
  private baseRadius = this.selectedCap.baseRadius;
  private isSpraying = false;
  private manualSprayOverride = false;
  private webcamActive = false;
  private trackingDiagnosticsVisible = false;
  private controlsCollapsed = false;
  private performanceMode = false;
  private lastHandResult: HandTrackingResult | null = null;
  private mappedPointLogged = false;
  private sprayDeliveryLogged = false;
  private activeSprayPoint: { x: number; y: number } | null = null;
  private lastDepositTimestamp = 0;

  private audioElement: HTMLAudioElement | null = null;

  constructor() {
    this.compositeCanvas = document.getElementById("composite-canvas") as HTMLCanvasElement;
    this.compositeCtx = this.compositeCanvas.getContext("2d")!;

    this.paintCanvas = document.createElement("canvas");
    this.paintCtx = this.paintCanvas.getContext("2d")!;

    this.initResize();
    this.bindControls();
    this.bindMouseEvents();
    this.bindKeyboardFallback();
    this.updateUiChrome();
    this.updateTrackingOverlay(null);
    this.updateCapControls();
    this.updateBackgroundControls();
    this.updateSprayStatus();
    this.startRenderLoop();
  }

  private initResize() {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Copy existing paint during resize
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = this.paintCanvas.width;
      tempCanvas.height = this.paintCanvas.height;
      if (tempCanvas.width > 0 && tempCanvas.height > 0) {
        tempCanvas.getContext("2d")?.drawImage(this.paintCanvas, 0, 0);
      }

      this.compositeCanvas.width = w;
      this.compositeCanvas.height = h;
      this.paintCanvas.width = w;
      this.paintCanvas.height = h;

      this.brushEngine.resize(w, h);

      if (tempCanvas.width > 0 && tempCanvas.height > 0) {
        this.paintCtx.drawImage(tempCanvas, 0, 0);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();
  }

  private bindControls() {
    const inputSelect = document.getElementById("input-mode") as HTMLSelectElement;
    const anonymitySelect = document.getElementById("anonymity-mode") as HTMLSelectElement;
    const radiusInput = document.getElementById("brush-radius") as HTMLInputElement;
    const radiusVal = document.getElementById("radius-val")!;
    const capSelect = document.getElementById("cap-preset") as HTMLSelectElement;
    const performanceCapSelect = document.getElementById("performance-cap-preset") as HTMLSelectElement;
    const backgroundSelect = document.getElementById("background-preset") as HTMLSelectElement;
    const performanceBackgroundSelect = document.getElementById("performance-background-preset") as HTMLSelectElement;
    const smoothingSelect = document.getElementById("smoothing-level") as HTMLSelectElement;
    const dripsToggle = document.getElementById("drips-enabled") as HTMLInputElement;
    const toggleWebcamBtn = document.getElementById("toggle-webcam") as HTMLButtonElement;
    const clearBtn = document.getElementById("clear-canvas")!;
    const toggleRecordBtn = document.getElementById("toggle-record") as HTMLButtonElement;
    const webcamControls = document.getElementById("webcam-controls")!;
    const manualSprayBtn = document.getElementById("manual-spray-trigger")!;
    const toggleTrackingDebugBtn = document.getElementById(
      "toggle-tracking-debug"
    ) as HTMLButtonElement;
    const collapseControlsBtn = document.getElementById("collapse-controls")!;
    const openControlsBtn = document.getElementById("open-controls-tab")!;
    const performanceModeBtn = document.getElementById("toggle-performance-mode")!;
    const performanceExitBtn = document.getElementById("performance-exit")!;
    const fullscreenBtn = document.getElementById("toggle-fullscreen")!;
    const shakeCanBtn = document.getElementById("shake-can")!;
    const performanceRecordBtn = document.getElementById("performance-record-toggle")!;
    const performanceClearBtn = document.getElementById("performance-clear-canvas")!;

    inputSelect.addEventListener("change", (e) => {
      this.inputMode = (e.target as HTMLSelectElement).value as InputSourceMode;
      webcamControls.style.display = this.inputMode === "spatial" ? "flex" : "none";
      this.strokeManager.reset();
      this.strokeSmoother.reset();
      this.dripAccumulator.reset();
      this.activeSprayPoint = null;
      this.setSprayActive(false);
      this.updateUiChrome();
      this.updateTrackingOverlay(this.inputMode === "spatial" ? this.lastHandResult : null);
    });

    anonymitySelect.addEventListener("change", (e) => {
      this.anonymityMode = (e.target as HTMLSelectElement).value as AnonymityMode;
    });

    radiusInput.addEventListener("input", (e) => {
      this.baseRadius = parseInt((e.target as HTMLInputElement).value, 10);
      radiusVal.textContent = this.baseRadius.toString();
    });

    const selectCap = (id: string) => {
      this.selectedCap = getSprayCapPreset(id);
      this.baseRadius = this.selectedCap.baseRadius;
      this.updateCapControls();
      this.strokeManager.reset();
      this.strokeSmoother.reset();
      this.dripAccumulator.reset();
    };
    capSelect.addEventListener("change", (e) => selectCap((e.target as HTMLSelectElement).value));
    performanceCapSelect.addEventListener("change", (e) => selectCap((e.target as HTMLSelectElement).value));

    const selectBackground = (id: string) => {
      this.selectedBackground = getSprayBackground(id);
      this.updateBackgroundControls();
    };
    backgroundSelect.addEventListener("change", (e) => selectBackground((e.target as HTMLSelectElement).value));
    performanceBackgroundSelect.addEventListener("change", (e) => selectBackground((e.target as HTMLSelectElement).value));

    smoothingSelect.addEventListener("change", (e) => {
      this.smoothingLevel = (e.target as HTMLSelectElement).value as SmoothingLevel;
      this.strokeSmoother.reset();
      this.strokeManager.reset();
    });
    dripsToggle.addEventListener("change", () => {
      this.dripsEnabled = dripsToggle.checked;
      if (!this.dripsEnabled) this.dripAccumulator.reset();
    });

    document.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.addEventListener("click", (e) => {
        const el = e.currentTarget as HTMLElement;
        this.selectedColor = el.dataset.color || "#e92f3d";
        document.querySelectorAll<HTMLElement>(".swatch").forEach((swatchElement) => {
          swatchElement.classList.toggle("selected", swatchElement.dataset.color === this.selectedColor);
        });
      });
    });

    toggleWebcamBtn.addEventListener("click", async () => {
      toggleWebcamBtn.disabled = true;
      try {
        if (!this.webcamActive) {
          await this.sprayCanAudio.unlock();
          this.resetTrackingDiagnostics();
          await this.handTracker.initialize(
            (res) => this.handleHandTrackingResult(res),
            (diagnostics) => this.handleHandTrackingDiagnostics(diagnostics)
          );
          await this.handTracker.start();
          this.webcamActive = true;
          toggleWebcamBtn.textContent = "Stop Camera";
          toggleWebcamBtn.classList.add("active");
        } else {
          await this.handTracker.stop();
          this.webcamActive = false;
          this.lastHandResult = null;
          this.updateTrackingOverlay(null);
          toggleWebcamBtn.textContent = "Start Camera";
          toggleWebcamBtn.classList.remove("active");
        }
      } catch {
        this.webcamActive = false;
        toggleWebcamBtn.textContent = "Retry Camera";
        toggleWebcamBtn.classList.remove("active");
      } finally {
        toggleWebcamBtn.disabled = false;
      }
    });

    toggleTrackingDebugBtn.addEventListener("click", () => {
      this.toggleTrackingDiagnostics();
    });

    collapseControlsBtn.addEventListener("click", () => {
      this.controlsCollapsed = true;
      this.updateUiChrome();
    });
    openControlsBtn.addEventListener("click", () => {
      this.controlsCollapsed = false;
      this.updateUiChrome();
    });
    performanceModeBtn.addEventListener("click", () => this.togglePerformanceMode());
    performanceExitBtn.addEventListener("click", () => this.togglePerformanceMode(false));
    fullscreenBtn.addEventListener("click", () => void this.toggleFullscreen());
    document.addEventListener("fullscreenchange", () => this.updateFullscreenControl());

    shakeCanBtn.addEventListener("click", () => void this.playCanRattle());

    clearBtn.addEventListener("click", () => {
      this.clearPaint();
    });
    performanceClearBtn.addEventListener("click", () => this.clearPaint());

    toggleRecordBtn.addEventListener("click", () => void this.toggleRecording());
    performanceRecordBtn.addEventListener("click", () => void this.toggleRecording());

    manualSprayBtn.addEventListener("mousedown", () => {
      this.manualSprayOverride = true;
      this.updateManualSprayIndicators();
    });
    window.addEventListener("mouseup", () => {
      this.manualSprayOverride = false;
      this.updateManualSprayIndicators();
    });

    // Audio setup with Web Audio routing for performance recording
    const audioInput = document.getElementById("audio-file") as HTMLInputElement;
    const playBtn = document.getElementById("play-audio") as HTMLButtonElement;
    const stopBtn = document.getElementById("stop-audio") as HTMLButtonElement;

    audioInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (this.audioElement) this.audioElement.pause();
        this.audioElement = new Audio(URL.createObjectURL(file));

        this.sprayCanAudio.attachMusicElement(this.audioElement);

        playBtn.disabled = false;
        stopBtn.disabled = false;
      }
    });

    playBtn.addEventListener("click", async () => {
      await this.sprayCanAudio.unlock();
      await this.audioElement?.play();
    });

    stopBtn.addEventListener("click", () => {
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      }
    });
  }

  private bindMouseEvents() {
    this.compositeCanvas.addEventListener("mousedown", (e) => {
      if (this.inputMode !== "mouse") return;
      this.strokeManager.reset();
      this.strokeSmoother.reset();
      this.dripAccumulator.reset();
      this.activeSprayPoint = { x: e.clientX, y: e.clientY };
      this.lastDepositTimestamp = 0;
      this.setSprayActive(true);
      this.depositActivePoint(performance.now());
    });

    window.addEventListener("mousemove", (e) => {
      if (this.inputMode !== "mouse" || !this.isSpraying) return;
      this.activeSprayPoint = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mouseup", () => {
      if (this.inputMode !== "mouse") return;
      this.depositActivePoint(performance.now(), true);
      this.setSprayActive(false);
      this.endStroke();
    });
  }

  private bindKeyboardFallback() {
    window.addEventListener("keydown", (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && e.code === "KeyP") {
        e.preventDefault();
        this.togglePerformanceMode();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && e.code === "KeyD") {
        e.preventDefault();
        this.toggleTrackingDiagnostics();
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        this.manualSprayOverride = true;
        this.updateManualSprayIndicators();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.manualSprayOverride = false;
        this.updateManualSprayIndicators();
      }
    });
  }

  private handleHandTrackingResult(res: HandTrackingResult | null) {
    if (this.inputMode !== "spatial") return;

    this.lastHandResult = res;
    this.updateTrackingOverlay(res);

    if (!res) {
      this.activeSprayPoint = null;
      this.setSprayActive(this.manualSprayOverride);
      return;
    }

    this.setSprayActive(res.isPinching || this.manualSprayOverride);

    const px = res.x * this.compositeCanvas.width;
    const py = res.y * this.compositeCanvas.height;
    this.activeSprayPoint = { x: px, y: py };
    if (!this.mappedPointLogged) {
      this.mappedPointLogged = true;
      console.info(
        `[Spatial Spraypaint] Fingertip mapped to canvas (${Math.round(px)}, ${Math.round(py)})`
      );
    }
    this.setTrackingStage("mapping", "pass", `${Math.round(px)}, ${Math.round(py)}`);

    if (this.isSpraying) {
      this.setTrackingStage("spray", "pass", "POINT RECEIVED");
      if (!this.sprayDeliveryLogged) {
        this.sprayDeliveryLogged = true;
        console.info("[Spatial Spraypaint] Spray engine received tracked point");
      }
    } else {
      this.endStroke(false);
    }
  }

  private handleHandTrackingDiagnostics(diagnostics: HandTrackingDiagnostics) {
    this.setTrackingStage(
      "library",
      diagnostics.libraryLoaded ? "pass" : "waiting",
      diagnostics.libraryLoaded ? "LOADED" : "WAITING"
    );
    this.setTrackingStage(
      "frames",
      diagnostics.videoFramesReceived > 0 ? "pass" : "waiting",
      diagnostics.videoFramesReceived > 0
        ? diagnostics.videoFramesReceived.toString()
        : "WAITING"
    );
    this.setTrackingStage(
      "callback",
      diagnostics.resultsCallbacks > 0 ? "pass" : "waiting",
      diagnostics.resultsCallbacks > 0 ? diagnostics.resultsCallbacks.toString() : "WAITING"
    );
    this.setTrackingStage(
      "landmarks",
      diagnostics.landmarksDetected ? "pass" : "waiting",
      diagnostics.landmarksDetected ? "DETECTED" : "WAITING"
    );

    const trackerStatus = document.getElementById("tracker-runtime-status");
    if (trackerStatus) {
      if (diagnostics.error) trackerStatus.textContent = "TRACKER ERROR";
      else if (diagnostics.cameraStarted) trackerStatus.textContent = "CAMERA RUNNING";
      else if (diagnostics.trackerInitialized) trackerStatus.textContent = "TRACKER READY";
      else if (diagnostics.libraryLoaded) trackerStatus.textContent = "LOADING MODEL";
      else trackerStatus.textContent = "TRACKER IDLE";
    }

    const errorElement = document.getElementById("tracking-error");
    if (errorElement) {
      errorElement.textContent = diagnostics.error ?? "";
      errorElement.classList.toggle("visible", Boolean(diagnostics.error));
    }
    if (diagnostics.error && !this.performanceMode) {
      this.trackingDiagnosticsVisible = true;
      this.updateUiChrome();
    }
    const compactTrackingStatus = document.getElementById("performance-tracking-status");
    if (compactTrackingStatus) {
      compactTrackingStatus.textContent = diagnostics.error
        ? "TRACKER ERROR"
        : diagnostics.cameraStarted
          ? "TRACKING"
          : "NO CAMERA";
      compactTrackingStatus.classList.toggle("error", Boolean(diagnostics.error));
    }
  }

  private updateTrackingOverlay(res: HandTrackingResult | null) {
    const cursor = document.getElementById("tracking-cursor");
    const handStatus = document.getElementById("hand-detection-status");
    const confidence = document.getElementById("tracking-confidence");
    const pinchDistance = document.getElementById("pinch-distance");
    const pinchState = document.getElementById("pinch-state");
    const manualState = document.getElementById("manual-state");

    const handDetected = Boolean(res);
    if (handStatus) {
      handStatus.textContent = handDetected ? "HAND DETECTED" : "NO HAND";
      handStatus.classList.toggle("detected", handDetected);
    }
    if (confidence) confidence.textContent = res ? `${(res.confidence * 100).toFixed(1)}%` : "—";
    if (pinchDistance) pinchDistance.textContent = res ? res.pinchDist.toFixed(3) : "—";
    if (pinchState) {
      pinchState.textContent = res?.isPinching ? "ACTIVE" : "OPEN";
      pinchState.classList.toggle("active", Boolean(res?.isPinching));
    }
    if (manualState) {
      manualState.textContent = this.manualSprayOverride ? "ACTIVE" : "OFF";
      manualState.classList.toggle("active", this.manualSprayOverride);
    }

    this.setTrackingStage(
      "pinch",
      res?.isPinching ? "active" : res ? "pass" : "waiting",
      res?.isPinching ? "ACTIVE" : res ? "OPEN" : "WAITING"
    );

    if (!cursor) return;
    cursor.classList.toggle("detected", handDetected);
    cursor.classList.toggle("pinching", Boolean(res?.isPinching));
    cursor.classList.toggle("manual", this.manualSprayOverride);
    cursor.classList.toggle(
      "spraying",
      Boolean(res && (res.isPinching || this.manualSprayOverride))
    );
    if (res) {
      cursor.style.left = `${res.x * 100}%`;
      cursor.style.top = `${res.y * 100}%`;
    }
  }

  private updateManualSprayIndicators() {
    if (this.inputMode !== "spatial") return;
    this.setSprayActive(Boolean(this.manualSprayOverride || this.lastHandResult?.isPinching));
    this.updateTrackingOverlay(this.lastHandResult);
  }

  private updateSprayStatus() {
    const statusBadge = document.getElementById("spray-status");
    const reason = this.manualSprayOverride
      ? "SPACE"
      : this.lastHandResult?.isPinching
        ? "PINCH"
        : this.inputMode === "mouse" && this.isSpraying
          ? "MOUSE"
        : null;
    if (statusBadge) {
      statusBadge.textContent = reason ? `SPRAYING · ${reason}` : "OFF";
      statusBadge.classList.toggle("on", Boolean(reason));
    }
    const compactSprayStatus = document.getElementById("performance-spray-status");
    if (compactSprayStatus) {
      compactSprayStatus.textContent = reason ? `SPRAY ${reason}` : "SPRAY OFF";
      compactSprayStatus.classList.toggle("on", Boolean(reason));
    }
    const audioStatus = document.getElementById("spray-audio-status");
    if (audioStatus) {
      audioStatus.textContent = this.isSpraying ? "HISS" : "QUIET";
      audioStatus.classList.toggle("on", this.isSpraying);
      audioStatus.classList.remove("error");
    }
  }

  private updateTrackingOverlayVisibility() {
    const overlay = document.getElementById("tracking-overlay");
    const panel = document.getElementById("tracking-debug-panel");
    overlay?.classList.toggle("visible", this.inputMode === "spatial");
    panel?.classList.toggle(
      "visible",
      this.inputMode === "spatial" && this.trackingDiagnosticsVisible && !this.performanceMode,
    );
  }

  private setTrackingStage(stage: string, state: string, value: string) {
    const row = document.querySelector<HTMLElement>(`[data-tracking-stage="${stage}"]`);
    if (!row) return;
    row.dataset.state = state;
    const valueElement = row.querySelector<HTMLElement>(".tracking-stage-value");
    if (valueElement) valueElement.textContent = value;
  }

  private resetTrackingDiagnostics() {
    this.mappedPointLogged = false;
    this.sprayDeliveryLogged = false;
    this.lastHandResult = null;
    this.updateTrackingOverlay(null);
    for (const stage of [
      "library",
      "frames",
      "callback",
      "landmarks",
      "mapping",
      "pinch",
      "spray",
    ]) {
      this.setTrackingStage(stage, "waiting", "WAITING");
    }
    const errorElement = document.getElementById("tracking-error");
    if (errorElement) {
      errorElement.textContent = "";
      errorElement.classList.remove("visible");
    }
  }

  private setSprayActive(active: boolean) {
    this.isSpraying = active;
    this.updateSprayStatus();
    void this.sprayCanAudio.setSpraying(active).catch((error) => {
      console.error("[Spatial Spraypaint] Spray audio failed", error);
      const audioStatus = document.getElementById("spray-audio-status");
      if (audioStatus) {
        audioStatus.textContent = "AUDIO ERROR";
        audioStatus.classList.add("error");
      }
    });
  }

  private toggleTrackingDiagnostics() {
    this.trackingDiagnosticsVisible = !this.trackingDiagnosticsVisible;
    this.updateUiChrome();
  }

  private togglePerformanceMode(force?: boolean) {
    this.performanceMode = force ?? !this.performanceMode;
    if (!this.performanceMode) this.controlsCollapsed = false;
    this.updateUiChrome();
  }

  private updateUiChrome() {
    const app = document.getElementById("app");
    const debugToggle = document.getElementById("toggle-tracking-debug") as HTMLButtonElement;
    const performanceToggle = document.getElementById(
      "toggle-performance-mode",
    ) as HTMLButtonElement;

    app?.classList.toggle("controls-collapsed", this.controlsCollapsed);
    app?.classList.toggle("performance-mode", this.performanceMode);
    debugToggle.textContent = this.trackingDiagnosticsVisible
      ? "Hide Tracking Debug (D)"
      : "Show Tracking Debug (D)";
    debugToggle.setAttribute("aria-pressed", this.trackingDiagnosticsVisible.toString());
    performanceToggle.textContent = this.performanceMode
      ? "Exit Performance Mode (P)"
      : "Performance Mode (P)";
    performanceToggle.setAttribute("aria-pressed", this.performanceMode.toString());
    this.updateTrackingOverlayVisibility();
  }

  private updateCapControls() {
    const capSelect = document.getElementById("cap-preset") as HTMLSelectElement;
    const performanceCapSelect = document.getElementById("performance-cap-preset") as HTMLSelectElement;
    const radiusInput = document.getElementById("brush-radius") as HTMLInputElement;
    const radiusValue = document.getElementById("radius-val");
    const compactCapStatus = document.getElementById("performance-cap-status");
    capSelect.value = this.selectedCap.id;
    performanceCapSelect.value = this.selectedCap.id;
    radiusInput.value = this.baseRadius.toString();
    if (radiusValue) radiusValue.textContent = this.baseRadius.toString();
    if (compactCapStatus) compactCapStatus.textContent = this.selectedCap.name.toUpperCase();
  }

  private updateBackgroundControls() {
    const backgroundSelect = document.getElementById("background-preset") as HTMLSelectElement;
    const performanceBackgroundSelect = document.getElementById("performance-background-preset") as HTMLSelectElement;
    backgroundSelect.value = this.selectedBackground.id;
    performanceBackgroundSelect.value = this.selectedBackground.id;
  }

  private async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn("[Spatial Spraypaint] Fullscreen is unavailable in this browser", error);
    }
  }

  private updateFullscreenControl() {
    const fullscreenButton = document.getElementById("toggle-fullscreen");
    if (fullscreenButton) {
      fullscreenButton.textContent = document.fullscreenElement
        ? "Exit Fullscreen"
        : "Enter Fullscreen";
    }
  }

  private async playCanRattle() {
    const status = document.getElementById("spray-audio-status");
    try {
      await this.sprayCanAudio.playRattle();
      if (status) {
        status.textContent = "RATTLE";
        status.classList.add("on");
      }
      window.setTimeout(() => this.updateSprayStatus(), 480);
    } catch (error) {
      console.error("[Spatial Spraypaint] Can rattle audio failed", error);
      if (status) {
        status.textContent = "AUDIO ERROR";
        status.classList.add("error");
      }
    }
  }

  private async toggleRecording() {
    if (!this.recorder.getIsRecording()) {
      let audioStream: MediaStream | undefined;
      try {
        await this.sprayCanAudio.unlock();
        audioStream = this.sprayCanAudio.getRecordingStream();
      } catch (error) {
        console.error("[Spatial Spraypaint] Recording audio mix unavailable", error);
      }
      this.recorder.start(this.compositeCanvas, audioStream);
      console.info(
        `[Spatial Spraypaint] Recording started (${audioStream?.getAudioTracks().length ?? 0} mixed audio track)`,
      );
      this.updateRecordingControls(true);
      return;
    }

    const blob = await this.recorder.stop();
    console.info(
      `[Spatial Spraypaint] Recording export ready (${blob.size} bytes, ${blob.type})`,
    );
    this.updateRecordingControls(false);
    this.downloadBlob(blob, `spatial-spraypaint-${Date.now()}.webm`);
  }

  private updateRecordingControls(recording: boolean) {
    const recordButton = document.getElementById("toggle-record") as HTMLButtonElement;
    const compactRecordButton = document.getElementById(
      "performance-record-toggle",
    ) as HTMLButtonElement;
    const compactStatus = document.getElementById("performance-record-status");
    recordButton.textContent = recording ? "Stop & Save Video" : "Record Performance";
    recordButton.classList.toggle("active", recording);
    compactRecordButton.textContent = recording ? "STOP + SAVE" : "RECORD";
    compactRecordButton.classList.toggle("active", recording);
    if (compactStatus) {
      compactStatus.textContent = recording ? "REC" : "READY";
      compactStatus.classList.toggle("recording", recording);
    }
  }

  private clearPaint() {
    this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
    this.brushEngine.clear();
    this.endStroke();
  }

  private endStroke(clearActivePoint = true) {
    this.strokeManager.reset();
    this.strokeSmoother.reset();
    this.dripAccumulator.reset();
    if (clearActivePoint) this.activeSprayPoint = null;
  }

  private depositActivePoint(now: number, force = false) {
    if (!this.isSpraying || !this.activeSprayPoint || (!force && now - this.lastDepositTimestamp < 28)) return;
    this.lastDepositTimestamp = now;
    this.processPoint(this.activeSprayPoint.x, this.activeSprayPoint.y, now);
  }

  private processPoint(x: number, y: number, timestamp: number) {
    const smoothed = this.strokeSmoother.smooth({ x, y }, this.smoothingLevel);
    const { point, interpolated, previous } = this.strokeManager.createPoint(
      smoothed.x,
      smoothed.y,
      this.baseRadius,
      0,
      timestamp,
    );
    let segmentStart = previous;
    for (const segmentEnd of [...interpolated, point]) {
      this.brushEngine.renderSegment(
        this.paintCtx,
        segmentStart,
        segmentEnd,
        this.selectedColor,
        this.selectedCap,
      );
      segmentStart = segmentEnd;
    }

    const drip = this.dripAccumulator.observe({
      x: point.x,
      y: point.y,
      radius: point.width,
      timestamp,
      dripTendency: this.selectedCap.dripTendency,
      enabled: this.dripsEnabled,
    });
    if (drip) this.brushEngine.startDrip(drip, this.selectedColor, timestamp);
  }

  private startRenderLoop() {
    const render = () => {
      const now = performance.now();
      this.depositActivePoint(now);
      this.brushEngine.advanceDrips(this.paintCtx, now);

      // 1. Clear composite canvas
      this.compositeCtx.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);

      this.compositeCtx.fillStyle = this.selectedBackground.color;
      this.compositeCtx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);

      // 2. Draw camera/background layer onto composite
      if (this.webcamActive && this.inputMode === "spatial") {
        this.anonymityProcessor.processFrame(
          this.compositeCtx,
          this.handTracker.getVideoElement(),
          this.anonymityMode,
          this.compositeCanvas.width,
          this.compositeCanvas.height
        );
      }

      // 3. Composite persistent spray paint layer on top
      this.compositeCtx.drawImage(this.paintCanvas, 0, 0);

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new SpatialSpraypaintApp();
});
