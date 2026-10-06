import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * BLACKBOOK SYSTEM-MENU AFFORDANCE REMOVAL V1.
 *
 * `#blackbook-menu` ("…") was reserved markup for a future system menu
 * (About StudioRich / Feedback / Help / Version) that was never built: it
 * was permanently `disabled`, never queried or wired by any runtime code
 * (confirmed by inspection -- no listener, no enable path), and BLACKBOOK
 * has no current action or setting that needs a menu home (Artwork delete
 * already lives per-page in the PAGES drawer; there is no rename/export/
 * share functionality anywhere in this surface). A permanently inert
 * control is removed outright rather than kept reserved or built out to
 * justify its own existence -- BLACKBOOK must never present an
 * interactive-looking control that does nothing.
 *
 * This guards both HTML surfaces that shared the markup against it
 * silently reappearing.
 */
describe("BLACKBOOK SYSTEM-MENU AFFORDANCE REMOVAL V1", () => {
  it("blackbook.html no longer contains the dead #blackbook-menu control", () => {
    const html = readFileSync(new URL("../../blackbook.html", import.meta.url), "utf8");
    expect(html).not.toContain("blackbook-menu");
  });

  it("blackbook-spray-test.html no longer contains the dead #blackbook-menu control", () => {
    const html = readFileSync(new URL("../../blackbook-spray-test.html", import.meta.url), "utf8");
    expect(html).not.toContain("blackbook-menu");
  });
});
