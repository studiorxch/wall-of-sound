export type InputSourceMode = "mouse" | "spatial";

export interface StrokePoint {
  x: number; // Persistent wall coordinate
  y: number; // Persistent wall coordinate
  z?: number; // Optional depth factor
  timestamp: number;
  velocity: number; // Calculated speed in wall units/ms
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
