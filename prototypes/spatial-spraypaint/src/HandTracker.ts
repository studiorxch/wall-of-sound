export interface HandTrackingResult {
  x: number;
  y: number;
  pinchDist: number;
  isPinching: boolean;
  confidence: number;
}

export class HandTracker {
  private videoElement: HTMLVideoElement;
  private handsInstance: any = null;
  private cameraInstance: any = null;
  private onResultCallback: ((res: HandTrackingResult | null) => void) | null = null;
  private smoothX = 0;
  private smoothY = 0;
  private active = false;

  constructor() {
    this.videoElement = document.createElement("video");
    this.videoElement.setAttribute("playsinline", "true");
  }

  public async initialize(onResult: (res: HandTrackingResult | null) => void) {
    this.onResultCallback = onResult;

    // Use MediaPipe Hands global from CDN script tag
    const mpHands = (window as any).Hands;
    const mpCamera = (window as any).Camera;

    if (!mpHands) {
      console.error("MediaPipe Hands library not loaded from CDN");
      return;
    }

    this.handsInstance = new mpHands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.handsInstance.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    this.handsInstance.onResults(this.handleResults.bind(this));

    this.cameraInstance = new mpCamera(this.videoElement, {
      onFrame: async () => {
        if (this.active) {
          await this.handsInstance.send({ image: this.videoElement });
        }
      },
      width: 640,
      height: 480,
    });
  }

  public async start() {
    this.active = true;
    if (this.cameraInstance) {
      await this.cameraInstance.start();
    }
  }

  public stop() {
    this.active = false;
    if (this.cameraInstance) {
      this.cameraInstance.stop();
    }
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  private handleResults(results: any) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      if (this.onResultCallback) this.onResultCallback(null);
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Mirroring horizontal axis so user movement matches natural mirror action
    const rawX = 1 - indexTip.x;
    const rawY = indexTip.y;

    // Exponential smoothing to eliminate camera tracking jitter
    this.smoothX = this.smoothX * 0.65 + rawX * 0.35;
    this.smoothY = this.smoothY * 0.65 + rawY * 0.35;

    // Calculate pinch distance between index tip and thumb tip
    const dx = indexTip.x - thumbTip.x;
    const dy = indexTip.y - thumbTip.y;
    const pinchDist = Math.sqrt(dx * dx + dy * dy);

    // Threshold pinch gesture (pinch = spray on)
    const isPinching = pinchDist < 0.08;

    if (this.onResultCallback) {
      this.onResultCallback({
        x: this.smoothX,
        y: this.smoothY,
        pinchDist,
        isPinching,
        confidence: results.multiHandedness?.[0]?.score || 1.0,
      });
    }
  }
}
