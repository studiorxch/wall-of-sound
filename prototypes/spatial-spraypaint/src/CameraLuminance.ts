export const CAMERA_LUMINANCE_INTERVAL_MS = 500;
const SAMPLE_WIDTH = 16;
const SAMPLE_HEIGHT = 12;

export function calculateAverageLuminance(pixels: Uint8ClampedArray): number | null {
  if (pixels.length < 4) return null;
  let total = 0;
  let samples = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    total += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    samples += 1;
  }
  return samples > 0 ? total / samples / 255 : null;
}

export class CameraLuminanceSampler {
  private readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private lastSampleAt = -CAMERA_LUMINANCE_INTERVAL_MS;
  private luminance: number | null = null;

  constructor() {
    this.canvas.width = SAMPLE_WIDTH;
    this.canvas.height = SAMPLE_HEIGHT;
  }

  public sample(video: HTMLVideoElement, now: number): number | null {
    if (video.readyState < 2 || now - this.lastSampleAt < CAMERA_LUMINANCE_INTERVAL_MS) {
      return this.luminance;
    }
    this.lastSampleAt = now;
    this.context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    this.luminance = calculateAverageLuminance(
      this.context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data,
    );
    return this.luminance;
  }

  public reset(): void {
    this.lastSampleAt = -CAMERA_LUMINANCE_INTERVAL_MS;
    this.luminance = null;
  }
}
