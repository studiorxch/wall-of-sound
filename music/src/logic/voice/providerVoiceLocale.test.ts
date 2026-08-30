import { describe, expect, it } from "vitest";
import { formatProviderVoiceLanguage, formatProviderVoiceLocale, formatProviderVoiceRegion, providerVoiceLocaleSearchText } from "./providerVoiceLocale";

describe("providerVoiceLocale", () => {
  it("renders provider locale IDs as friendly language and country labels", () => {
    expect(formatProviderVoiceLocale("en_GB")).toBe("English · United Kingdom");
    expect(formatProviderVoiceLocale("fr_FR")).toBe("French · France");
    expect(formatProviderVoiceLocale("bg_BG")).toBe("Bulgarian · Bulgaria");
    expect(formatProviderVoiceLocale("cs_CZ")).toBe("Czech · Czechia");
  });

  it("keeps raw provider locale IDs available to search without displaying them", () => {
    expect(providerVoiceLocaleSearchText("en_GB")).toContain("English · United Kingdom");
    expect(providerVoiceLocaleSearchText("en_GB")).toContain("en_GB");
  });

  it("separates language group labels from country row labels", () => {
    expect(formatProviderVoiceLanguage("en_AU")).toBe("English");
    expect(formatProviderVoiceRegion("en_AU")).toBe("Australia");
    expect(formatProviderVoiceLanguage("en_US")).toBe("English");
    expect(formatProviderVoiceRegion("en_US")).toBe("United States");
  });

  it("does not display a raw locale fallback when metadata is absent", () => {
    expect(formatProviderVoiceLocale(null)).toBe("Language unavailable");
  });
});
