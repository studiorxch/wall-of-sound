// Validates captured browser observations; this does not drive or simulate a browser.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const file = process.argv[2];
if (!file) throw new Error('Pass a captured HOST-00 NDJSON file; no fabricated/default evidence.');
const rows = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse);
const groups = new Map();
for (const row of rows) { if (!groups.has(row.sessionId)) groups.set(row.sessionId, []); groups.get(row.sessionId).push(row); }
const evidence = [...groups.values()].find(rs => rs.some(r => r.events.some(e => e.type === 'readiness' && e.ok)) && new Set(rs.filter(r => r.engineCount === 1).map(r => r.url)).size >= 2);
assert(evidence, 'Missing real audio/navigation evidence');
const playing = evidence.filter(r => r.audio && !r.audio.paused && r.time != null);
assert(playing.length > 5);
assert(playing.every(r => r.engineCount === 1 && r.audioIdentityStable && r.context === 'running'));
assert(playing.some(r => r.peak > 0));
assert(playing.every((r,i) => i === 0 || r.time >= playing[i-1].time));
const events = evidence.at(-1).events;
assert(events.some(e => e.type === 'child-click' && e.trusted && e.active));
assert(events.some(e => e.type === 'parent-activation' && e.active));
const start = events.find(e => e.type === 'readiness' && e.ok).at;
assert(!events.some(e => e.at > start && e.type === 'media' && ['pause','seeking','emptied','play'].includes(e.event)));
const history = [...groups.values()].find(rs => rs.some(r => r.events.some(e => e.type === 'parent-artwork' && e.id === 'A')) && rs.some(r => r.url.endsWith('?artwork=B')));
assert(history);
const a = history.find(r => r.url.endsWith('?artwork=A'));
const b = history.find(r => r.url.endsWith('?artwork=B'));
assert.equal(a.historyLength, b.historyLength);
assert(history.some(r => r.events.filter(e => e.type === 'popstate').length >= 3));
assert(rows.some(r => r.events.some(e => e.type === 'child-replace-state' && !e.topUrl.includes('child-only'))));
assert(rows.some(r => r.events.some(e => e.type === 'key' && e.trusted && e.key === 'Tab')));
console.log(`PASS: ${rows.length} recorded snapshots; trusted activation, running graph/nonzero signal, stable engine/audio identity, advancing time, no navigation media restart, artwork replacement, Back/Forward events, child URL isolation, trusted Tab input.`);
