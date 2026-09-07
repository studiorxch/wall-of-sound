import { AnonymityMode } from "./types";

const SILHOUETTE_SAMPLE_MAX_WIDTH = 320;
const SILHOUETTE_SAMPLE_MAX_HEIGHT = 240;

export function calculateSilhouetteThreshold(pixels: Uint8ClampedArray): number {
  if (pixels.length < 4) return 112;

  let luminanceTotal = 0;
  let pixelCount = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    luminanceTotal +=
      pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    pixelCount += 1;
  }

  return Math.min(170, Math.max(72, (luminanceTotal / pixelCount) * 0.92));
}

export function applySilhouettePosterization(
  pixels: Uint8ClampedArray,
  threshold: number,
): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    const isShadow = luminance < threshold;

    pixels[index] = isShadow ? 5 : 218;
    pixels[index + 1] = isShadow ? 7 : 214;
    pixels[index + 2] = isShadow ? 12 : 202;
    pixels[index + 3] = 255;
  }
}

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
        this.resizeOffscreen(smallW, smallH);
        this.offscreenCtx.drawImage(videoEl, 0, 0, smallW, smallH);
        destCtx.imageSmoothingEnabled = false;
        destCtx.drawImage(this.offscreenCanvas, 0, 0, smallW, smallH, 0, 0, width, height);
        destCtx.imageSmoothingEnabled = true;
        break;

      case "silhouette":
        this.drawSilhouette(destCtx, videoEl, width, height);
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

  private drawSilhouette(
    destCtx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    width: number,
    height: number,
  ): void {
    const scale = Math.min(
      1,
      SILHOUETTE_SAMPLE_MAX_WIDTH / width,
      SILHOUETTE_SAMPLE_MAX_HEIGHT / height,
    );
    const sampleWidth = Math.max(1, Math.round(width * scale));
    const sampleHeight = Math.max(1, Math.round(height * scale));
    this.resizeOffscreen(sampleWidth, sampleHeight);
    this.offscreenCtx.drawImage(videoEl, 0, 0, sampleWidth, sampleHeight);

    const frame = this.offscreenCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const threshold = calculateSilhouetteThreshold(frame.data);
    applySilhouettePosterization(frame.data, threshold);
    this.offscreenCtx.putImageData(frame, 0, 0);

    destCtx.imageSmoothingEnabled = false;
    destCtx.drawImage(
      this.offscreenCanvas,
      0,
      0,
      sampleWidth,
      sampleHeight,
      0,
      0,
      width,
      height,
    );
    destCtx.imageSmoothingEnabled = true;
  }

  private resizeOffscreen(width: number, height: number): void {
    if (this.offscreenCanvas.width !== width) this.offscreenCanvas.width = width;
    if (this.offscreenCanvas.height !== height) this.offscreenCanvas.height = height;
  }
}
