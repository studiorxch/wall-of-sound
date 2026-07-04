import Dexie, { type Table } from 'dexie';
import type { ColorlabPalette } from '../types/colorlab';

class PaletteDB extends Dexie {
  palettes!: Table<ColorlabPalette, string>;

  constructor() {
    super('colorlab_palettes');
    this.version(1).stores({
      palettes: 'id, name, favorite, archived, createdAt, updatedAt',
    });
  }
}

const db = new PaletteDB();

export async function savePalette(palette: ColorlabPalette): Promise<void> {
  await db.palettes.put(palette);
}

export async function loadAllPalettes(): Promise<ColorlabPalette[]> {
  const all = await db.palettes.toArray();
  return all
    .filter(p => !p.archived)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadPalette(id: string): Promise<ColorlabPalette | undefined> {
  return db.palettes.get(id);
}

export async function deletePalette(id: string): Promise<void> {
  await db.palettes.delete(id);
}

export async function toggleFavorite(id: string): Promise<void> {
  const p = await db.palettes.get(id);
  if (!p) return;
  await db.palettes.put({ ...p, favorite: !p.favorite, updatedAt: new Date().toISOString() });
}

export async function archivePaletteById(id: string): Promise<void> {
  const p = await db.palettes.get(id);
  if (!p) return;
  await db.palettes.put({ ...p, archived: true, updatedAt: new Date().toISOString() });
}

export async function duplicatePalette(id: string): Promise<ColorlabPalette> {
  const p = await db.palettes.get(id);
  if (!p) throw new Error(`Palette ${id} not found.`);
  const now = new Date().toISOString();
  const copy: ColorlabPalette = {
    ...p,
    id: crypto.randomUUID(),
    name: `${p.name} copy`,
    swatches: p.swatches.map(s => ({ ...s, id: crypto.randomUUID() })),
    sourceType: 'duplicated',
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.palettes.add(copy);
  return copy;
}

export function makePalette(
  name: string,
  hexes: string[],
  sourceType: ColorlabPalette['sourceType'],
): ColorlabPalette {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    swatches: hexes.map(hex => ({ id: crypto.randomUUID(), hex, locked: false })),
    sourceType,
    tags: [],
    favorite: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}
