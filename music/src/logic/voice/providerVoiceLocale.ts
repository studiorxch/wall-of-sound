function normalizedLocale(locale: string | null): string | null {
  const trimmed = locale?.trim();
  return trimmed ? trimmed.replace(/_/g, "-") : null;
}

export interface ProviderVoiceLocaleLabels {
  language: string;
  region: string | null;
}

/** Converts provider locale IDs to labels without changing the raw ID used by the adapter. */
export function providerVoiceLocaleLabels(locale: string | null): ProviderVoiceLocaleLabels {
  const normalized = normalizedLocale(locale);
  if (!normalized) return { language: "Language unavailable", region: null };

  try {
    const [languageCode, regionCode] = normalized.split("-");
    const language = new Intl.DisplayNames(["en"], { type: "language" }).of(languageCode);
    const region = regionCode
      ? new Intl.DisplayNames(["en"], { type: "region" }).of(regionCode)
      : null;
    return { language: language ?? "Language unavailable", region: region ?? null };
  } catch {
    return { language: "Language unavailable", region: null };
  }
}

export function formatProviderVoiceLocale(locale: string | null): string {
  const { language, region } = providerVoiceLocaleLabels(locale);
  return region ? `${language} · ${region}` : language;
}

export function formatProviderVoiceLanguage(locale: string | null): string {
  return providerVoiceLocaleLabels(locale).language;
}

export function formatProviderVoiceRegion(locale: string | null): string {
  return providerVoiceLocaleLabels(locale).region ?? "Region unavailable";
}

/** Raw locale IDs remain searchable even though the browser renders only friendly labels. */
export function providerVoiceLocaleSearchText(locale: string | null): string {
  return `${formatProviderVoiceLocale(locale)} ${locale ?? ""}`;
}
