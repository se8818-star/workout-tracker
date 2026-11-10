import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateMaxes, applyEstimates, clearedAfter, e1rm, EST_MAX_REPS } from '../js/calc.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, done: true, ...extra });
const log = (date, entries, extra = {}) => ({ date, entries, ...extra });

test('best estimate per exercise from ticked weighted sets', () => {
  const ests = estimateMaxes([
    log('2026-11-01', [{ exerciseId: 'squat', sets: [set(185, 5), set(205, 3), { weight: 300, reps: 5, done: false }] }]),
    log('2026-11-03', [{ exerciseId: 'squat', sets: [set(195, 5)] }, { exerciseId: 'plank', sets: [{ secs: 30, done: true }] }]),
  ]);
  assert.deepEqual(Object.keys(ests), ['squat']);
  assert.equal(ests.squat.weight, 195);
  assert.equal(ests.squat.reps, 5);
  assert.equal(ests.squat.date, '2026-11-03');
  assert.equal(ests.squat.est, Math.round(e1rm(195, 5) * 10) / 10);
});

test('high-rep sets and warmups do not count', () => {
  const ests = estimateMaxes([
    log('2026-11-01', [{ exerciseId: 'curl', sets: [set(40, EST_MAX_REPS + 3)] }]),
    log('2026-11-02', [{ exerciseId: 'curl', sets: [set(30, 10)] }], { warmup: true }),
  ]);
  assert.deepEqual(ests, {});
});

test('a single rep is the max itself', () => {
  assert.equal(estimateMaxes([log('2026-11-01', [{ exerciseId: 'bench', sets: [set(225, 1)] }])]).bench.est, 225);
});

test('weights far over the target are typos: skipped, or reported when asked', () => {
  const l = log('2026-11-01', [{ exerciseId: 'bench', sets: [set(2250, 5, { targetWeight: 225 }), set(225, 5, { targetWeight: 225 })] }]);
  assert.equal(estimateMaxes([l]).bench.weight, 225);
  assert.equal(estimateMaxes([l], { withTypos: true }).bench.weight, 225, 'a real set beats a typo');
  const only = log('2026-11-01', [{ exerciseId: 'bench', sets: [set(2250, 5, { targetWeight: 225 })] }]);
  assert.equal(estimateMaxes([only]).bench, undefined);
  assert.equal(estimateMaxes([only], { withTypos: true }).bench.typo, true);
});

test('missing maxes are added and marked estimated', () => {
  const a = { maxes: {} };
  const res = applyEstimates(a, { squat: { est: 227.5, weight: 195, reps: 5, date: '2026-11-03' } });
  assert.deepEqual(res.added, ['squat']);
  assert.equal(a.maxes.squat, 227.5);
  assert.deepEqual(a.maxInfo.squat, { est: true, weight: 195, reps: 5, date: '2026-11-03' });
});

test('existing maxes rise when beaten, big jumps are flagged', () => {
  const a = { maxes: { squat: 200, bench: 150, dl: 300 } };
  const res = applyEstimates(a, {
    squat: { est: 220, weight: 190, reps: 5 },
    bench: { est: 250, weight: 215, reps: 5 },
    dl: { est: 280, weight: 240, reps: 5 },
  }, { jump: 1.2 });
  assert.deepEqual(res.raised, ['squat']);
  assert.deepEqual(res.flagged, [{ exerciseId: 'bench', est: 250 }]);
  assert.deepEqual(a.maxes, { squat: 220, bench: 150, dl: 300 });
  assert.equal(a.maxInfo.dl, undefined, 'a typed max that was not beaten stays typed');
});

test('onlyMissing leaves maxes on file alone; typos never become a max', () => {
  const a = { maxes: { squat: 200 } };
  const res = applyEstimates(a, { squat: { est: 230 }, bench: { est: 2600, typo: true } }, { onlyMissing: true });
  assert.deepEqual(a.maxes, { squat: 200 });
  assert.deepEqual(res.flagged, [{ exerciseId: 'bench', est: 2600 }]);
});

test('a max the coach removed is only estimated again from newer lifts', () => {
  const a = { maxes: {}, maxInfo: { squat: { cleared: '2026-11-02' } } };
  const logs = [log('2026-11-01', [{ exerciseId: 'squat', sets: [set(200, 5)] }])];
  assert.deepEqual(estimateMaxes(logs, { after: clearedAfter(a) }), {});
  logs.push(log('2026-11-04', [{ exerciseId: 'squat', sets: [set(150, 5)] }]));
  assert.equal(estimateMaxes(logs, { after: clearedAfter(a) }).squat.weight, 150);
});
