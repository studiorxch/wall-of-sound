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

  private inputMode: InputSourceMode = "mouse";
  private anonymityMode: AnonymityMode = "hidden";
  private selectedColor = "#ff2a5f";
  private baseRadius = 28;
  private isSpraying = false;
  private manualSprayOverride = false;
  private webcamActive = false;
  private trackingOverlayEnabled = true;
  private lastHandResult: HandTrackingResult | null = null;
  private mappedPointLogged = false;
  private sprayDeliveryLogged = false;

  private audioCtx: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioStreamDestination: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    this.compositeCanvas = document.getElementById("composite-canvas") as HTMLCanvasElement;
    this.compositeCtx = this.compositeCanvas.getContext("2d")!;

    this.paintCanvas = document.createElement("canvas");
    this.paintCtx = this.paintCanvas.getContext("2d")!;

    this.initResize();
    this.bindControls();
    this.bindMouseEvents();
    this.bindKeyboardFallback();
    this.updateTrackingOverlayVisibility();
    this.updateTrackingOverlay(null);
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
    const toggleWebcamBtn = document.getElementById("toggle-webcam") as HTMLButtonElement;
    const clearBtn = document.getElementById("clear-canvas")!;
    const toggleRecordBtn = document.getElementById("toggle-record") as HTMLButtonElement;
    const webcamControls = document.getElementById("webcam-controls")!;
    const manualSprayBtn = document.getElementById("manual-spray-trigger")!;
    const toggleTrackingDebugBtn = document.getElementById(
      "toggle-tracking-debug"
    ) as HTMLButtonElement;

    inputSelect.addEventListener("change", (e) => {
      this.inputMode = (e.target as HTMLSelectElement).value as InputSourceMode;
      webcamControls.style.display = this.inputMode === "spatial" ? "flex" : "none";
      this.strokeManager.reset();
      this.updateTrackingOverlayVisibility();
      this.updateTrackingOverlay(this.inputMode === "spatial" ? this.lastHandResult : null);
    });

    anonymitySelect.addEventListener("change", (e) => {
      this.anonymityMode = (e.target as HTMLSelectElement).value as AnonymityMode;
    });

    radiusInput.addEventListener("input", (e) => {
      this.baseRadius = parseInt((e.target as HTMLInputElement).value, 10);
      radiusVal.textContent = this.baseRadius.toString();
    });

    document.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.addEventListener("click", (e) => {
        document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
        const el = e.currentTarget as HTMLElement;
        el.classList.add("selected");
        this.selectedColor = el.dataset.color || "#ff2a5f";
      });
    });

    toggleWebcamBtn.addEventListener("click", async () => {
      toggleWebcamBtn.disabled = true;
      try {
        if (!this.webcamActive) {
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
      this.trackingOverlayEnabled = !this.trackingOverlayEnabled;
      toggleTrackingDebugBtn.textContent = this.trackingOverlayEnabled
        ? "Hide Tracking Debug"
        : "Show Tracking Debug";
      toggleTrackingDebugBtn.setAttribute(
        "aria-pressed",
        this.trackingOverlayEnabled.toString()
      );
      this.updateTrackingOverlayVisibility();
    });

    clearBtn.addEventListener("click", () => {
      this.paintCtx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
      this.brushEngine.clear();
    });

    toggleRecordBtn.addEventListener("click", async () => {
      if (!this.recorder.getIsRecording()) {
        const audioStream = this.audioStreamDestination?.stream;
        this.recorder.start(this.compositeCanvas, audioStream);
        toggleRecordBtn.textContent = "Stop & Save Video";
        toggleRecordBtn.style.background = "#ff3366";
      } else {
        const blob = await this.recorder.stop();
        toggleRecordBtn.textContent = "Record Performance";
        toggleRecordBtn.style.background = "#cc1100";
        this.downloadBlob(blob, `spatial-spraypaint-${Date.now()}.webm`);
      }
    });

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

        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = this.audioCtx.createMediaElementSource(this.audioElement);
        this.audioStreamDestination = this.audioCtx.createMediaStreamDestination();

        // Connect both to local speakers and stream destination
        source.connect(this.audioCtx.destination);
        source.connect(this.audioStreamDestination);

        playBtn.disabled = false;
        stopBtn.disabled = false;
      }
    });

    playBtn.addEventListener("click", () => {
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      this.audioElement?.play();
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
      this.isSpraying = true;
      this.strokeManager.reset();
      this.processPoint(e.clientX, e.clientY);
    });

    window.addEventListener("mousemove", (e) => {
      if (this.inputMode !== "mouse" || !this.isSpraying) return;
      this.processPoint(e.clientX, e.clientY);
    });

    window.addEventListener("mouseup", () => {
      if (this.inputMode !== "mouse") return;
      this.isSpraying = false;
      this.strokeManager.reset();
    });
  }

  private bindKeyboardFallback() {
    window.addEventListener("keydown", (e) => {
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
      this.isSpraying = this.manualSprayOverride;
      this.updateSprayStatus();
      return;
    }

    this.isSpraying = res.isPinching || this.manualSprayOverride;
    this.updateSprayStatus();

    const px = res.x * this.compositeCanvas.width;
    const py = res.y * this.compositeCanvas.height;
    if (!this.mappedPointLogged) {
      this.mappedPointLogged = true;
      console.info(
        `[Spatial Spraypaint] Fingertip mapped to canvas (${Math.round(px)}, ${Math.round(py)})`
      );
    }
    this.setTrackingStage("mapping", "pass", `${Math.round(px)}, ${Math.round(py)}`);

    if (this.isSpraying) {
      this.processPoint(px, py);
      this.setTrackingStage("spray", "pass", "POINT RECEIVED");
      if (!this.sprayDeliveryLogged) {
        this.sprayDeliveryLogged = true;
        console.info("[Spatial Spraypaint] Spray engine received tracked point");
      }
    } else {
      this.strokeManager.reset();
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
    this.isSpraying = Boolean(
      this.manualSprayOverride || this.lastHandResult?.isPinching
    );
    this.updateTrackingOverlay(this.lastHandResult);
    this.updateSprayStatus();
  }

  private updateSprayStatus() {
    const statusBadge = document.getElementById("spray-status");
    if (!statusBadge) return;

    const reason = this.manualSprayOverride
      ? "SPACE"
      : this.lastHandResult?.isPinching
        ? "PINCH"
        : null;
    statusBadge.textContent = reason ? `SPRAYING · ${reason}` : "OFF";
    statusBadge.classList.toggle("on", Boolean(reason));
  }

  private updateTrackingOverlayVisibility() {
    const overlay = document.getElementById("tracking-overlay");
    overlay?.classList.toggle(
      "visible",
      this.inputMode === "spatial" && this.trackingOverlayEnabled
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

  private processPoint(x: number, y: number) {
    const { point, interpolated } = this.strokeManager.createPoint(x, y, this.baseRadius);

    // Draw spray persistent paint onto dedicated paint canvas
    for (const p of interpolated) {
      this.brushEngine.renderPoint(this.paintCtx, p, this.selectedColor);
    }
    this.brushEngine.renderPoint(this.paintCtx, point, this.selectedColor);
  }

  private startRenderLoop() {
    const render = () => {
      // 1. Clear composite canvas
      this.compositeCtx.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);

      // 2. Draw camera/background layer onto composite
      if (this.webcamActive && this.inputMode === "spatial") {
        this.anonymityProcessor.processFrame(
          this.compositeCtx,
          this.handTracker.getVideoElement(),
          this.anonymityMode,
          this.compositeCanvas.width,
          this.compositeCanvas.height
        );
      } else {
        // Dark neutral background for Hidden/Mouse mode
        this.compositeCtx.fillStyle = "#050508";
        this.compositeCtx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
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
