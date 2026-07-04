import type { ColorlabPalette, ColorlabSwatch } from '../types/colorlab';

// ─── SVG export ───────────────────────────────────────────────────────────────

export function exportSVG(palette: ColorlabPalette): void {
  const w = 80;
  const h = 80;
  const labelH = 18;
  const totalW = w * palette.swatches.length;
  const totalH = h + labelH;

  const rects = palette.swatches.map((s, i) =>
    `<rect x="${i * w}" y="0" width="${w}" height="${h}" fill="${s.hex}"/>` +
    `<text x="${i * w + w / 2}" y="${h + 13}" text-anchor="middle" ` +
    `font-family="monospace" font-size="10" fill="#888">${s.hex.toUpperCase()}</text>`
  ).join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="${totalW}" height="${totalH}" fill="#111"/>
  ${rects}
  <text x="${totalW / 2}" y="${totalH - 2}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#555">${palette.name}</text>
</svg>`;

  download(svg, `${slugify(palette.name)}.svg`, 'image/svg+xml');
}

// ─── PNG export ───────────────────────────────────────────────────────────────

export function exportPNG(palette: ColorlabPalette): void {
  const swatchW = 80;
  const swatchH = 80;
  const canvas = document.createElement('canvas');
  canvas.width = swatchW * palette.swatches.length;
  canvas.height = swatchH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  palette.swatches.forEach((s, i) => {
    ctx.fillStyle = s.hex;
    ctx.fillRect(i * swatchW, 0, swatchW, swatchH);
  });

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(palette.name)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ─── ASE export ───────────────────────────────────────────────────────────────
// Adobe Swatch Exchange binary format.

export function exportASE(palette: ColorlabPalette): void {
  const blocks = palette.swatches.map(s => makeAseColorBlock(s));
  const totalBlocks = blocks.reduce((sum, b) => sum + b.byteLength, 0);
  const buf = new ArrayBuffer(12 + totalBlocks);
  const view = new DataView(buf);
  let off = 0;

  // Header: "ASEF"
  [0x41, 0x53, 0x45, 0x46].forEach(b => { view.setUint8(off++, b); });
  // Version 1.0
  view.setUint16(off, 1, false); off += 2;
  view.setUint16(off, 0, false); off += 2;
  // Block count
  view.setUint32(off, palette.swatches.length, false); off += 4;

  // Blocks
  blocks.forEach(block => {
    new Uint8Array(buf, off, block.byteLength).set(new Uint8Array(block));
    off += block.byteLength;
  });

  download(buf, `${slugify(palette.name)}.ase`, 'application/octet-stream');
}

function makeAseColorBlock(swatch: ColorlabSwatch): ArrayBuffer {
  const name = swatch.label || swatch.hex.toUpperCase();
  // UTF-16BE name + null terminator
  const nameChars = name.length + 1; // include null
  const nameBytes = nameChars * 2;

  // block_length = nameLength field (2) + name bytes + "RGB " (4) + 3 floats (12) + color_type (2)
  const blockLength = 2 + nameBytes + 4 + 12 + 2;
  const buf = new ArrayBuffer(2 + 4 + blockLength); // type + length + body
  const view = new DataView(buf);
  let off = 0;

  view.setUint16(off, 0x0001, false); off += 2; // block type: color
  view.setUint32(off, blockLength, false); off += 4; // block length

  view.setUint16(off, nameChars, false); off += 2; // name length (chars incl null)
  for (let i = 0; i < name.length; i++) {
    view.setUint16(off, name.charCodeAt(i), false); off += 2;
  }
  view.setUint16(off, 0, false); off += 2; // null terminator

  // "RGB "
  [0x52, 0x47, 0x42, 0x20].forEach(b => { view.setUint8(off++, b); });

  // R, G, B as 0–1 floats
  const r = parseInt(swatch.hex.slice(1, 3), 16) / 255;
  const g = parseInt(swatch.hex.slice(3, 5), 16) / 255;
  const b = parseInt(swatch.hex.slice(5, 7), 16) / 255;
  view.setFloat32(off, r, false); off += 4;
  view.setFloat32(off, g, false); off += 4;
  view.setFloat32(off, b, false); off += 4;

  view.setUint16(off, 0, false); // color type: global

  return buf;
}

// ─── JSON export ──────────────────────────────────────────────────────────────

export function exportJSON(palette: ColorlabPalette): void {
  const data = {
    id: palette.id,
    name: palette.name,
    swatches: palette.swatches,
    sourceType: palette.sourceType,
    tags: palette.tags,
    notes: palette.notes,
    favorite: palette.favorite,
    archived: palette.archived,
    createdAt: palette.createdAt,
    updatedAt: palette.updatedAt,
  };
  download(JSON.stringify(data, null, 2), `${slugify(palette.name)}.colorlab.json`, 'application/json');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'palette';
}

function download(data: string | ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
