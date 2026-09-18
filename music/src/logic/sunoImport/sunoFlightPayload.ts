// 0904H_MUSIC_Suno_RSC_Flight_Metadata_Source — parses the React Server
// Components ("Flight") payload Next.js embeds directly in the HTML of any
// public https://suno.com/song/{uuid} page. Verified live against two real
// songs while building this (one whose `metadata.prompt` is inlined
// directly, one where it's a deferred `$<id>` reference resolved from a
// separate Text row) — no authentication needed at all; this is a fully
// public page. This replaced the old suno-scraper project's authenticated
// Studio API path (`/api/clips/{id}`), which returned HTTP 404 when
// re-tested live — Suno's current web app clearly no longer serves rich
// metadata from that endpoint, but embeds it directly in the page instead.
//
// Wire format (reverse-engineered from real responses, not documented by
// Next.js as a stable public contract — expect this to need re-verification
// if Suno's frontend build changes): the page's HTML contains one or more
// `<script>self.__next_f.push([1,"<row-text>"])</script>` tags. Concatenating
// every pushed string (in document order) gives one long text stream made
// of newline-separated "rows", each shaped `<id>:<payload>`. A row's
// payload is either:
//   - a plain JSON value (object/array/string/number/bool/null) for that id,
//   - `I[...]` — a client component import descriptor (ignored here), or
//   - `T<hexByteLength>,<raw text>` — a "Text" row: the raw content is
//     exactly `hexByteLength` UTF-8 BYTES long and may itself contain real
//     newlines (this is why rows can't just be split on "\n" — a Text row's
//     own embedded newlines would be mistaken for row boundaries).
// Anywhere a JSON value is the literal string `"$<id>"`, that is a
// reference to another row's own value — resolved here generically by ID,
// never hardcoded to any specific id like "$51".

export interface ParsedFlightRow {
  kind: "json" | "text" | "other";
  value: unknown;
}

export function extractFlightText(html: string): string {
  const pattern = /self\.__next_f\.push\((\[[\s\S]*?\])\)/g;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      const arr = JSON.parse(match[1]);
      if (Array.isArray(arr) && typeof arr[1] === "string") parts.push(arr[1]);
    } catch {
      // Malformed/unexpected chunk — skip it rather than throw; other
      // chunks may still parse fine.
    }
  }
  return parts.join("");
}

export function parseFlightRows(text: string): Map<string, ParsedFlightRow> {
  const rows = new Map<string, ParsedFlightRow>();
  const n = text.length;
  let i = 0;
  while (i < n) {
    const colon = text.indexOf(":", i);
    if (colon === -1) break;
    const rowId = text.slice(i, colon);
    const afterColon = colon + 1;
    if (text[afterColon] === "T") {
      const comma = text.indexOf(",", afterColon);
      if (comma === -1) break;
      const hexLen = text.slice(afterColon + 1, comma);
      const byteLength = parseInt(hexLen, 16);
      const tailBytes = Buffer.from(text.slice(comma + 1), "utf-8");
      const contentBytes = tailBytes.subarray(0, byteLength);
      const content = contentBytes.toString("utf-8");
      rows.set(rowId, { kind: "text", value: content });
      i = comma + 1 + content.length;
      if (text[i] === "\n") i += 1;
      continue;
    }
    const nl = text.indexOf("\n", afterColon);
    const rest = nl === -1 ? text.slice(afterColon) : text.slice(afterColon, nl);
    i = nl === -1 ? n : nl + 1;
    const firstChar = rest[0];
    if (firstChar === "{" || firstChar === "[" || firstChar === '"' || /^-?\d/.test(rest) || rest === "true" || rest === "false" || rest === "null") {
      try {
        rows.set(rowId, { kind: "json", value: JSON.parse(rest) });
        continue;
      } catch {
        // Fall through to "other" below.
      }
    }
    rows.set(rowId, { kind: "other", value: rest });
  }
  return rows;
}

const FLIGHT_REF_PATTERN = /^\$[0-9a-fA-F]+$/;

export function resolveFlightRefs(value: unknown, rows: Map<string, ParsedFlightRow>, depth = 0): unknown {
  if (depth > 20) return value;
  if (typeof value === "string" && FLIGHT_REF_PATTERN.test(value)) {
    const row = rows.get(value.slice(1));
    if (!row) return value;
    if (row.kind === "text") return row.value;
    if (row.kind === "json") return resolveFlightRefs(row.value, rows, depth + 1);
    return row.value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveFlightRefs(v, rows, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveFlightRefs(v, rows, depth + 1);
    return out;
  }
  return value;
}

// A Suno "clip" record is recognized structurally (has both `id` and a
// `metadata` object), not by which numbered row it happens to live under —
// robust to the page's own component tree shifting between builds. Depth-
// capped to avoid runaway recursion on an unexpected shape.
function findClipRecord(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 10 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findClipRecord(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string" && obj.metadata && typeof obj.metadata === "object") return obj;
    for (const v of Object.values(obj)) {
      const found = findClipRecord(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export interface SunoPublicPageRecord {
  sunoUuid: string;
  title?: string;
  prompt?: string;
  style?: string;
  tags: string[];
  imageUrl?: string;
  durationSeconds?: number;
  createdAt?: string;
  model?: string;
  sunoUrl: string;
}

// Top-level entry point. Returns null (never throws, never invents a
// field) when the page doesn't contain a recognizable clip record, or
// when the record found doesn't match the requested UUID (defends against
// a page structure change silently matching the wrong embedded object).
export function parseSunoSongPage(html: string, expectedUuid: string): SunoPublicPageRecord | null {
  const flightText = extractFlightText(html);
  if (!flightText) return null;
  const rows = parseFlightRows(flightText);
  for (const row of rows.values()) {
    if (row.kind !== "json") continue;
    const clip = findClipRecord(row.value);
    if (!clip) continue;
    const resolved = resolveFlightRefs(clip, rows) as Record<string, unknown>;
    if (resolved.id !== expectedUuid) continue;
    const metadata = (resolved.metadata ?? {}) as Record<string, unknown>;
    const rawTags = typeof metadata.tags === "string" ? metadata.tags : "";
    return {
      sunoUuid: expectedUuid,
      title: typeof resolved.title === "string" ? resolved.title : undefined,
      prompt: typeof metadata.prompt === "string" ? metadata.prompt : undefined,
      style: rawTags || undefined,
      tags: rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      imageUrl: typeof resolved.image_large_url === "string" ? resolved.image_large_url
        : typeof resolved.image_url === "string" ? resolved.image_url : undefined,
      durationSeconds: typeof metadata.duration === "number" ? metadata.duration : undefined,
      createdAt: typeof resolved.created_at === "string" ? resolved.created_at : undefined,
      model: typeof resolved.major_model_version === "string" ? resolved.major_model_version : undefined,
      sunoUrl: `https://suno.com/song/${expectedUuid}`,
    };
  }
  return null;
}
