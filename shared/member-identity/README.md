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
package then connects only to `127.0.0.1:9099` for Auth and `127.0.0.1:8080`
for Firestore. Production services remain the default when the flag is absent.

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
