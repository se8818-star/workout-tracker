import test from 'node:test';
import assert from 'node:assert/strict';
import { changeItem, removeItem, addItem, restoreItem, weekView } from '../js/plan.js';
import { buildSession } from '../js/calc.js';

const block = () => ({ weeks: 6, deloadWeek: null, days: [{ name: 'A', items: [
  { exerciseId: 'sq', sets: 3, reps: 8, weight: 100, unit: 'lb', progression: { type: 'add_weight', step: 5 } },
  { exerciseId: 'row', sets: 3, reps: 10, repsTo: 12 },
] }] });
const view = (b, w, ii = 0) => weekView(b.days[0].items[ii], b, w);
const weeks = (b, f, ii = 0) => Array.from({ length: b.weeks }, (_, w) => f(view(b, w, ii)));

test('just this week changes only that week', () => {
  const b = changeItem(block(), 0, 0, 2, { sets: 5 }, 'week');
  assert.deepEqual(weeks(b, (v) => v.sets), [3, 3, 5, 3, 3, 3]);
});

test('just week 1 leaves the later weeks as they were', () => {
  const b = changeItem(block(), 0, 0, 0, { sets: 4, weight: 120 }, 'week');
  assert.deepEqual(weeks(b, (v) => v.sets), [4, 3, 3, 3, 3, 3]);
  assert.deepEqual(weeks(b, (v) => v.weight), [120, 105, 110, 115, 120, 125]);
});

test('rest of the program carries the change forward, rule still on top', () => {
  const b = changeItem(block(), 0, 0, 2, { weight: 130, sets: 4 }, 'rest');
  assert.deepEqual(weeks(b, (v) => v.weight), [100, 105, 130, 135, 140, 145]);
  assert.deepEqual(weeks(b, (v) => v.sets), [3, 3, 4, 4, 4, 4]);
  // From week 1 it just changes the item itself.
  const c = changeItem(block(), 0, 0, 0, { sets: 4 }, 'rest');
  assert.equal(c.days[0].items[0].sets, 4);
  assert.equal(c.days[0].items[0].byWeek, undefined);
});

test('rep ranges move as a whole', () => {
  const b = changeItem(block(), 0, 1, 3, { reps: { reps: 8, repsTo: 10 } }, 'rest');
  assert.deepEqual(weeks(b, (v) => `${v.reps}-${v.repsTo}`, 1), ['10-12', '10-12', '10-12', '8-10', '8-10', '8-10']);
  const c = changeItem(block(), 0, 1, 1, { reps: { reps: 6, repsTo: null } }, 'week');
  assert.deepEqual(weeks(c, (v) => `${v.reps}-${v.repsTo}`, 1), ['10-12', '6-null', '10-12', '10-12', '10-12', '10-12']);
});

test('swap an exercise for one week or from a week on', () => {
  const b = changeItem(block(), 0, 0, 1, { exerciseId: 'fsq' }, 'week');
  assert.deepEqual(weeks(b, (v) => v.exerciseId), ['sq', 'fsq', 'sq', 'sq', 'sq', 'sq']);
  assert.equal(buildSession(b, 0, 1, { maxes: {} }).items[0].exerciseId, 'fsq');
  const c = changeItem(block(), 0, 0, 3, { exerciseId: 'fsq' }, 'rest');
  assert.deepEqual(weeks(c, (v) => v.exerciseId), ['sq', 'sq', 'sq', 'fsq', 'fsq', 'fsq']);
  const d = changeItem(block(), 0, 0, 0, { exerciseId: 'fsq' }, 'week');
  assert.deepEqual(weeks(d, (v) => v.exerciseId), ['fsq', 'sq', 'sq', 'sq', 'sq', 'sq']);
});

test('remove and add exercises by week', () => {
  const b = removeItem(block(), 0, 1, 2, 'week');
  assert.deepEqual([0, 1, 2, 3].map((w) => buildSession(b, 0, w, {}).items.length), [2, 2, 1, 2]);
  const c = removeItem(block(), 0, 1, 2, 'rest');
  assert.deepEqual([0, 1, 2, 5].map((w) => buildSession(c, 0, w, {}).items.length), [2, 2, 1, 1]);
  assert.equal(removeItem(block(), 0, 1, 0, 'rest').days[0].items.length, 1);
  assert.equal(restoreItem(c, 0, 1, 4, 'rest').days[0].items[1].byWeek[3].off, true);
  assert.equal(buildSession(restoreItem(c, 0, 1, 4, 'rest'), 0, 5, {}).items.length, 2);
  const d = addItem(block(), 0, { exerciseId: 'curl', sets: 2, reps: 12 }, 3, 'rest');
  assert.deepEqual([0, 2, 3, 5].map((w) => buildSession(d, 0, w, {}).items.length), [2, 2, 3, 3]);
  const e = addItem(block(), 0, { exerciseId: 'curl', sets: 2, reps: 12 }, 3, 'week');
  assert.deepEqual([2, 3, 4].map((w) => buildSession(e, 0, w, {}).items.length), [2, 3, 2]);
});

test('deload still applies to a carried-forward change', () => {
  const b0 = { ...block(), deloadWeek: 4 };
  const b = changeItem(b0, 0, 0, 2, { sets: 4 }, 'rest');
  assert.deepEqual(weeks(b, (v) => v.sets), [3, 3, 4, 4, 2, 4]);
});

test('a started workout picks up exercises the coach added or took out', async () => {
  const { refreshEntries, sessionEntries } = await import('../js/calc.js');
  const b = block();
  const before = sessionEntries(buildSession(b, 0, 1, { maxes: {} }), 'lb');
  before[0].sets[0] = { ...before[0].sets[0], reps: 8, done: true };
  let next = removeItem(b, 0, 1, 1, 'week');
  next = addItem(next, 0, { exerciseId: 'curl', sets: 2, reps: 12 }, 1, 'week');
  const out = refreshEntries(before, sessionEntries(buildSession(next, 0, 1, { maxes: {} }), 'lb'));
  assert.deepEqual(out.map((e) => e.exerciseId), ['sq', 'curl']);
  assert.equal(out[0].sets[0].done, true);
});
