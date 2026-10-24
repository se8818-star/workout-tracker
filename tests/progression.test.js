import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgression, applyProgression, clearWeeks, describeRules } from '../js/progression.js';
import { buildSession, sessionEntries, refreshEntries, prescribedWeight } from '../js/calc.js';

const block = () => ({ weeks: 10, deloadWeek: null, days: [{ name: 'A', items: [
  { exerciseId: 'sq', sets: 3, reps: 10, weight: 100, unit: 'lb' },
  { exerciseId: 'plank', measure: 'time', sets: 3, secs: 30 },
  { exerciseId: 'curl', sets: 2, reps: 12 },
  { exerciseId: 'w', warmup: true, sets: 1, reps: 10 },
] }] });
const week = (b, w) => buildSession(b, 0, w, {}, 5).items.map((i) => `${i.sets.length}x${i.sets[0].reps ?? i.sets[0].secs}${i.sets[0].weight ? `@${i.sets[0].weight}` : ''}`);

test('Sean\'s example: reps climb to 15, then back to 10 with 10 more pounds, and repeat', () => {
  const p = parseProgression('Increase reps by 1 per week until reps = 15 then reset reps to 10 and increase weight by 10. Continue this same progression');
  assert.equal(p.error, null);
  assert.equal(p.rules.length, 1);
  const r = applyProgression(block(), p.rules);
  assert.deepEqual(r.changed.map((x) => x.ii), [0, 2]);
  assert.deepEqual(r.skipped.map((x) => x.ii), [1]); // timed plank has no reps; warmup is left out
  const sq = Array.from({ length: 10 }, (_, w) => week(r.block, w)[0]);
  assert.deepEqual(sq, ['3x10@100', '3x11@100', '3x12@100', '3x13@100', '3x14@100', '3x15@100', '3x10@110', '3x11@110', '3x12@110', '3x13@110']);
  // Curl has no weight, so only its reps cycle.
  assert.equal(week(r.block, 4)[2], '2x10');
  assert.equal(week(r.block, 9)[3], '1x10'); // warmup untouched
});

test('other wordings', () => {
  const cases = {
    'Add a set every 2 weeks': [{ field: 'sets', op: '+', value: 1 }],
    'add 5 lb per week': [{ field: 'weight', op: '+', value: 5, unit: 'lb' }],
    'Drop sets by one every other week': [{ field: 'sets', op: '-', value: 1 }],
    '+2.5% each week': [{ field: 'weight', op: '+', value: 2.5, unit: '%' }],
  };
  for (const [t, actions] of Object.entries(cases)) assert.deepEqual(parseProgression(t).rules[0].actions, actions, t);
  assert.equal(parseProgression('Add a set every 2 weeks').rules[0].every, 2);
  const capped = parseProgression('add 1 rep and 5 lb every week up to 12 reps').rules[0];
  assert.deepEqual(capped.until, { field: 'reps', value: 12 });
  assert.match(parseProgression('make it harder').error, /couldn't read/);
  assert.equal(describeRules(parseProgression('add 1 rep per week').rules)[0], 'Each week: reps +1.');
});

test('a reset can come as its own sentence', () => {
  const p = parseProgression('Add 1 rep each week. When reps hit 12, reset reps to 8 and add 5 lb.');
  assert.equal(p.error, null);
  assert.deepEqual(p.rules[0].until, { field: 'reps', value: 12 });
  const b = block(); b.weeks = 7;
  const r = applyProgression(b, p.rules);
  assert.deepEqual(Array.from({ length: 7 }, (_, w) => week(r.block, w)[0]), ['3x10@100', '3x11@100', '3x12@100', '3x8@105', '3x9@105', '3x10@105', '3x11@105']);
});

test('cap stops at the limit; deload week pauses the progression', () => {
  const b = block(); b.weeks = 6; b.deloadWeek = 3;
  const r = applyProgression(b, parseProgression('add 1 rep per week up to 12 reps').rules, [0]);
  assert.deepEqual(Array.from({ length: 6 }, (_, w) => week(r.block, w)[0]), ['3x10@100', '3x11@100', '3x12@100', '2x12@90', '3x12@100', '3x12@100']);
});

test('% of max lifts take % steps, and a week override is used as written', () => {
  const b = { weeks: 3, deloadWeek: null, days: [{ name: 'A', items: [{ exerciseId: 'sq', sets: 4, reps: 5, pct: 70 }] }] };
  const r = applyProgression(b, parseProgression('add 2.5% per week').rules);
  const it = r.block.days[0].items[0];
  assert.equal(prescribedWeight(it, { maxes: { sq: 300 } }, 2, r.block), 225); // 75% of 300
  assert.equal(applyProgression(b, parseProgression('add 10 lb per week').rules).changed.length, 0);
  it.byWeek[1].pct = 80;
  assert.equal(prescribedWeight(it, { maxes: { sq: 300 } }, 1, r.block), 240);
  assert.equal(clearWeeks(r.block).days[0].items[0].byWeek, undefined);
});

test('athlete logs pick up a week\'s own numbers when nothing is logged yet', () => {
  const b = block();
  const before = sessionEntries(buildSession(b, 0, 2, {}, 5), 'lb');
  b.days[0].items[0].byWeek = { 2: { reps: 6, weight: 150 } };
  const fresh = sessionEntries(buildSession(b, 0, 2, {}, 5), 'lb');
  const out = refreshEntries(before, fresh);
  assert.equal(out[0].sets[0].targetReps, 6);
  assert.equal(out[0].sets[0].targetWeight, 150);
});

test('the words replace an item\'s own weekly rule for the same number', () => {
  const b = { weeks: 3, deloadWeek: null, days: [{ name: 'A', items: [{ exerciseId: 'sq', sets: 4, reps: 5, pct: 70, progression: { type: 'add_pct', step: 5 } }, { exerciseId: 'b', sets: 3, reps: 5, pct: 70, progression: { type: 'add_pct', step: 5 } }] }] };
  const r = applyProgression(b, parseProgression('add 1 rep per week until reps = 6 then reset reps to 5 and add 2.5%').rules, null);
  assert.equal(r.block.days[0].items[0].progression, undefined);
  assert.deepEqual(r.replaced.length, 2);
  assert.equal(prescribedWeight(r.block.days[0].items[0], { maxes: { sq: 200 } }, 2, r.block), 145); // 72.5% of 200
});
