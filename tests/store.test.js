import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';

store.load({ cloud: true });

test('a change made while an upload is on its way stays queued', () => {
  store.clearAll();
  store.put('logs', { id: 'a:2026-10-23', athleteId: 'a', date: '2026-10-23', entries: [] });
  const sent = store.dirtyKeys(); // what the upload took
  store.put('logs', { ...store.get('logs', 'a:2026-10-23'), note: 'set 2 ticked' }); // tapped mid-upload
  store.clearDirty(sent); // the upload finishes
  assert.deepEqual(store.dirtyKeys().map(([k]) => k), ['logs/a:2026-10-23']);
  store.clearDirty(store.dirtyKeys());
  assert.equal(store.dirtyKeys().length, 0);
});

test('a delete keeps the record so the server knows whose it was', () => {
  store.clearAll();
  store.put('assignments', { id: 'asg-1', athleteId: 'a', blockId: 'b' });
  store.del('assignments', 'asg-1');
  const [[key, mark]] = store.dirtyKeys();
  assert.equal(key, 'assignments/asg-1');
  assert.ok(store.isDeleted(mark));
  assert.equal(mark.data.athleteId, 'a');
  assert.equal(store.get('assignments', 'asg-1'), null);
});

test('marks from older versions still read as deleted or not', () => {
  assert.ok(store.isDeleted('deleted'));
  assert.ok(!store.isDeleted(true));
});
