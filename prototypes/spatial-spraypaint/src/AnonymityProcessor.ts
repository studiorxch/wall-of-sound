import { AnonymityMode } from "./types";

export class AnonymityProcessor {
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor() {
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d")!;
  }

  public processFrame(
    destCtx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    mode: AnonymityMode,
    width: number,
    height: number
  ) {
    if (mode === "hidden" || videoEl.readyState < 2) {
      return; // Do not render camera background layer
    }

    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;

    destCtx.save();
    
    // Mirror background horizontally for intuitive performer experience
    destCtx.translate(width, 0);
    destCtx.scale(-1, 1);

    switch (mode) {
      case "clean":
        destCtx.drawImage(videoEl, 0, 0, width, height);
        break;

      case "ghost":
        destCtx.filter = "blur(18px) opacity(0.7)";
        destCtx.drawImage(videoEl, 0, 0, width, height);
        destCtx.filter = "none";
        break;

      case "pixel":
        const pixelSize = 24;
        const smallW = Math.max(1, Math.floor(width / pixelSize));
        const smallH = Math.max(1, Math.floor(height / pixelSize));
        this.offscreenCtx.drawImage(videoEl, 0, 0, smallW, smallH);
        destCtx.imageSmoothingEnabled = false;
        destCtx.drawImage(this.offscreenCanvas, 0, 0, smallW, smallH, 0, 0, width, height);
        destCtx.imageSmoothingEnabled = true;
        break;

      case "silhouette":
        destCtx.filter = "brightness(0.3) contrast(2.5) grayscale(1)";
        destCtx.drawImage(videoEl, 0, 0, width, height);
        destCtx.filter = "none";
        break;

      case "chromatic":
        // RGB split effect
        destCtx.globalCompositeOperation = "screen";
        destCtx.drawImage(videoEl, -6, 0, width, height);
        destCtx.drawImage(videoEl, 6, 0, width, height);
        destCtx.globalCompositeOperation = "source-over";
        break;
    }

    destCtx.restore();
  }
}
