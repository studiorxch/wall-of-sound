import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * BLACKBOOK Presentation Readiness -- Top-Bar Narrow-Viewport Collision Fix V1.
 *
 * #status-toast (centered, top:18px, z-index 11) overlapped #event-music
 * (the RADIO island, left-anchored, top:16px, ~52px tall, z-index 9) below
 * 900px -- confirmed via real rendered geometry on iPad portrait (834px),
 * 900x700, and 700x900: the persistent signed-out "Private page -- sign in
 * to draw" message sat directly over RADIO OFF and the volume slider for
 * the entire signed-out session.
 *
 * Fixed with a `@media (max-width: 900px) { #status-toast { top: 76px; } }`
 * override, reusing the same breakpoint as #bottom-bar's own existing
 * narrow-viewport fallback.
 *
 * This guards two things a plain substring check would miss:
 * 1. The override rule actually exists with the expected selector/value.
 * 2. It appears AFTER the base `#status-toast { ... top: 18px ... }` rule
 *    in source order -- CSS cascade resolves equal-specificity rules by
 *    source position regardless of a media query's own position in the
 *    file, so an override placed BEFORE the rule it overrides silently
 *    loses (this exact mistake was caught during this fix's own
 *    development: an early draft placed the override inside the existing
 *    early `@media` block, before the base `#status-toast` rule later in
 *    the file, and the override never took effect).
 */
describe("BLACKBOOK Presentation Readiness -- top-bar narrow-viewport collision fix", () => {
  it("blackbook.html: the #status-toast narrow-viewport override exists after the base rule, at the shared 900px breakpoint", () => {
    const html = readFileSync(new URL("../../blackbook.html", import.meta.url), "utf8");

    const baseRuleMatch = html.match(/#status-toast\s*\{[^}]*top:\s*18px[^}]*\}/);
    expect(baseRuleMatch).not.toBeNull();
    const baseRuleIndex = baseRuleMatch!.index!;

    const overrideLiteral = "#status-toast { top: 76px; }";
    const overrideIndex = html.indexOf(overrideLiteral);
    expect(overrideIndex).toBeGreaterThan(-1);

    // Source order: the override must appear after the base rule it
    // overrides (equal-specificity CSS resolves by source position,
    // regardless of a media query's own position in the file).
    expect(overrideIndex).toBeGreaterThan(baseRuleIndex);

    // Guard against a lazy/overly-permissive media-query match spanning
    // back to the file's FIRST, unrelated `@media (max-width: 900px)`
    // block (#bottom-bar's own fallback, earlier in the file): the
    // nearest preceding occurrence of that media-query opening must also
    // be after the base rule -- i.e. it must be the second occurrence,
    // this override's own block, not the first.
    const nearestPrecedingMediaQueryIndex = html.lastIndexOf("@media (max-width: 900px)", overrideIndex);
    expect(nearestPrecedingMediaQueryIndex).toBeGreaterThan(baseRuleIndex);
  });
});
