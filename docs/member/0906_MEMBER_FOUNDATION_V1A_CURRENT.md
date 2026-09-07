# StudioRich Member Identity Foundation V1A — Current Status

**Checkpoint:** Member Identity Foundation V1A

**Status:** PASS — code foundation complete; Firebase console, emulator rules, and live account verification remain external

**Implementation commit:** `95fd69094b4cdce65fa15336cba20f465d22682b`

**Last verified:** 2026-09-07

## Implemented

- One isolated `@studiorich/member-identity` package under `shared/`.
- Firebase JavaScript SDK pinned to `12.18.0`.
- One default Firebase app initializer with configuration equality checks and hot-reload reuse.
- One canonical auth/member authority per Firebase app, returned behind a StudioRich-owned interface.
- Explicit durable browser-local Firebase Auth persistence.
- Email/password sign-in and account creation, Google popup sign-in, sign-out, auth-state restoration, safe error states, and listener cleanup.
- Firebase Auth UID as the canonical human member identifier.
- Idempotent transactional `members/{uid}` bootstrap and load.
- Existing profile fields are preserved; returning bootstrap updates only `updatedAt` and `lastSeenAt`.
- Firestore timestamps are normalized to `Date` at the public package boundary so consumers do not import Firebase types.
- Source-controlled, owner-only Firestore rules for `members/{uid}`.
- Explicit emulator opt-in through `VITE_FIREBASE_USE_EMULATORS=true`; production services remain the default.
- Package output allowlist validated for future file/workspace consumption.

Human member identity remains separate from Residents, `sr-resident-*`, MUSIC IDs, RADIO listener preferences, local sessions, artwork placeholders, and the unused ChatGPT auth helper.

## Canonical Architecture

```text
StudioRich environment configuration
  → one Firebase app
  → Firebase Auth + durable browser persistence
  → one StudioRich member identity authority
  → transactional members/{Firebase Auth UID}
  → Firebase-free MemberIdentityAuthority consumed by future products
```

The package exposes the authority interface and `createFirebaseMemberIdentityAuthority`. It does not expose the concrete authority class, Firebase Auth gateway, or Firestore repository through its public entry point.

## Canonical Member Schema

```text
uid: Firebase Auth UID
displayName: string | null
photoURL: string | null
accountStatus: active | suspended | deleted
createdAt: server timestamp
updatedAt: server timestamp
lastSeenAt: server timestamp
onboardingVersion: 1+
```

Email remains Firebase Auth-owned and is not duplicated into `members/{uid}`.

## Required Environment Names

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- Optional local-only switch: `VITE_FIREBASE_USE_EMULATORS`

No real configuration value, API key, private key, token, cookie, service account, or credential is committed.

## Firestore Rules

`firestore.rules` is the repository authority but has not been deployed.

The rules permit an authenticated user to read, create, and update only `members/{their uid}`. Creation requires the exact V1 schema, UID equality, active status, onboarding version 1, and request-time server timestamps. Updates allow only `displayName`, `photoURL`, `updatedAt`, `lastSeenAt`, and `onboardingVersion`; `uid`, `accountStatus`, and `createdAt` are protected. Deletes and all unmatched access are denied.

Rules were manually/static reviewed. Emulator rules tests were not run because this host has no Java runtime. No production rule deployment command was executed.

## Verification Evidence

- Focused unit tests: **17/17 passed**, 6 test files.
- TypeScript strict check: **PASS**.
- Declaration/JavaScript build: **PASS**.
- Built public-package import and export-boundary check: **PASS**.
- Isolated-cache `npm pack --dry-run`: **PASS**, 46 intended files, built `dist` output included, source/tests excluded.
- Dependency install audit at implementation time: **0 vulnerabilities**.
- Scoped `git diff --check`: **PASS**.
- Secret-pattern scan across V1A configuration/source: **PASS**, no findings.
- Repository-wide runtime scan: only `shared/member-identity/src/firebase/firebaseClient.ts` initializes Firebase; Auth/Firestore services are obtained only through the package service boundary.
- Coupling scan: no MUSIC, MAPS, Wall, Subway, RADIO, Resident, or ChatGPT module import from the package.

