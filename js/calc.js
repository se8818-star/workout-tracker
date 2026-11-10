// Pure training math: prescriptions, tonnage, plyo contacts, weekly volume.
// No DOM or storage here so it can be tested with plain Node.

export const PATTERNS = ['squat', 'hinge', 'push', 'pull', 'carry', 'core', 'plyo', 'sprint', 'throw', 'other'];

export const PLYO_TIERS = {
  1: 'Low (jumps in place)',
  2: 'Low-medium (standing jumps)',
  3: 'Medium (multiple jumps, bounds, hops)',
  4: 'Medium-high (box drills)',
  5: 'High (depth jumps)',
  6: 'Very high (shock)',
};

// Contacts at or above this tier are counted on their own line.
export const HIGH_TIER = 5;

// Weights are stored in pounds. Each device shows and takes them in its own
// unit (lb or kg), so a coach in kg and an athlete in lb see the same numbers.
export const LB_PER_KG = 2.20462;
export const toUnit = (lb, unit) => (lb == null ? null : unit === 'kg' ? lb / LB_PER_KG : lb);
export const fromUnit = (v, unit) => (v == null ? null : unit === 'kg' ? v * LB_PER_KG : v);

// Rounding is a step in pounds, or {lb, kg, unit} to round in the item's own unit.
function stepFor(rounding, item) {
  if (typeof rounding === 'number') return rounding;
  const u = item.unit || rounding.unit || 'lb';
  return u === 'kg' ? rounding.kg * LB_PER_KG : rounding.lb;
}

export function roundTo(x, step = 5) {
  if (!step) return x;
  return Math.round(x / step) * step;
}

// Estimated 1RM (Epley). Single reps return the weight itself.
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// ---------- maxes from logged lifts ----------
// An athlete's max for an exercise is estimated from their ticked sets with
// the rep-max formula above. Sets of more than EST_MAX_REPS reps guess the max
// poorly, so they're left out. A set more than TYPO_JUMP times its target
// weight is most likely a typo (2250 for 225) and is skipped.
export const EST_MAX_REPS = 12;
export const TYPO_JUMP = 1.5;

const setEstimate = (s) => (s.done && s.weight > 0 && s.reps >= 1 && s.reps <= EST_MAX_REPS ? e1rm(s.weight, s.reps) : 0);
const looksLikeTypo = (s) => s.targetWeight > 0 && s.weight > s.targetWeight * TYPO_JUMP;

// Best estimate per exercise across logs: { [exerciseId]: {est, weight, reps,
// date, typo} }. `after` maps an exercise to a date: only later sets count
// (used after a coach clears a max). Typo sets are only reported when
// `withTypos` is set, and never beat a real set.
export function estimateMaxes(logs, { after = {}, withTypos = false } = {}) {
  const out = {};
  for (const l of logs) {
    if (l.warmup) continue;
    for (const e of l.entries || []) {
      if (after[e.exerciseId] && l.date <= after[e.exerciseId]) continue;
      for (const s of e.sets || []) {
        const est = setEstimate(s);
        if (!est) continue;
        const typo = looksLikeTypo(s);
        if (typo && !withTypos) continue;
        const cur = out[e.exerciseId];
        if (!cur || (cur.typo && !typo) || (cur.typo === typo && est > cur.est)) {
          out[e.exerciseId] = { est: Math.round(est * 10) / 10, weight: s.weight, reps: s.reps, date: l.date, typo };
        }
      }
    }
  }
  return out;
}

