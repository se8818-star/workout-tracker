import test from 'node:test';
import assert from 'node:assert/strict';
import * as calc from '../js/calc.js';
import {
  prescribedWeight, prescribedSets, prescribedReps, buildSession, sessionTotals, e1rm,
  scheduledOn, weekStart, parseQuickEntry, tagPctOfMax, sessionLoad,
} from '../js/calc.js';

const ex = {
  squat: { id: 'squat', pattern: 'squat', loaded: true },
  box: { id: 'box', pattern: 'plyo', loaded: false, contactsPerRep: 1, plyoTier: 4 },
  depth: { id: 'depth', pattern: 'plyo', loaded: false, contactsPerRep: 1, plyoTier: 5 },
  pogo: { id: 'pogo', pattern: 'plyo', loaded: false, contactsPerRep: 10, plyoTier: 1 },
  sprint: { id: 'sprint', pattern: 'sprint', loaded: false, metersPerRep: 20 },
};
const athlete = { maxes: { squat: 300 } };
const block = { weeks: 4, deloadWeek: 3, days: [{ name: 'A', items: [
  { exerciseId: 'squat', sets: 4, reps: 5, pct: 75, progression: { type: 'add_pct', step: 2.5 } },
  { exerciseId: 'box', sets: 3, reps: 5 },
  { exerciseId: 'pogo', sets: 2, reps: 1 },
] }] };

test('percent of max with weekly progression and rounding', () => {
  const item = block.days[0].items[0];
  assert.equal(prescribedWeight(item, athlete, 0, block), 225);
  assert.equal(prescribedWeight(item, athlete, 1, block), 235); // 77.5% = 232.5 -> 235
  assert.equal(prescribedWeight(item, athlete, 2, block), 240);
});

test('deload halves sets and drops load 10%', () => {
  const item = block.days[0].items[0];
  assert.equal(prescribedSets(item, block, 3), 2);
  assert.equal(prescribedWeight(item, athlete, 3, block), 225); // 82.5% * 300 * 0.9 = 222.75 -> 225
});

test('no max on file means no prescribed weight', () => {
  assert.equal(prescribedWeight(block.days[0].items[0], { maxes: {} }, 0, block), null);
});

test('fixed weight and rep progressions', () => {
  const b = { weeks: 4, days: [] };
  assert.equal(prescribedWeight({ weight: 40, progression: { type: 'add_weight', step: 5 } }, athlete, 2, b), 50);
  assert.equal(prescribedReps({ reps: 6, progression: { type: 'add_reps', step: 1 } }, 3), 9);
});

test('tonnage, contacts and high-intensity contacts', () => {
  const s = buildSession(block, 0, 0, athlete);
  s.items.forEach((it) => it.sets.forEach((x) => { x.done = true; }));
  s.items.push({ exerciseId: 'depth', sets: [{ reps: 3, done: true }, { reps: 3, done: false }] });
  s.items.push({ exerciseId: 'sprint', sets: [{ reps: 4, done: true }] });
  const t = sessionTotals(s, ex, true);
  assert.equal(t.tonnage, 4 * 5 * 225);
  assert.equal(t.contacts, 15 + 20 + 3); // box 3x5, pogo 2x1x10, depth 3 (one set not done)
  assert.equal(t.highContacts, 3);
  assert.equal(t.sprintMeters, 80);
  assert.equal(t.setsByPattern.plyo, 3 + 2 + 1);
  const planned = sessionTotals(s, ex, false);
  assert.equal(planned.contacts, 41);
});

test('intensity zones from % of max', () => {
  const e = tagPctOfMax({ exerciseId: 'squat', sets: [{ reps: 3, weight: 270, done: true }, { reps: 5, weight: 240, done: true }] }, athlete, ex);
  const t = sessionTotals({ items: [e] }, ex, true);
  assert.equal(t.zones.z90, 3);
  assert.equal(t.zones.z80, 5);
});

test('estimated 1RM and session load', () => {
  assert.equal(Math.round(e1rm(225, 5)), 263);
  assert.equal(e1rm(300, 1), 300);
  assert.equal(sessionLoad({ sessionRpe: 7, minutes: 60 }), 420);
});

