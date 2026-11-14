import test from 'node:test';
import assert from 'node:assert/strict';

// A small stand-in for the browser's localStorage that records writes.
const mem = new Map();
let writes = [];
let limit = Infinity; // total characters allowed, to act out a full phone
const used = () => [...mem.values()].reduce((n, v) => n + v.length, 0);
globalThis.localStorage = {
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (used() - (mem.get(k)?.length || 0) + v.length > limit) throw new Error('QuotaExceededError');
    mem.set(k, String(v)); writes.push(k);
  },
  removeItem: (k) => { mem.delete(k); },
};

const store = await import('../js/store.js');

const oldDb = {
  exercises: { sq: { id: 'sq', name: 'Squat' } },
  athletes: { a: { id: 'a', name: 'Sam' } },
  blocks: {}, assignments: {},
  logs: {
    'a:2026-10-20': { id: 'a:2026-10-20', athleteId: 'a', date: '2026-10-20', entries: [] },
    'a:2026-11-03': { id: 'a:2026-11-03', athleteId: 'a', date: '2026-11-03', entries: [] },
  },
  settings: { units: 'kg', rounding: 5 },
  dirty: { 'logs/a:2026-11-03': { n: '1.0' } },
};

test('data saved by the old version is split up once, with nothing lost', () => {
  mem.clear(); limit = Infinity;
  mem.set('wt-cloud-v1', JSON.stringify(oldDb));
  store.load({ cloud: true });
  assert.equal(mem.has('wt-cloud-v1'), false);
  assert.ok(mem.has('wt-cloud-v1:meta') && mem.has('wt-cloud-v1:logs:2026-10') && mem.has('wt-cloud-v1:logs:2026-11'));
  store.load({ cloud: true }); // reopen the app
  assert.equal(store.get('athletes', 'a').name, 'Sam');
  assert.equal(store.all('logs').length, 2);
  assert.equal(store.unit(), 'kg');
  assert.deepEqual(store.dirtyKeys().map(([k]) => k), ['logs/a:2026-11-03']);
});

test('ticking a set rewrites only that month and the upload queue', () => {
  writes = [];
  store.put('logs', { ...store.get('logs', 'a:2026-11-03'), note: 'set 1 ticked' });
  assert.deepEqual(writes.sort(), ['wt-cloud-v1:logs:2026-11', 'wt-cloud-v1:meta']);
  writes = [];
  store.setSetting('lastPull', '2026-11-10T00:00:00Z');
  assert.deepEqual(writes, ['wt-cloud-v1:meta']);
});

test('records arriving from the server are saved with the next save', () => {
  store.applyRemote('blocks', 'b1', { id: 'b1', name: 'Fall' });
  store.applyRemote('logs', 'a:2026-09-01', { id: 'a:2026-09-01', athleteId: 'a', date: '2026-09-01', entries: [] });
  writes = [];
  store.setSetting('lastPull', '2026-11-10T01:00:00Z');
  assert.deepEqual(writes.sort(), ['wt-cloud-v1:blocks', 'wt-cloud-v1:logs:2026-09', 'wt-cloud-v1:meta']);
  store.load({ cloud: true });
  assert.equal(store.get('blocks', 'b1').name, 'Fall');
  assert.ok(store.get('logs', 'a:2026-09-01'));
});

test('deleting the last workout of a month removes that month', () => {
  store.del('logs', 'a:2026-09-01');
  assert.equal(mem.has('wt-cloud-v1:logs:2026-09'), false);
  store.load({ cloud: true });
  assert.equal(store.get('logs', 'a:2026-09-01'), null);
});

test('signing out clears every saved part', () => {
  store.clearAll();
  assert.deepEqual([...mem.keys()].filter((k) => k.startsWith('wt-cloud-v1:logs:')), []);
  store.load({ cloud: true });
  assert.equal(store.all('logs').length, 0);
});

test('a phone too full to split the old copy keeps it whole and keeps working', () => {
  mem.clear();
  const raw = JSON.stringify(oldDb);
  mem.set('wt-cloud-v1', raw);
  limit = raw.length + 50; // no room for a second copy
  store.load({ cloud: true });
  assert.equal(mem.get('wt-cloud-v1'), raw);
  assert.equal([...mem.keys()].length, 1);
  store.setSetting('units', 'lb'); // still saves, the old way
  limit = Infinity;
  assert.equal(JSON.parse(mem.get('wt-cloud-v1')).settings.units, 'lb');
  store.load({ cloud: true });
  assert.equal(store.all('logs').length, 2);
});
