// Coach edit mode on the workout page: the plan.js changes it uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { changeItem, moveItem, setItemMeasure, setItemLoad, setItemGroup, weekView } from '../js/plan.js';
import { buildSession, weekItems } from '../js/calc.js';

const block = () => ({ weeks: 4, deloadWeek: null, days: [{ name: 'A', items: [
  { exerciseId: 'w1', warmup: true, sets: 1, reps: 10 },
  { exerciseId: 'sq', sets: 3, reps: 8, weight: 100, note: 'Brace', tempo: '3-1-1' },
  { exerciseId: 'row', sets: 3, reps: 10, rpe: 8 },
  { exerciseId: 'w2', warmup: true, sets: 1, reps: 10 },
] }] });
const view = (b, w, ii) => weekView(b.days[0].items[ii], b, w);
const weeks = (b, ii, k) => Array.from({ length: b.weeks }, (_, w) => view(b, w, ii)[k]);

test('a note can change for just one week', () => {
  const b = changeItem(block(), 0, 1, 2, { note: 'Pause at the bottom' }, 'week');
  assert.deepEqual(weeks(b, 1, 'note'), ['Brace', 'Brace', 'Pause at the bottom', 'Brace']);
  assert.equal(buildSession(b, 0, 2, null).items[1].note, 'Pause at the bottom');
  assert.equal(buildSession(b, 0, 3, null).items[1].note, 'Brace');
});

test('tempo and target RPE carry forward for the rest of the program', () => {
  const b = changeItem(block(), 0, 2, 1, { rpe: 9, tempo: '2-0-1' }, 'rest');
  assert.deepEqual(weeks(b, 2, 'rpe'), [8, 9, 9, 9]);
  assert.deepEqual(weeks(b, 2, 'tempo'), ['', '2-0-1', '2-0-1', '2-0-1']);
  assert.equal(buildSession(b, 0, 3, null).items[2].sets[0].rpe, 9);
  assert.equal(buildSession(b, 0, 0, null).items[2].sets[0].rpe, 8);
});

test('clearing the target RPE for one week leaves the others', () => {
  const b = changeItem(block(), 0, 2, 2, { rpe: '' }, 'week');
  assert.deepEqual(weeks(b, 2, 'rpe'), [8, 8, '', 8]);
  assert.equal(buildSession(b, 0, 2, null).items[2].sets[0].rpe, null);
  assert.equal(weekItems(b, 0, 2)[2].rpe, undefined);
});

test('a change from week 1 on rewrites the item itself', () => {
  const b = changeItem(block(), 0, 1, 0, { note: '' }, 'rest');
  assert.equal(b.days[0].items[1].note, undefined);
  assert.deepEqual(weeks(b, 1, 'note'), ['', '', '', '']);
});

test('moving stays among exercises of the same kind', () => {
  const b = moveItem(block(), 0, 2, -1);
  assert.deepEqual(b.days[0].items.map((i) => i.exerciseId), ['w1', 'row', 'sq', 'w2']);
  // The first main exercise can't move above the warmup... it hops past it to nothing.
  assert.deepEqual(moveItem(block(), 0, 1, -1).days[0].items.map((i) => i.exerciseId), ['w1', 'sq', 'row', 'w2']);
  // Warmup items hop over the main work to the next warmup item.
  assert.deepEqual(moveItem(block(), 0, 0, 1).days[0].items.map((i) => i.exerciseId), ['w2', 'sq', 'row', 'w1']);
});

test('how it is logged and the load type change every week', () => {
  let b = setItemMeasure(block(), 0, 1, 'time');
  assert.equal(b.days[0].items[1].measure, 'time');
  assert.equal(b.days[0].items[1].secs, 30);
  b = setItemMeasure(block(), 0, 1, 'breaths');
  assert.equal(b.days[0].items[1].weight, undefined);
  b = setItemLoad(block(), 0, 2, 'pct', 75);
  assert.deepEqual(weeks(b, 2, 'pct'), [75, 75, 75, 75]);
  b = changeItem(block(), 0, 1, 2, { weight: 150 }, 'week');
  b = setItemLoad(b, 0, 1, 'none');
  assert.deepEqual(weeks(b, 1, 'weight'), [null, null, null, null]);
  assert.equal(b.days[0].items[1].byWeek, undefined);
});

test('supersets are set by letter', () => {
  assert.equal(setItemGroup(block(), 0, 1, ' b ').days[0].items[1].group, 'B');
  const b = setItemGroup(setItemGroup(block(), 0, 1, 'a'), 0, 1, '');
  assert.equal(b.days[0].items[1].group, undefined);
});
