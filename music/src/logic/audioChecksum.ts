// MUSIC P0 Clean Library Foundation — Step B: content-hash primitive for the
// browser import path. The repo's one prior hash primitive
// (server/radio/radioVersionCloneHelper.ts's sha256File) runs server-side,
// Node crypto, against a file already written to disk — it can't run in the
// browser during file-picker import, before the bytes exist on disk. This
// is that missing browser-side counterpart, same algorithm (SHA-256), same
// hex-digest output shape, via the standard Web Crypto API (no dependency).

export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
