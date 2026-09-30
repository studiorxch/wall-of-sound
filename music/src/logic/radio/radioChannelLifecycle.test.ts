import { describe, it, expect } from "vitest";
import { canActivateChannel, canDeleteChannel } from "./radioChannelLifecycle";

describe("canActivateChannel", () => {
  it("rejects an empty rotation with a concise, specific reason", () => {
    const result = canActivateChannel({ rotation: { anchorAtMs: 0, programIds: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no default Program/i);
  });

  it("allows activation once at least one Program is in the rotation", () => {
    const result = canActivateChannel({ rotation: { anchorAtMs: 0, programIds: ["radprogram_a"] } });
    expect(result).toEqual({ ok: true });
  });
});

describe("canDeleteChannel", () => {
  it("refuses to delete an active Channel", () => {
    const result = canDeleteChannel({ status: "active" }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/deactivate/i);
  });

  it("refuses to delete an inactive Channel that has any schedule history, even a single cancelled block", () => {
    const result = canDeleteChannel({ status: "inactive" }, [{ id: "radschedule_1" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/schedule history/i);
  });

  it("allows deleting an inactive Channel with zero schedule blocks ever created", () => {
    const result = canDeleteChannel({ status: "inactive" }, []);
    expect(result).toEqual({ ok: true });
  });
});
