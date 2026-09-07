import {
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import type {
  CanonicalAuthUser,
  MemberAccountStatus,
  StudioRichMember,
} from "../data/memberTypes.js";
import { planMemberBootstrap } from "../logic/memberBootstrap.js";
import type { MemberRepository } from "../logic/memberRepository.js";

export const MEMBER_COLLECTION_PATH = "members";

function assertUid(uid: string): void {
  if (!uid || uid.trim() !== uid || uid.includes("/")) throw new Error("invalid_member_uid");
}

function nullableString(data: DocumentData, field: string): string | null {
  const value = data[field];
  if (value === null || typeof value === "string") return value;
  throw new Error(`invalid_member_${field}`);
}

function memberTimestamp(data: DocumentData, field: string): Date {
  const value = data[field];
  if (value instanceof Timestamp) return value.toDate();
  throw new Error(`invalid_member_${field}`);
}

function accountStatus(data: DocumentData): MemberAccountStatus {
  const value = data.accountStatus;
  if (value === "active" || value === "suspended" || value === "deleted") return value;
  throw new Error("invalid_member_accountStatus");
}

function decodeMember(snapshot: DocumentSnapshot<DocumentData>): StudioRichMember | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const uid = data.uid;
  if (typeof uid !== "string" || uid !== snapshot.id) throw new Error("member_uid_mismatch");
  if (!Number.isInteger(data.onboardingVersion) || data.onboardingVersion < 1) {
    throw new Error("invalid_member_onboardingVersion");
  }

  return {
    uid,
    displayName: nullableString(data, "displayName"),
    photoURL: nullableString(data, "photoURL"),
    accountStatus: accountStatus(data),
    createdAt: memberTimestamp(data, "createdAt"),
    updatedAt: memberTimestamp(data, "updatedAt"),
    lastSeenAt: memberTimestamp(data, "lastSeenAt"),
    onboardingVersion: data.onboardingVersion,
  };
}

export class FirestoreMemberRepository implements MemberRepository {
  constructor(private readonly firestore: Firestore) {}

  async getMember(uid: string): Promise<StudioRichMember | null> {
    assertUid(uid);
    return decodeMember(await getDoc(doc(this.firestore, MEMBER_COLLECTION_PATH, uid)));
  }

  async ensureMemberForAuthUser(authUser: CanonicalAuthUser): Promise<StudioRichMember> {
    assertUid(authUser.uid);
    const memberReference = doc(this.firestore, MEMBER_COLLECTION_PATH, authUser.uid);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(memberReference);
      const existingMember = decodeMember(snapshot);
      const plan = planMemberBootstrap(existingMember, authUser, serverTimestamp());

      if (plan.kind === "create") transaction.set(memberReference, plan.data);
      else {
        transaction.update(memberReference, {
          updatedAt: plan.data.updatedAt,
          lastSeenAt: plan.data.lastSeenAt,
        });
      }
    });

    const member = await this.getMember(authUser.uid);
    if (!member) throw new Error("member_bootstrap_missing_after_commit");
    return member;
  }

  async updateLastSeen(uid: string): Promise<StudioRichMember> {
    assertUid(uid);
    const memberReference = doc(this.firestore, MEMBER_COLLECTION_PATH, uid);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(memberReference);
      if (!snapshot.exists()) throw new Error("member_not_found");
      decodeMember(snapshot);
      transaction.update(memberReference, {
        updatedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    });

    const member = await this.getMember(uid);
    if (!member) throw new Error("member_not_found_after_update");
    return member;
  }
}
