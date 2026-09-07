import { InputSourceMode, AnonymityMode } from "./types";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import { SprayBrushEngine } from "./SprayBrushEngine";
import { HandTracker, HandTrackingResult } from "./HandTracker";
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

    inputSelect.addEventListener("change", (e) => {
      this.inputMode = (e.target as HTMLSelectElement).value as InputSourceMode;
      webcamControls.style.display = this.inputMode === "spatial" ? "flex" : "none";
      this.strokeManager.reset();
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
      if (!this.webcamActive) {
        await this.handTracker.initialize((res) => this.handleHandTrackingResult(res));
        await this.handTracker.start();
        this.webcamActive = true;
        toggleWebcamBtn.textContent = "Stop Camera";
        toggleWebcamBtn.classList.add("active");
      } else {
        this.handTracker.stop();
        this.webcamActive = false;
        toggleWebcamBtn.textContent = "Start Camera";
        toggleWebcamBtn.classList.remove("active");
      }
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
    });
    window.addEventListener("mouseup", () => {
      this.manualSprayOverride = false;
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
        this.manualSprayOverride = true;
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.manualSprayOverride = false;
      }
    });
  }

  private handleHandTrackingResult(res: HandTrackingResult | null) {
    const statusBadge = document.getElementById("spray-status");

    if (!res || this.inputMode !== "spatial") {
      this.isSpraying = this.manualSprayOverride;
      if (statusBadge) {
        statusBadge.textContent = this.isSpraying ? "SPRAYING" : "OFF";
        if (this.isSpraying) statusBadge.classList.add("on");
        else statusBadge.classList.remove("on");
      }
      return;
    }

    this.isSpraying = res.isPinching || this.manualSprayOverride;

    if (statusBadge) {
      statusBadge.textContent = this.isSpraying ? "SPRAYING" : "OFF";
      if (this.isSpraying) statusBadge.classList.add("on");
      else statusBadge.classList.remove("on");
    }

    if (this.isSpraying) {
      const px = res.x * this.compositeCanvas.width;
      const py = res.y * this.compositeCanvas.height;
      this.processPoint(px, py);
    } else {
      this.strokeManager.reset();
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
