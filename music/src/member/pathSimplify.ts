/**
 * Map Art Supplies Calibration V1 Revision 8: geometry-aware path
 * simplification, used to keep a raw authored point list within a bounded
 * count WITHOUT the "detail preserved early, then a straight line to the
 * end" bug that an index-based `slice(0, budget)` fallback produces.
 *
 * Root cause this fixes: `resolveSprayEmissionPoints`,
 * `resolveSprayCoreSamplePoints`, and `resolveMopEmissionPoints` each
 * compute an "adaptive step" from the path's TOTAL arc length divided by a
 * point budget, then subdivide each RAW segment by that step -- but every
 * raw segment still contributes AT LEAST ONE output point regardless of
 * how small the step made its own share. For a real zigzag/wavy gesture
 * with many short segments (routine with pointer coalescing), segment
 * COUNT ALONE can exceed the budget even though each segment is far
 * shorter than the computed step -- the adaptive step never actually
 * bounds the output in that case. The old fallback then trimmed the
 * overflowing array to `budget` entries by INDEX and force-jumped the
 * final entry to the true last point -- silently discarding every
 * direction change/extremum in the untrimmed tail and replacing it with a
 * straight line. A test that only checks "the final point is reached" and
 * "count <= budget" cannot catch this -- both still held.
 *
 * Fix: when the RAW point count itself would already exceed the budget
 * (independent of any step math), simplify the raw points FIRST, down to
 * at most the budget -- THEN the existing per-segment adaptive-step
 * interpolation runs safely, because segment count can no longer exceed
 * the budget.
 *
 * Simplification strategy: bucketed local-extremum retention, not
 * Douglas-Peucker. DP was tried first (the textbook line-simplification
 * algorithm) but measured badly on exactly the adversarial input this bug
 * report described -- a long, roughly uniform high-frequency zigzag (every
 * point its own local extremum, direction reversing every sample). DP's
 * global recursive max-distance splitting has no guarantee of distributing
 * retained points evenly across a self-similar signal like that; live
 * inspection showed large contiguous stretches (30-60% through the path)
 * with almost NO retained points -- a smaller-scale repeat of the exact
 * bug being fixed. Bucketed retention instead divides the path into
 * `maxPoints` roughly-equal INDEX ranges (guaranteeing even coverage by
 * construction -- a bucket can never be empty) and keeps, from each
 * bucket, whichever point deviates most from the straight line between
 * that bucket's neighbors (the locally most "significant" point) -- geometry-
 * aware within each bucket, uniform coverage across the whole path.
 */

export interface SimplifiablePoint {
  readonly x: number;
  readonly y: number;
}

function perpendicularDistance(point: SimplifiablePoint, lineStart: SimplifiablePoint, lineEnd: SimplifiablePoint): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Reduces `points` to at most `maxPoints` entries, guaranteeing coverage
 * spread evenly across the ENTIRE path (never a contiguous gap, unlike
 * both a naive index truncation and, empirically, Douglas-Peucker on a
 * high-frequency signal) while still preferring each local region's most
 * geometrically significant point over an arbitrary one. Returns `points`
 * unchanged (same array reference) if already within budget. Always keeps
 * the first and last authored point.
 */
export function simplifyPathToBudget<T extends SimplifiablePoint>(points: readonly T[], maxPoints: number): readonly T[] {
  if (points.length <= maxPoints || maxPoints < 2) return points;
  if (maxPoints === 2) return [points[0], points[points.length - 1]];

  const interiorBucketCount = maxPoints - 2;
  const interiorLength = points.length - 2; // points[1 .. length-2], excluding first/last
  const result: T[] = [points[0]];
  for (let bucket = 0; bucket < interiorBucketCount; bucket += 1) {
    const startIndex = 1 + Math.floor((bucket * interiorLength) / interiorBucketCount);
    const endIndex = 1 + Math.floor(((bucket + 1) * interiorLength) / interiorBucketCount);
    if (startIndex >= endIndex) continue; // more buckets than interior points -- some buckets legitimately empty
    const chordStart = points[Math.max(0, startIndex - 1)];
    const chordEnd = points[Math.min(points.length - 1, endIndex)];
    let best = points[startIndex];
    let bestDistance = -1;
    for (let i = startIndex; i < endIndex; i += 1) {
      const distance = perpendicularDistance(points[i], chordStart, chordEnd);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = points[i];
      }
    }
    result.push(best);
  }
  result.push(points[points.length - 1]);
  return result;
}