// Applies estimates to athlete.maxes (in place). An exercise with no max gets
// one; a max is raised when beaten, unless the jump is over `jump` times it
// (then it's flagged for the coach). `onlyMissing` leaves existing maxes
// alone. athlete.maxInfo[id] says where each max came from:
// {est: true, weight, reps, date} for an estimate, nothing for a typed one.
export function applyEstimates(athlete, ests, { jump = 1.2, onlyMissing = false } = {}) {
  const res = { added: [], raised: [], flagged: [] };
  athlete.maxes ||= {};
  for (const [id, e] of Object.entries(ests)) {
    const cur = athlete.maxes[id];
    if (cur && (onlyMissing || e.est <= cur)) continue;
    if (e.typo || (cur && e.est > cur * jump)) { res.flagged.push({ exerciseId: id, est: Math.round(e.est) }); continue; }
    athlete.maxes[id] = e.est;
    athlete.maxInfo = { ...athlete.maxInfo, [id]: { est: true, weight: e.weight, reps: e.reps, date: e.date } };
    res[cur ? 'raised' : 'added'].push(id);
  }
  return res;
}

// Exercises whose max the coach removed: estimates only use sets after that.
export const clearedAfter = (athlete) => Object.fromEntries(Object.entries(athlete?.maxInfo || {}).filter(([, v]) => v?.cleared).map(([k, v]) => [k, v.cleared]));

// Weeks are 0-based. A deload week cuts sets in half and load by 10%.
export function isDeload(block, week) {
  return block.deloadWeek != null && block.deloadWeek === week;
}

// A number the coach set for one week (item.byWeek[week].sets, .reps, .secs,
// .weight or .pct). It is used exactly as written: the weekly rule and the
// deload cut don't change it. Week 1 (0) is the item itself.
export function weekOverride(item, week, k) {
  const v = item.byWeek?.[week]?.[k];
  return v == null ? null : v;
}

export function prescribedSets(item, block, week) {
  const o = weekOverride(item, week, 'sets');
  if (o != null) return Math.max(1, o);
  const sets = item.sets || 1;
  return isDeload(block, week) ? Math.max(1, Math.ceil(sets / 2)) : sets;
}

// Prescribed load for one item in a given week. Returns null when the
// item has no load (bodyweight, plyos) or the athlete has no max on file.
export function prescribedWeight(item, athlete, week, block, rounding = 5) {
  const prog = item.progression || { type: 'none' };
  let weight = null;
  if (item.pct != null) {
    const max = athlete?.maxes?.[item.maxFrom || item.exerciseId];
    if (!max) return null;
    const o = weekOverride(item, week, 'pct');
    if (o != null) return roundTo(max * o / 100, stepFor(rounding, item));
    let pct = item.pct;
    if (prog.type === 'add_pct') pct += (prog.step || 0) * week;
    weight = max * pct / 100;
  } else if (item.weight != null) {
    const o = weekOverride(item, week, 'weight');
    if (o != null) return roundTo(o, stepFor(rounding, item));
    weight = item.weight;
    if (prog.type === 'add_weight') weight += (prog.step || 0) * week;
  } else {
    return null;
  }
  if (isDeload(block, week)) weight *= 0.9;
  return roundTo(weight, stepFor(rounding, item));
}

// The week's % of max, as the athlete would see it when they have no max on
// file to turn it into a weight.
export function prescribedPct(item, week, block) {
  if (item.pct == null) return null;
  const o = weekOverride(item, week, 'pct');
  if (o != null) return o;
  const prog = item.progression || {};
  let pct = item.pct + (prog.type === 'add_pct' ? (prog.step || 0) * week : 0);
  if (isDeload(block, week)) pct *= 0.9;
  return Math.round(pct * 2) / 2;
}

// How an item is measured: 'reps' (default), 'time' (seconds per set),
// 'breaths' (a count like reps, kept in the reps field, never loaded), or
// 'none' (no sets or reps; the athlete just checks it off, e.g. a warmup).
export const measureOf = (item) => item.measure || 'reps';
export const isCount = (measure) => measure === 'reps' || measure === 'breaths';

// Whether a logged exercise gets a weight box. The athlete can turn it on or
// off for one workout (entry.load); otherwise the exercise decides.
export function logsWeight(entry, ex) {
  const m = measureOf(entry);
  if (m === 'none' || m === 'breaths') return false;
  return entry.load ?? ex?.loaded !== false;
}

