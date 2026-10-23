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

// Weeks are 0-based. A deload week cuts sets in half and load by 10%.
export function isDeload(block, week) {
  return block.deloadWeek != null && block.deloadWeek === week;
}

export function prescribedSets(item, block, week) {
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
    let pct = item.pct;
    if (prog.type === 'add_pct') pct += (prog.step || 0) * week;
    weight = max * pct / 100;
  } else if (item.weight != null) {
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
  const prog = item.progression || {};
  const secs = item.secs || 0;
  return prog.type === 'add_secs' ? secs + (prog.step || 0) * week : secs;
}

export function prescribedReps(item, week) {
  const prog = item.progression || {};
  const reps = item.reps || 0;
  return prog.type === 'add_reps' ? reps + (prog.step || 0) * week : reps;
}

// Build the concrete session for one athlete: block day + week -> rows with sets.
export function buildSession(block, dayIndex, week, athlete, rounding = 5) {
  const day = block.days[dayIndex];
  if (!day) return null;
  return {
    name: day.name,
    items: day.items.map((item) => {
      const measure = measureOf(item);
      const reps = isCount(measure) ? prescribedReps(item, week) : null;
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
        sets: Array.from({ length: n }, () => ({ reps, secs, weight, ...(pct != null ? { pct } : {}), rpe: item.rpe ?? null, done: false })),
      };
    }),
  };
}

// Turn a built session into log entries: prescribed numbers become targets
// and the boxes start empty for the athlete to fill.
export function sessionEntries(s, unit) {
  return s.items.map((it) => ({ ...it, unit: it.unit || unit, sets: it.sets.map((x) => ({
    targetReps: x.reps, targetSecs: x.secs, targetWeight: x.weight, ...(x.pct != null ? { targetPct: x.pct } : {}),
    rpe: x.rpe, reps: null, secs: null, weight: null, done: false,
  })) }));
}

const untouchedSet = (s) => !s.done && s.reps == null && s.secs == null && s.weight == null && !s.unit;
const untouchedEntry = (e) => !e.addedByAthlete && !e.athleteEdited && !e.swappedFrom && !e.athleteNote && !e.setsChanged && e.sets.every(untouchedSet);

// A day's log is made the first time the athlete opens it, but the coach can
// still edit the block after that. Bring the block's current plan into the
// log: a log nobody has written in yet is rebuilt outright; otherwise each
// set the athlete hasn't touched picks up the new targets, and anything they
// logged stays as it is.
export function refreshEntries(entries, fresh) {
  if (entries.every(untouchedEntry)) return fresh;
  const used = new Set();
  return entries.map((e) => {
    const k = fresh.findIndex((f, i) => !used.has(i) && (f.exerciseId === e.exerciseId || f.exerciseId === e.swappedFrom));
    if (e.addedByAthlete || k < 0) return e;
    used.add(k);
    const f = fresh[k];
    if (untouchedEntry(e)) return { ...e, ...f };
    return {
      ...e, note: f.note, tempo: f.tempo, group: f.group, unit: f.unit,
      // How the athlete chose to log it (reps, breaths, weight...) stays theirs.
      measure: e.athleteEdited ? e.measure : f.measure,
      sets: e.sets.map((s, j) => {
        const t = f.sets[Math.min(j, f.sets.length - 1)];
        if (!t || s.done) return s;
        const { targetPct, ...rest } = s;
        return { ...rest, targetReps: t.targetReps, targetSecs: t.targetSecs, targetWeight: e.swappedFrom ? null : t.targetWeight,
          ...(t.targetPct != null && !e.swappedFrom ? { targetPct: t.targetPct } : {}), rpe: t.rpe };
      }),
    };
  });
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
      // Breaths count as sets but not as reps, tonnage or contacts.
      const reps = entry.measure === 'breaths' ? 0 : Number(s.reps) || 0;
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

// Where an assignment lands on a date. Training days are spread over the week
// by `assignment.weekdays` (0 = Monday). Returns {week, dayIndex} or null.
export function scheduledOn(assignment, block, iso) {
  const offset = daysBetween(assignment.startDate, iso);
  if (offset < 0) return null;
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
// "RDL 3x10 @RPE7". Returns {name, sets, reps, pct?, weight?, rpe?, progression?} or null.
export function parseQuickEntry(line) {
  const m = line.trim().match(/^(.+?)\s+(\d+)\s*[x×]\s*(\d+)(.*)$/i);
  if (!m) return null;
  const out = { name: m[1].trim(), sets: Number(m[2]), reps: Number(m[3]) };
  let rest = m[4];
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
