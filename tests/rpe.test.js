import test from 'node:test';
import assert from 'node:assert/strict';
import { rpeLine, plannedRpe, untouchedEntry, refreshEntries } from '../js/calc.js';

const set = (o = {}) => ({ targetReps: 5, reps: null, secs: null, weight: null, done: false, rpe: 8, ...o });

test('plannedRpe reads the shared planned RPE', () => {
  assert.equal(plannedRpe({ sets: [set(), set()] }), 8);
  assert.equal(plannedRpe({ sets: [set(), set({ rpe: 9 })] }), null);
  assert.equal(plannedRpe({ sets: [set({ rpe: null })] }), null);
});

test('rpeLine lists noted RPEs with dashes for gaps', () => {
  assert.equal(rpeLine({ sets: [set(), set()] }), '');
  assert.equal(rpeLine({ sets: [set({ actualRpe: 7 }), set(), set({ actualRpe: 8.5 }), set()] }), 'RPE 7, –, 8.5 (planned 8)');
  assert.equal(rpeLine({ sets: [set({ rpe: null, actualRpe: 6 })] }), 'RPE 6');
});

test('a set with only an RPE counts as touched and keeps it on refresh', () => {
  const e = { exerciseId: 'bench', sets: [set({ actualRpe: 7 })] };
  assert.equal(untouchedEntry(e), false);
  const out = refreshEntries([e], [{ exerciseId: 'bench', sets: [set({ targetReps: 6, rpe: 9 })] }]);
  assert.equal(out[0].sets[0].actualRpe, 7);
  assert.equal(out[0].sets[0].rpe, 9);
  assert.equal(out[0].sets[0].targetReps, 6);
});
