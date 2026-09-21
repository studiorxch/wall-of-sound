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
} from "../data/artworkTypes.js";
import { boundsForMarks, createMapArtworkDocument, validateArtworkMark } from "../logic/artworkDocument.js";

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
  if (stroke.type === "material-erasure") {
    const decoded: ArtworkMark = format === "local-2d-erasure-v1"
      ? { id: String(stroke.id ?? ""), type: "material-erasure", createdAt, geometry: { format, points: Array.isArray(geometry?.points) ? geometry.points.map(decodeLocalPoint) : [] }, targetMaterialId: String(stroke.targetMaterialId ?? "") as "graphite", width: Number(stroke.width) }
      : { id: String(stroke.id ?? ""), type: "material-erasure", createdAt, geometry: { format: "geographic-erasure-v1", points: Array.isArray(geometry?.points) ? geometry.points.map(decodePoint) : [] }, targetMaterialId: String(stroke.targetMaterialId ?? "") as "graphite", width: Number(stroke.width) };
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
    ...(material ? { material: { supplyId: String(material.supplyId) as "pencil", materialId: String(material.materialId) as "graphite" } } : {}),
  };
  const decoded: ArtworkMark = format === "local-2d-stroke-v1"
    ? { ...base, geometry: { format, points: Array.isArray(geometry?.points) ? geometry.points.map(decodeLocalPoint) : [] } }
    : { ...base, geometry: { format: "geographic-stroke-v1", points: Array.isArray(geometry?.points) ? geometry.points.map(decodePoint) : [] } };
  validateArtworkMark(decoded);
  return decoded;
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
  const marks = legacy ? data.geometry.strokes.map((stroke: unknown) => legacyMark(stroke, createdAt)) : Array.isArray(data.marks) ? data.marks.map(decodeMark) : [];
  if (!marks.length) throw new Error("invalid_artwork_marks");
  if (data.state !== "draft" && data.state !== "archived") throw new Error("invalid_artwork_state");
  if (data.visibility !== "private") throw new Error("invalid_artwork_visibility");
  return {
    id,
    creatorId: data.creatorId,
    createdAt,
    updatedAt,
    surfaceId: legacy ? "map:new-york" : String(data.surfaceId ?? ""),
    composition: legacy ? { bounds: boundsForMarks(marks), startedAt: createdAt, lastEditedAt: updatedAt } : { bounds: data.composition.bounds, startedAt: data.composition.startedAt.toDate(), lastEditedAt: data.composition.lastEditedAt.toDate() },
    marks,
    state: data.state,
    visibility: "private",
  };
}

function decodeArtwork(snapshot: DocumentSnapshot<DocumentData>): MapArtwork {
  if (!snapshot.exists()) throw new Error("artwork_not_found");
  return decodeArtworkData(snapshot.id, snapshot.data());
}

function storedArtwork(artwork: Artwork, updatedAt: ReturnType<typeof serverTimestamp>) {
  return { creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, createdAt: Timestamp.fromDate(artwork.createdAt), updatedAt, composition: { bounds: boundsForMarks(artwork.marks), startedAt: Timestamp.fromDate(artwork.composition.startedAt), lastEditedAt: updatedAt }, marks: artwork.marks, state: artwork.state, visibility: artwork.visibility };
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

  async removeOwnedArtworkMark(artworkId: string, creatorId: string, markId: string): Promise<MapArtwork | null> {
    assertIdentifier(artworkId, "artwork_id"); assertIdentifier(creatorId, "member_uid"); assertIdentifier(markId, "mark_id");
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    let deleted = false;
    await runTransaction(this.firestore, async (transaction) => {
      const artwork = decodeArtwork(await transaction.get(reference));
      if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
      const marks = artwork.marks.filter((mark) => mark.id !== markId);
      if (marks.length === artwork.marks.length) return;
      if (!marks.length) { transaction.delete(reference); deleted = true; return; }
      transaction.set(reference, storedArtwork({ ...artwork, marks }, serverTimestamp()));
    });
    return deleted ? null : decodeArtwork(await getDoc(reference));
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

  async deleteOwnedArtwork(artworkId: string, creatorId: string): Promise<void> {
    assertIdentifier(artworkId, "artwork_id");
    assertIdentifier(creatorId, "member_uid");
    const reference = doc(this.firestore, ARTWORK_COLLECTION_PATH, artworkId);
    const artwork = decodeArtwork(await getDoc(reference));
    if (artwork.creatorId !== creatorId) throw new Error("artwork_owner_mismatch");
    await deleteDoc(reference);
  }
}
