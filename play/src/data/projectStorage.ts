import type { PlaylistProject } from "./playlistTypes";

const STORAGE_KEY = "flow_curve_project";

export function saveProjectToStorage(project: PlaylistProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // storage quota exceeded — silent
  }
}

export function loadProjectFromStorage(): PlaylistProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlaylistProject;
  } catch {
    return null;
  }
}

export function clearProjectFromStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadProjectFromJson(jsonText: string): PlaylistProject | null {
  try {
    return JSON.parse(jsonText) as PlaylistProject;
  } catch {
    return null;
  }
}
