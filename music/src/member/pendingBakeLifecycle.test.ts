import { describe, expect, it } from "vitest";
import { partitionPendingBakesBySurvival, type OperationIdentity, type PendingBakeIdentity } from "./pendingBakeLifecycle";

function op(id: string): OperationIdentity {
  return { id };
}

function bake(operationId: string): PendingBakeIdentity {
  return { operationId };
}

describe("COMMITTED-CACHE PENDING-BAKE SURVIVAL V1 -- partitionPendingBakesBySurvival", () => {
  it("a pending bake whose own operation is still present survives", () => {
    const operations = [op("blackbook-operation-1"), op("blackbook-operation-2")];
    const pending = [bake("blackbook-operation-1")];
    const result = partitionPendingBakesBySurvival(operations, pending);
    expect(result.surviving).toEqual(pending);
    expect(result.orphaned).toEqual([]);
  });

  it("a pending bake whose own operation was removed (Undo of exactly that stroke) is orphaned, never merged", () => {
    const operations = [op("blackbook-operation-2")]; // operation-1 was undone
    const pending = [bake("blackbook-operation-1")];
    const result = partitionPendingBakesBySurvival(operations, pending);
    expect(result.surviving).toEqual([]);
    expect(result.orphaned).toEqual(pending);
  });

  it("CLEAR/NEW/sign-out (operations becomes fully empty) orphans every pending bake -- none can survive an empty Mark set", () => {
    const pending = [bake("blackbook-operation-1"), bake("blackbook-operation-2")];
    const result = partitionPendingBakesBySurvival([], pending);
    expect(result.surviving).toEqual([]);
    expect(result.orphaned).toEqual(pending);
  });

  it("Artwork/Pages switching (operations replaced by a DIFFERENT Artwork's own reloaded marks, using blackbook-mark-<id> ids) can never accidentally match a live-drawn blackbook-operation-<n> bake -- a live gesture's bake is always orphaned by a real switch, never misattributed to the new Artwork", () => {
    const newArtworkOperations = [op("blackbook-mark-abc123"), op("blackbook-mark-def456")];
    const pending = [bake("blackbook-operation-7")];
    const result = partitionPendingBakesBySurvival(newArtworkOperations, pending);
    expect(result.surviving).toEqual([]);
    expect(result.orphaned).toEqual(pending);
  });

  it("an UNRELATED Undo (removing a different, later operation) leaves an earlier operation's own pending bake surviving -- this is Finding A: the bake must not be forced to drop just because something else was undone", () => {
    const operations = [op("blackbook-operation-1"), op("blackbook-operation-2")]; // operation-3 (drawn after both) was just undone
    const pending = [bake("blackbook-operation-1")]; // operation-1's own bake, unrelated to the undo
    const result = partitionPendingBakesBySurvival(operations, pending);
    expect(result.surviving).toEqual(pending);
    expect(result.orphaned).toEqual([]);
  });

  it("rapid consecutive Spray strokes: multiple pending bakes partition independently, in FIFO order, regardless of which one(s) survive", () => {
    const operations = [op("blackbook-operation-1"), op("blackbook-operation-3")]; // operation-2 (the middle stroke) was undone
    const pending = [bake("blackbook-operation-1"), bake("blackbook-operation-2"), bake("blackbook-operation-3")];
    const result = partitionPendingBakesBySurvival(operations, pending);
    expect(result.surviving).toEqual([bake("blackbook-operation-1"), bake("blackbook-operation-3")]);
    expect(result.orphaned).toEqual([bake("blackbook-operation-2")]);
    // FIFO relative order among survivors is preserved (never reordered).
    expect(result.surviving.map((b) => b.operationId)).toEqual(["blackbook-operation-1", "blackbook-operation-3"]);
  });

  it("no pending bakes at all (the common case -- nothing in flight) is a safe no-op", () => {
    const result = partitionPendingBakesBySurvival([op("blackbook-operation-1")], []);
    expect(result.surviving).toEqual([]);
    expect(result.orphaned).toEqual([]);
  });

  it("is pure -- never mutates either input array", () => {
    const operations = [op("blackbook-operation-1")];
    const pending = [bake("blackbook-operation-1"), bake("blackbook-operation-2")];
    const operationsCopy = [...operations];
    const pendingCopy = [...pending];
    partitionPendingBakesBySurvival(operations, pending);
    expect(operations).toEqual(operationsCopy);
    expect(pending).toEqual(pendingCopy);
  });
});