test('schedule maps dates to week and day', () => {
  const a = { startDate: '2026-10-19', weekdays: [0, 2, 4] }; // a Monday
  const b3 = { weeks: 2, days: [{}, {}, {}] };
  assert.deepEqual(scheduledOn(a, b3, '2026-10-19'), { week: 0, dayIndex: 0 });
  assert.deepEqual(scheduledOn(a, b3, '2026-10-23'), { week: 0, dayIndex: 2 });
  assert.equal(scheduledOn(a, b3, '2026-10-20'), null);
  assert.deepEqual(scheduledOn(a, b3, '2026-10-28'), { week: 1, dayIndex: 1 });
  assert.equal(scheduledOn(a, b3, '2026-11-02'), null); // past the block
  assert.equal(scheduledOn(a, b3, '2026-10-18'), null); // before start
  assert.equal(weekStart('2026-10-22'), '2026-10-19');
});

test('quick entry shorthand', () => {
  assert.deepEqual(parseQuickEntry('Back squat 4x5 @80%'), { name: 'Back squat', sets: 4, reps: 5, pct: 80 });
  assert.deepEqual(parseQuickEntry('Bench 3x8 @185 +5/wk'), { name: 'Bench', sets: 3, reps: 8, weight: 185, progression: { type: 'add_weight', step: 5 } });
  assert.deepEqual(parseQuickEntry('Squat 5×3 @75% +2.5%/wk'), { name: 'Squat', sets: 5, reps: 3, pct: 75, progression: { type: 'add_pct', step: 2.5 } });
  assert.deepEqual(parseQuickEntry('RDL 3x10 @RPE7'), { name: 'RDL', sets: 3, reps: 10, rpe: 7 });
  assert.deepEqual(parseQuickEntry('Box jump 3x5'), { name: 'Box jump', sets: 3, reps: 5 });
  assert.equal(parseQuickEntry('just words'), null);
});

test('buildSession carries the coach tempo and note to the athlete', () => {
  const block = { weeks: 1, days: [{ name: 'A', items: [{ exerciseId: 'squat', sets: 2, reps: 5, tempo: '3-1-1-0', note: 'Brace' }, { exerciseId: 'box', sets: 1, reps: 3 }] }] };
  const s = buildSession(block, 0, 0, { maxes: {} });
  assert.equal(s.items[0].tempo, '3-1-1-0');
  assert.equal(s.items[0].note, 'Brace');
  assert.equal(s.items[1].tempo, '');
});

test('time and no-measure items build the right sets', () => {
  const block = { weeks: 3, days: [{ name: 'A', items: [
    { exerciseId: 'box', measure: 'time', sets: 3, secs: 30, progression: { type: 'add_secs', step: 5 } },
    { exerciseId: 'box', measure: 'none', sets: 4, reps: 8 },
  ] }] };
  const s = buildSession(block, 0, 2, { maxes: {} });
  assert.equal(s.items[0].measure, 'time');
  assert.equal(s.items[0].sets.length, 3);
  assert.equal(s.items[0].sets[0].secs, 40);
  assert.equal(s.items[0].sets[0].reps, null);
  assert.equal(s.items[1].sets.length, 1);
  assert.equal(s.items[1].sets[0].reps, null);
});

test('weights convert between lb and kg and back', () => {
  assert.equal(calc.toUnit(calc.fromUnit(100, 'kg'), 'kg'), 100);
  assert.equal(calc.fromUnit(135, 'lb'), 135);
  assert.equal(calc.toUnit(null, 'kg'), null);
  // A kg device rounds prescribed loads to whole 2.5 kg steps.
  const item = { exerciseId: 'x', sets: 1, reps: 5, pct: 80 };
  const lb = calc.prescribedWeight(item, { maxes: { x: 300 } }, 0, { deloadWeek: null }, 2.5 * calc.LB_PER_KG);
  assert.equal(Math.round(calc.toUnit(lb, 'kg') * 10) / 10, 110);
});

test('breaths are counted like reps but never loaded or added to rep totals', () => {
  const block = { deloadWeek: null, days: [{ name: 'A', items: [{ exerciseId: 'b', sets: 2, reps: 6, measure: 'breaths', weight: 45 }] }] };
  const s = calc.buildSession(block, 0, 0, { maxes: {} });
  assert.deepEqual(s.items[0].sets.map((x) => [x.reps, x.weight]), [[6, null], [6, null]]);
  const t = calc.sessionTotals(s, { b: { pattern: 'core', loaded: false } }, false);
  assert.equal(t.sets, 2);
  assert.equal(t.reps, 0);
});
