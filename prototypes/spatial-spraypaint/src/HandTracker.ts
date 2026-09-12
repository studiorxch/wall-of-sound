import { Camera } from "@mediapipe/camera_utils";
import {
  Hands,
  VERSION as HANDS_VERSION,
  type NormalizedLandmark,
  type Results,
} from "@mediapipe/hands";
import {
  HandTrackingReliabilityMonitor,
  type HandTrackingReliabilitySnapshot,
} from "./HandTrackingReliability";

const HANDS_ASSET_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240";
const PINCH_THRESHOLD = 0.08;

export interface HandTrackingResult {
  aimX: number;
  aimY: number;
  x: number;
  y: number;
  pinchDist: number;
  isPinching: boolean;
  confidence: number;
  timestamp: number;
}

export interface HandTrackingCoordinateState {
  x: number;
  y: number;
  initialized: boolean;
}

export interface ResolvedHandTrackingCoordinates {
  aim: { x: number; y: number };
  stroke: { x: number; y: number };
  state: HandTrackingCoordinateState;
}

export interface HandTrackingDiagnostics {
  libraryLoaded: boolean;
  trackerInitialized: boolean;
  cameraStarted: boolean;
  videoFramesReceived: number;
  resultsCallbacks: number;
  landmarksDetected: boolean;
  reliability: HandTrackingReliabilitySnapshot;
  error: string | null;
}

export type HandTrackingDiagnosticCallback = (diagnostics: HandTrackingDiagnostics) => void;

export function calculatePinchDistance(
  indexTip: Pick<NormalizedLandmark, "x" | "y">,
  thumbTip: Pick<NormalizedLandmark, "x" | "y">,
): number {
  return Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
}

export function isPinchActive(distance: number): boolean {
  return distance < PINCH_THRESHOLD;
}

export function mapMirroredFingertip(
  indexTip: Pick<NormalizedLandmark, "x" | "y">,
): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, 1 - indexTip.x)),
    y: Math.min(1, Math.max(0, indexTip.y)),
  };
}

export function resolveHandTrackingCoordinates(
  mapped: { x: number; y: number },
  previous: HandTrackingCoordinateState,
  strokeResponse = 0.35,
): ResolvedHandTrackingCoordinates {
  const response = Math.max(0, Math.min(1, strokeResponse));
  const stroke = previous.initialized
    ? {
      x: previous.x + (mapped.x - previous.x) * response,
      y: previous.y + (mapped.y - previous.y) * response,
    }
    : { ...mapped };
  return {
    aim: { ...mapped },
    stroke,
    state: { ...stroke, initialized: true },
  };
}

export class HandTracker {
  private readonly videoElement: HTMLVideoElement;
  private handsInstance: Hands | null = null;
  private cameraInstance: Camera | null = null;
  private onResultCallback: ((res: HandTrackingResult | null) => void) | null = null;
  private onDiagnosticCallback: HandTrackingDiagnosticCallback | null = null;
  private smoothX = 0;
  private smoothY = 0;
  private hasSmoothedPoint = false;
  private active = false;
  private resultsCallbackLogged = false;
  private handWasDetected = false;
  private lastPinchState: boolean | null = null;
  private readonly reliabilityMonitor = new HandTrackingReliabilityMonitor();
  private diagnostics: HandTrackingDiagnostics = {
    libraryLoaded: false,
    trackerInitialized: false,
    cameraStarted: false,
    videoFramesReceived: 0,
    resultsCallbacks: 0,
    landmarksDetected: false,
    reliability: this.reliabilityMonitor.snapshot(),
    error: null,
  };

  constructor() {
    this.videoElement = document.createElement("video");
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.setAttribute("playsinline", "true");
  }

