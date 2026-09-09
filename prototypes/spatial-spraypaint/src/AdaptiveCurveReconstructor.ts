export interface CurveInputSample {
  x: number;
  y: number;
  timestamp: number;
}

export interface CurveReconstructionOptions {
  baseRadius: number;
  cornerAngleDegrees?: number;
}

const DEFAULT_CORNER_ANGLE_DEGREES = 62;
const MIN_VECTOR_LENGTH = 0.001;

export function resolveCurveSampleSpacing(baseRadius: number, velocity: number): number {
  const radiusSpacing = Math.max(2, Math.min(7, baseRadius * 0.18));
  const velocityDensity = Math.max(0.58, Math.min(1, 1 - velocity * 0.08));
  return radiusSpacing * velocityDensity;
}

export function turnAngleDegrees(
  previous: CurveInputSample,
  corner: CurveInputSample,
  next: CurveInputSample,
): number {
  const incomingX = corner.x - previous.x;
  const incomingY = corner.y - previous.y;
  const outgoingX = next.x - corner.x;
  const outgoingY = next.y - corner.y;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength < MIN_VECTOR_LENGTH || outgoingLength < MIN_VECTOR_LENGTH) return 0;
  const cosine = Math.max(-1, Math.min(1,
    (incomingX * outgoingX + incomingY * outgoingY) / (incomingLength * outgoingLength),
  ));
  return Math.acos(cosine) * (180 / Math.PI);
}

function tangent(
  previous: CurveInputSample | null,
  point: CurveInputSample,
  next: CurveInputSample,
  cornerAngleDegrees: number,
): CurveInputSample {
  if (!previous || turnAngleDegrees(previous, point, next) >= cornerAngleDegrees) {
    return { x: next.x - point.x, y: next.y - point.y, timestamp: 0 };
  }
  return {
    x: (next.x - previous.x) * 0.5,
    y: (next.y - previous.y) * 0.5,
    timestamp: 0,
  };
}

function endingTangent(
  start: CurveInputSample,
  end: CurveInputSample,
  next: CurveInputSample | null,
  cornerAngleDegrees: number,
): CurveInputSample {
  if (!next || turnAngleDegrees(start, end, next) >= cornerAngleDegrees) {
    return { x: end.x - start.x, y: end.y - start.y, timestamp: 0 };
  }
  return {
    x: (next.x - start.x) * 0.5,
    y: (next.y - start.y) * 0.5,
    timestamp: 0,
  };
}

function reconstructSegment(
  previous: CurveInputSample | null,
  start: CurveInputSample,
  end: CurveInputSample,
  next: CurveInputSample | null,
  options: CurveReconstructionOptions,
): CurveInputSample[] {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance < MIN_VECTOR_LENGTH) return [{ ...end }];

  const duration = Math.max(1, end.timestamp - start.timestamp);
  const velocity = distance / duration;
  const spacing = resolveCurveSampleSpacing(options.baseRadius, velocity);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  const cornerAngle = options.cornerAngleDegrees ?? DEFAULT_CORNER_ANGLE_DEGREES;
  const startTangent = tangent(previous, start, end, cornerAngle);
  const endTangent = endingTangent(start, end, next, cornerAngle);
  const reconstructed: CurveInputSample[] = [];
  let emitted = start;

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const curvePoint = index === steps ? { ...end } : {
      x: h00 * start.x + h10 * startTangent.x + h01 * end.x + h11 * endTangent.x,
      y: h00 * start.y + h10 * startTangent.y + h01 * end.y + h11 * endTangent.y,
      timestamp: start.timestamp + (end.timestamp - start.timestamp) * t,
    };
    const chordLength = Math.hypot(curvePoint.x - emitted.x, curvePoint.y - emitted.y);
    const subdivisions = Math.max(1, Math.ceil(chordLength / spacing));
    for (let subdivision = 1; subdivision <= subdivisions; subdivision += 1) {
      const ratio = subdivision / subdivisions;
      reconstructed.push(index === steps && subdivision === subdivisions ? { ...end } : {
        x: emitted.x + (curvePoint.x - emitted.x) * ratio,
        y: emitted.y + (curvePoint.y - emitted.y) * ratio,
        timestamp: emitted.timestamp + (curvePoint.timestamp - emitted.timestamp) * ratio,
      });
    }
    emitted = curvePoint;
  }
  return reconstructed;
}

/**
 * Keeps sparse input samples separate from the denser path sent to canonical
 * spray deposition. One sample of look-ahead is retained so broad motion can
 * gain continuous tangents without rounding deliberate corners.
 */
export class AdaptiveCurveReconstructor {
  private inputs: CurveInputSample[] = [];

  public push(sample: CurveInputSample, options: CurveReconstructionOptions): CurveInputSample[] {
    this.inputs.push({ ...sample });
    if (this.inputs.length === 1) return [{ ...sample }];
    if (this.inputs.length === 2) return [];

    const length = this.inputs.length;
    return reconstructSegment(
      length > 3 ? this.inputs[length - 4] : null,
      this.inputs[length - 3],
      this.inputs[length - 2],
      this.inputs[length - 1],
      options,
    );
  }

  public finish(options: CurveReconstructionOptions): CurveInputSample[] {
    if (this.inputs.length < 2) {
      this.inputs = [];
      return [];
    }
    const length = this.inputs.length;
    const output = reconstructSegment(
      length > 2 ? this.inputs[length - 3] : null,
      this.inputs[length - 2],
      this.inputs[length - 1],
      null,
      options,
    );
    this.inputs = [];
    return output;
  }

  public reset(): void {
    this.inputs = [];
  }
}
