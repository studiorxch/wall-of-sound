// ── RadioChannelHud v1.0.0 ──────────────────────────────────────────────
// MAP × RADIO -- Production synchronized listener integration.
//
// Purpose:
//   The minimal receiver control surface for the ONE canonical RADIO
//   Channel ("studiorich-radio") on LIVE MAP: a "LIVE RADIO" broadcast
//   indicator, a RADIO ON/OFF receiver toggle, a personal volume slider,
//   and a transient Now Playing announcement on track change.
//
// Authority:
//   READS ONLY: window.SBE.RadioChannelReceiverState, published by
//   music/src/member/radioChannelReceiverRuntime.ts (same bridge pattern
//   subwayMemberRuntime.ts already uses for MemberIdentityState).
//   CONTROLS ONLY: window.SBE.RadioChannelReceiver.{turnOn,turnOff,setVolume}.
//   This module computes NOTHING about Channel/Program/track resolution --
//   it never owns a clock, never resolves a track, never fetches a
//   manifest. Every one of those decisions belongs to the existing RADIO
//   Channel Clock resolver chain, reached only through the bridge above.
//   Do NOT read Firestore, RADIO repositories, or any manifest directly
//   from this file -- that would make MAP a second broadcast authority,
//   which is explicitly prohibited.
//
// "LIVE RADIO" describes the BROADCAST, not the local receiver -- it stays
// lit whenever the Channel itself is active, independent of whether this
// listener's own receiver is ON or OFF (RadioChannelReceiverState.live).
//
// Explicitly NOT implemented here (out of scope for this batch): duration
// display, progress bar, seek, previous/next, shuffle, playlist browser,
// channel selector, listener counts.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var _els = null;
  var _nowPlayingHideTimer = null;
  var _lastTrackKey = null;

  function _injectCSS() {
    if (document.getElementById('wos-radio-channel-css')) return;
    var s = document.createElement('style');
    s.id = 'wos-radio-channel-css';
    s.textContent = [
      '#wos-radio-channel { position: fixed; top: 16px; right: 16px; z-index: 9400; display: flex; align-items: center; gap: 10px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: rgba(10,10,12,.72); backdrop-filter: blur(10px);',
      '  border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 8px 14px; color: #f4efe7; }',
      '#wos-radio-channel[data-watch-hide] { }',
      '#wos-radio-channel .wos-radio-live { display: flex; align-items: center; gap: 6px; font: 700 10px/1 inherit; letter-spacing: .06em; opacity: .35; }',
      '#wos-radio-channel .wos-radio-live[data-live="true"] { opacity: 1; }',
      '#wos-radio-channel .wos-radio-dot { width: 7px; height: 7px; border-radius: 50%; background: #ff3b30; }',
      '#wos-radio-channel .wos-radio-live[data-live="false"] .wos-radio-dot { background: rgba(255,255,255,.25); }',
      '#wos-radio-channel button { border: 1px solid rgba(255,255,255,.18); background: rgba(24,22,19,.9); color: #f4efe7; border-radius: 999px;',
      '  padding: 5px 12px; font: 700 10px/1 inherit; letter-spacing: .05em; cursor: pointer; }',
      '#wos-radio-channel button[data-on="true"] { border-color: #9adfa0; color: #9adfa0; }',
      '#wos-radio-channel input[type="range"] { width: 64px; }',
      '#wos-now-playing-radio { position: fixed; top: 62px; right: 16px; z-index: 9399; max-width: 260px; padding: 10px 14px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: rgba(10,10,12,.82); backdrop-filter: blur(10px);',
      '  border: 1px solid rgba(255,255,255,.14); border-radius: 12px; color: #f4efe7; opacity: 0; transform: translateY(-4px);',
      '  transition: opacity .4s ease, transform .4s ease; pointer-events: none; }',
      '#wos-now-playing-radio.wos-visible { opacity: 1; transform: translateY(0); }',
      '#wos-now-playing-radio .wos-np-title { font-size: 12px; font-weight: 700; }',
      '#wos-now-playing-radio .wos-np-artist { font-size: 10px; opacity: .7; margin-top: 2px; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function _build() {
    _injectCSS();
    var bar = document.createElement('div');
    bar.id = 'wos-radio-channel';
    bar.setAttribute('data-watch-hide', '');
    bar.innerHTML = [
      '<span class="wos-radio-live" data-live="false"><span class="wos-radio-dot"></span>LIVE RADIO</span>',
      '<button type="button" id="wos-radio-toggle" data-on="false">RADIO OFF</button>',
      '<input type="range" id="wos-radio-volume" min="0" max="1" step="0.01" />',
    ].join('');
    document.body.appendChild(bar);

    var nowPlaying = document.createElement('div');
    nowPlaying.id = 'wos-now-playing-radio';
    nowPlaying.setAttribute('data-watch-hide', '');
    nowPlaying.innerHTML = '<div class="wos-np-title"></div><div class="wos-np-artist"></div>';
    document.body.appendChild(nowPlaying);

    return {
      bar: bar,
      liveEl: bar.querySelector('.wos-radio-live'),
      toggleBtn: bar.querySelector('#wos-radio-toggle'),
      volumeInput: bar.querySelector('#wos-radio-volume'),
      nowPlayingEl: nowPlaying,
      npTitleEl: nowPlaying.querySelector('.wos-np-title'),
      npArtistEl: nowPlaying.querySelector('.wos-np-artist'),
    };
  }

  function _showNowPlaying(track) {
    var key = track.title + '|' + track.artist;
    if (key === _lastTrackKey) return; // only announce on an actual track change
    _lastTrackKey = key;
    _els.npTitleEl.textContent = track.title;
    _els.npArtistEl.textContent = track.artist;
    _els.nowPlayingEl.classList.add('wos-visible');
    if (_nowPlayingHideTimer) global.clearTimeout(_nowPlayingHideTimer);
    _nowPlayingHideTimer = global.setTimeout(function () {
      _els.nowPlayingEl.classList.remove('wos-visible');
    }, 6000);
  }

  function _render(state) {
    if (!_els || !state) return;
    _els.liveEl.setAttribute('data-live', state.live ? 'true' : 'false');
    var isOn = state.status === 'on';
    _els.toggleBtn.setAttribute('data-on', isOn ? 'true' : 'false');
    _els.toggleBtn.textContent = isOn ? 'RADIO ON' : 'RADIO OFF';
    if (isOn && state.nowPlaying) {
      _showNowPlaying(state.nowPlaying);
    } else if (!isOn) {
      _lastTrackKey = null;
    }
  }

  function init() {
    if (_els) return;
    var receiver = SBE.RadioChannelReceiver;
    if (!receiver) {
      global.setTimeout(init, 100);
      return;
    }
    _els = _build();
    _els.volumeInput.value = String(receiver.getVolume());
    _els.toggleBtn.addEventListener('click', function () {
      if (receiver.isOn()) receiver.turnOff();
      else receiver.turnOn();
    });
    _els.volumeInput.addEventListener('input', function (event) {
      receiver.setVolume(parseFloat(event.target.value));
    });
    receiver.subscribe(_render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  SBE.RadioChannelHud = { init: init };
})(window);
