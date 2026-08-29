import { describe, expect, it } from "vitest";
import { isVoiceTextEditingTarget } from "./voiceKeyboard";

describe("VOICE keyboard boundary", () => {
  it("leaves spaces and ordinary editing inside the Generate Script textarea", () => {
    expect(isVoiceTextEditingTarget({ tagName: "textarea" })).toBe(true);
  });

  it("leaves Voice Profile text fields and editable controls alone", () => {
    expect(isVoiceTextEditingTarget({ tagName: "input" })).toBe(true);
    expect(isVoiceTextEditingTarget({ tagName: "select" })).toBe(true);
    expect(isVoiceTextEditingTarget({ tagName: "div", isContentEditable: true })).toBe(true);
  });

  it("keeps keyboard navigation available for the non-editable library surface", () => {
    expect(isVoiceTextEditingTarget({ tagName: "button" })).toBe(false);
    expect(isVoiceTextEditingTarget(null)).toBe(false);
  });
});
