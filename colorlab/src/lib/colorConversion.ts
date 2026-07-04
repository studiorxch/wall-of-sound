import type { RGBColor, LABColor } from '../types/palette';

// ─── RGB ↔ HEX ────────────────────────────────────────────────────────────────

export function rgbToHex({ r, g, b }: RGBColor): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): RGBColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
}

// ─── Perceptual utilities ─────────────────────────────────────────────────────

export function luminance({ r, g, b }: RGBColor): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function colorDistance(a: RGBColor, b: RGBColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// ─── RGB → HSL ────────────────────────────────────────────────────────────────
// HSL is export-derived ONLY — not stored as archival truth.
// Canonical archival values are RGB + LAB (per ExtractionPipeline doctrine).

export interface HSLColor { h: number; s: number; l: number; }

export function rgbToHsl({ r, g, b }: RGBColor): HSLColor {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: Math.round(l * 100) };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if      (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / delta + 2) / 6;
  else                 h = ((rn - gn) / delta + 4) / 6;

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// ─── Delta-E 2000 ─────────────────────────────────────────────────────────────
// Canonical perceptual distance for cleanup pipeline.
// RGB distance calculations are forbidden for canonical perceptual cleanup behavior.
// Implementation: CIE standard (ISO 11664-6 / CIE 142:2001)

export function chroma({ a, b }: LABColor): number {
  return Math.sqrt(a ** 2 + b ** 2);
}

export function deltaE2000(lab1: LABColor, lab2: LABColor): number {
  const L1 = lab1.l, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.l, a2 = lab2.a, b2 = lab2.b;

  const C1ab = Math.sqrt(a1 ** 2 + b1 ** 2);
  const C2ab = Math.sqrt(a2 ** 2 + b2 ** 2);
  const Cabavg = (C1ab + C2ab) / 2;
  const Cab7 = Cabavg ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + 25 ** 7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p ** 2 + b1 ** 2);
  const C2p = Math.sqrt(a2p ** 2 + b2 ** 2);

  const atan2deg = (y: number, x: number) =>
    ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  const h1p = C1p === 0 ? 0 : atan2deg(b1, a1p);
  const h2p = C2p === 0 ? 0 : atan2deg(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);

  const Lpavg = (L1 + L2) / 2;
  const Cpavg = (C1p + C2p) / 2;

  let hpavg = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpavg = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hpavg = (h1p + h2p + 360) / 2;
    else hpavg = (h1p + h2p - 360) / 2;
  }

  const deg = (n: number) => (n * Math.PI) / 180;
  const T =
    1
    - 0.17 * Math.cos(deg(hpavg - 30))
    + 0.24 * Math.cos(deg(2 * hpavg))
    + 0.32 * Math.cos(deg(3 * hpavg + 6))
    - 0.20 * Math.cos(deg(4 * hpavg - 63));

  const SL = 1 + (0.015 * (Lpavg - 50) ** 2) / Math.sqrt(20 + (Lpavg - 50) ** 2);
  const SC = 1 + 0.045 * Cpavg;
  const SH = 1 + 0.015 * Cpavg * T;

  const Cpavg7 = Cpavg ** 7;
  const RC = 2 * Math.sqrt(Cpavg7 / (Cpavg7 + 25 ** 7));
  const RT = -Math.sin(deg(60 * Math.exp(-(((hpavg - 275) / 25) ** 2)))) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 +
    (dCp / SC) ** 2 +
    (dHp / SH) ** 2 +
    RT * (dCp / SC) * (dHp / SH)
  );
}

// ─── RGB → CIE LAB ────────────────────────────────────────────────────────────
// Archival perceptual reference. HSL intentionally excluded (interaction-only).
// Pipeline: sRGB 8-bit → linear sRGB → XYZ D65 → CIE L*a*b*

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function xyzToLabComponent(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

export function rgbToLab({ r, g, b }: RGBColor): LABColor {
  // sRGB → linear sRGB
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  // Linear sRGB → XYZ D65 (IEC 61966-2-1)
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / 1.00000;
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

  // XYZ → L*a*b*
  const fx = xyzToLabComponent(x);
  const fy = xyzToLabComponent(y);
  const fz = xyzToLabComponent(z);

  return {
    l: Math.round((116 * fy - 16) * 10) / 10,
    a: Math.round((500 * (fx - fy)) * 10) / 10,
    b: Math.round((200 * (fy - fz)) * 10) / 10,
  };
}

// ─── LAB → RGB ────────────────────────────────────────────────────────────────
// Inverse pipeline: CIE L*a*b* → XYZ D65 → linear sRGB → sRGB.
// Used by runtime adaptation layers — NOT for archival storage.

const D65_X = 0.95047, D65_Y = 1.00000, D65_Z = 1.08883;

function labToXyzComponent(t: number): number {
  const delta = 6 / 29;
  return t > delta ? t ** 3 : 3 * delta * delta * (t - 4 / 29);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function labToRgb({ l, a, b }: LABColor): RGBColor {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const x = labToXyzComponent(fx) * D65_X;
  const y = labToXyzComponent(fy) * D65_Y;
  const z = labToXyzComponent(fz) * D65_Z;

  // XYZ → linear sRGB (D65 illuminant matrix)
  const lr =  3.2406 * x - 1.5372 * y - 0.4986 * z;
  const lg = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const lb =  0.0557 * x - 0.2040 * y + 1.0570 * z;

  return {
    r: Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, lr)) * 255))),
    g: Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, lg)) * 255))),
    b: Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, lb)) * 255))),
  };
}