## Files in the V1A Checkpoint

- `firebase.json`
- `firestore.rules`
- `shared/member-identity/.gitignore`
- `shared/member-identity/README.md`
- `shared/member-identity/package.json`
- `shared/member-identity/package-lock.json`
- `shared/member-identity/tsconfig.json`
- `shared/member-identity/tsconfig.build.json`
- `shared/member-identity/src/index.ts`
- `shared/member-identity/src/data/memberTypes.ts`
- `shared/member-identity/src/logic/memberBootstrap.ts`
- `shared/member-identity/src/logic/memberBootstrap.test.ts`
- `shared/member-identity/src/logic/memberRepository.ts`
- `shared/member-identity/src/logic/memberIdentityAuthority.ts`
- `shared/member-identity/src/logic/memberIdentityAuthority.test.ts`
- `shared/member-identity/src/firebase/firebaseConfig.ts`
- `shared/member-identity/src/firebase/firebaseConfig.test.ts`
- `shared/member-identity/src/firebase/firebaseClient.ts`
- `shared/member-identity/src/firebase/firebaseClient.test.ts`
- `shared/member-identity/src/firebase/firebaseServices.ts`
- `shared/member-identity/src/firebase/firebaseServices.test.ts`
- `shared/member-identity/src/firebase/firebaseAuthGateway.ts`
- `shared/member-identity/src/firebase/firestoreMemberRepository.ts`
- `shared/member-identity/src/firebase/createFirebaseMemberIdentityAuthority.ts`
- `shared/member-identity/src/firebase/createFirebaseMemberIdentityAuthority.test.ts`
- `docs/member/0906_MEMBER_FOUNDATION_V1A_CURRENT.md`

## Safety and Repository State

The initial V1A implementation began on `music/p0-clean-library-foundation` at `5c0018bc467eb580ac4ebce6a1fcb138c4938879` with 44 modified and 41 untracked pre-existing paths. Closure resumed at `95fd69094b4cdce65fa15336cba20f465d22682b` after concurrent cleanup/spatial-work commits; the resumed baseline contained 43 modified and 37 untracked non-V1A paths. The nested `studiorich-orbital` repository remained on `main` at `5ab54de37fb3fdd1752c67abbfef6e7c432be0e5` with its pre-existing `README.md` and `.nvmrc` changes.

No MUSIC, VOICE, MAPS, Subway, RADIO, Graffiti, Resident, Wall, WallOS UI, or nested `studiorich-orbital` file was edited or staged for this checkpoint.

## Not Live-Verified

The following remain unknown until an authorized Firebase console and live/dev verification pass:

- whether `studiorich-83b1e` remains the canonical production project;
- whether the StudioRich Web App and its six client configuration values are current;
- whether Email/Password and Google providers are enabled;
- whether `studiorich.tv` and `www.studiorich.tv` remain authorized domains;
- whether the default Firestore database still exists in `us-east4`;
- the production rules currently deployed;
- actual account creation, Google popup behavior, reload/browser restoration, UID/document equality, repeat bootstrap, sign-out/sign-in, own-member access, cross-member denial, and protected-field denial.

Production Firebase was not contacted, mutated, or deployed during V1A implementation or closure. No user or member document was created.

## Next Safe Checkpoint — WallOS Phase 1B

After explicit console verification and emulator/live authorization, consume `MemberIdentityAuthority` from the authoritative WallOS host, supply the verified environment configuration, and build only the minimal account/sign-in surface. WallOS and Subway must reference the returned canonical UID; neither may initialize Firebase or create another identity authority.

Do not reopen or replace the V1A Firebase app, auth authority, member repository, rules boundary, or resident/human identity separation.
