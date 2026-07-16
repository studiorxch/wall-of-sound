/**
 * audioPathResolver.ts
 *
 * Converts any audio path representation into a portable relative form and
 * generates browser-safe playback URLs at runtime.
 *
 * Track records store:   audioRelPath = "catalog/audio/flicker_at_dusk.flac"
 * Browser playback uses: resolveAudioUrl(audioRelPath) → "/music-audio/catalog/audio/..."
 *
 * Nothing machine-specific is persisted. Only this module knows the URL prefix.
 */

export type AudioCategory = "catalog" | "external" | "reference";

export interface PortableAudioPath {
  audioCategory: AudioCategory;
  audioFileName: string;
  audioRelPath: string;  // relative to library/music/ root
}

/** URL prefix the Vite dev server exposes for the music library root. */
const MUSIC_AUDIO_PREFIX = "/music-audio/";

/** Patterns that indicate a browser playback URL (not a persistent path). */
const BROWSER_URL_RE = /^(https?:\/\/|file:\/\/)/i;

/** Pattern for /music-audio/ URL (relative or absolute). */
const MUSIC_AUDIO_URL_RE = /\/music-audio\//;

/** Pattern for /media?path= URL (legacy absolute-path proxy). */
const MEDIA_PROXY_RE = /^\/media\?path=/;

/** Known library root suffixes used to strip machine-specific prefixes. */
const MUSIC_ROOT_SUFFIX = "/library/music/";

