import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../js/templates.js';
import { buildSession, sessionTotals } from '../js/calc.js';

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
  assert.match(fly.note, /Reps 10-12 · RIR 1\/0 · Rest 3-5 min/);
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
  assert.equal(bench.sets[0].rpe, 9);
  assert.match(bench.note, /Reps 10-15 · RIR 1/);
  assert.doesNotMatch(bench.note, /https?:/);
  assert.ok(t.exercises.every((e) => e.video), 'every exercise has a demo');
  assert.equal(t.exercises.find((e) => e.id === 'db-bench').video, 'https://youtu.be/JN9DVjlafcg');
  assert.equal(s.items[2].sets[0].rpe, null);
});
