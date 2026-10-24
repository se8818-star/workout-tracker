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

test('a rep range moves as a whole with "add 1 rep per week"', () => {
  const b = { weeks: 3, deloadWeek: null, days: [{ name: 'A', items: [{ exerciseId: 'x', sets: 3, reps: 10, repsTo: 15 }] }] };
  const p = parseProgression('Add 1 rep per week');
  const r = applyProgression(b, p.rules);
  const it = r.block.days[0].items[0];
  assert.deepEqual(it.byWeek[1], { reps: 11, repsTo: 16 });
  assert.deepEqual(it.byWeek[2], { reps: 12, repsTo: 17 });
  const s = buildSession(r.block, 0, 2, {});
  assert.equal(s.items[0].sets[0].repsTo, 17);
});

// A two-day program with names, for sentences aimed at some of it.
const named = () => ({ weeks: 8, deloadWeek: null, days: [
  { name: 'Full body', items: [
    { exerciseId: 'bench', sets: 1, reps: 10, repsTo: 15, weight: 100, unit: 'lb', group: 'A' },
    { exerciseId: 'squat', sets: 1, reps: 10, repsTo: 15, weight: 150, unit: 'lb', group: 'A' },
    { exerciseId: 'chin', sets: 1, reps: 10, group: 'B' },
  ] },
  { name: 'Legs 2', items: [
    { exerciseId: 'fsquat', sets: 3, reps: 8, weight: 135, unit: 'lb' },
    { exerciseId: 'curl', sets: 3, reps: 12, weight: 30, unit: 'lb', progression: { type: 'add_weight', step: 5 } },
  ] },
] });
const NAMES_EX = { bench: { name: 'Dumbbell bench press' }, squat: { name: 'Back squat' }, chin: { name: 'Chin-up' }, fsquat: { name: 'Front squat' }, curl: { name: 'Seated leg curl' } };
const sets = (b, di, ii) => Array.from({ length: b.weeks }, (_, w) => buildSession(b, di, w, {}, 5).items[ii].sets.length);
const lbs = (b, di, ii) => Array.from({ length: b.weeks }, (_, w) => buildSession(b, di, w, {}, 5).items[ii].sets[0].weight);

test('week ranges: "weeks 2-3: 2 sets. Week 4 on: 3 sets" on one day', () => {
  const b = named();
  const p = parseProgression('Weeks 2-3: 2 sets. Week 4 on: 3 sets.', b, NAMES_EX);
  assert.equal(p.error, null);
  assert.deepEqual(p.rules[0].weeks, { from: 2, to: 3 });
  assert.deepEqual(p.rules[1].weeks, { from: 4, to: Infinity });
  assert.deepEqual(describeRules(p.rules), ['Weeks 2–3: sets at 2.', 'From week 4: sets at 3.']);
  const r = applyProgression(b, p.rules, [0]);
  assert.deepEqual(sets(r.block, 0, 0), [1, 2, 2, 3, 3, 3, 3, 3]);
  assert.deepEqual(sets(r.block, 0, 2), [1, 2, 2, 3, 3, 3, 3, 3]);
  assert.deepEqual(sets(r.block, 1, 0), [3, 3, 3, 3, 3, 3, 3, 3]); // other day left alone
});

test('one exercise, from a week on; other weeks and other numbers stay', () => {
  const b = named();
  const p = parseProgression('From week 5, add 5 lb per week to bench', b, NAMES_EX);
  assert.equal(p.error, null);
  assert.deepEqual(p.rules[0].targets.items, ['0:0']);
  assert.match(describeRules(p.rules)[0], /^From week 5, only Dumbbell bench press, each week: weight \+5 lb/);
  const r = applyProgression(b, p.rules);
  assert.deepEqual(r.changed, [{ di: 0, ii: 0 }]);
  assert.deepEqual(lbs(r.block, 0, 0), [100, 100, 100, 100, 105, 110, 115, 120]);
  assert.deepEqual(lbs(r.block, 0, 1), [150, 150, 150, 150, 150, 150, 150, 150]);
});

test('a one-off week goes back afterwards, and earlier commands survive later ones', () => {
  let b = named();
  b = applyProgression(b, parseProgression('Weeks 2-3: 2 sets. Week 4 on: 3 sets.', b, NAMES_EX).rules, [0]).block;
  const p = parseProgression('Week 6: 4 sets for back squat', b, NAMES_EX);
  assert.equal(p.error, null);
  b = applyProgression(b, p.rules).block;
  assert.deepEqual(sets(b, 0, 1), [1, 2, 2, 3, 3, 4, 3, 3]);
  assert.deepEqual(sets(b, 0, 0), [1, 2, 2, 3, 3, 3, 3, 3]);
});