export function prescribedSecs(item, week) {
  const o = weekOverride(item, week, 'secs');
  if (o != null) return o;
  const prog = item.progression || {};
  const secs = item.secs || 0;
  return prog.type === 'add_secs' ? secs + (prog.step || 0) * week : secs;
}

export function prescribedReps(item, week) {
  const o = weekOverride(item, week, 'reps');
  if (o != null) return o;
  const prog = item.progression || {};
  const reps = item.reps || 0;
  return prog.type === 'add_reps' ? reps + (prog.step || 0) * week : reps;
}

// A rep range ("10-15") keeps its low end in item.reps and its top in
// item.repsTo. The top moves with the weekly rep rule; a week with its own
// reps uses that week's own top (or none, for a single number).
export function prescribedRepsTo(item, week) {
  const reps = prescribedReps(item, week);
  let top = null;
  if (weekOverride(item, week, 'reps') != null) top = weekOverride(item, week, 'repsTo');
  else if (item.repsTo != null) top = item.repsTo + (prescribedReps(item, week) - (item.reps || 0));
  return top != null && top > reps ? top : null;
}

// "10-15", "10–15", "10 to 15" -> {reps: 10, repsTo: 15}; "12" -> {reps: 12, repsTo: null}.
// Empty gives {reps: null, repsTo: null}; anything else is null.
export function parseReps(text) {
  const t = String(text ?? '').trim();
  if (!t) return { reps: null, repsTo: null };
  const m = t.match(/^(\d+)\s*(?:(?:-|–|—|to)\s*(\d+))?$/i);
  if (!m) return null;
  let lo = Number(m[1]), hi = m[2] == null ? null : Number(m[2]);
  if (hi != null && hi < lo) [lo, hi] = [hi, lo];
  return { reps: lo, repsTo: hi != null && hi > lo ? hi : null };
}

// 10, 15 -> "10–15"; 10, null -> "10". `dash` picks the joiner (a plain
// hyphen for boxes the coach types in).
export function repsText(reps, repsTo, dash = '–') {
  if (reps == null) return '';
  return repsTo != null && repsTo > reps ? `${reps}${dash}${repsTo}` : `${reps}`;
}

// The reps a planned set counts for in totals: the middle of a range.
export const planReps = (lo, hi) => (hi != null && hi > lo ? Math.round((lo + hi) / 2) : lo);

// A week can also leave an exercise out (byWeek[week].off) or use another
// exercise in its place (byWeek[week].exerciseId), set from an athlete's
// program page with "just this week" or "rest of the program".
export const offInWeek = (item, week) => Boolean(item.byWeek?.[week]?.off);
export const exerciseInWeek = (item, week) => item.byWeek?.[week]?.exerciseId || item.exerciseId;

// The items a day has in one week, each with that week's exercise.
export function weekItems(block, dayIndex, week) {
  const day = block.days[dayIndex];
  if (!day) return [];
  return day.items.filter((it) => !offInWeek(it, week)).map((it) => {
    const exId = exerciseInWeek(it, week);
    return exId === it.exerciseId ? it : { ...it, exerciseId: exId };
  });
}