  public async initialize(
    onResult: (res: HandTrackingResult | null) => void,
    onDiagnostic?: HandTrackingDiagnosticCallback,
  ): Promise<void> {
    this.onResultCallback = onResult;
    this.onDiagnosticCallback = onDiagnostic ?? null;
    this.reliabilityMonitor.reset();
    this.updateDiagnostics({ error: null, reliability: this.reliabilityMonitor.snapshot() });

    if (this.handsInstance && this.cameraInstance) {
      this.emitDiagnostics();
      return;
    }

    try {
      console.info(
        `[Spatial Spraypaint] MediaPipe library loaded (Hands ${HANDS_VERSION}, Camera Utils)`,
      );
      this.updateDiagnostics({ libraryLoaded: true });

      this.handsInstance = new Hands({
        locateFile: (file: string) => `${HANDS_ASSET_ROOT}/${file}`,
      });
      this.handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      this.handsInstance.onResults((results) => this.handleResults(results));
      await this.handsInstance.initialize();

      console.info("[Spatial Spraypaint] MediaPipe hand tracker initialized");
      this.updateDiagnostics({ trackerInitialized: true });

      this.cameraInstance = new Camera(this.videoElement, {
        onFrame: async () => {
          if (!this.active || !this.handsInstance) return;
          const firstFrame = this.diagnostics.videoFramesReceived === 0;
          this.updateDiagnostics({
            videoFramesReceived: this.diagnostics.videoFramesReceived + 1,
            reliability: this.reliabilityMonitor.recordFrame(performance.now()),
          });
          if (firstFrame) {
            console.info("[Spatial Spraypaint] Camera frames reaching MediaPipe");
          }

          try {
            await this.handsInstance.send({ image: this.videoElement });
          } catch (error) {
            this.reportError("MediaPipe could not process the camera frame.", error);
          }
        },
        facingMode: "user",
        width: 640,
        height: 480,
      });
    } catch (error) {
      this.handsInstance = null;
      this.cameraInstance = null;
      this.reportError(
        "MediaPipe hand tracking failed to initialize. Check the network and reload the prototype.",
        error,
      );
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (!this.handsInstance || !this.cameraInstance) {
      const error = new Error("Hand tracker must initialize before the camera starts.");
      this.reportError(error.message, error);
      throw error;
    }

    try {
      this.active = true;
      await this.cameraInstance.start();
      console.info("[Spatial Spraypaint] Camera started");
      this.updateDiagnostics({ cameraStarted: true });
    } catch (error) {
      this.active = false;
      this.reportError(
        "The camera could not start. Allow camera access and try again.",
        error,
      );
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.active = false;
    if (this.cameraInstance) await this.cameraInstance.stop();
    this.handWasDetected = false;
    this.hasSmoothedPoint = false;
    this.updateDiagnostics({ cameraStarted: false });
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  private handleResults(results: Results): void {
    const timestamp = performance.now();
    const hasLandmarks = Boolean(results.multiHandLandmarks?.length);
    this.updateDiagnostics({
      resultsCallbacks: this.diagnostics.resultsCallbacks + 1,
      reliability: this.reliabilityMonitor.recordResult(timestamp, hasLandmarks),
    });
    if (!this.resultsCallbackLogged) {
      this.resultsCallbackLogged = true;
      console.info("[Spatial Spraypaint] MediaPipe results callback firing");
    }

    if (!hasLandmarks) {
      this.handWasDetected = false;
      this.lastPinchState = null;
      this.onResultCallback?.(null);
      return;
    }

    if (!this.handWasDetected) {
      console.info("[Spatial Spraypaint] Hand landmarks detected");
      this.handWasDetected = true;
    }
    this.updateDiagnostics({ landmarksDetected: true });

    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    if (!indexTip || !thumbTip) {
      this.reportError("MediaPipe returned incomplete hand landmarks.");
      this.onResultCallback?.(null);
      return;
    }

    const mapped = mapMirroredFingertip(indexTip);
    const coordinates = resolveHandTrackingCoordinates(mapped, {
      x: this.smoothX,
      y: this.smoothY,
      initialized: this.hasSmoothedPoint,
    });
    this.smoothX = coordinates.state.x;
    this.smoothY = coordinates.state.y;
    this.hasSmoothedPoint = coordinates.state.initialized;

    const pinchDist = calculatePinchDistance(indexTip, thumbTip);
    const isPinching = isPinchActive(pinchDist);
    this.updateDiagnostics({
      reliability: this.reliabilityMonitor.recordLandmark(timestamp, mapped, isPinching),
    });
    if (isPinching !== this.lastPinchState) {
      console.info(
        `[Spatial Spraypaint] Pinch state ${isPinching ? "ACTIVE" : "OPEN"} (${pinchDist.toFixed(3)})`,
      );
      this.lastPinchState = isPinching;
    }

    this.onResultCallback?.({
      aimX: coordinates.aim.x,
      aimY: coordinates.aim.y,
      x: this.smoothX,
      y: this.smoothY,
      pinchDist,
      isPinching,
      confidence: results.multiHandedness?.[0]?.score ?? 0,
      timestamp,
    });
  }

  private updateDiagnostics(update: Partial<HandTrackingDiagnostics>): void {
    this.diagnostics = { ...this.diagnostics, ...update };
    this.emitDiagnostics();
  }

  private emitDiagnostics(): void {
    this.onDiagnosticCallback?.({ ...this.diagnostics });
  }

  private reportError(message: string, error?: unknown): void {
    console.error(`[Spatial Spraypaint] ${message}`, error ?? "");
    this.updateDiagnostics({ error: message });
  }
}
