export function clampEnergy(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function estimateEnergyFromBpm(bpm: number, minBpm: number, maxBpm: number): number {
  if (maxBpm === minBpm) return 0.5;
  return clampEnergy((bpm - minBpm) / (maxBpm - minBpm));
}