// Weekly rules build on what the athlete actually did, not only on what was
// written. `done` is {week, sets}: the sets they finished of this exercise the
// last time this day came up in the program (an earlier, non-deload week).
// Each set's target becomes that set's actual number plus the rule's step for
// every week since: programmed 10 x 135 with "+5 lb a week", done 9 x 130,
// gives 10 x 135 next week (not 140). Only the number the rule moves changes.
// A number the coach typed for this week, a deload week, or no log at all
// leaves the programmed targets as they are. Returns per-set overrides
// [{weight?, pct?, reps?, repsTo?, secs?}] or null.
export function fromActual(item, week, block, athlete, done, rounding = 5) {
  const prog = item.progression;
  if (!prog?.step || !done?.sets?.length || isDeload(block, week) || done.week >= week) return null;
  const gap = week - done.week;
  const n = prescribedSets(item, block, week);
  const measure = measureOf(item);
  const ref = (j) => done.sets[Math.min(j, done.sets.length - 1)];
  const out = Array.from({ length: n }, () => ({}));
  let changed = false;
  if (prog.type === 'add_weight' && item.weight != null && weekOverride(item, week, 'weight') == null) {
    out.forEach((o, j) => { const w = Number(ref(j).weight); if (w > 0) { o.weight = roundTo(w + prog.step * gap, stepFor(rounding, item)); changed = true; } });
  } else if (prog.type === 'add_pct' && item.pct != null && weekOverride(item, week, 'pct') == null) {
    const max = athlete?.maxes?.[item.maxFrom || item.exerciseId];
    if (max) out.forEach((o, j) => {
      const w = Number(ref(j).weight);
      if (w > 0) { o.weight = roundTo(w + max * prog.step / 100 * gap, stepFor(rounding, item)); o.pct = Math.round(o.weight / max * 200) / 2; changed = true; }
    });
  } else if (prog.type === 'add_reps' && isCount(measure) && weekOverride(item, week, 'reps') == null) {
    const lo = prescribedReps(item, week), hi = prescribedRepsTo(item, week);
    out.forEach((o, j) => {
      const r = ref(j).reps;
      if (r == null || r === '') return;
      o.reps = Number(r) + prog.step * gap;
      // A rep range keeps its width and moves with the low end.
      if (hi != null) o.repsTo = o.reps + (hi - lo);
      changed = true;
    });
  } else if (prog.type === 'add_secs' && measure === 'time' && weekOverride(item, week, 'secs') == null) {
    out.forEach((o, j) => { const t = ref(j).secs; if (t != null && t !== '') { o.secs = Number(t) + prog.step * gap; changed = true; } });
  }
  return changed ? out : null;
}

// lastDone for buildSession from an athlete's logs: for the nth time an
// exercise appears on the day, the sets they finished of it the most recent
// earlier week this day came up in the same program (its copy or original
// counts too). Deload weeks are skipped, so the week after a deload builds on
// the week before it. Swapped or athlete-added exercises don't count.
export function lastDoneFrom(logs, block, dayIndex, week, beforeIso) {
  const ids = new Set([block.id, block.copiedFrom].filter(Boolean));
  const past = logs.filter((l) => !l.warmup && ids.has(l.blockId) && l.dayIndex === dayIndex && l.week < week
    && !isDeload(block, l.week) && (!beforeIso || l.date < beforeIso))
    .sort((a, b) => b.week - a.week || b.date.localeCompare(a.date));
  return (exerciseId, nth = 0) => {
    for (const l of past) {
      const e = (l.entries || []).filter((x) => x.exerciseId === exerciseId && !x.swappedFrom && !x.addedByAthlete)[nth];
      const sets = (e?.sets || []).filter((x) => x.done);
      if (sets.length) return { week: l.week, sets };
    }
    return null;
  };
}

