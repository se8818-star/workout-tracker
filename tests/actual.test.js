import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, lastDoneFrom, refreshEntries, sessionEntries } from '../js/calc.js';

const block = { id: 'b1', weeks: 6, deloadWeek: 3, days: [{ name: 'A', items: [
  { exerciseId: 'bench', sets: 2, reps: 10, weight: 135, progression: { type: 'add_weight', step: 5 } },
  { exerciseId: 'pullup', sets: 2, reps: 8, progression: { type: 'add_reps', step: 1 } },
  { exerciseId: 'squat', sets: 1, reps: 5, pct: 70, progression: { type: 'add_pct', step: 5 } },
  { exerciseId: 'curl', sets: 1, reps: 10, repsTo: 15, progression: { type: 'add_reps', step: 1 } },
  { exerciseId: 'row', sets: 1, reps: 10, weight: 100 },
] }] };
const athlete = { maxes: { squat: 300 } };
const set = (reps, weight, done = true) => ({ reps, weight, done });
const log = (week, date, entries, extra = {}) => ({ blockId: 'b1', dayIndex: 0, week, date, entries, ...extra });

const wk1 = log(0, '2026-11-02', [
  { exerciseId: 'bench', sets: [set(9, 130), set(8, 130)] },
  { exerciseId: 'pullup', sets: [set(6, null), set(5, null)] },
  { exerciseId: 'squat', sets: [set(5, 200)] },
  { exerciseId: 'curl', sets: [set(12, null)] },
  { exerciseId: 'row', sets: [set(10, 90)] },
]);

test('weekly weight rule adds to what was lifted, reps stay as programmed', () => {
  const s = buildSession(block, 0, 1, athlete, 5, lastDoneFrom([wk1], block, 0, 1, '2026-11-09'));
  const bench = s.items[0];
  assert.deepEqual(bench.sets.map((x) => [x.reps, x.weight]), [[10, 135], [10, 135]]);
  assert.equal(bench.basedOn, 0);
});

test('weekly rep rule adds to reps done; ranges keep their width', () => {
  const s = buildSession(block, 0, 1, athlete, 5, lastDoneFrom([wk1], block, 0, 1, '2026-11-09'));
  assert.deepEqual(s.items[1].sets.map((x) => x.reps), [7, 6]);
  assert.deepEqual([s.items[3].sets[0].reps, s.items[3].sets[0].repsTo], [13, 18]);
});

test('% of max rule adds step% of max to the weight lifted', () => {
  const s = buildSession(block, 0, 1, athlete, 5, lastDoneFrom([wk1], block, 0, 1, '2026-11-09'));
  assert.equal(s.items[2].sets[0].weight, 215); // 200 + 5% of 300
  assert.equal(s.items[2].sets[0].pct, 71.5);
});

test('no rule, no log, a typed week number or a deload keep the program', () => {
  const s = buildSession(block, 0, 1, athlete, 5, lastDoneFrom([wk1], block, 0, 1, '2026-11-09'));
  assert.equal(s.items[4].sets[0].weight, 100);
  const none = buildSession(block, 0, 1, athlete, 5, lastDoneFrom([], block, 0, 1, '2026-11-09'));
  assert.equal(none.items[0].sets[0].weight, 140);
  const typed = structuredClone(block);
  typed.days[0].items[0].byWeek = { 1: { weight: 150 } };
  assert.equal(buildSession(typed, 0, 1, athlete, 5, lastDoneFrom([wk1], typed, 0, 1, '2026-11-09')).items[0].sets[0].weight, 150);
  const deload = buildSession(block, 0, 3, athlete, 5, lastDoneFrom([wk1], block, 0, 3, '2026-11-23'));
  assert.equal(deload.items[0].sets[0].weight, 135); // (135 + 15) x 0.9, as programmed
  assert.equal(deload.items[0].basedOn, undefined);
});

test('skipped or deload weeks add one step per week since', () => {
  const wk4 = log(3, '2026-11-23', [{ exerciseId: 'bench', sets: [set(10, 120), set(10, 120)] }]);
  const s = buildSession(block, 0, 4, athlete, 5, lastDoneFrom([wk1, wk4], block, 0, 4, '2026-11-30'));
  assert.equal(s.items[0].sets[0].weight, 150); // 130 + 4 x 5, deload week ignored
  assert.equal(s.items[0].basedOn, 0);
});

test('unfinished sets, other days, other programs and later logs are ignored', () => {
  const logs = [
    log(0, '2026-11-02', [{ exerciseId: 'bench', sets: [set(10, 100, false)] }]),
    log(0, '2026-11-03', [{ exerciseId: 'bench', sets: [set(10, 100)] }], { dayIndex: 1 }),
    log(0, '2026-11-04', [{ exerciseId: 'bench', sets: [set(10, 100)] }], { blockId: 'other' }),
    log(1, '2026-11-09', [{ exerciseId: 'bench', sets: [set(10, 100)] }]),
  ];
  const s = buildSession(block, 0, 1, athlete, 5, lastDoneFrom(logs, block, 0, 1, '2026-11-09'));
  assert.equal(s.items[0].sets[0].weight, 140);
});

test("an athlete's copy of a program builds on logs from the original", () => {
  const copy = { ...structuredClone(block), id: 'b2', copiedFrom: 'b1' };
  const s = buildSession(copy, 0, 1, athlete, 5, lastDoneFrom([wk1], copy, 0, 1, '2026-11-09'));
  assert.equal(s.items[0].sets[0].weight, 135);
});

test('an opened log picks up last week once it is logged', () => {
  const before = sessionEntries(buildSession(block, 0, 1, athlete, 5, lastDoneFrom([], block, 0, 1, '2026-11-09')), 'lb');
  assert.equal(before[0].sets[0].targetWeight, 140);
  const after = refreshEntries(before, sessionEntries(buildSession(block, 0, 1, athlete, 5, lastDoneFrom([wk1], block, 0, 1, '2026-11-09')), 'lb'));
  assert.equal(after[0].sets[0].targetWeight, 135);
  assert.equal(after[0].basedOn, 0);
});
