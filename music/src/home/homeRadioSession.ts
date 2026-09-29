import { createRadioChannelReceiver, type RadioChannelReceiver, type RadioChannelReceiverListener } from "../logic/radio/createRadioChannelReceiver";

/**
 * RADIO-01 -- persistent HOME's own RADIO session manager. The underlying
 * receiver (engine + controller + in-flight playback) is constructed
 * lazily, at most once, on the FIRST hosted surface that reaches it --
 * reused verbatim (same engine, same controller, same in-flight playback)
 * across every later surface swap for the lifetime of this manager (in
 * practice, HOME's own document lifetime). HOME never constructs a second
 * engine; this is the ONE persistent owner every hosted surface's own
 * `window.SBE.RadioChannelReceiver` ultimately delegates to (see
 * `radioChannelReceiverRuntime.ts`'s own hosted branch).
 *
 * Deliberately reuses `createRadioChannelReceiver()` verbatim by default --
 * the exact same factory a standalone document's own bootstrap still calls
 * locally -- never a second/parallel engine implementation for the hosted
 * case. The factory is injectable so this manager's own lazy-singleton and
 * listener-handoff behavior is unit testable without a real engine/Firebase
 * Auth/Firestore instance.
 *
 * Each newly-mounted hosted surface calls `acquire()` exactly once (see
 * `getRadioSession` in `homeRuntime.ts`) to obtain a receiver-shaped handle
 * bound to the ONE underlying session. A document may legitimately
 * register MORE THAN ONE listener on its own handle (this receiver's own
 * shared bootstrap script keeps a `window.SBE.RadioChannelReceiverState`
 * mirror subscribed AND the surface's own UI wiring -- `blackbookRadioUI.ts`/
 * `radioChannelHud.js` -- separately subscribes its own `render` callback)
 * -- both must keep working for the lifetime of that ONE mount. What must
 * NOT happen is an old, now-torn-down surface's listeners lingering once a
 * NEW surface mounts. So listener cleanup happens once per `acquire()`
 * call (once per new mount), clearing every listener the PREVIOUS mount
 * registered all at once -- never per individual `subscribe()` call, which
 * would incorrectly kick out a still-current mount's own second listener.
 */
export interface HomeRadioSessionManager {
  acquire(): RadioChannelReceiver;
}

export function createHomeRadioSessionManager(createReceiver: () => RadioChannelReceiver = createRadioChannelReceiver): HomeRadioSessionManager {
  let session: RadioChannelReceiver | undefined;
  let unsubscribers: Array<() => void> = [];

  function getSession(): RadioChannelReceiver {
    session ??= createReceiver();
    return session;
  }

  return {
    acquire(): RadioChannelReceiver {
      const target = getSession();
      // A new mount is claiming the session -- clear every listener the
      // PREVIOUS mount registered, all at once, right now -- never one at
      // a time per subscribe() call (see this module's own doc above).
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      return {
        turnOn: target.turnOn,
        turnOff: target.turnOff,
        setVolume: target.setVolume,
        getVolume: target.getVolume,
        isOn: target.isOn,
        subscribe(listener: RadioChannelReceiverListener): () => void {
          const unsubscribe = target.subscribe(listener);
          unsubscribers.push(unsubscribe);
          return () => {
            unsubscribe();
            unsubscribers = unsubscribers.filter((candidate) => candidate !== unsubscribe);
          };
        },
      };
    },
  };
}