// Build the concrete session for one athlete: block day + week -> rows with sets.
// `lastDone(exerciseId, nth)` gives what the athlete did of that exercise
// before (see fromActual); leave it out to get the program as written.
export function buildSession(block, dayIndex, week, athlete, rounding = 5, lastDone = null) {
  const day = block.days[dayIndex];
  if (!day) return null;
  const seen = {};
  return {
    name: day.name,
    items: weekItems(block, dayIndex, week).map((item) => {
      const nth = seen[item.exerciseId] = (seen[item.exerciseId] ?? -1) + 1;
      const done = lastDone && !item.warmup && block.kind !== 'warmup' ? lastDone(item.exerciseId, nth) : null;
      const actual = done ? fromActual(item, week, block, athlete, done, rounding) : null;
      const measure = measureOf(item);
      const reps = isCount(measure) ? prescribedReps(item, week) : null;
      const repsTo = isCount(measure) ? prescribedRepsTo(item, week) : null;
      const secs = measure === 'time' ? prescribedSecs(item, week) : null;
      const noLoad = measure === 'none' || measure === 'breaths';
      const weight = noLoad ? null : prescribedWeight(item, athlete, week, block, rounding);
      const pct = noLoad ? null : prescribedPct(item, week, block);
      const n = measure === 'none' ? 1 : prescribedSets(item, block, week);
      return {
        exerciseId: item.exerciseId,
        ...(item.warmup || block.kind === 'warmup' ? { warmup: true } : {}),
        measure,
        ...(item.unit ? { unit: item.unit } : {}),
        note: item.note || '',
        tempo: item.tempo || '',
        group: item.group || '',
        ...(actual ? { basedOn: done.week } : {}),
        sets: Array.from({ length: n }, (_, j) => {
          const a = actual?.[j] || {};
          const r = a.reps ?? reps, rt = a.reps != null ? (a.repsTo ?? null) : repsTo, p = a.pct ?? pct;
          return { reps: r, ...(rt != null ? { repsTo: rt } : {}), secs: a.secs ?? secs, weight: a.weight ?? weight, ...(p != null ? { pct: p } : {}), rpe: item.rpe ?? null, done: false };
        }),
      };
    }),
  };
}

// Turn a built session into log entries: prescribed numbers become targets
// and the boxes start empty for the athlete to fill.
export function sessionEntries(s, unit) {
  return s.items.map((it) => ({ ...it, unit: it.unit || unit, sets: it.sets.map((x) => ({
    targetReps: x.reps, ...(x.repsTo != null ? { targetRepsTo: x.repsTo } : {}), targetSecs: x.secs, targetWeight: x.weight, ...(x.pct != null ? { targetPct: x.pct } : {}),
    rpe: x.rpe, reps: null, secs: null, weight: null, done: false,
  })) }));
}

// A set with a form video counts as touched, so a rebuild never drops the clip.
const untouchedSet = (s) => !s.done && s.reps == null && s.secs == null && s.weight == null && !s.unit && !s.video;
export const untouchedEntry = (e) => !e.addedByAthlete && !e.athleteEdited && !e.swappedFrom && !e.athleteNote && !e.setsChanged && e.sets.every(untouchedSet);

// A day's log is made the first time the athlete opens it, but the coach can
// still edit the block after that. Bring the block's current plan into the
// log: a log nobody has written in yet is rebuilt outright; otherwise each
// set the athlete hasn't touched picks up the new targets, and anything they
// logged stays as it is.
// An exercise the coach took out (or swapped) that the athlete hadn't
// started goes away; one the coach added shows up at the end.
export function refreshEntries(entries, fresh) {
  if (entries.every(untouchedEntry)) return fresh;
  const used = new Set();
  const out = entries.map((e) => {
    const k = fresh.findIndex((f, i) => !used.has(i) && (f.exerciseId === e.exerciseId || f.exerciseId === e.swappedFrom));
    if (e.addedByAthlete) return e;
    if (k < 0) return untouchedEntry(e) ? null : e;
    used.add(k);
    const f = fresh[k];
    if (untouchedEntry(e)) return { ...e, basedOn: undefined, ...f };
    return {
      ...e, note: f.note, tempo: f.tempo, group: f.group, unit: f.unit, basedOn: f.basedOn,
      // How the athlete chose to log it (reps, breaths, weight...) stays theirs.
      measure: e.athleteEdited ? e.measure : f.measure,
      sets: e.sets.map((s, j) => {
        const t = f.sets[Math.min(j, f.sets.length - 1)];
        if (!t || s.done) return s;
        const { targetPct, targetRepsTo, ...rest } = s;
        return { ...rest, targetReps: t.targetReps, ...(t.targetRepsTo != null ? { targetRepsTo: t.targetRepsTo } : {}), targetSecs: t.targetSecs, targetWeight: e.swappedFrom ? null : t.targetWeight,
          ...(t.targetPct != null && !e.swappedFrom ? { targetPct: t.targetPct } : {}), rpe: t.rpe };
      }),
    };
  }).filter(Boolean);
  return out.concat(fresh.filter((_, i) => !used.has(i)));
}

