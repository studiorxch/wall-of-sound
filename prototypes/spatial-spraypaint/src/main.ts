import { InputSourceMode, AnonymityMode } from "./types";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import { SprayBrushEngine } from "./SprayBrushEngine";
import { HandTracker, HandTrackingResult } from "./HandTracker";
import { AnonymityProcessor } from "./AnonymityProcessor";
import { PerformanceRecorder } from "./PerformanceRecorder";

class SpatialSpraypaintApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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
  private webcamActive = false;

  private audioCtx: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;

  constructor() {
    this.canvas = document.getElementById("composite-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.initResize();
    this.bindControls();
    this.bindMouseEvents();
    this.startRenderLoop();
  }

  private initResize() {
    const handleResize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.brushEngine.resize(this.canvas.width, this.canvas.height);
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
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.brushEngine.clear();
    });

    toggleRecordBtn.addEventListener("click", async () => {
      if (!this.recorder.getIsRecording()) {
        this.recorder.start(this.canvas);
        toggleRecordBtn.textContent = "Stop & Save Video";
        toggleRecordBtn.style.background = "#ff3366";
      } else {
        const blob = await this.recorder.stop();
        toggleRecordBtn.textContent = "Record Performance";
        toggleRecordBtn.style.background = "#cc1100";
        this.downloadBlob(blob, `spatial-spraypaint-${Date.now()}.webm`);
      }
    });

    // Audio setup
    const audioInput = document.getElementById("audio-file") as HTMLInputElement;
    const playBtn = document.getElementById("play-audio") as HTMLButtonElement;
    const stopBtn = document.getElementById("stop-audio") as HTMLButtonElement;

    audioInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (this.audioElement) this.audioElement.pause();
        this.audioElement = new Audio(URL.createObjectURL(file));
        playBtn.disabled = false;
        stopBtn.disabled = false;
      }
    });

    playBtn.addEventListener("click", () => this.audioElement?.play());
    stopBtn.addEventListener("click", () => {
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      }
    });
  }

  private bindMouseEvents() {
    this.canvas.addEventListener("mousedown", (e) => {
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

  private handleHandTrackingResult(res: HandTrackingResult | null) {
    const statusBadge = document.getElementById("spray-status");

    if (!res || this.inputMode !== "spatial") {
      this.isSpraying = false;
      if (statusBadge) {
        statusBadge.textContent = "OFF";
        statusBadge.classList.remove("on");
      }
      return;
    }

    this.isSpraying = res.isPinching;

    if (statusBadge) {
      statusBadge.textContent = res.isPinching ? "SPRAYING" : "OFF";
      if (res.isPinching) statusBadge.classList.add("on");
      else statusBadge.classList.remove("on");
    }

    if (this.isSpraying) {
      const px = res.x * this.canvas.width;
      const py = res.y * this.canvas.height;
      this.processPoint(px, py);
    } else {
      this.strokeManager.reset();
    }
  }

  private processPoint(x: number, y: number) {
    const { point, interpolated } = this.strokeManager.createPoint(x, y, this.baseRadius);

    for (const p of interpolated) {
      this.brushEngine.renderPoint(this.ctx, p, this.selectedColor);
    }
    this.brushEngine.renderPoint(this.ctx, point, this.selectedColor);
  }

  private startRenderLoop() {
    const render = () => {
      // 1. Render camera anonymity background layer if active
      if (this.webcamActive && this.inputMode === "spatial") {
        this.anonymityProcessor.processFrame(
          this.ctx,
          this.handTracker.getVideoElement(),
          this.anonymityMode,
          this.canvas.width,
          this.canvas.height
        );
      }

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
