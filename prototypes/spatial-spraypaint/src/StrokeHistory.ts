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
  private clearedState: { strokes: RecordedStroke[]; lockedCount: number } | null = null;

  constructor(private readonly limit = 40) {}

  public begin(metadata: StrokeMetadata): number {
    if (this.current?.points.length) this.finalize();
    this.current = { id: this.nextId, ...metadata, points: [], drips: [] };
    this.nextId += 1;
    return this.current.id;
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
    if (this.strokes.length > this.lockedCount) {
      this.strokes.pop();
    } else if (this.clearedState) {
      this.strokes = this.cloneStrokes(this.clearedState.strokes);
      this.lockedCount = this.clearedState.lockedCount;
      this.clearedState = null;
    }
    return this.snapshot();
  }

  public clearUndoably(): boolean {
    this.current = null;
    if (!this.strokes.length) return false;
    this.clearedState = { strokes: this.snapshot(), lockedCount: this.lockedCount };
    this.strokes = [];
    this.lockedCount = 0;
    return true;
  }

  public clear(): void {
    this.current = null;
    this.strokes = [];
    this.lockedCount = 0;
    this.clearedState = null;
  }

  public canUndo(): boolean {
    return this.strokes.length > this.lockedCount || this.clearedState !== null;
  }

  public size(): number {
    return this.strokes.length - this.lockedCount + (this.clearedState ? 1 : 0);
  }

  public snapshot(): RecordedStroke[] {
    return this.cloneStrokes(this.strokes);
  }

  public renderSnapshot(): RecordedStroke[] {
    const snapshot = this.snapshot();
    if (this.current?.points.length) snapshot.push(this.cloneStroke(this.current));
    return snapshot;
  }

  private cloneStrokes(strokes: RecordedStroke[]): RecordedStroke[] {
    return strokes.map((stroke) => this.cloneStroke(stroke));
  }

  private cloneStroke(stroke: RecordedStroke): RecordedStroke {
    return {
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
      drips: stroke.drips.map((drip) => ({ ...drip })),
    };
  }
}