function setsOf(entry, onlyDone) {
  return (entry.sets || []).filter((s) => !onlyDone || s.done);
}

// Totals for one session (planned or logged). `onlyDone` counts finished sets only.
export function sessionTotals(session, exercises, onlyDone = true) {
  const t = { tonnage: 0, reps: 0, sets: 0, contacts: 0, highContacts: 0, sprintMeters: 0, throws: 0, setsByPattern: {}, tonnageByPattern: {}, zones: { z70: 0, z80: 0, z90: 0 } };
  for (const entry of session.items || session.entries || []) {
    const ex = exercises[entry.exerciseId];
    if (!ex || entry.warmup) continue; // warmups don't count toward training load
    for (const s of setsOf(entry, onlyDone)) {
      // Breaths count as sets but not as reps, tonnage or contacts. A planned
      // rep range counts as its middle; logged sets count what was done.
      const reps = entry.measure === 'breaths' ? 0 : planReps(Number(s.reps) || 0, s.repsTo);
      const w = Number(s.weight) || 0;
      t.sets += 1;
      t.reps += reps;
      t.setsByPattern[ex.pattern] = (t.setsByPattern[ex.pattern] || 0) + 1;
      if ((entry.load ?? ex.loaded) && w) {
        const ton = reps * w;
        t.tonnage += ton;
        t.tonnageByPattern[ex.pattern] = (t.tonnageByPattern[ex.pattern] || 0) + ton;
      }
      if (ex.contactsPerRep) {
        const c = reps * ex.contactsPerRep;
        t.contacts += c;
        if ((ex.plyoTier || 0) >= HIGH_TIER) t.highContacts += c;
      }
      if (ex.metersPerRep) t.sprintMeters += reps * ex.metersPerRep;
      if (ex.pattern === 'throw') t.throws += reps;
      if (s.pctOfMax != null) {
        if (s.pctOfMax >= 90) t.zones.z90 += reps;
        else if (s.pctOfMax >= 80) t.zones.z80 += reps;
        else if (s.pctOfMax >= 70) t.zones.z70 += reps;
      }
    }
  }
  return t;
}

export function addTotals(a, b) {
  const out = { ...a, setsByPattern: { ...a.setsByPattern }, tonnageByPattern: { ...a.tonnageByPattern }, zones: { ...a.zones } };
  for (const k of ['tonnage', 'reps', 'sets', 'contacts', 'highContacts', 'sprintMeters', 'throws']) out[k] += b[k];
  for (const [k, v] of Object.entries(b.setsByPattern)) out.setsByPattern[k] = (out.setsByPattern[k] || 0) + v;
  for (const [k, v] of Object.entries(b.tonnageByPattern)) out.tonnageByPattern[k] = (out.tonnageByPattern[k] || 0) + v;
  for (const k of Object.keys(out.zones)) out.zones[k] += b.zones[k];
  return out;
}

export function emptyTotals() {
  return sessionTotals({ items: [] }, {});
}

// Session load = session RPE (1-10) x minutes.
export function sessionLoad(log) {
  return (Number(log.sessionRpe) || 0) * (Number(log.minutes) || 0);
}

// Tag each logged set with % of the athlete's max so zone counts work.
export function tagPctOfMax(entry, athlete, exercises) {
  const ex = exercises[entry.exerciseId];
  const max = athlete?.maxes?.[entry.exerciseId];
  if (!ex?.loaded || !max) return entry;
  return { ...entry, sets: entry.sets.map((s) => ({ ...s, pctOfMax: s.weight ? Math.round((s.weight / max) * 100) : null })) };
}

// ---- dates ----

