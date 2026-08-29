import { describe, expect, it } from "vitest";
import { positionVoicePopover } from "./voicePopoverPosition";

describe("VOICE property popover positioning", () => {
  it("keeps a menu in the viewport and opens below when space permits", () => {
    expect(positionVoicePopover({ left: 20, top: 40, right: 110, bottom: 70 }, { width: 800, height: 600 })).toEqual({ left: 20, top: 78, maxHeight: 360 });
  });

  it("opens upward near the bottom and constrains a tall menu", () => {
    expect(positionVoicePopover({ left: 760, top: 540, right: 790, bottom: 570 }, { width: 800, height: 600 })).toEqual({ left: 508, top: 180, maxHeight: 360 });
  });
});
