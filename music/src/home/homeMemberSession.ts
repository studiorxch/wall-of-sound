import { createFirebaseMemberIdentityAuthority, type MemberIdentityAuthority, type MemberIdentityStateListener } from "@studiorich/member-identity";

/**
 * MEMBER-01A -- persistent HOME's own MEMBER identity session manager,
 * modeled directly on `homeRadioSession.ts`. The underlying
 * `MemberIdentityAuthority` (same abstraction, same Firebase Auth/Firestore
 * `members/{uid}` domain every other consumer already uses -- never a new
 * identity system) is constructed lazily, at most once, on the FIRST
 * caller that reaches it -- reused verbatim across every later hosted
 * surface swap for the lifetime of this manager (in practice, HOME's own
 * document lifetime). HOME never constructs a second live instance for a
 * hosted session; this is the ONE persistent owner both the parent's own
 * avatar presentation AND every hosted surface's `getMemberIdentity()`
 * bridge call ultimately delegate to.
 *
 * Same listener-handoff discipline as `homeRadioSession.ts`: a mount that
 * has gone away must not leave a lingering subscription that could fire
 * into a torn-down surface's own now-stale closures. Listener cleanup
 * happens once per `acquire()` call (once per caller), clearing every
 * listener THAT SPECIFIC caller previously registered through THIS
 * manager -- never per individual `subscribe()` call, which would
 * incorrectly evict a still-current caller's own second listener (the
 * parent's own avatar AND a hosted surface's own local needs may both
 * legitimately hold a live subscription at once).
 */
export interface HomeMemberSessionManager {
  acquire(): MemberIdentityAuthority;
}

export function createHomeMemberSessionManager(
  createAuthority: () => MemberIdentityAuthority = () => createFirebaseMemberIdentityAuthority(import.meta.env),
): HomeMemberSessionManager {
  let session: MemberIdentityAuthority | undefined;
  let unsubscribers: Array<() => void> = [];

  function getSession(): MemberIdentityAuthority {
    session ??= createAuthority();
    return session;
  }

  return {
    acquire(): MemberIdentityAuthority {
      const target = getSession();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      return {
        getState: () => target.getState(),
        subscribe(listener: MemberIdentityStateListener): () => void {
          const unsubscribe = target.subscribe(listener);
          unsubscribers.push(unsubscribe);
          return () => {
            unsubscribe();
            unsubscribers = unsubscribers.filter((candidate) => candidate !== unsubscribe);
          };
        },
        start: () => target.start(),
        stop: () => target.stop(),
        signInWithEmailPassword: (email, password) => target.signInWithEmailPassword(email, password),
        createAccountWithEmailPassword: (email, password) => target.createAccountWithEmailPassword(email, password),
        signInWithGoogle: () => target.signInWithGoogle(),
        signInWithCredential: (serialized) => target.signInWithCredential(serialized),
        signOut: () => target.signOut(),
        updateProfile: (displayName) => target.updateProfile(displayName),
      };
    },
  };
}
