import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../js/templates.js';
import { buildSession, sessionTotals, sectionStarts, sessionEntries, refreshEntries } from '../js/calc.js';

test('every template item uses an exercise the template brings', () => {
  for (const t of TEMPLATES) {
    const ids = new Set(t.exercises.map((e) => e.id));
    for (const d of t.block.days) for (const item of d.items) assert.ok(ids.has(item.exerciseId), `${t.id}: ${item.exerciseId}`);
  }
});

test('Fall 2026 builds a session with RIR mapped to RPE and notes kept', () => {
  const t = TEMPLATES.find((x) => x.id === 'fall-2026');
  assert.equal(t.block.weeks, 10);
  const s = buildSession(t.block, 0, 0, { maxes: {} });
  const fly = s.items.find((x) => x.exerciseId === 'pec-fly');
  assert.equal(fly.exerciseId, 'pec-fly');
  assert.equal(fly.sets.length, 3);
  assert.equal(fly.sets[0].rpe, 9.5);
  assert.equal(fly.tempo, '3-1-X-1');
  assert.match(fly.note, /\nRIR 1\/0 · Rest 3-5 min$/);
  assert.equal(fly.sets[0].reps, 10);
  assert.equal(fly.sets[0].repsTo, 12);
});

test('the Fall 2026 warmup is its own template, left out of training totals', () => {
  const prog = TEMPLATES.find((x) => x.id === 'fall-2026');
  assert.ok(prog.block.days.every((d) => d.items.every((x) => !x.warmup)), 'program has no built-in warmup');
  const t = TEMPLATES.find((x) => x.id === 'fall-2026-warmup');
  assert.equal(t.kind, 'warmup');
  assert.equal(t.block.days.length, 1);
  assert.equal(t.block.days[0].items.length, 12);
  assert.ok(t.block.days[0].items.every((x) => x.warmup));
  const ex = Object.fromEntries(t.exercises.map((e) => [e.id, e]));
  const s = buildSession(t.block, 0, 0, { maxes: {} });
  assert.equal(sessionTotals(s, ex, false).sets, 0);
});

test('Christina FB is three supersets with demo videos on its exercises', () => {
  const t = TEMPLATES.find((x) => x.id === 'christina-fb');
  const s = buildSession(t.block, 0, 0, { maxes: {} });
  assert.deepEqual(s.items.map((x) => x.group), ['A', 'A', 'B', 'B', 'C', 'C']);
  const bench = s.items[0];
  assert.equal(bench.sets.length, 1);
  assert.equal(bench.sets[0].reps, 10);
  assert.equal(bench.sets[0].repsTo, 15);
  assert.equal(bench.sets[0].rpe, 9);
  assert.match(bench.note, /RIR 1/);
  assert.doesNotMatch(bench.note, /Reps 10-15/);
  assert.doesNotMatch(bench.note, /https?:/);
  assert.ok(t.exercises.every((e) => e.video), 'every exercise has a demo');
  assert.equal(t.exercises.find((e) => e.id === 'db-bench').video, 'https://youtu.be/JN9DVjlafcg');
  assert.equal(s.items[2].sets[0].rpe, null);
});

test('Landon Program: 3 days of plyos, supersets and weekly weight rules, no warmup inside', () => {
  const t = TEMPLATES.find((x) => x.id === 'landon');
  assert.equal(t.name, 'Landon Program');
  assert.equal(t.block.weeks, 4);
  assert.deepEqual(t.block.days.map((d) => d.name), ['Monday: Full body', 'Friday: Upper', 'Saturday: Lower']);
  assert.ok(t.block.days.every((d) => d.items.every((x) => !x.warmup)));
  const sat = buildSession(t.block, 2, 0, { maxes: {} });
  const squat = sat.items.find((x) => x.exerciseId === 'ssb-box-squat');
  assert.equal(squat.sets.length, 4);
  assert.equal(squat.sets[0].reps, 5);
  assert.equal(squat.sets[0].repsTo, 8);
  assert.equal(squat.sets[0].weight, 255);
  assert.equal(buildSession(t.block, 2, 2, { maxes: {} }).items.find((x) => x.exerciseId === 'ssb-box-squat').sets[0].weight, 265);
  const mon = buildSession(t.block, 0, 0, { maxes: {} });
  assert.equal(mon.items.find((x) => x.exerciseId === 'a-march').sets.length, 1, 'yard drills are check-offs');
  assert.equal(mon.items.find((x) => x.exerciseId === '3pt-y-raise').sets[0].secs, 30);
  const ex = Object.fromEntries(t.exercises.map((e) => [e.id, e]));
  assert.equal(ex['dead-hang'].videoPassword, 'cressey');
  for (const d of t.block.days) for (const x of d.items) assert.doesNotMatch(x.note || '', /password|https?:/i);
});

test('Landon Warmup is its own warmup template', () => {
  const t = TEMPLATES.find((x) => x.id === 'landon-warmup');
  assert.equal(t.kind, 'warmup');
  assert.equal(t.name, 'Landon Warmup');
  const items = t.block.days[0].items;
  assert.equal(items.length, 33);
  assert.ok(items.every((x) => x.warmup));
  assert.equal(items.find((x) => x.exerciseId === 'bretzel').measure, 'breaths');
  const s = buildSession(t.block, 0, 0, { maxes: {} });
  assert.deepEqual(sectionStarts(s.items).filter(Boolean), ['P1 · Foam roll', 'P2 · RPR', 'P3 · Expansionary', 'Dynamic']);
  const count = (sec) => s.items.filter((x) => x.section === sec).length;
  assert.deepEqual([count('P1 · Foam roll'), count('P2 · RPR'), count('P3 · Expansionary'), count('Dynamic')], [9, 11, 9, 4]);
  assert.ok(s.items.filter((x) => x.section === 'P2 · RPR').every((x) => x.measure === 'time' && x.sets[0].secs === 10));
});

test('template exercise ids are unique within each template', () => {
  for (const t of TEMPLATES) assert.equal(new Set(t.exercises.map((e) => e.id)).size, t.exercises.length, t.id);
});

test('a section name reaches log entries and follows coach edits', () => {
  const block = { weeks: 1, kind: 'warmup', days: [{ name: 'W', items: [{ exerciseId: 'a', sets: 1, reps: 5, section: 'Foam roll' }, { exerciseId: 'b', sets: 1, reps: 5 }] }] };
  const old = sessionEntries(buildSession(block, 0, 0, {}), 'lb');
  assert.equal(old[0].section, 'Foam roll');
  old[1].sets[0].done = true;
  block.days[0].items[0].section = 'Mobility';
  block.days[0].items[1].section = 'Mobility';
  const out = refreshEntries(old, sessionEntries(buildSession(block, 0, 0, {}), 'lb'));
  assert.deepEqual(out.map((e) => e.section), ['Mobility', 'Mobility']);
  assert.deepEqual(sectionStarts(out), ['Mobility', '']);
});
