export type InputSourceMode = "mouse" | "spatial";

export interface StrokePoint {
  x: number; // Normalized (0 to 1) or canvas pixels
  y: number; // Normalized (0 to 1) or canvas pixels
  z?: number; // Optional depth factor
  timestamp: number;
  velocity: number; // Calculated speed in pixels/ms
  width: number;
  opacity: number;
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  baseRadius: number;
  source: InputSourceMode;
}

export type AnonymityMode = "clean" | "ghost" | "pixel" | "silhouette" | "chromatic" | "hidden";
