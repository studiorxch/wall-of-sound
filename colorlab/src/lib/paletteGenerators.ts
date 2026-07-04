import type { HarmonyMode, ColorlabSwatch } from '../types/colorlab';

// ─── HSL ↔ HEX helpers ────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function wrap(v: number, max: number) { return ((v % max) + max) % max; }

// ─── Random generator ─────────────────────────────────────────────────────────

export function generateRandom(count: number): string[] {
  return Array.from({ length: count }, () => {
    const h = Math.random() * 360;
    const s = 30 + Math.random() * 55;
    const l = 20 + Math.random() * 55;
    return hslToHex(h, s, l);
  });
}

export function regenerateUnlocked(swatches: ColorlabSwatch[]): ColorlabSwatch[] {
  return swatches.map(s => {
    if (s.locked) return s;
    const h = Math.random() * 360;
    const sat = 30 + Math.random() * 55;
    const l = 20 + Math.random() * 55;
    return { ...s, hex: hslToHex(h, sat, l) };
  });
}

// ─── Seed color generator ─────────────────────────────────────────────────────

export function generateFromSeed(seedHex: string, count: number): string[] {
  const [h, s, l] = hexToHsl(seedHex);
  const colors: string[] = [seedHex];

  // complementary
  if (count > 1) colors.push(hslToHex(wrap(h + 180, 360), clamp(s, 40, 80), clamp(l, 25, 65)));
  // accent (shifted +60)
  if (count > 2) colors.push(hslToHex(wrap(h + 60, 360), clamp(s + 10, 45, 90), clamp(l, 30, 60)));
  // muted neutral
  if (count > 3) colors.push(hslToHex(h, clamp(s * 0.3, 5, 25), clamp(l + 15, 30, 75)));
  // dark companion
  if (count > 4) colors.push(hslToHex(h, clamp(s * 0.6, 10, 40), clamp(l * 0.35, 8, 30)));

  // fill remaining slots with analogous shifts
  for (let i = colors.length; i < count; i++) {
    const shift = 25 + (i - 5) * 15;
    colors.push(hslToHex(wrap(h + shift, 360), clamp(s * 0.8, 20, 70), clamp(l + (i % 2 === 0 ? 10 : -10), 15, 70)));
  }

  return colors.slice(0, count);
}

// ─── Harmony generator ────────────────────────────────────────────────────────

export function generateHarmony(seedHex: string, mode: HarmonyMode, count: number): string[] {
  const [h, s, l] = hexToHsl(seedHex);
  const sat = clamp(s || 60, 45, 85);
  const lit = clamp(l || 45, 30, 65);

  let hues: number[] = [];

  switch (mode) {
    case 'complementary':
      hues = [h, wrap(h + 180, 360)]; break;
    case 'analogous':
      hues = [wrap(h - 30, 360), h, wrap(h + 30, 360)]; break;
    case 'triadic':
      hues = [h, wrap(h + 120, 360), wrap(h + 240, 360)]; break;
    case 'tetradic':
      hues = [h, wrap(h + 90, 360), wrap(h + 180, 360), wrap(h + 270, 360)]; break;
    case 'split_complementary':
      hues = [h, wrap(h + 150, 360), wrap(h + 210, 360)]; break;
    case 'monochrome':
      hues = Array.from({ length: Math.min(count, 6) }, (_, i) => h); break;
  }

  // Fill to count by cycling hues with lightness/saturation variations
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const baseHue = hues[i % hues.length];
    const lVar = mode === 'monochrome'
      ? clamp(20 + (i / (count - 1 || 1)) * 55, 15, 75)
      : clamp(lit + (i < hues.length ? 0 : (i % 2 === 0 ? 12 : -12)), 18, 72);
    const sVar = mode === 'monochrome'
      ? clamp(sat - i * 5, 10, sat)
      : clamp(sat + (i < hues.length ? 0 : (i % 3 === 0 ? -10 : 5)), 20, 90);
    result.push(hslToHex(baseHue, sVar, lVar));
  }

  return result;
}
