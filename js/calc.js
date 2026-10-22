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
  return roundTo(weight, rounding);
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
      const reps = prescribedReps(item, week);
      const weight = prescribedWeight(item, athlete, week, block, rounding);
      const n = prescribedSets(item, block, week);
      return {
        exerciseId: item.exerciseId,
        note: item.note || '',
        group: item.group || '',
        sets: Array.from({ length: n }, () => ({ reps, weight, rpe: item.rpe ?? null, done: false })),
      };
    }),
  };
}

function setsOf(entry, onlyDone) {
  return (entry.sets || []).filter((s) => !onlyDone || s.done);
}

// Totals for one session (planned or logged). `onlyDone` counts finished sets only.
export function sessionTotals(session, exercises, onlyDone = true) {
  const t = { tonnage: 0, reps: 0, sets: 0, contacts: 0, highContacts: 0, sprintMeters: 0, throws: 0, setsByPattern: {}, tonnageByPattern: {}, zones: { z70: 0, z80: 0, z90: 0 } };
  for (const entry of session.items || session.entries || []) {
    const ex = exercises[entry.exerciseId];
    if (!ex) continue;
    for (const s of setsOf(entry, onlyDone)) {
      const reps = Number(s.reps) || 0;
      const w = Number(s.weight) || 0;
      t.sets += 1;
      t.reps += reps;
      t.setsByPattern[ex.pattern] = (t.setsByPattern[ex.pattern] || 0) + 1;
      if (ex.loaded && w) {
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
  }
  return out;
}
