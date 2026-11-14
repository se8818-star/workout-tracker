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

test('the program started last is the active one, and overlapping days follow it', () => {
  store.clearAll();
  store.put('blocks', blockOf('old', 'Old'));
  store.put('blocks', blockOf('new', 'New'));
  store.put('assignments', { id: 'g-new', athleteId: 'a', blockId: 'new', startDate: '2026-11-02', weekdays: [0] });
  store.put('assignments', { id: 'g-old', athleteId: 'a', blockId: 'old', startDate: '2026-10-19', weekdays: [0] });
  assert.equal(store.activeProgram('a', '2026-11-10').assignment.id, 'g-new');
  assert.equal(store.activeProgram('a', '2026-11-10').week, 1);
  assert.equal(store.plannedOn('a', '2026-11-09')[0].block.id, 'new');
  assert.equal(store.activeProgram('a', '2026-10-27').assignment.id, 'g-old');
  // Both programs have run all their weeks: nothing active.
  assert.equal(store.activeProgram('a', '2027-01-04'), null);
});

test('an empty switched-to day goes away once its program is removed', () => {
  store.clearAll();
  store.put('blocks', blockOf('p', 'Prog'));
  store.put('assignments', { id: 'g1', athleteId: 'a', blockId: 'p', startDate: '2026-11-09', weekdays: [0] });
  const l = store.startLog('a', '2026-11-09', store.plannedOn('a', '2026-11-09')[0]);
  store.saveLog({ ...l, switchedFrom: { week: 0, dayIndex: 0 } });
  assert.ok(store.currentLog('a', '2026-11-09'));
  store.del('assignments', 'g1');
  store.put('assignments', { id: 'g2', athleteId: 'a', blockId: 'p', startDate: '2026-11-09', weekdays: [1] });
  assert.equal(store.currentLog('a', '2026-11-09'), null);
});

test('colors follow the category; a second program in a category gets its second color; a coach can pick', () => {
  store.clearAll();
  store.put('blocks', blockOf('p1', 'Lift'));
  store.put('blocks', blockOf('p3', 'Lift 2'));
  store.put('blocks', { ...blockOf('p2', 'Throw'), category: 'throwing' });
  store.put('assignments', { id: 'g1', athleteId: 'a', blockId: 'p1', startDate: '2026-11-02', weekdays: [0] });
  store.put('assignments', { id: 'g2', athleteId: 'a', blockId: 'p2', startDate: '2026-11-02', weekdays: [1] });
  store.put('assignments', { id: 'g3', athleteId: 'a', blockId: 'p3', startDate: '2026-11-09', weekdays: [0] });
  const col = (id) => store.programColor(store.get('assignments', id));
  assert.equal(col('g1'), 0); // Strength, first
  assert.equal(col('g2'), 2); // Throwing
  assert.equal(col('g3'), 5); // Strength, second
  store.put('assignments', { ...store.get('assignments', 'g1'), color: 4 });
  assert.equal(col('g1'), 4);
});

test('each category is its own workout on the day, logged on its own', () => {
  store.clearAll();
  store.put('blocks', blockOf('lift', 'Lift'));
  store.put('blocks', { ...blockOf('thr', 'Throw'), category: 'throwing' });
  store.put('assignments', { id: 'gl', athleteId: 'a', blockId: 'lift', startDate: '2026-11-09', weekdays: [0] });
  store.put('assignments', { id: 'gt', athleteId: 'a', blockId: 'thr', startDate: '2026-11-09', weekdays: [0] });
  const iso = '2026-11-09';
  assert.equal(store.plannedIn('a', iso, 'strength')[0].block.id, 'lift');
  assert.equal(store.plannedIn('a', iso, 'throwing')[0].block.id, 'thr');
  const l1 = store.startLog('a', iso, store.plannedIn('a', iso, 'strength')[0]);
  const l2 = store.startLog('a', iso, store.plannedIn('a', iso, 'throwing')[0]);
  assert.equal(l1.id, 'a:2026-11-09'); // strength keeps the old id
  assert.equal(l2.id, 'a:2026-11-09:throwing');
  assert.equal(l2.category, 'throwing');
  assert.equal(store.currentLog('a', iso, 'throwing').blockId, 'thr');
  assert.equal(store.currentLog('a', iso).blockId, 'lift');
  assert.deepEqual(store.logsOn('a', iso).map((l) => l.id), ['a:2026-11-09', 'a:2026-11-09:throwing']);
});

test('two programs at once each keep their own days, and the coach sees each one done', () => {
  store.clearAll();
  store.put('blocks', blockOf('p1', 'Lift'));
  store.put('blocks', blockOf('p2', 'Run'));
  // Lift on Mondays, Run on Tuesdays, both from Nov 2 for 4 weeks.
  const g1 = store.put('assignments', { id: 'g1', athleteId: 'a', blockId: 'p1', startDate: '2026-11-02', weekdays: [0], color: 0 });
  const g2 = store.put('assignments', { id: 'g2', athleteId: 'a', blockId: 'p2', startDate: '2026-11-02', weekdays: [1], color: 1 });
  assert.equal(store.plannedOn('a', '2026-11-09')[0].block.id, 'p1');
  assert.equal(store.plannedOn('a', '2026-11-10')[0].block.id, 'p2');
  const done = (iso) => { const l = store.startLog('a', iso, store.plannedOn('a', iso)[0]); l.entries[0].sets[0].done = true; l.finished = true; store.saveLog(l); };
  done('2026-11-02'); done('2026-11-09'); done('2026-11-03');
  assert.deepEqual(store.programProgress(g1, '2026-11-11'), { done: 2, due: 2, total: 4, last: '2026-11-09' });
  assert.deepEqual(store.programProgress(g2, '2026-11-11'), { done: 1, due: 2, total: 4, last: '2026-11-03' });
  assert.deepEqual(store.logProgram(store.logFor('a', '2026-11-03')), { name: 'Run', color: 1, assignmentId: 'g2', category: 'strength' });
  // A removed program's old workouts still say which program they were.
  store.del('assignments', 'g2');
  assert.equal(store.logProgram(store.logFor('a', '2026-11-03')).name, 'Run');
});
