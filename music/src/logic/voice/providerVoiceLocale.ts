function normalizedLocale(locale: string | null): string | null {
  const trimmed = locale?.trim();
  return trimmed ? trimmed.replace(/_/g, "-") : null;
}

/** Converts provider locale IDs to labels without changing the raw ID used by the adapter. */
export function formatProviderVoiceLocale(locale: string | null): string {
  const normalized = normalizedLocale(locale);
  if (!normalized) return "Language unavailable";

  try {
    const [languageCode, regionCode] = normalized.split("-");
    const language = new Intl.DisplayNames(["en"], { type: "language" }).of(languageCode);
    const region = regionCode
      ? new Intl.DisplayNames(["en"], { type: "region" }).of(regionCode)
      : null;
    if (!language) return "Language unavailable";
    return region ? `${language} · ${region}` : language;
  } catch {
    return "Language unavailable";
  }
}

/** Raw locale IDs remain searchable even though the browser renders only friendly labels. */
export function providerVoiceLocaleSearchText(locale: string | null): string {
  return `${formatProviderVoiceLocale(locale)} ${locale ?? ""}`;
}
