// Changing one athlete's assigned program in place, from a given week:
// "just this week" or "this week to the end". Pure functions on a block, no
// DOM or storage, so they can be tested with plain Node.
//
// How it's stored: a later week's own numbers already live in
// item.byWeek[week] (sets, reps, repsTo, secs, pct, weight). This adds
// byWeek[week].exerciseId (another exercise that week) and byWeek[week].off
// (the exercise is left out that week). Week 1 (0) is the item itself.

import { prescribedSets, prescribedReps, prescribedRepsTo, prescribedSecs, prescribedPct, isDeload, offInWeek, exerciseInWeek, measureOf } from './calc.js';

const own = (it, w, k) => it.byWeek?.[w]?.[k] != null;

function setOwn(it, w, vals) {
  it.byWeek = it.byWeek || {};
  const wk = { ...it.byWeek[w] };
  for (const [k, v] of Object.entries(vals)) { if (v == null) delete wk[k]; else wk[k] = v; }
  if (Object.keys(wk).length) it.byWeek[w] = wk; else delete it.byWeek[w];
  if (!Object.keys(it.byWeek).length) delete it.byWeek;
}

// A fixed weight for a week before rounding (rounding happens when the
// athlete's session is built).
function weightAt(it, b, w) {
  if (it.weight == null) return null;
  if (own(it, w, 'weight')) return it.byWeek[w].weight;
  const step = it.progression?.type === 'add_weight' ? (it.progression.step || 0) * w : 0;
  return Math.round((it.weight + step) * (isDeload(b, w) ? 0.9 : 1) * 100) / 100;
}

// One number as the athlete gets it in week w.
function valueAt(it, b, k, w) {
  switch (k) {
    case 'sets': return prescribedSets(it, b, w);
    case 'secs': return prescribedSecs(it, w);
    case 'pct': return prescribedPct(it, w, b);
    case 'weight': return weightAt(it, b, w);
    case 'exerciseId': return exerciseInWeek(it, w);
    case 'reps': return { reps: prescribedReps(it, w), repsTo: prescribedRepsTo(it, w) };
    default: return null;
  }
}

const same = (a, b) => (a && typeof a === 'object' ? a.reps === b.reps && (a.repsTo ?? null) === (b.repsTo ?? null) : a === b);

function pin(it, b, k, w, v = valueAt(it, b, k, w)) {
  if (k === 'reps') setOwn(it, w, { reps: v.reps, repsTo: v.repsTo ?? null });
  else setOwn(it, w, { [k]: v });
}

// Drop a week's own value when the item would give that week the same thing anyway.
function tidy(it, b, k) {
  for (let w = 0; w < b.weeks; w++) {
    if (!own(it, w, k)) continue;
    const mine = valueAt(it, b, k, w);
    const keep = structuredClone(it.byWeek[w]);
    setOwn(it, w, k === 'reps' ? { reps: null, repsTo: null } : { [k]: null });
    if (!same(valueAt(it, b, k, w), mine)) { it.byWeek = it.byWeek || {}; it.byWeek[w] = keep; }
  }
}

// Week 1 is the item itself: set its value.
function setBase(it, k, v) {
  if (k === 'reps') { it.reps = v.reps; if (v.repsTo != null) it.repsTo = v.repsTo; else delete it.repsTo; return; }
  it[k] = v;
}

// Move week 1 and the weeks from `from` on that have their own number by
// the same amount, so a weekly rule or a deload still applies on top.
function shift(it, b, k, from, oldV, next) {
  if (k === 'exerciseId') {
    it.exerciseId = next;
    for (let w = Math.max(1, from); w < b.weeks; w++) setOwn(it, w, { exerciseId: null });
    return;
  }
  if (k === 'reps') {
    const d = next.reps - oldV.reps;
    const width = next.repsTo != null ? next.repsTo - next.reps : 0;
    const lo = (it.reps || 0) + d;
    setBase(it, 'reps', { reps: Math.max(0, lo), repsTo: width ? Math.max(0, lo) + width : null });
    for (let w = Math.max(1, from); w < b.weeks; w++) {
      if (!own(it, w, 'reps')) continue;
      const r = Math.max(0, it.byWeek[w].reps + d);
      setOwn(it, w, { reps: r, repsTo: width ? r + width : null });
    }
    return;
  }
  const d = next - oldV;
  const base = k === 'sets' ? (it.sets || 1) : k === 'secs' ? (it.secs || 0) : it[k];
  if (base == null) { it[k] = next; return; }
  it[k] = k === 'sets' ? Math.max(1, base + d) : Math.max(0, Math.round((base + d) * 100) / 100);
  for (let w = Math.max(1, from); w < b.weeks; w++) {
    if (own(it, w, k)) setOwn(it, w, { [k]: Math.max(k === 'sets' ? 1 : 0, Math.round((it.byWeek[w][k] + d) * 100) / 100) });
  }
}