test('days, supersets and several exercises by name', () => {
  const b = named();
  const day = parseProgression('On Legs 2, add 1 rep each week until week 4', b, NAMES_EX);
  assert.equal(day.error, null);
  assert.deepEqual(day.rules[0].targets.days, [1]);
  assert.deepEqual(day.rules[0].weeks, { from: 2, to: 4 });
  const r = applyProgression(b, day.rules);
  assert.deepEqual(r.changed.map((x) => x.di), [1, 1]);
  const reps = Array.from({ length: 8 }, (_, w) => buildSession(r.block, 1, w, {}, 5).items[0].sets[0].reps);
  assert.deepEqual(reps, [8, 9, 10, 11, 11, 11, 11, 11]); // the gains are kept after the weeks end
  // The curl's own "+5 lb a week" isn't touched by a reps change.
  assert.deepEqual(lbs(r.block, 1, 1).slice(0, 3), [30, 35, 40]);
  const ss = parseProgression('Superset A: add a set in weeks 3 and 5', b, NAMES_EX);
  assert.deepEqual(ss.rules[0].targets.groups, ['a']);
  assert.deepEqual(applyProgression(b, ss.rules).changed.map((x) => x.ii), [0, 1]);
  const two = parseProgression('add 10 lb every 2 weeks for bench and squats', b, NAMES_EX);
  assert.deepEqual(two.rules[0].targets.items.sort(), ['0:0', '0:1', '1:0']);
});

test('a scoped weight change keeps the weeks its exercise\'s own rule already gave', () => {
  const b = named();
  const r = applyProgression(b, parseProgression('From week 4, add 10 lb per week to leg curl', b, NAMES_EX).rules);
  assert.deepEqual(r.replaced, [{ di: 1, ii: 1 }]);
  assert.deepEqual(lbs(r.block, 1, 1), [30, 35, 40, 50, 60, 70, 80, 90]);
});

test('scope mistakes are explained', () => {
  const b = named();
  assert.match(parseProgression('Week 1: 3 sets', b, NAMES_EX).error, /Week 1 is the starting point/);
  assert.equal(parseProgression('Superset C: 3 sets', b, NAMES_EX).error, 'This program has no superset C.');
  assert.equal(parseProgression('add 1 set on day 3', b, NAMES_EX).error, 'This program has no day 3.');
  // Names the block doesn't have are not a scope: the sentence reads as before.
  assert.equal(parseProgression('add 1 rep per week to everything', b, NAMES_EX).rules[0].targets, undefined);
});

test('a named week is a one-off; the weeks after go back', () => {
  const b = named();
  const p = parseProgression('Only Front squat: add 2 sets in week 6. Weeks 7 and 8: drop sets by 1 on front squat', b, NAMES_EX);
  assert.equal(p.error, null);
  assert.deepEqual(describeRules(p.rules), ['Week 6, only Front squat: sets +2.', 'Weeks 7, 8, only Front squat: sets −1.']);
  const r = applyProgression(b, p.rules);
  assert.deepEqual(sets(r.block, 1, 0), [3, 3, 3, 3, 3, 5, 2, 2]);
  const both = parseProgression('add 1 set starting week 3 for chin-ups and the bench', b, NAMES_EX);
  assert.deepEqual(both.rules[0].targets.labels, ['Chin-up', 'Dumbbell bench press']);
});

test('changes run together with commas still split by their weeks', () => {
  const b = named();
  const p = parseProgression('weeks 2-3: 2 sets of everything, weeks 4-7: 3 sets of everything, weeks 8-12: 4 sets of everything', b, NAMES_EX);
  assert.equal(p.error, null);
  assert.deepEqual(describeRules(p.rules), ['Weeks 2–3: sets at 2.', 'Weeks 4–7: sets at 3.', 'Weeks 8–12: sets at 4.']);
  const r = applyProgression(b, p.rules);
  assert.deepEqual(sets(r.block, 0, 0), [1, 2, 2, 3, 3, 3, 3, 4]);
  assert.deepEqual(sets(r.block, 1, 0), [3, 2, 2, 3, 3, 3, 3, 4]);
  assert.equal(parseProgression('weeks 2-3: 2 sets and weeks 4-7: 3 sets then week 8 on: 4 sets', b, NAMES_EX).rules.length, 3);
  assert.match(parseProgression('2 sets, 3 sets', b, NAMES_EX).error, /more than one number for sets/);
});