/** Category path segments. */
const CATEGORY_DIRS: Record<AudioCategory, string> = {
  catalog: "catalog/audio/",
  external: "external/audio/",
  reference: "reference/audio/",
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isAbsoluteAudioPath(value: string): boolean {
  return (
    (value.startsWith("/") && !value.startsWith(MUSIC_AUDIO_PREFIX)) ||
    /^[A-Za-z]:\\/.test(value)
  );
}

export function isBrowserAudioUrl(value: string): boolean {
  return BROWSER_URL_RE.test(value) || MEDIA_PROXY_RE.test(value);
}

export function hasUnsafePathTraversal(audioRelPath: string): boolean {
  const normalized = audioRelPath.replace(/\\/g, "/");
  // Only flag actual traversal segments — leading "/" is an absolute path, not a traversal attack.
  return normalized.split("/").some((seg) => seg === ".." || seg === ".");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeAudioFileName(value: string): string {
  return value.replace(/\\/g, "/").split("/").pop() ?? value;
}

export function inferAudioRelPath(category: AudioCategory, fileName: string): string {
  return `${CATEGORY_DIRS[category]}${fileName}`;
}

function inferCategoryFromRelPath(relPath: string): AudioCategory | null {
  if (relPath.startsWith("catalog/")) return "catalog";
  if (relPath.startsWith("external/")) return "external";
  if (relPath.startsWith("reference/")) return "reference";
  return null;
}

function stripMusicRoot(absPath: string): string | null {
  const normalized = absPath.replace(/\\/g, "/");
  const idx = normalized.indexOf(MUSIC_ROOT_SUFFIX);
  if (idx === -1) return null;
  return normalized.slice(idx + MUSIC_ROOT_SUFFIX.length);
}

function stripMusicAudioPrefix(urlPath: string): string | null {
  const idx = urlPath.indexOf("/music-audio/");
  if (idx === -1) return null;
  return urlPath.slice(idx + "/music-audio/".length);
}

// ---------------------------------------------------------------------------
// Core converter
// ---------------------------------------------------------------------------

/**
 * Convert any audio path/URL into a portable PortableAudioPath.
 * Returns null for unsafe traversals or values that cannot be resolved.
 */
export function toPortableAudioPath(input: {
  value: string;
  category?: AudioCategory;
  knownRootCandidates?: string[];
}): PortableAudioPath | null {
  const { value, category } = input;
  if (!value?.trim()) return null;

  let relPath: string | null = null;

  // 1. /music-audio/ URL (browser URL already using the new prefix)
  if (MUSIC_AUDIO_URL_RE.test(value)) {
    relPath = stripMusicAudioPrefix(value);
  }

  // 2. Browser URL with /media?path= proxy (legacy absolute path proxy)
  if (!relPath && MEDIA_PROXY_RE.test(value)) {
    try {
      const parsed = new URL(value, "http://localhost");
      const absPath = decodeURIComponent(parsed.searchParams.get("path") ?? "");
      if (absPath) relPath = stripMusicRoot(absPath);
    } catch {
      // ignore
    }
  }

  // 3. Full browser URL (http/https/file) — try to extract relPath
  if (!relPath && BROWSER_URL_RE.test(value)) {
    try {
      const parsed = new URL(value);
      // Try /music-audio/ prefix in pathname
      relPath = stripMusicAudioPrefix(parsed.pathname);
      // Try /media?path= in search
      if (!relPath) {
        const absPath = decodeURIComponent(parsed.searchParams.get("path") ?? "");
        if (absPath) relPath = stripMusicRoot(absPath);
      }
    } catch {
      // ignore
    }
  }

  // 4. Absolute filesystem path
  if (!relPath && isAbsoluteAudioPath(value)) {
    relPath = stripMusicRoot(value);
    // Try knownRootCandidates if provided
    if (!relPath && input.knownRootCandidates) {
      for (const root of input.knownRootCandidates) {
        const normalized = value.replace(/\\/g, "/");
        const normRoot = root.replace(/\\/g, "/").replace(/\/$/, "") + "/";
        if (normalized.startsWith(normRoot)) {
          relPath = normalized.slice(normRoot.length);
          break;
        }
      }
    }
    // If still no match but we have a category, extract just the filename
    if (!relPath && category) {
      const fileName = normalizeAudioFileName(value);
      relPath = inferAudioRelPath(category, fileName);
    }
  }

  // 5. Already a relative path
  if (!relPath && !BROWSER_URL_RE.test(value) && !isAbsoluteAudioPath(value)) {
    // Filename only + known category
    if (!value.includes("/") && category) {
      relPath = inferAudioRelPath(category, value);
    } else {
      relPath = value;
    }
  }

  if (!relPath) return null;

  // Normalize separators
  relPath = relPath.replace(/\\/g, "/").replace(/^\/+/, "");

  // Safety: reject path traversal
  if (hasUnsafePathTraversal(relPath)) return null;

  const inferredCategory = inferCategoryFromRelPath(relPath) ?? category ?? null;
  if (!inferredCategory) return null;

  const audioFileName = normalizeAudioFileName(relPath);

  return {
    audioCategory: inferredCategory,
    audioFileName,
    audioRelPath: relPath,
  };
}

// ---------------------------------------------------------------------------
// Runtime URL resolution
// ---------------------------------------------------------------------------

/**
 * Convert a stored audioRelPath into a browser-playable URL.
 * Returns null if the input is null/empty.
 */
export function resolveAudioUrl(audioRelPath?: string | null): string | null {
  if (!audioRelPath?.trim()) return null;
  if (hasUnsafePathTraversal(audioRelPath)) return null;
  // Reject absolute paths — they cannot be used as browser URLs via /music-audio/
  if (isAbsoluteAudioPath(audioRelPath) || BROWSER_URL_RE.test(audioRelPath)) return null;
  const clean = audioRelPath.replace(/^\/+/, "");
  return `${MUSIC_AUDIO_PREFIX}${clean}`;
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

export type AudioPathKind =
  | "relative"       // already portable
  | "filename_only"  // just the filename, no path
  | "absolute"       // /Users/... or C:\...
  | "browser_url"    // http://, https://, file://
  | "legacy_proxy"   // /media?path=...
  | "music_audio"    // /music-audio/... (new prefix)
  | "empty"
  | "unsafe";

export function classifyAudioPath(value: string | undefined | null): AudioPathKind {
  if (!value?.trim()) return "empty";
  if (MEDIA_PROXY_RE.test(value)) return "legacy_proxy";
  if (MUSIC_AUDIO_URL_RE.test(value)) return "music_audio";
  if (BROWSER_URL_RE.test(value)) return "browser_url";
  if (isAbsoluteAudioPath(value)) return "absolute";
  if (hasUnsafePathTraversal(value)) return "unsafe";
  if (!value.includes("/")) return "filename_only";
  return "relative";
}
