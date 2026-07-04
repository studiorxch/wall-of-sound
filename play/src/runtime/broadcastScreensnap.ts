// Motion screensnap — captures the map/route frame during route travel.
// Does not pause the route or enter a capture mode.

export type SnapResult =
  | { ok: true; filename: string }
  | { ok: false; reason: string };

function buildFilename(trackIndex: number | null | undefined): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  if (trackIndex != null) return `play-map-snap-${trackIndex}-${stamp}.png`;
  return `play-map-snap-${stamp}.png`;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Try to find and capture the Mapbox canvas from the WOS iframe.
// Requires WALL to send back wall:snap-data via postMessage.
export function requestSnapViaWall(
  iframe: HTMLIFrameElement | null,
  trackIndex: number | null | undefined,
  onResult: (r: SnapResult) => void,
  timeoutMs = 4000,
): void {
  if (!iframe?.contentWindow) {
    onResult({ ok: false, reason: "WALL NOT CONNECTED" });
    return;
  }

  const requestId = Math.random().toString(36).slice(2);
  const filename = buildFilename(trackIndex);
  let settled = false;

  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    window.removeEventListener("message", handler);
    onResult({ ok: false, reason: "CANVAS BLOCKED" });
  }, timeoutMs);

  function handler(e: MessageEvent) {
    if (!e.data || e.data.type !== "wall:snap-data") return;
    if (e.data.requestId !== requestId) return;
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    window.removeEventListener("message", handler);
    const { dataUrl, error } = e.data;
    if (error || !dataUrl) {
      onResult({ ok: false, reason: error || "CANVAS BLOCKED" });
      return;
    }
    downloadDataUrl(dataUrl, filename);
    onResult({ ok: true, filename });
  }

  window.addEventListener("message", handler);
  iframe.contentWindow.postMessage({ type: "play:snap-request", requestId }, "*");
}
