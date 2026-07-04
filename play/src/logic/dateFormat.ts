// Safe numeric formatters — never crash on null/undefined/NaN (0622D).

// Short relative time used by collection cards ("today", "yesterday", "3d ago", "2mo ago").
export function relTimeShort(iso: string | undefined): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
export function formatNumber(value: unknown, digits = 2, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : fallback;
}

export function formatInteger(value: unknown, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value).toString()
    : fallback;
}

export function fmtRelativeDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`;
  const diffH = diffMin / 60;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 2) return "yesterday";
  if (diffD < 7) return `${Math.round(diffD)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtShortDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtUpdatedLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 2) return "Updated just now";
  if (diffMin < 60) return `Updated ${Math.round(diffMin)}m ago`;
  const diffH = diffMin / 60;
  if (diffH < 24) return `Updated ${Math.round(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 2) return "Updated yesterday";
  if (diffD < 7) return `Updated ${Math.round(diffD)}d ago`;
  return `Updated ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
