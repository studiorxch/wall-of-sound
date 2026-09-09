import {
  SelfieSegmentation,
  VERSION as SEGMENTATION_VERSION,
  type Results,
} from "@mediapipe/selfie_segmentation";

const SEGMENTATION_ASSET_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747";
export const SEGMENTATION_INTERVAL_MS = 125;
export const SEGMENTATION_DRAWING_INTERVAL_MS = 250;
const MASK_WIDTH = 256;
const MASK_HEIGHT = 144;

export type SegmentationPhase = "idle" | "loading" | "ready" | "error";

export interface SegmentationDiagnostics {
  phase: SegmentationPhase;
  message: string;
  results: number;
  lastInferenceMs: number | null;
}

export function shouldRequestSegmentation(options: {
  now: number;
  lastRequestAt: number;
  inFlight: boolean;
  ready: boolean;
  videoReady: boolean;
  minimumIntervalMs?: number;
}): boolean {
  return options.ready
    && options.videoReady
    && !options.inFlight
    && options.now - options.lastRequestAt >= (options.minimumIntervalMs ?? SEGMENTATION_INTERVAL_MS);
}

export class PersonSegmenter {
  private segmenter: SelfieSegmentation | null = null;
  private readonly maskCanvas = document.createElement("canvas");
  private readonly maskCtx = this.maskCanvas.getContext("2d")!;
  private diagnostics: SegmentationDiagnostics = {
    phase: "idle",
    message: "SEGMENTATION IDLE",
    results: 0,
    lastInferenceMs: null,
  };
  private onDiagnostics: ((diagnostics: SegmentationDiagnostics) => void) | null = null;
  private inFlight = false;
  private lastRequestAt = -SEGMENTATION_INTERVAL_MS;
  private requestStartedAt = 0;
  private hasMask = false;

  constructor() {
    this.maskCanvas.width = MASK_WIDTH;
    this.maskCanvas.height = MASK_HEIGHT;
  }

  public async initialize(
    onDiagnostics?: (diagnostics: SegmentationDiagnostics) => void,
  ): Promise<void> {
    this.onDiagnostics = onDiagnostics ?? null;
    if (this.diagnostics.phase === "ready") {
      this.emitDiagnostics();
      return;
    }
    this.updateDiagnostics({
      phase: "loading",
      message: "LOADING SEGMENTATION…",
    });
    try {
      console.info(
        `[Spatial Spraypaint] MediaPipe Selfie Segmentation library loaded (${SEGMENTATION_VERSION})`,
      );
      this.segmenter = new SelfieSegmentation({
        locateFile: (file: string) => `${SEGMENTATION_ASSET_ROOT}/${file}`,
      });
      this.segmenter.setOptions({ selfieMode: false, modelSelection: 1 });
      this.segmenter.onResults((results) => this.handleResults(results));
      await this.segmenter.initialize();
      console.info("[Spatial Spraypaint] Person segmenter initialized (landscape model, 8 fps maximum)");
      this.updateDiagnostics({ phase: "ready", message: "SEGMENTATION READY · 8 FPS MAX" });
    } catch (error) {
      this.fail("Person segmentation could not initialize. Environment returned to Original.", error);
      throw error;
    }
  }

  public async requestFrame(video: HTMLVideoElement, now: number, drawingActive = false): Promise<void> {
    if (!shouldRequestSegmentation({
      now,
      lastRequestAt: this.lastRequestAt,
      inFlight: this.inFlight,
      ready: this.diagnostics.phase === "ready",
      videoReady: video.readyState >= 2,
      minimumIntervalMs: drawingActive ? SEGMENTATION_DRAWING_INTERVAL_MS : SEGMENTATION_INTERVAL_MS,
    }) || !this.segmenter) return;

    this.inFlight = true;
    this.lastRequestAt = now;
    this.requestStartedAt = performance.now();
    try {
      await this.segmenter.send({ image: video });
    } catch (error) {
      this.fail("Person segmentation failed. Environment returned to Original.", error);
    } finally {
      this.inFlight = false;
    }
  }

  public getMask(): HTMLCanvasElement | null {
    return this.hasMask && this.diagnostics.phase === "ready" ? this.maskCanvas : null;
  }

  public getDiagnostics(): SegmentationDiagnostics {
    return { ...this.diagnostics };
  }

  private handleResults(results: Results): void {
    this.maskCtx.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    this.maskCtx.drawImage(results.segmentationMask, 0, 0, MASK_WIDTH, MASK_HEIGHT);
    this.hasMask = true;
    const inferenceMs = performance.now() - this.requestStartedAt;
    this.updateDiagnostics({
      results: this.diagnostics.results + 1,
      lastInferenceMs: inferenceMs,
      message: `SEGMENTATION READY · ${Math.round(inferenceMs)}MS · 8 FPS MAX`,
    });
  }

  private fail(message: string, error: unknown): void {
    console.error(`[Spatial Spraypaint] ${message}`, error);
    this.hasMask = false;
    this.updateDiagnostics({ phase: "error", message });
  }

  private updateDiagnostics(update: Partial<SegmentationDiagnostics>): void {
    this.diagnostics = { ...this.diagnostics, ...update };
    this.emitDiagnostics();
  }

  private emitDiagnostics(): void {
    this.onDiagnostics?.({ ...this.diagnostics });
  }
}
