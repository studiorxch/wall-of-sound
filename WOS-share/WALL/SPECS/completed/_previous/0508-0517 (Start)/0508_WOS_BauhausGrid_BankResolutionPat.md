# 0508_WOS_BauhausGrid_BankResolutionPatch_v1.0.1

## Goal

Fix Bauhaus Grid generation so `_wos.generateBauhausGrid()` works whether it receives:

- a MIDI bank id, e.g. `bank_1778233508307_bsdr`
- a MIDI cartridge id, e.g. `midi_1778233508306`
- no id, in which case it should use `state.activeMidiBankId`

Current failure:

````txt
[BAUHAUS GRID] Cartridge not found: bank_...

This means the generator is treating a bank id as a cartridge id.

Files To Touch
wall/main.js

Optional only if necessary:

wall/ui/controls.js

Do not touch:

wall/engine/gridSystem.js
wall/index.html
wall/styles.css
wall/engine/registry.js
wall/engine/schemas.js
Required Fix

Add a resolver near the current Bauhaus grid functions:

function resolveMidiBankAndCartridge(inputId) {
  var id = inputId || state.activeMidiBankId || null;
  var banks = state.midiBanks || [];
  var cartridges = state.midiCartridges || [];

  var bank = null;
  var cartridge = null;

  if (id) {
    bank = banks.find(function (b) {
      return b && b.id === id;
    }) || null;

    cartridge = cartridges.find(function (c) {
      return c && c.id === id;
    }) || null;
  }

  // If input was a cartridge id, find its bank.
  if (cartridge && !bank) {
    bank = banks.find(function (b) {
      return b && (b.cartridgeId === cartridge.id || b.sourceCartridgeId === cartridge.id);
    }) || null;
  }

  // If input was a bank id, find its cartridge.
  if (bank && !cartridge) {
    var cartridgeId = bank.cartridgeId || bank.sourceCartridgeId || null;

    if (cartridgeId) {
      cartridge = cartridges.find(function (c) {
        return c && c.id === cartridgeId;
      }) || null;
    }
  }

  // Fallback: some older paths use same id for both.
  if (bank && !cartridge) {
    cartridge = cartridges.find(function (c) {
      return c && c.id === bank.id;
    }) || null;
  }

  if (cartridge && !bank) {
    bank = {
      id: cartridge.id,
      cartridgeId: cartridge.id,
      name: cartridge.name || "Imported MIDI",
      events: null
    };
  }

  return {
    inputId: id,
    bank: bank,
    cartridge: cartridge,
    bankId: bank ? bank.id : null,
    cartridgeId: cartridge ? cartridge.id : null
  };
}
Update generateBauhausGrid(bankId)

At the top of generateBauhausGrid(bankId), replace the current direct cartridge lookup with:

var resolved = resolveMidiBankAndCartridge(bankId);
var bank = resolved.bank;
var cartridge = resolved.cartridge;

if (!bank && !cartridge) {
  console.warn("[BAUHAUS GRID] Drop a MIDI file first");
  return null;
}

if (!cartridge) {
  console.warn("[BAUHAUS GRID] Cartridge not found:", {
    inputId: resolved.inputId,
    bankId: resolved.bankId,
    activeMidiBankId: state.activeMidiBankId
  });
  return null;
}

Then use:

var sourceBankId = bank ? bank.id : cartridge.id;
var sourceCartridgeId = cartridge.id;

The generated layer source should become:

source: {
  type: "midiBank",
  bankId: sourceBankId,
  cartridgeId: sourceCartridgeId
}
Important

The grid block count should come from the same event source used by MIDI playback.

Preferred event source:

var playbackEvents = getMidiNoteEventsForPlayback();

But if generateBauhausGrid(bankId) receives a non-active bank, it should still be able to generate from that specific bank/cartridge.

Add a helper if needed:

function getMidiPlaybackEventsForResolvedSource(bank, cartridge) {
  if (bank && Array.isArray(bank.events) && bank.events.length) {
    return bank.events.map(function (event, index) {
      return normalizeMidiPlaybackEvent(event, index);
    }).filter(Boolean);
  }

  if (bank && Array.isArray(bank.notes) && bank.notes.length) {
    return bank.notes.map(function (note, index) {
      return normalizeMidiPlaybackEvent(note, index);
    }).filter(Boolean);
  }

  if (cartridge && Array.isArray(cartridge.notes) && cartridge.notes.length) {
    return cartridge.notes.map(function (note, index) {
      return normalizeMidiPlaybackEvent(note, index);
    }).filter(Boolean);
  }

  return [];
}

Then in generateBauhausGrid():

var events = getMidiPlaybackEventsForResolvedSource(bank, cartridge);

if (!events.length) {
  console.warn("[BAUHAUS GRID] No MIDI events found for source", {
    bankId: sourceBankId,
    cartridgeId: sourceCartridgeId
  });
  return null;
}

Use events.length for:

note count
grid dimension calculation
grid block generation
debug stats
Required Layer Count Truth

For your current test file:

Roger Rabbit - Map Scene
6653 notes

Expected after fix:

_wos.generateBauhausGrid()
_wos.debugGridStats()

Should show:

gridBlocks: 6653
sourceNotes: 6653
playbackEvents: 6653
countMatch: true
Update _wos.debugGridStats()

Make sure it resolves both bankId and cartridgeId.

Stats should not assume layer.source.bankId is a cartridge id.

Use:

var resolved = resolveMidiBankAndCartridge(
  layer.source && (layer.source.bankId || layer.source.cartridgeId)
);

Then:

sourceNotes: resolved.cartridge && resolved.cartridge.notes ? resolved.cartridge.notes.length : 0
playbackEvents: getMidiPlaybackEventsForResolvedSource(resolved.bank, resolved.cartridge).length
Test Flow

After reload:

_wos.generateBauhausGrid()

Expected:

Drop a MIDI file first
null

Drop MIDI.

Then:

_wos.midi.banks()
_wos.midi.cartridges()
_wos.midiPlayback.events().length

Expected:

banks >= 1
cartridges >= 1
6653

Then:

_wos.generateBauhausGrid()
_wos.debugGridStats()
_wos.getSystemHudData().runtime

Expected:

one grid layer
gridBlocks: 6653
sourceNotes: 6653
playbackEvents: 6653
runtime.gridLayers: 1
runtime.gridBlocks: 6653

Then hit Play.

Expected:

audible MIDI playback continues
grid blocks pulse/highlight
midiLastTriggered changes while playing
Forbidden Changes

Do not:

rewrite MIDI importer
rewrite MIDI playback bridge
change grid UI
change renderer style
change controls layout
change playback behavior
touch registry/schemas

---

## Why `midiLastTriggered` may show `0`

If audible MIDI playback passed, then `lastTriggeredNotes` may be getting cleared quickly or checked between events. That’s okay for now.

The main blocker is:

```txt
grid was never generated

So there were no grid blocks available to pulse.
````
