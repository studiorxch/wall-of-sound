import type { PlayColorTheme } from "./colorLab";

export type PlayMapThemeExport = {
  version: "PLAY_MAP_THEME_V1";
  exportedAt: string;
  playlistTitle: string;
  theme: PlayColorTheme;
};

export function buildMapThemeExport({
  playlistTitle,
  theme,
}: {
  playlistTitle: string;
  theme: PlayColorTheme;
}): PlayMapThemeExport {
  return {
    version: "PLAY_MAP_THEME_V1",
    exportedAt: new Date().toISOString(),
    playlistTitle,
    theme,
  };
}

export function parseMapThemeExport(input: unknown): PlayColorTheme | null {
  try {
    const obj = input as Record<string, unknown>;
    if (obj.version !== "PLAY_MAP_THEME_V1") {
      // Also accept raw theme objects with expected keys
      if (typeof obj.dominant === "string" && typeof obj.accent === "string") {
        return obj as unknown as PlayColorTheme;
      }
      return null;
    }
    const theme = obj.theme as Record<string, unknown>;
    if (
      typeof theme?.dominant === "string" &&
      typeof theme?.accent === "string" &&
      typeof theme?.glow === "string"
    ) {
      return theme as unknown as PlayColorTheme;
    }
    return null;
  } catch {
    return null;
  }
}

export function downloadMapThemeJson({
  playlistTitle,
  theme,
}: {
  playlistTitle: string;
  theme: PlayColorTheme;
}): void {
  const data = buildMapThemeExport({ playlistTitle, theme });
  const slug = playlistTitle.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  const themeName = (theme.name ?? "theme").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `PLAY_MapTheme_${slug}_${themeName}_${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function themeToCSS(theme: PlayColorTheme): string {
  return [
    `--play-map-dominant: ${theme.dominant};`,
    `--play-map-accent:   ${theme.accent};`,
    `--play-map-glow:     ${theme.glow};`,
    `--play-map-shadow:   ${theme.shadow};`,
    `--play-map-muted:    ${theme.muted};`,
    `--play-sky-top:      ${theme.skyTop};`,
    `--play-sky-mid:      ${theme.skyMid};`,
    `--play-sky-haze:     ${theme.haze};`,
  ].join("\n");
}