export function toISO(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// Monday of the week containing `iso`.
export function weekStart(iso) {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

// A workout with real work in it: finished, or at least one set ticked off.
// Athletes often tick every set and close the app without tapping Finish, so
// the coach's pages count these too.
export function loggedWork(log) {
  return Boolean(log && (log.finished || (log.entries || []).some((e) => (e.sets || []).some((s) => s.done))));
}

// Where an assignment stands on a date: 'upcoming', 'current' or 'ended'.
// A program also ends once all its weeks have gone by.
export function assignmentStatus(assignment, block, iso) {
  if (iso < assignment.startDate) return 'upcoming';
  if (assignment.endDate && iso > assignment.endDate) return 'ended';
  if (block && block.kind !== 'warmup' && daysBetween(assignment.startDate, iso) >= block.weeks * 7) return 'ended';
  return 'current';
}

// Nothing logged yet: no ticks, numbers, notes or session details.
export function untouchedLog(log) {
  return !log.finished && log.sessionRpe == null && log.minutes == null && !log.note && log.entries.every(untouchedEntry);
}

// Where an assignment lands on a date. An optional endDate (a replaced
// program) stops it after that day. Training days are spread over the week
// by `assignment.weekdays` (0 = Monday). Returns {week, dayIndex} or null.
export function scheduledOn(assignment, block, iso) {
  const offset = daysBetween(assignment.startDate, iso);
  if (offset < 0 || (assignment.endDate && iso > assignment.endDate)) return null;
  const week = Math.floor(offset / 7);
  if (week >= block.weeks) return null;
  const startDow = (parseISO(assignment.startDate).getDay() + 6) % 7;
  const dow = (startDow + offset) % 7;
  const weekdays = assignment.weekdays || defaultWeekdays(block.days.length);
  const dayIndex = weekdays.indexOf(dow);
  if (dayIndex < 0 || dayIndex >= block.days.length) return null;
  return { week, dayIndex };
}

// An assigned warmup runs on its weekdays from the start date until the
// optional end date, whatever program week it is.
export function warmupScheduledOn(assignment, iso) {
  const offset = daysBetween(assignment.startDate, iso);
  if (offset < 0 || (assignment.endDate && iso > assignment.endDate)) return false;
  const dow = (parseISO(iso).getDay() + 6) % 7;
  return (assignment.weekdays || []).includes(dow);
}

export function defaultWeekdays(n) {
  const presets = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  return presets[n] || presets[3];
}

// ---- quick entry ----

// Parses lines like "Back squat 4x5 @80%", "Box jump 3x5", "Bench 3x8 @185 +5/wk",
// "RDL 3x10 @RPE7", "Bench 3x10-15". Returns {name, sets, reps, repsTo?, pct?,
// weight?, rpe?, progression?} or null.
export function parseQuickEntry(line) {
  const m = line.trim().match(/^(.+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?(.*)$/i);
  if (!m) return null;
  const out = { name: m[1].trim(), sets: Number(m[2]), reps: Number(m[3]) };
  if (m[4] != null) { const r = parseReps(`${m[3]}-${m[4]}`); out.reps = r.reps; if (r.repsTo != null) out.repsTo = r.repsTo; }
  let rest = m[5];
  const rpe = rest.match(/@\s*rpe\s*(\d+(?:\.\d+)?)/i);
  if (rpe) { out.rpe = Number(rpe[1]); rest = rest.replace(rpe[0], ''); }
  const pct = rest.match(/@\s*(\d+(?:\.\d+)?)\s*%/);
  if (pct) out.pct = Number(pct[1]);
  else {
    const w = rest.match(/@\s*(\d+(?:\.\d+)?)/);
    if (w) out.weight = Number(w[1]);
  }
  const prog = rest.match(/\+\s*(\d+(?:\.\d+)?)\s*(%|lb|kg|reps?)?\s*\/\s*wk/i);
  if (prog) {
    const unit = (prog[2] || '').toLowerCase();
    const type = unit === '%' ? 'add_pct' : unit.startsWith('rep') ? 'add_reps' : 'add_weight';
    out.progression = { type, step: Number(prog[1]) };
    if (unit === 'lb' || unit === 'kg') out.progUnit = unit;
  }
  return out;
}
