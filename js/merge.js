// Combining two versions of one record when two devices changed it at the
// same time (sync.js finds out when the server refuses an upload that was
// made from an out-of-date copy). No browser APIs, so the tests can run it.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Three-way merge. `base` is the server copy this device's edit started from,
// `local` is this device's copy, `server` is the newer copy on the server.
// Field by field: whatever only one side changed is kept; a field both sides
// changed is merged deeper when it's an object (maxes, maxInfo, logAs, ...),
// otherwise this device's value wins (the newer edit). Lists are one value.
export function merge3(base, local, server) {
  if (!isObj(local) || !isObj(server)) return local;
  const b = isObj(base) ? base : {};
  const out = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(server)])) {
    let v;
    if (k === 'updatedAt') v = String(local[k] || '') > String(server[k] || '') ? local[k] : server[k];
    else if (same(local[k], b[k])) v = server[k];
    else if (same(server[k], b[k])) v = local[k];
    else if (isObj(local[k]) && isObj(server[k])) v = merge3(b[k], local[k], server[k]);
    else v = local[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// A set with anything logged in it.
const touched = (s) => Boolean(s && (s.done || s.reps != null || s.weight != null || s.secs != null || s.video || s.actualRpe != null));

// Two copies of one workout log (no older copy to compare with, since logs
// are too many to keep a second copy of). This device's copy is the base;
// any set logged only on the other copy is brought over, and a workout
// finished on either is finished. Notes and effort fill in where empty here.
export function mergeLog(local, server) {
  if (!isObj(local) || !isObj(server)) return local;
  const out = structuredClone(local);
  const used = new Set();
  for (const se of server.entries || []) {
    // The same exercise, matched in order (an exercise can appear twice).
    const i = (out.entries || []).findIndex((e, n) => !used.has(n) && e.exerciseId === se.exerciseId);
    if (i < 0) continue;
    used.add(i);
    const le = out.entries[i];
    (se.sets || []).forEach((ss, j) => {
      if (!touched(ss)) return;
      if (!le.sets[j]) le.sets[j] = ss;
      else if (!touched(le.sets[j])) le.sets[j] = { ...le.sets[j], ...ss };
    });
    if (!le.athleteNote && se.athleteNote) le.athleteNote = se.athleteNote;
  }
  if (server.finished) out.finished = true;
  for (const k of ['note', 'sessionRpe', 'minutes']) if ((out[k] == null || out[k] === '') && server[k] != null && server[k] !== '') out[k] = server[k];
  if (String(server.updatedAt || '') > String(out.updatedAt || '')) out.updatedAt = server.updatedAt;
  return out;
}
