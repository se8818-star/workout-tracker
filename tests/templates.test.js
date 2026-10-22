import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../js/templates.js';
import { buildSession } from '../js/calc.js';

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
  const fly = s.items[1];
  assert.equal(fly.exerciseId, 'pec-fly');
  assert.equal(fly.sets.length, 3);
  assert.equal(fly.sets[0].rpe, 9.5);
  assert.equal(fly.tempo, '3-1-X-1');
  assert.match(fly.note, /Reps 10-12 · RIR 1\/0 · Rest 3-5 min/);
});
