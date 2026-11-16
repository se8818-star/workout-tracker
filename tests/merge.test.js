import test from 'node:test';
import assert from 'node:assert/strict';
import { merge3, mergeLog } from '../js/merge.js';
import * as store from '../js/store.js';

store.load({ cloud: true });

test('coach changes a max while the athlete phone adds another: both kept', () => {
  const base = { id: 'a', name: 'Sam', maxes: { sq: 300 } };
  const server = { id: 'a', name: 'Sam', maxes: { sq: 320 } }; // coach
  const local = { id: 'a', name: 'Sam', maxes: { sq: 300, bp: 200 }, logAs: { pl: { measure: 'time' } } }; // phone
  assert.deepEqual(merge3(base, local, server), { id: 'a', name: 'Sam', maxes: { sq: 320, bp: 200 }, logAs: { pl: { measure: 'time' } } });
});

test('the same field changed on both: this device (the newer edit) wins', () => {
  assert.deepEqual(merge3({ n: 1 }, { n: 2 }, { n: 3 }), { n: 2 });
});

test('a field removed on one side stays removed', () => {
  assert.deepEqual(merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 }), { a: 1, c: 3 });
});

test('logs: sets logged on either copy are kept, finished on either is finished', () => {
  const set = (o = {}) => ({ targetReps: 5, reps: null, weight: null, done: false, ...o });
  const local = { id: 'l', finished: false, note: '', entries: [{ exerciseId: 'sq', sets: [set({ done: true, reps: 5 }), set()] }] };
  const server = { id: 'l', finished: true, note: 'felt good', entries: [{ exerciseId: 'sq', sets: [set({ done: true, reps: 4 }), set({ done: true, reps: 5, weight: 225 })] }] };
  const m = mergeLog(local, server);
  assert.equal(m.entries[0].sets[0].reps, 5); // this device's logged set stays
  assert.equal(m.entries[0].sets[1].weight, 225); // the other device's set comes over
  assert.equal(m.finished, true);
  assert.equal(m.note, 'felt good');
});

const KEY = 'athletes/a';
const res = (data, at = '2026-11-16T10:00:01.000000+00:00') => ({ status: 'conflict', updated_at: at, data, deleted: false });

test('a stale upload is merged with the server copy and queued again', () => {
  store.clearAll();
  store.setSetting('versionsReady', true);
  store.applyRemote('athletes', 'a', { id: 'a', name: 'Sam', maxes: { sq: 300 } }, '2026-11-16T10:00:00.000000+00:00');
  const a = store.get('athletes', 'a');
  store.put('athletes', { ...a, maxes: { ...a.maxes, bp: 200 } });
  const [[key, m]] = store.dirtyKeys();
  const row = store.uploadRow(key, m, 't');
  assert.equal(row.base, '2026-11-16T10:00:00.000000+00:00');
  // The coach had changed squat in the meantime.
  assert.equal(store.resolveConflict(key, m, res({ id: 'a', name: 'Sam', maxes: { sq: 320 } })), 'retry');
  assert.deepEqual(store.get('athletes', 'a').maxes, { sq: 320, bp: 200 });
  const [[, m2]] = store.dirtyKeys();
  assert.equal(store.uploadRow(KEY, m2, 't').base, '2026-11-16T10:00:01.000000+00:00');
});

test('an upload that matches the server copy after merging is simply taken', () => {
  store.clearAll();
  store.setSetting('versionsReady', true);
  store.applyRemote('athletes', 'a', { id: 'a', name: 'Sam' }, '2026-11-16T10:00:00.000000+00:00');
  store.put('athletes', { ...store.get('athletes', 'a') }); // re-saved, nothing changed but the stamp
  const [[key, m]] = store.dirtyKeys();
  const server = { id: 'a', name: 'Sammy', updatedAt: '2099-01-01T00:00:00Z' };
  assert.equal(store.resolveConflict(key, m, res(server)), 'taken');
  assert.equal(store.get('athletes', 'a').name, 'Sammy');
  assert.equal(store.dirtyKeys().length, 0);
});

test('a saved upload records the new version; a change made meanwhile stays queued', () => {
  store.clearAll();
  store.setSetting('versionsReady', true);
  store.put('logs', { id: 'a:2026-11-16', athleteId: 'a', date: '2026-11-16', entries: [] });
  const [[key, m]] = store.dirtyKeys();
  const row = store.uploadRow(key, m, 't');
  assert.equal(row.base, null); // new: the server must not have it yet
  store.put('logs', { ...store.get('logs', 'a:2026-11-16'), note: 'tapped mid-upload' });
  store.uploaded(key, m, row, { status: 'saved', updated_at: '2026-11-16T10:00:00.000000+00:00' });
  const [[, m2]] = store.dirtyKeys();
  assert.equal(store.uploadRow(key, m2, 't').base, '2026-11-16T10:00:00.000000+00:00');
});

test('the server keeping a finished workout replaces the unfinished copy here', () => {
  store.clearAll();
  store.setSetting('versionsReady', true);
  store.put('logs', { id: 'a:2026-11-16', athleteId: 'a', date: '2026-11-16', entries: [], finished: false });
  const [[key, m]] = store.dirtyKeys();
  const row = store.uploadRow(key, m, 't');
  const changed = store.uploaded(key, m, row, { status: 'saved', updated_at: '2026-11-16T10:00:00.000000+00:00', data: { ...row.data, finished: true }, deleted: false });
  assert.equal(changed, true);
  assert.equal(store.get('logs', 'a:2026-11-16').finished, true);
  assert.equal(store.dirtyKeys().length, 0);
});

test('before versions are known, uploads go without a check', () => {
  store.clearAll();
  store.put('blocks', { id: 'b', name: 'P' });
  const [[key, m]] = store.dirtyKeys();
  assert.equal('base' in store.uploadRow(key, m, 't'), false);
});

test('a pull while a local edit waits keeps the version the edit started from', () => {
  store.clearAll();
  store.setSetting('versionsReady', true);
  store.applyRemote('blocks', 'b', { id: 'b', name: 'P' }, '2026-11-16T10:00:00.000000+00:00');
  store.put('blocks', { ...store.get('blocks', 'b'), name: 'Mine' });
  store.applyRemote('blocks', 'b', { id: 'b', name: 'Theirs' }, '2026-11-16T10:00:05.000000+00:00');
  const [[key, m]] = store.dirtyKeys();
  assert.equal(store.uploadRow(key, m, 't').base, '2026-11-16T10:00:00.000000+00:00');
  assert.equal(store.get('blocks', 'b').name, 'Mine');
});

test('deleted on another device: gone here, unless it is a workout with sets logged', () => {
  store.clearAll();
  store.setSetting('versionsReady', true);
  store.put('assignments', { id: 'g', athleteId: 'a', blockId: 'b' });
  let [[key, m]] = store.dirtyKeys();
  assert.equal(store.resolveConflict(key, m, { updated_at: 'x', data: { id: 'g' }, deleted: true }), 'taken');
  assert.equal(store.get('assignments', 'g'), null);
  store.put('logs', { id: 'a:2026-11-16', athleteId: 'a', date: '2026-11-16', entries: [{ exerciseId: 'sq', sets: [{ done: true, reps: 5 }] }] });
  [[key, m]] = store.dirtyKeys();
  assert.equal(store.resolveConflict(key, m, { updated_at: 'x', data: {}, deleted: true }), 'retry');
  assert.ok(store.get('logs', 'a:2026-11-16'));
});
