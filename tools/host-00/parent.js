import { DualDeckPlaybackEngine } from '/music/src/audio/DualDeckPlaybackEngine.ts';
const frame = document.querySelector('#surface');
const sessionId = crypto.randomUUID();
const browser = navigator.userAgent;
const events = [];
let engine = null, pair = null, analyser = null, engineCount = 0, generation = 0;
const record = (type, data = {}) => events.push({ type, at: performance.now(), ...data });
function snapshot() {
  let childUrl, childReadError;
  try { childUrl = frame.contentWindow?.location.href; }
  catch (error) { childReadError = error.name; } // Browser error documents can have an opaque origin.

  let peak = 0;
  if (analyser) { const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); peak = Math.max(...samples.map(Math.abs)); }
  return { browser, sessionId, engineCount, url: location.href, childUrl, childReadError,
    historyLength: history.length, context: engine?.getContextState(), peak,
    audioIdentityStable: !!engine && engine.nodes.A.audio === pair[0] && engine.nodes.B.audio === pair[1],
    time: engine?.getCurrentTime('A'), audio: engine ? engine.getDeckDiagnostics('A') : null, events: [...events] };
}
function stop() { generation++; engine?.destroy(); engine = null; analyser = null; record('off'); }
function activate(delay) {
  record('parent-activation', { active: navigator.userActivation.isActive, delay });
  if (engine) return;
  engine = new DualDeckPlaybackEngine(); engineCount++;
  // Harness-only inspection of TS-private objects, no production engine change.
  pair = [engine.nodes.A.audio, engine.nodes.B.audio];
  for (const [index, audio] of pair.entries()) for (const type of ['play','playing','pause','seeking','seeked','emptied','ended','error']) {
    audio.addEventListener(type, () => record('media', { deck: index, event: type, time: audio.currentTime }));
  }
  engine.setMasterVolume(0.2);
  engine.primeForUserGesture(); // Before all async work, just like current RADIO.
  analyser = engine.ctx.createAnalyser();
  engine.nodes.A.gain.connect(analyser); // Observe existing signal without a second destination.
  const owner = engine, run = ++generation;
  const begin = async () => {
    try {
      await owner.preload('A', { trackId: 'host00-tone', slotId: 'host00', sourceUrl: '/tone.wav', cueStartSeconds: 0 });
      if (run !== generation) return;
      owner.setDeckGainValue('A', 1);
      await owner.playDeck('A');
      record('play-resolved', { context: owner.getContextState(), active: navigator.userActivation.isActive });
      record('readiness', await owner.confirmAudibleReadiness('A'));
    } catch (error) { record('play-rejected', { name: error.name, message: error.message }); }
  };
  if (delay) setTimeout(begin, delay); else void begin();
}
function mount() {
  const book = location.pathname === '/blackbook.html';
  document.querySelector('#route').textContent = location.pathname + location.search;
  const url = new URL('/surface.html', location.origin);
  url.searchParams.set('surface', book ? 'blackbook' : 'map');
  const artwork = new URLSearchParams(location.search).get('artwork');
  if (artwork) url.searchParams.set('artwork', artwork);
  frame.contentWindow.location.replace(url.href);
  record('mount', { target: url.href });
}
function navigate(url) { history.pushState({ host00: true }, '', url); mount(); }
function artwork(id) {
  const url = new URL(location.href); url.searchParams.set('artwork', id);
  history.replaceState({ host00: true }, '', url); record('parent-artwork', { id });
  document.querySelector('#route').textContent = location.pathname + location.search;
}
window.HOST00 = { record, activate, snapshot, artwork };
history.replaceState({ host00: true }, '', location.href);
window.addEventListener('popstate', () => { record('popstate'); mount(); });
document.querySelector('#map').onclick = () => navigate('/wall-app/');
document.querySelector('#book').onclick = () => navigate('/blackbook.html');
document.querySelector('#off').onclick = stop;
document.querySelector('#child-reload').onclick = () => frame.contentWindow.location.reload();
document.querySelector('#src').onclick = () => { frame.src = '/surface.html?surface=src-assignment'; record('src-assignment'); };
window.addEventListener('pagehide', stop);
setInterval(() => { const data = snapshot(); document.querySelector('#status').textContent = JSON.stringify({...data, events: data.events.slice(-5)}, null, 2); }, 500);
setInterval(() => { void fetch('/evidence', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(snapshot()) }); }, 1000);
mount();
