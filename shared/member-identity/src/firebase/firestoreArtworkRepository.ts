import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import type {
  ArtworkRepository,
  Artwork,
  ArtworkMark,
  CreateArtworkInput,
  CreateMapArtworkInput,
  GeographicArtworkPoint,
  LocalArtworkPoint,
  MapArtwork,
  PageFrame,
} from "../data/artworkTypes.js";
import type { ArtMaterialId, ArtSupplyId } from "../data/artSupplyTypes.js";
import { boundsForMarks, createMapArtworkDocument, normalizeArtworkTitle, validateArtworkMark } from "../logic/artworkDocument.js";

export const ARTWORK_COLLECTION_PATH = "artworks";

function assertIdentifier(value: string, field: string): void {
  if (!value || value.trim() !== value || value.includes("/")) throw new Error(`invalid_${field}`);
}

function timestamp(data: DocumentData, field: string): Date {
  if (!(data[field] instanceof Timestamp)) throw new Error(`invalid_artwork_${field}`);
  return data[field].toDate();
}

function decodePoint(value: unknown): GeographicArtworkPoint {
  if (!value || typeof value !== "object") throw new Error("invalid_artwork_point");
  const point = value as Record<string, unknown>;
  if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) {
    throw new Error("invalid_artwork_point");
  }
  return { longitude: point.longitude as number, latitude: point.latitude as number };
}

function decodeLocalPoint(value: unknown): LocalArtworkPoint {
  if (!value || typeof value !== "object") throw new Error("invalid_artwork_point");
  const point = value as Record<string, unknown>;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("invalid_artwork_point");
  return { x: point.x as number, y: point.y as number };
}

function decodeMark(value: unknown): ArtworkMark {
  if (!value || typeof value !== "object") throw new Error("invalid_artwork_stroke");
  const stroke = value as Record<string, unknown>;
  const style = stroke.style as Record<string, unknown> | null;
  const geometry = stroke.geometry as Record<string, unknown> | null;
  const format = geometry?.format;
  const createdAt = stroke.createdAt instanceof Timestamp ? stroke.createdAt.toDate() : new Date(0);
  // Calibration V1 Revision 7: `authoredZoom` (see artworkTypes.ts's own
  // doc) only exists on GEOGRAPHIC Marks -- never carried through for a
  // local-2d (Blackbook) format, matching the canonical type. Omitted
  // entirely (not written as undefined) when the stored document doesn't
  // have it, so a legacy Mark decodes exactly as it did before this field
  // existed.
  const isGeographicFormat = format !== "local-2d-stroke-v1" && format !== "local-2d-erasure-v1";
  const authoredZoom = isGeographicFormat && Number.isFinite(stroke.authoredZoom)
    ? { authoredZoom: stroke.authoredZoom as number }
    : {};
  if (stroke.type === "material-erasure") {
    const decoded: ArtworkMark = format === "local-2d-erasure-v1"
      ? { id: String(stroke.id ?? ""), type: "material-erasure", createdAt, geometry: { format, points: Array.isArray(geometry?.points) ? geometry.points.map(decodeLocalPoint) : [] }, targetMaterialId: String(stroke.targetMaterialId ?? "") as "graphite", width: Number(stroke.width) }
      : { id: String(stroke.id ?? ""), type: "material-erasure", createdAt, geometry: { format: "geographic-erasure-v1", points: Array.isArray(geometry?.points) ? geometry.points.map(decodePoint) : [] }, targetMaterialId: String(stroke.targetMaterialId ?? "") as "graphite", width: Number(stroke.width), ...authoredZoom };
    validateArtworkMark(decoded);
    return decoded;
  }
  const material = stroke.material && typeof stroke.material === "object" ? stroke.material as Record<string, unknown> : null;
  const base = {
    id: String(stroke.id ?? ""),
    type: "stroke" as const,
    createdAt,
    style: {
      color: String(style?.color ?? ""),
      width: Number(style?.width),
      opacity: Number(style?.opacity),
    },
    ...(material ? { material: {
      supplyId: String(material.supplyId) as ArtSupplyId,
      materialId: String(material.materialId) as ArtMaterialId,
      // Graphite Grades Foundation V1: decoded together, omitted together --
      // a legacy Mark (or a non-graded supply) never gets an invented
      // variant identity.
      ...(typeof material.variantId === "string" && Number.isFinite(material.profileVersion)
        ? { variantId: material.variantId, profileVersion: material.profileVersion as number }
        : {}),
    } } : {}),
  };
  const decoded: ArtworkMark = format === "local-2d-stroke-v1"
    ? { ...base, geometry: { format, points: Array.isArray(geometry?.points) ? geometry.points.map(decodeLocalPoint) : [] } }
    : { ...base, geometry: { format: "geographic-stroke-v1", points: Array.isArray(geometry?.points) ? geometry.points.map(decodePoint) : [] }, ...authoredZoom };
  validateArtworkMark(decoded);
  return decoded;
}

