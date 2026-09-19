import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import type {
  ArtworkRepository,
  CreateMapArtworkInput,
  GeographicArtworkPoint,
  GeographicArtworkStroke,
  MapArtwork,
} from "../data/artworkTypes.js";
import { createMapArtworkDocument, validateGeographicStroke } from "../logic/artworkDocument.js";

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

function decodeStroke(value: unknown): GeographicArtworkStroke {
  if (!value || typeof value !== "object") throw new Error("invalid_artwork_stroke");
  const stroke = value as Record<string, unknown>;
  const style = stroke.style as Record<string, unknown> | null;
  const decoded: GeographicArtworkStroke = {
    id: String(stroke.id ?? ""),
    points: Array.isArray(stroke.points) ? stroke.points.map(decodePoint) : [],
    style: {
      color: String(style?.color ?? ""),
      width: Number(style?.width),
      opacity: Number(style?.opacity),
    },
  };
  validateGeographicStroke(decoded);
  return decoded;
}

function decodeArtwork(snapshot: DocumentSnapshot<DocumentData>): MapArtwork {
  if (!snapshot.exists()) throw new Error("artwork_not_found");
  const data = snapshot.data();
  if (typeof data.creatorId !== "string") throw new Error("invalid_artwork_creatorId");
  if (data.surface?.type !== "map") throw new Error("invalid_artwork_surface");
  if (data.geometry?.format !== "geographic-strokes-v1" || !Array.isArray(data.geometry.strokes)) {
    throw new Error("invalid_artwork_geometry");
  }
  if (data.state !== "draft" && data.state !== "archived") throw new Error("invalid_artwork_state");
  if (data.visibility !== "private") throw new Error("invalid_artwork_visibility");
  return {
    id: snapshot.id,
    creatorId: data.creatorId,
    createdAt: timestamp(data, "createdAt"),
    updatedAt: timestamp(data, "updatedAt"),
    surface: { type: "map" },
    geometry: {
      format: "geographic-strokes-v1",
      strokes: data.geometry.strokes.map(decodeStroke),
    },
    state: data.state,
    visibility: "private",
  };
}

export class FirestoreArtworkRepository implements ArtworkRepository {
  constructor(private readonly firestore: Firestore) {}

  async createMapArtwork(input: CreateMapArtworkInput): Promise<MapArtwork> {
    assertIdentifier(input.creatorId, "member_uid");
    const reference = doc(collection(this.firestore, ARTWORK_COLLECTION_PATH));
    await setDoc(reference, createMapArtworkDocument(input, serverTimestamp()));
    return decodeArtwork(await getDoc(reference));
  }

  async listOwnedMapArtwork(creatorId: string): Promise<readonly MapArtwork[]> {
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
