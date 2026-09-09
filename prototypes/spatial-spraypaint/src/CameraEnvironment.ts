import { AnonymityProcessor } from "./AnonymityProcessor";
import { type AnonymityMode } from "./types";

export type CameraEnvironmentMode = "original" | "blur" | "solid" | "image";

export interface CameraEnvironmentState {
  mode: CameraEnvironmentMode;
  solidColor: string;
  image: HTMLImageElement | null;
}

export interface CoverRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function needsPersonSegmentation(
  personTreatment: AnonymityMode,
  environmentMode: CameraEnvironmentMode,
): boolean {
  return personTreatment !== "clean" || environmentMode !== "original";
}

export function calculateCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): CoverRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, width: destinationWidth, height: destinationHeight };
  }
  const scale = Math.max(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (destinationWidth - width) / 2,
    y: (destinationHeight - height) / 2,
    width,
    height,
  };
}

export function effectiveEnvironmentMode(
  requested: CameraEnvironmentMode,
  hasMask: boolean,
  hasImage: boolean,
): CameraEnvironmentMode {
  if (!hasMask || (requested === "image" && !hasImage)) return "original";
  return requested;
}

export class CameraEnvironmentProcessor {
  private readonly backgroundCanvas = document.createElement("canvas");
  private readonly backgroundCtx = this.backgroundCanvas.getContext("2d")!;
  private readonly personCanvas = document.createElement("canvas");
  private readonly personCtx = this.personCanvas.getContext("2d")!;
  private readonly personTreatment = new AnonymityProcessor();

  public processFrame(
    destination: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    treatment: AnonymityMode,
    environment: CameraEnvironmentState,
    mask: HTMLCanvasElement,
    width: number,
    height: number,
  ): void {
    this.resize(width, height);
    this.backgroundCtx.clearRect(0, 0, width, height);
    this.personCtx.clearRect(0, 0, width, height);

    this.drawEnvironment(video, environment, mask, width, height);
    this.personTreatment.processFrame(this.personCtx, video, treatment, width, height);
    this.applyMirroredMask(this.personCtx, mask, width, height, "destination-in");

    destination.drawImage(this.backgroundCanvas, 0, 0);
    destination.drawImage(this.personCanvas, 0, 0);
  }

  private drawEnvironment(
    video: HTMLVideoElement,
    environment: CameraEnvironmentState,
    mask: HTMLCanvasElement,
    width: number,
    height: number,
  ): void {
    switch (environment.mode) {
      case "original":
        this.drawMirroredVideo(this.backgroundCtx, video, width, height);
        this.applyMirroredMask(this.backgroundCtx, mask, width, height, "destination-out");
        break;
      case "blur":
        this.backgroundCtx.save();
        this.backgroundCtx.filter = "blur(22px) saturate(.92)";
        this.backgroundCtx.translate(width, 0);
        this.backgroundCtx.scale(-1, 1);
        this.backgroundCtx.drawImage(video, -width * 0.025, -height * 0.025, width * 1.05, height * 1.05);
        this.backgroundCtx.restore();
        this.applyMirroredMask(this.backgroundCtx, mask, width, height, "destination-out");
        break;
      case "solid":
        this.backgroundCtx.fillStyle = environment.solidColor;
        this.backgroundCtx.fillRect(0, 0, width, height);
        break;
      case "image": {
        if (!environment.image) return;
        const rect = calculateCoverRect(
          environment.image.naturalWidth,
          environment.image.naturalHeight,
          width,
          height,
        );
        this.backgroundCtx.drawImage(environment.image, rect.x, rect.y, rect.width, rect.height);
        break;
      }
    }
  }

  private drawMirroredVideo(
    context: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    width: number,
    height: number,
  ): void {
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.restore();
  }

  private applyMirroredMask(
    context: CanvasRenderingContext2D,
    mask: HTMLCanvasElement,
    width: number,
    height: number,
    operation: GlobalCompositeOperation,
  ): void {
    context.save();
    context.globalCompositeOperation = operation;
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(mask, 0, 0, width, height);
    context.restore();
  }

  private resize(width: number, height: number): void {
    if (this.backgroundCanvas.width !== width) this.backgroundCanvas.width = width;
    if (this.backgroundCanvas.height !== height) this.backgroundCanvas.height = height;
    if (this.personCanvas.width !== width) this.personCanvas.width = width;
    if (this.personCanvas.height !== height) this.personCanvas.height = height;
  }
}