function decodePageFrame(value: unknown): PageFrame | undefined {
  if (!value || typeof value !== "object") return undefined;
  const frame = value as Record<string, unknown>;
  if (!Number.isFinite(frame.x) || !Number.isFinite(frame.y) || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) {
    return undefined;
  }
  return { x: frame.x as number, y: frame.y as number, width: frame.width as number, height: frame.height as number };
}

function legacyMark(value: unknown, createdAt: Date): ArtworkMark {
  if (!value || typeof value !== "object") throw new Error("invalid_artwork_stroke");
  const stroke = value as Record<string, unknown>;
  return decodeMark({ ...stroke, type: "stroke", createdAt: Timestamp.fromDate(createdAt), geometry: { format: "geographic-stroke-v1", points: stroke.points } });
}

export function decodeArtworkData(id: string, data: DocumentData): MapArtwork {
  if (typeof data.creatorId !== "string") throw new Error("invalid_artwork_creatorId");
  const createdAt = timestamp(data, "createdAt");
  const updatedAt = timestamp(data, "updatedAt");
  const legacy = data.surface?.type === "map" && data.geometry?.format === "geographic-strokes-v1" && Array.isArray(data.geometry.strokes);
  // BLACKBOOK CLEAR + Single-Step Undo V1 -- a real, legitimately-cleared
  // Artwork now persists with ZERO marks (see `replaceOwnedArtworkMarks`'s
  // own doc) and must still decode successfully -- the previous
  // `if (!marks.length) throw new Error("invalid_artwork_marks")` here
  // rejected exactly that case. Matches the same relaxation already made
  // at the write side (firestore.rules' `hasValidArtworkV1Shape`,
  // `storedArtwork`'s own bounds handling): a genuinely malformed document
  // (no `marks` field at all) still decodes to `[]` via the ternary above
  // rather than throwing, same as before this change -- there was never a
  // way to distinguish "malformed" from "legitimately empty" at this
  // layer, and the write side is what actually enforces well-formedness.
  const marks = legacy ? data.geometry.strokes.map((stroke: unknown) => legacyMark(stroke, createdAt)) : Array.isArray(data.marks) ? data.marks.map(decodeMark) : [];
  if (data.state !== "draft" && data.state !== "archived") throw new Error("invalid_artwork_state");
  if (data.visibility !== "private") throw new Error("invalid_artwork_visibility");
  const pageFrame = decodePageFrame(data.pageFrame);
  return {
    id,
    creatorId: data.creatorId,
    createdAt,
    updatedAt,
    surfaceId: legacy ? "map:new-york" : String(data.surfaceId ?? ""),
    // ARTWORK V2: a document written before this field existed (legacy or
    // Blackbook) decodes to the same defaults `createMapArtworkDocument`
    // writes for a new caller that omits them -- never `undefined`.
    artworkType: data.artworkType === "blank" ? "blank" : "map",
    title: typeof data.title === "string" ? data.title : "",
    composition: legacy ? { bounds: boundsForMarks(marks), startedAt: createdAt, lastEditedAt: updatedAt } : { bounds: data.composition.bounds, startedAt: data.composition.startedAt.toDate(), lastEditedAt: data.composition.lastEditedAt.toDate() },
    marks,
    state: data.state,
    visibility: "private",
    ...(pageFrame ? { pageFrame } : {}),
  };
}

function decodeArtwork(snapshot: DocumentSnapshot<DocumentData>): MapArtwork {
  if (!snapshot.exists()) throw new Error("artwork_not_found");
  return decodeArtworkData(snapshot.id, snapshot.data());
}

function storedArtwork(artwork: Artwork, updatedAt: ReturnType<typeof serverTimestamp>) {
  return {
    creatorId: artwork.creatorId,
    surfaceId: artwork.surfaceId,
    artworkType: artwork.artworkType,
    title: artwork.title,
    createdAt: Timestamp.fromDate(artwork.createdAt),
    updatedAt,
    // BLACKBOOK CLEAR + Single-Step Undo V1 -- `boundsForMarks([])` throws
    // ("artwork_requires_mark"): it was never meant to run against an
    // empty marks array, since every PRIOR caller either always had at
    // least one mark (append/create) or deleted the whole document rather
    // than persisting zero marks (removeOwnedArtworkMark). CLEAR is the
    // first caller that legitimately persists an empty marks array while
    // keeping the document alive -- the previous bounds are simply kept
    // (meaningless while there's nothing to show, harmless to leave
    // stale; recomputed correctly the moment any mark exists again).
    // Byte-identical to the previous behavior whenever marks is non-empty.
    composition: { bounds: artwork.marks.length > 0 ? boundsForMarks(artwork.marks) : artwork.composition.bounds, startedAt: Timestamp.fromDate(artwork.composition.startedAt), lastEditedAt: updatedAt },
    marks: artwork.marks,
    state: artwork.state,
    visibility: artwork.visibility,
    // Blackbook Spatial Workspace V1: immutable after creation (rules-
    // enforced) -- carried through unchanged on every rewrite (rename,
    // mark append/remove), never dropped, never re-derived.
    ...(artwork.pageFrame ? { pageFrame: artwork.pageFrame } : {}),
  };
}