// Change one exercise (day di, item ii) as seen in `week`.
// change: any of { exerciseId, sets, reps: {reps, repsTo}, secs, pct, weight }.
// scope 'week' = only that week; 'rest' = that week to the end of the program.
// Weeks before `week` keep exactly what they had. Returns a new block.
export function changeItem(block, di, ii, week, change, scope) {
  const b = structuredClone(block);
  const it = b.days[di].items[ii];
  for (const [k, next] of Object.entries(change)) {
    if (next == null) continue;
    const before = Array.from({ length: b.weeks }, (_, w) => valueAt(it, b, k, w));
    if (same(before[week], next)) continue;
    // Weeks that must keep what they have: earlier ones always, and every
    // other week for a one-week change made on week 1.
    const hold = (w) => w < week || (scope === 'week' && week === 0 && w > 0);
    for (let w = 0; w < b.weeks; w++) if (hold(w) && w !== 0 && !own(it, w, k)) pin(it, b, k, w, before[w]);
    if (scope === 'week' && week > 0) pin(it, b, k, week, next);
    else if (scope === 'week') setBase(it, k, next);
    else if (week === 0) shift(it, b, k, 0, before[0], next);
    else {
      // Week 1 (the item itself) has to stay, so work the change out on a
      // copy and write the result into the weeks from `week` on.
      const tmp = structuredClone(it);
      shift(tmp, b, k, week, before[week], next);
      for (let w = week; w < b.weeks; w++) pin(it, b, k, w, valueAt(tmp, b, k, w));
    }
    // Whatever the rule or deload does, the week edited gets what was typed.
    if (!same(valueAt(it, b, k, week), next)) pin(it, b, k, week, next);
    tidy(it, b, k);
  }
  return b;
}

// Take an exercise out of `week` only, or out of `week` to the end.
export function removeItem(block, di, ii, week, scope) {
  const b = structuredClone(block);
  const items = b.days[di].items;
  if (scope === 'rest' && week === 0) { items.splice(ii, 1); return b; }
  const last = scope === 'week' ? week : b.weeks - 1;
  for (let w = week; w <= last; w++) setOwn(items[ii], w, { off: true });
  return b;
}

// Put an exercise left out of `week` back in (that week only, or to the end).
export function restoreItem(block, di, ii, week, scope) {
  const b = structuredClone(block);
  const it = b.days[di].items[ii];
  const last = scope === 'week' ? week : b.weeks - 1;
  for (let w = week; w <= last; w++) setOwn(it, w, { off: null });
  return b;
}

// Add an exercise to `week` only, or from `week` to the end.
export function addItem(block, di, item, week, scope) {
  const b = structuredClone(block);
  const it = structuredClone(item);
  for (let w = 0; w < b.weeks; w++) if (w < week || (scope === 'week' && w > week)) setOwn(it, w, { off: true });
  b.days[di].items.push(it);
  return b;
}

// What the athlete gets in one week, for showing and editing.
export function weekView(item, block, week) {
  const m = measureOf(item);
  return {
    off: offInWeek(item, week),
    exerciseId: exerciseInWeek(item, week),
    measure: m,
    sets: m === 'none' ? null : prescribedSets(item, block, week),
    ...(m === 'reps' || m === 'breaths' ? valueAt(item, block, 'reps', week) : { reps: null, repsTo: null }),
    secs: m === 'time' ? prescribedSecs(item, week) : null,
    pct: item.pct != null ? prescribedPct(item, week, block) : null,
    weight: item.weight != null ? weightAt(item, block, week) : null,
  };
}
