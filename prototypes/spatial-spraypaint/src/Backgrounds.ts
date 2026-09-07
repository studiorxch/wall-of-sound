export type BackgroundId = "black" | "charcoal" | "mid-gray" | "off-white";

export interface SprayBackground {
  id: BackgroundId;
  name: string;
  color: string;
}

export const SPRAY_BACKGROUNDS: readonly SprayBackground[] = [
  { id: "black", name: "Black", color: "#050508" },
  { id: "charcoal", name: "Charcoal Wall", color: "#24252a" },
  { id: "mid-gray", name: "Mid Gray", color: "#707176" },
  { id: "off-white", name: "Off-White Wall", color: "#e8e3d7" },
] as const;

export function getSprayBackground(id: string): SprayBackground {
  return SPRAY_BACKGROUNDS.find((background) => background.id === id) ?? SPRAY_BACKGROUNDS[0];
}