export class FirestoreArtworkRepository implements ArtworkRepository {
  constructor(private readonly firestore: Firestore) {}

  async createArtwork(input: CreateArtworkInput): Promise<Artwork> {
    assertIdentifier(input.creatorId, "member_uid");
    const reference = doc(collection(this.firestore, ARTWORK_COLLECTION_PATH));
    await setDoc(reference, createMapArtworkDocument(input, serverTimestamp()));
    return decodeArtwork(await getDoc(reference));
  }

  async createMapArtwork(input: CreateMapArtworkInput): Promise<MapArtwork> {
    return this.createArtwork(input);
  }

  async appendOwnedArtworkMark(artworkId: string, creatorId: string, mark: ArtworkMark): Promise<MapArtwork> {
    assertIdentifier(artworkId, "artwork_id"); assertIdentifier(creatorId, "member_uid"); validateArtworkMark(mark);
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    await runTransaction(this.firestore, async (transaction) => {
      const artwork = decodeArtwork(await transaction.get(reference));
      if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
      const marks = artwork.marks.some((item) => item.id === mark.id) ? artwork.marks : [...artwork.marks, mark];
      transaction.set(reference, storedArtwork({ ...artwork, marks }, serverTimestamp()));
    });
    return decodeArtwork(await getDoc(reference));
  }

  /**
   * BLACKBOOK Artwork DELETE V1 -- this used to `transaction.delete(reference)`
   * (returning `null`) the instant removing a Mark emptied `marks`. That
   * was never a deliberate "delete the Artwork" decision -- it was a
   * side effect of an older assumption (since relaxed for CLEAR, see
   * `replaceOwnedArtworkMarks`/`storedArtwork`/`decodeArtworkData`'s own
   * docs) that an Artwork document could never legitimately hold zero
   * Marks. Now that it can, undoing your way down to zero Marks one at a
   * time must behave exactly like CLEAR does -- the Artwork and its own
   * identity survive, empty -- never like DELETE, which is now its own
   * explicit, first-class operation (`deleteOwnedArtwork`). This method
   * therefore never deletes the document itself; the returned value is
   * always the (possibly now-empty) surviving Artwork, never `null` --
   * the `| null` return type is kept only for interface/caller
   * compatibility (no caller needs updating; `retain()` in
   * mapArtworkBridge.ts already handles a non-null result correctly, and
   * simply never takes its "was removed" branch from this method anymore).
   */
  async removeOwnedArtworkMark(artworkId: string, creatorId: string, markId: string): Promise<MapArtwork | null> {
    assertIdentifier(artworkId, "artwork_id"); assertIdentifier(creatorId, "member_uid"); assertIdentifier(markId, "mark_id");
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    await runTransaction(this.firestore, async (transaction) => {
      const artwork = decodeArtwork(await transaction.get(reference));
      if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
      const marks = artwork.marks.filter((mark) => mark.id !== markId);
      if (marks.length === artwork.marks.length) return;
      transaction.set(reference, storedArtwork({ ...artwork, marks }, serverTimestamp()));
    });
    return decodeArtwork(await getDoc(reference));
  }

  async replaceOwnedArtworkMarks(artworkId: string, creatorId: string, marks: readonly ArtworkMark[]): Promise<Artwork> {
    assertIdentifier(artworkId, "artwork_id"); assertIdentifier(creatorId, "member_uid");
    marks.forEach(validateArtworkMark);
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    await runTransaction(this.firestore, async (transaction) => {
      const artwork = decodeArtwork(await transaction.get(reference));
      if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
      transaction.set(reference, storedArtwork({ ...artwork, marks: [...marks] }, serverTimestamp()));
    });
    return decodeArtwork(await getDoc(reference));
  }

  async listOwnedMapArtwork(creatorId: string): Promise<readonly MapArtwork[]> {
    return this.listOwnedArtwork(creatorId);
  }

  async listOwnedArtwork(creatorId: string): Promise<readonly Artwork[]> {
    assertIdentifier(creatorId, "member_uid");
    const snapshot = await getDocs(query(
      collection(this.firestore, ARTWORK_COLLECTION_PATH),
      where("creatorId", "==", creatorId),
    ));
    return snapshot.docs.map(decodeArtwork).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async renameOwnedArtwork(artworkId: string, creatorId: string, title: string): Promise<Artwork> {
    assertIdentifier(artworkId, "artwork_id");
    assertIdentifier(creatorId, "member_uid");
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    const normalizedTitle = normalizeArtworkTitle(title);
    await runTransaction(this.firestore, async (transaction) => {
      const artwork = decodeArtwork(await transaction.get(reference));
      if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
      transaction.set(reference, storedArtwork({ ...artwork, title: normalizedTitle }, serverTimestamp()));
    });
    return decodeArtwork(await getDoc(reference));
  }

  async deleteOwnedArtwork(artworkId: string, creatorId: string): Promise<void> {
    assertIdentifier(artworkId, "artwork_id");
    assertIdentifier(creatorId, "member_uid");
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    const artwork = decodeArtwork(await getDoc(reference));
    if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
    await deleteDoc(reference);
  }
}
