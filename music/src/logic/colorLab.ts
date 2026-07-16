export type PlayColorTheme = {
  id: string;
  name: string;
  dominant: string;
  accent: string;
  glow: string;
  shadow: string;
  muted: string;
  skyTop: string;
  skyMid: string;
  haze: string;
};

export const DEFAULT_PLAY_COLOR_THEME: PlayColorTheme = {
  id: "default",
  name: "Default",
  dominant: "#071019",
  accent: "#5f73ff",
  glow: "#00d5ff",
  shadow: "#02040a",
  muted: "#263545",
  skyTop: "#02040a",
  skyMid: "#071019",
  haze: "#0c2a3a",
};

export function makeThemeId(): string {
  return `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function extractColorThemeFromImageUrl(url: string): Promise<PlayColorTheme | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const pixels: [number, number, number][] = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    const sorted = [...pixels].sort((a, b) => luma(...a) - luma(...b));
    const dark  = sorted[Math.floor(sorted.length * 0.08)];
    const mid   = sorted[Math.floor(sorted.length * 0.50)];
    const bright = sorted[Math.floor(sorted.length * 0.88)];

    const avgR = pixels.reduce((s, p) => s + p[0], 0) / pixels.length;
    const avgG = pixels.reduce((s, p) => s + p[1], 0) / pixels.length;
    const avgB = pixels.reduce((s, p) => s + p[2], 0) / pixels.length;

    const dominant = rgbToHex(avgR, avgG, avgB);
    const shadow   = rgbToHex(dark[0] * 0.4, dark[1] * 0.4, dark[2] * 0.4);

    const [bR, bG, bB] = bright;
    const maxC = Math.max(bR, bG, bB) || 1;
    const accent = rgbToHex(
      bR + (bR === maxC ? 60 : -30),
      bG + (bG === maxC ? 60 : -30),
      bB + (bB === maxC ? 60 : -30),
    );
    const glow = rgbToHex(
      bR + (bR === maxC ? 120 : -50),
      bG + (bG === maxC ? 120 : -50),
      bB + (bB === maxC ? 120 : -50),
    );

    const muted  = rgbToHex(mid[0] * 0.6 + 15, mid[1] * 0.6 + 15, mid[2] * 0.6 + 20);
    const skyTop = rgbToHex(dark[0] * 0.3, dark[1] * 0.3, dark[2] * 0.35);
    const skyMid = rgbToHex(dark[0] * 0.5 + avgR * 0.08, dark[1] * 0.5 + avgG * 0.08, dark[2] * 0.5 + avgB * 0.1);
    const haze   = rgbToHex(mid[0] * 0.35 + 5, mid[1] * 0.35 + 8, mid[2] * 0.35 + 18);

    return { id: makeThemeId(), name: "Untitled Map Theme", dominant, accent, glow, shadow, muted, skyTop, skyMid, haze };
  } catch {
    return null;
  }
}
