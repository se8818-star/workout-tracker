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

const blockOf = (id, name) => ({ id, name, weeks: 4, deloadWeek: null, days: [{ name: `${name} A`, items: [{ exerciseId: 'sq', sets: 2, reps: 5 }] }] });

test('an opened but untouched day follows a program change', () => {
  store.clearAll();
  store.put('blocks', blockOf('old', 'Old'));
  store.put('blocks', blockOf('new', 'New'));
  store.put('assignments', { id: 'g1', athleteId: 'a', blockId: 'old', startDate: '2026-10-19', weekdays: [0] });
  store.startLog('a', '2026-10-19', store.plannedOn('a', '2026-10-19')[0]); // the athlete opens the day
  assert.equal(store.currentLog('a', '2026-10-19').blockId, 'old');
  // Coach ends the old program and starts a new one the same day.
  store.put('assignments', { ...store.get('assignments', 'g1'), endDate: '2026-10-18' });
  store.put('assignments', { id: 'g2', athleteId: 'a', blockId: 'new', startDate: '2026-10-19', weekdays: [0] });
  assert.equal(store.currentLog('a', '2026-10-19').blockId, 'new');
  // Once something is logged the day stays as it is.
  const log = store.logFor('a', '2026-10-19');
  log.entries[0].sets[0].done = true;
  store.saveLog(log);
  store.del('assignments', 'g2');
  assert.equal(store.currentLog('a', '2026-10-19').blockId, 'new');
});

test('an untouched day with no program left is dropped, a picked one stays', () => {
  store.clearAll();
  store.put('blocks', blockOf('b', 'B'));
  store.put('assignments', { id: 'g1', athleteId: 'a', blockId: 'b', startDate: '2026-10-19', weekdays: [0] });
  store.startLog('a', '2026-10-19', store.plannedOn('a', '2026-10-19')[0]);
  store.del('assignments', 'g1');
  assert.equal(store.currentLog('a', '2026-10-19'), null);
  const picked = store.startLog('a', '2026-10-20', { assignment: { id: 'g1' }, block: store.get('blocks', 'b'), week: 0, dayIndex: 0 });
  picked.chosen = true; store.saveLog(picked);
  assert.ok(store.currentLog('a', '2026-10-20'));
});
