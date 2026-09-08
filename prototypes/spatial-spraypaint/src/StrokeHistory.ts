import { type DripSeed } from "./DripLogic";
import { type SprayCapId } from "./SprayCapPresets";
import { type StrokePoint } from "./types";

export interface RecordedStroke {
  id: number;
  color: string;
  capId: SprayCapId;
  points: StrokePoint[];
  drips: DripSeed[];
}

type StrokeMetadata = Pick<RecordedStroke, "color" | "capId">;

export class StrokeHistory {
  private strokes: RecordedStroke[] = [];
  private current: RecordedStroke | null = null;
  private nextId = 1;
  private lockedCount = 0;

  constructor(private readonly limit = 40) {}

  public begin(metadata: StrokeMetadata): void {
    if (this.current?.points.length) this.finalize();
    this.current = { id: this.nextId, ...metadata, points: [], drips: [] };
    this.nextId += 1;
  }

  public appendPoint(point: StrokePoint): void {
    if (!this.current) return;
    this.current.points.push({ ...point });
  }

  public appendDrip(drip: DripSeed): void {
    if (!this.current) return;
    this.current.drips.push({ ...drip });
  }

  public finalize(): boolean {
    if (!this.current?.points.length) {
      this.current = null;
      return false;
    }
    this.strokes.push(this.current);
    if (this.strokes.length - this.lockedCount > this.limit) this.lockedCount += 1;
    this.current = null;
    return true;
  }

  public undo(): RecordedStroke[] {
    this.current = null;
    if (this.canUndo()) this.strokes.pop();
    return this.snapshot();
  }

  public clear(): void {
    this.current = null;
    this.strokes = [];
    this.lockedCount = 0;
  }

  public canUndo(): boolean {
    return this.strokes.length > this.lockedCount;
  }

  public size(): number {
    return this.strokes.length - this.lockedCount;
  }

  public snapshot(): RecordedStroke[] {
    return this.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
      drips: stroke.drips.map((drip) => ({ ...drip })),
    }));
  }
}
