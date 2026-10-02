# StudioRich Member Identity

Canonical, UI-independent human identity authority for StudioRich products.

The package keeps Firebase behind a StudioRich-owned state and service contract.
WallOS and future Subway consumers should subscribe to the exported authority;
they must not initialize Firebase or invent another member identifier.

## Environment

The consuming browser build must pass its environment object to
`createFirebaseMemberIdentityAuthority`. These values are required:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

No Firebase service-account credential belongs in this client package.

For explicit local verification, set `VITE_FIREBASE_USE_EMULATORS=true`. The
package then connects to `<host>:9099` for Auth and `<host>:8080` for
Firestore, where `<host>` defaults to `127.0.0.1` -- production services
remain the default when the flag is absent, and this default is unchanged.

To let another device on the same LAN (e.g. an iPad testing a touch/Pencil
surface) reach a developer's own locally-running emulators, set
`VITE_FIREBASE_EMULATOR_HOST` to that machine's LAN IP alongside
`VITE_FIREBASE_USE_EMULATORS=true`. This only ever changes which host the
EMULATOR client connects to -- it has no effect, and is never read, unless
emulator mode is already on, so it can never point any part of this package
at real/production Firebase. The emulators themselves must also be started
listening on that interface (`firebase emulators:start --host 0.0.0.0`),
and the LAN IP must never be added to the real Firebase project's
Authorized domains -- the emulator's own mock sign-in widget does not need
or use that list at all.

## Lifecycle

```ts
import { createFirebaseMemberIdentityAuthority } from "@studiorich/member-identity";

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const unsubscribe = memberIdentity.subscribe((state) => {
  // Render or route from the StudioRich-owned state, not Firebase directly.
});

await memberIdentity.start();

// On application teardown:
unsubscribe();
memberIdentity.stop();
```

`start()` explicitly selects durable browser-local Firebase Auth persistence and
installs one auth-state listener. Authenticated users are resolved through the
idempotent `members/{uid}` repository before the authority reports `signedIn`.
