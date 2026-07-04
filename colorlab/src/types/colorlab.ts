// 0629H — Simple palette types for the functional palette tool.
// Roles, attributes, and governance lifecycle are deferred per spec.

export type PaletteSourceType =
  | 'generated'
  | 'image_extracted'
  | 'seed_color'
  | 'harmony'
  | 'manual'
  | 'imported'
  | 'duplicated';

export type HarmonyMode =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'tetradic'
  | 'split_complementary'
  | 'monochrome';

export interface ColorlabSwatch {
  id: string;
  hex: string;
  label?: string;
  locked: boolean;
}

export interface ColorlabPalette {
  id: string;
  name: string;
  swatches: ColorlabSwatch[];
  sourceType: PaletteSourceType;
  tags: string[];
  notes?: string;
  favorite: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
