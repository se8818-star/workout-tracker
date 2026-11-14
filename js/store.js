// Data layer. Everything lives in one object kept in localStorage, so the app
// works offline and in demo mode. When Supabase is configured (js/config.js),
// sync.js mirrors these same records to the database.

import { SEED_EXERCISES, SEED_BLOCK } from './seed.js';
export { SEED_EXERCISES };
import { buildSession, lastDoneFrom, sessionEntries, refreshEntries, untouchedLog, assignmentStatus, daysBetween, addDays, loggedWork, scheduledOn, warmupScheduledOn, tagPctOfMax, estimateMaxes, applyEstimates, clearedAfter, toUnit, fromUnit, LB_PER_KG } from './calc.js';

let KEY = 'wt-db-v1';
export const KINDS = ['exercises', 'athletes', 'blocks', 'assignments', 'logs'];

let db = null;
const listeners = new Set();

function blank() {
  return { exercises: {}, athletes: {}, blocks: {}, assignments: {}, logs: {}, settings: { units: 'lb', rounding: 5 }, dirty: {} };
}

// Saved in parts: every kind of record, the logs split by month, and "meta"
// (settings + upload queue). A change rewrites only the parts it touched, so
// ticking a set doesn't rewrite the whole team. Parts live in IndexedDB, which
// has room for years of a team's workouts; localStorage (about 5 MB for the
// whole site) is the fallback where IndexedDB isn't available.
const changed = new Set();
const monthOf = (log) => (log?.date || '').slice(0, 7) || 'none';
const partOf = (kind, obj) => (kind === 'logs' ? `logs:${monthOf(obj)}` : kind);
let idb = null;     // IndexedDB connection, when available
let single = false; // localStorage too full to split an old copy: keep saving it whole

// A part's contents, or null for a month with no workouts left.
function partData(part) {
  if (part === 'meta') return { settings: db.settings, dirty: db.dirty };
  if (!part.startsWith('logs:')) return db[part];
  const m = part.slice(5), data = {};
  let any = false;
  for (const id in db.logs) if (monthOf(db.logs[id]) === m) { data[id] = db.logs[id]; any = true; }
  return any ? data : null;
}

function allParts() {
  const parts = new Set(['meta', ...KINDS.filter((k) => k !== 'logs')]);
  for (const id in db.logs) parts.add(`logs:${monthOf(db.logs[id])}`);
  return parts;
}

function writeChanged() {
  if (!changed.size) return;
  const parts = [...changed];
  try {
    if (idb) {
      // put() copies the data right away, so later edits can't leak into this write.
      const tx = idb.transaction('parts', 'readwrite'), os = tx.objectStore('parts');
      for (const p of parts) { const d = partData(p); if (d) os.put(d, `${KEY}:${p}`); else os.delete(`${KEY}:${p}`); }
      tx.onabort = () => { for (const p of parts) changed.add(p); }; // retried with the next save
    } else if (single) localStorage.setItem(KEY, JSON.stringify(db));
    else for (const p of parts) { const d = partData(p); if (d) localStorage.setItem(`${KEY}:${p}`, JSON.stringify(d)); else localStorage.removeItem(`${KEY}:${p}`); }
    changed.clear();
  } catch { /* private mode or full: keep in memory, retry these parts next save */ }
}

function save(...parts) {
  logIndex = null;
  for (const p of parts.length ? parts : allParts()) changed.add(p);
  writeChanged();
  for (const fn of listeners) fn();
}

const assemble = (entries) => {
  const d = blank();
  let found = false;
  for (const [key, val] of entries) {
    const part = key.slice(KEY.length + 1);
    if (part === 'meta') { Object.assign(d, val); found = true; } else if (part.startsWith('logs:')) Object.assign(d.logs, val); else if (KINDS.includes(part)) d[part] = val;
  }
  return found ? d : null;
};
const lsKeys = () => { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === KEY || k.startsWith(`${KEY}:`)) keys.push(k); } return keys; };
const lsParts = () => assemble(lsKeys().filter((k) => k !== KEY).map((k) => [k, JSON.parse(localStorage.getItem(k))]));
const lsSingle = () => { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) d.dirty ||= {}; return d; };

function openIdb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const done = (v) => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => resolve(null), 3000); // a stuck open falls back to localStorage
    try {
      const req = indexedDB.open('chunky-training', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('parts');
      req.onsuccess = () => done(req.result);
      req.onerror = req.onblocked = () => done(null);
    } catch { done(null); }
  });
}

function idbRead() {
  return new Promise((resolve, reject) => {
    const os = idb.transaction('parts').objectStore('parts');
    const range = IDBKeyRange.bound(`${KEY}:`, `${KEY}:\uffff`);
    const keys = os.getAllKeys(range), vals = os.getAll(range);
    vals.onsuccess = () => resolve(assemble(keys.result.map((k, i) => [k, vals.result[i]])));
    vals.onerror = () => reject(vals.error);
  });
}

// Older versions kept everything under one localStorage key. Split it once;
// the old copy is removed only after every part saved, so nothing is lost if
// storage is full.
function moveFromLocalStorage() {
  let d = null;
  try { d = lsParts() || lsSingle(); } catch { return null; }
  if (!d) return null;
  db = d;
  const old = lsKeys();
  if (idb) {
    const tx = idb.transaction('parts', 'readwrite'), os = tx.objectStore('parts');
    for (const p of allParts()) { const v = partData(p); if (v) os.put(v, `${KEY}:${p}`); }
    tx.oncomplete = () => old.forEach((k) => localStorage.removeItem(k));
    tx.onabort = () => { idb = null; single = old.includes(KEY); }; // stay on localStorage
  } else if (old.includes(KEY)) {
    const parts = [...allParts()];
    try {
      for (const p of parts) localStorage.setItem(`${KEY}:${p}`, JSON.stringify(partData(p)));
      localStorage.removeItem(KEY);
    } catch {
      for (const p of parts) try { localStorage.removeItem(`${KEY}:${p}`); } catch { /* ignore */ }
      single = true;
    }
  }
  return d;
}

// Local mode starts with the exercise library and a sample program, but no
// athletes. Cloud mode starts empty and fills from Supabase.
// Runs straight through when there's no IndexedDB (tests), so callers there
// can skip the await.
let demo = true;
export function load({ cloud = false } = {}) {
  demo = !cloud;
  KEY = cloud ? 'wt-cloud-v1' : 'wt-db-v1';
  logIndex = null;
  single = false;
  changed.clear();
  const finish = (d) => {
    db = d;
    if (!db) { db = blank(); if (demo) seedDemo(); for (const p of allParts()) changed.add(p); }
    db.dirty ||= {};
    return db;
  };
  if (typeof indexedDB === 'undefined') { idb = null; return Promise.resolve(finish(moveFromLocalStorage())); }
  // index.html starts opening and reading on page load; use that the first time.
  const early = globalThis.wtDisk;
  delete globalThis.wtDisk;
  const timeout = new Promise((r) => setTimeout(() => r(undefined), 3000));
  return Promise.race([early || Promise.resolve(undefined), timeout]).then(async (got) => {
    if (got?.entries) { idb = got.conn; return finish(assemble(got.entries.filter(([k]) => String(k).startsWith(`${KEY}:`))) || moveFromLocalStorage()); }
    idb = got?.conn || await openIdb();
    let d = null;
    if (idb) try { d = await idbRead(); } catch { d = null; }
    return finish(d || moveFromLocalStorage());
  });
}

export const isDemo = () => demo;

// Records arriving from the server: saved locally without marking them dirty.
// Returns true only if something actually changed (our own uploads come back
// as echoes, and re-rendering for those would wipe whatever is being typed).
export function applyRemote(kind, id, data) {
  if (!db[kind]) return false;
  if (kind === 'logs') logIndex = null;
  if (db.dirty[`${kind}/${id}`]) {
    // A local edit is waiting to upload; it wins, except that a workout
    // finished on another device beats an unfinished copy here.
    if (!(kind === 'logs' && data?.finished && !db[kind][id]?.finished)) return false;
    delete db.dirty[`${kind}/${id}`];
    changed.add('meta');
  }
  const cur = db[kind][id];
  if (!data) { if (!cur) return false; delete db[kind][id]; changed.add(partOf(kind, cur)); return true; }
  if (cur && JSON.stringify(cur) === JSON.stringify(data)) return false;
  db[kind][id] = data;
  changed.add(partOf(kind, data));
  if (cur) changed.add(partOf(kind, cur));
  return true;
}
export function flush() { save('meta'); }

// Removes every saved part (and any old localStorage copy) before starting over.
function wipe() {
  changed.clear();
  single = false;
  try { lsKeys().forEach((k) => localStorage.removeItem(k)); } catch { /* private mode */ }
  try { if (idb) idb.transaction('parts', 'readwrite').objectStore('parts').delete(IDBKeyRange.bound(`${KEY}:`, `${KEY}:\uffff`)); } catch { /* ignore */ }
}

export function clearAll() { wipe(); db = blank(); save(); }

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const settings = () => db.settings;
export function setSetting(k, v) { db.settings[k] = v; save('meta'); }

// Weight helpers for this device's unit. Stored weights are always pounds.
export const unit = () => db.settings.units || 'lb';
// `u` overrides the device unit, e.g. the unit a coach programmed an exercise in.
export const showW = (lb, u = unit()) => { const v = toUnit(lb, u); return v == null ? null : Math.round(v * 10) / 10; };
export const readW = (v, u = unit()) => fromUnit(v, u);
// Rounding per unit, so loads land on whole plates in whichever unit an exercise uses.
export const roundStep = () => ({ lb: db.settings.rounding, kg: db.settings.roundingKg ?? 2.5, unit: unit() });

export function all(kind) { return Object.values(db[kind]); }
export function get(kind, id) { return db[kind][id] || null; }
export function exercisesById() { return db.exercises; }

// Each change gets a new number in `dirty`, so an upload only clears the
// changes it actually sent: a set ticked while it was on its way stays queued.
let seq = 0;
const mark = () => `${Date.now()}.${seq++}`;

export function put(kind, obj) {
  obj.updatedAt = new Date().toISOString();
  const prev = db[kind][obj.id];
  db[kind][obj.id] = obj;
  db.dirty[`${kind}/${obj.id}`] = { n: mark() };
  save('meta', partOf(kind, obj), ...(prev ? [partOf(kind, prev)] : []));
  return obj;
}

// Many records in one go (e.g. adding a whole exercise library): saves once.
export function putMany(kind, objs) {
  const at = new Date().toISOString();
  const parts = new Set(['meta']);
  for (const obj of objs) {
    obj.updatedAt = at;
    if (db[kind][obj.id]) parts.add(partOf(kind, db[kind][obj.id]));
    db[kind][obj.id] = obj;
    db.dirty[`${kind}/${obj.id}`] = { n: mark() };
    parts.add(partOf(kind, obj));
  }
  if (objs.length) save(...parts);
  return objs;
}

// A deleted record keeps its contents on the server, so the database can still
// tell whose it was and the athlete's phone hears about the delete too.
export function del(kind, id) {
  const data = db[kind][id];
  delete db[kind][id];
  db.dirty[`${kind}/${id}`] = { n: mark(), deleted: true, ...(data ? { data } : {}) };
  save('meta', partOf(kind, data));
}

// [[key, mark]]; mark is { n, deleted?, data? } (true / 'deleted' from older versions).
export const dirtyKeys = () => Object.entries(db.dirty);
export const isDeleted = (mark) => mark === 'deleted' || Boolean(mark?.deleted);
// Clear only marks that haven't changed since they were read: [[key, mark]].
export function clearDirty(entries) {
  for (const [k, m] of entries) if (db.dirty[k] === m) delete db.dirty[k];
  save('meta');
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function reset() { wipe(); db = blank(); if (demo) seedDemo(); save(); }

// ---- queries ----

// Newest start date first, so when two programs overlap the one assigned for
// the later start wins the day, the same on every device.
export function assignmentsFor(athleteId) {
  return all('assignments').filter((a) => a.athleteId === athleteId)
    .sort((x, y) => (y.startDate || '').localeCompare(x.startDate || '') || x.id.localeCompare(y.id));
}

// The program an athlete is actively on: the running program they'd be shown
// on a training day (see plannedOn). Returns {assignment, block, week} or null.
export function activeProgram(athleteId, iso) {
  for (const a of assignmentsFor(athleteId)) {
    const block = get('blocks', a.blockId);
    if (!block || block.kind === 'warmup' || assignmentStatus(a, block, iso) !== 'current') continue;
    return { assignment: a, block, week: Math.floor(daysBetween(a.startDate, iso) / 7) };
  }
  return null;
}

// What is planned for an athlete on a date: [{assignment, block, week, dayIndex}]
// Programs only; an assigned warmup is its own session (warmupOn).
export function plannedOn(athleteId, iso) {
  const out = [];
  for (const a of assignmentsFor(athleteId)) {
    const block = get('blocks', a.blockId);
    if (!block || block.kind === 'warmup') continue;
    const at = scheduledOn(a, block, iso);
    if (at) out.push({ assignment: a, block, ...at });
  }
  return out;
}

// ---- categories: every program is Strength, Throwing, Speed or Rehab
// (block.category; none = Strength). Each category is its own workout on the
// athlete's day, logged on its own, like the warmup. Colors are fixed per
// category so they mean the same thing for every athlete; a second program in
// the same category gets the category's second color. Colors are numbered
// 0..PROGRAM_COLORS-1 (styles.css .pc0...); a coach can pick one per assignment.
export const PROGRAM_COLORS = 6;
export const CATEGORIES = [
  { k: 'strength', label: 'Strength', colors: [0, 5] },
  { k: 'throwing', label: 'Throwing', colors: [2, 4] },
  { k: 'speed', label: 'Speed', colors: [3, 4] },
  { k: 'rehab', label: 'Rehab', colors: [1, 5] },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.k, c]));
export const categoryOf = (block) => (block && CAT[block.category] ? block.category : 'strength');
export const categoryLabel = (k) => CAT[k]?.label || 'Strength';

// What's planned in one category on a date (see plannedOn), newest program first.
export function plannedIn(athleteId, iso, cat = 'strength') {
  return plannedOn(athleteId, iso).filter((p) => categoryOf(p.block) === cat);
}

export function programColor(assignment) {
  if (!assignment) return 0;
  if (Number.isInteger(assignment.color)) return assignment.color % PROGRAM_COLORS;
  const cat = categoryOf(get('blocks', assignment.blockId));
  // Same-category programs for this athlete, in start order: 1st, 2nd, ...
  const same = all('assignments').filter((g) => g.athleteId === assignment.athleteId && get('blocks', g.blockId)?.kind !== 'warmup' && categoryOf(get('blocks', g.blockId)) === cat)
    .sort((x, y) => (x.startDate || '').localeCompare(y.startDate || '') || x.id.localeCompare(y.id));
  const i = Math.max(0, same.findIndex((g) => g.id === assignment.id));
  const colors = CAT[cat].colors;
  return colors[i % colors.length];
}
// A log's program tag: {name, color}, or null for a warmup or a log with no program.
export function logProgram(log) {
  if (!log || log.warmup || !log.blockId) return null;
  const g = log.assignmentId && get('assignments', log.assignmentId);
  const b = get('blocks', log.blockId) || (g && get('blocks', g.blockId));
  const cat = log.category || categoryOf(b);
  return { name: b?.name || 'Old program', color: g ? programColor(g) : CAT[cat].colors[0], assignmentId: g?.id || null, category: cat };
}

// How far an athlete is through one assigned program, for the coach:
// { done, due, total, last } — workouts with logged work from this program
// (wherever the athlete did them), program days scheduled before `iso`, days
// in the whole program, and the last date logged.
export function programProgress(assignment, iso) {
  const block = get('blocks', assignment.blockId);
  const logs = logsFor(assignment.athleteId).filter((l) => !l.warmup && l.assignmentId === assignment.id && loggedWork(l));
  let due = 0, total = 0;
  if (block && block.kind !== 'warmup') {
    for (let k = 0; k < block.weeks * 7; k++) {
      const d = addDays(assignment.startDate, k);
      if (!scheduledOn(assignment, block, d) || !plannedOn(assignment.athleteId, d).some((p) => p.assignment.id === assignment.id)) continue;
      total++;
      // Today counts once it's done; until then it isn't behind yet.
      if (d < iso || (d === iso && logs.some((l) => l.date === d))) due++;
    }
  }
  return { done: logs.length, due, total, last: logs.length ? logs[logs.length - 1].date : null };
}

// The warmup assigned for a date: {assignment, block} or null.
export function warmupOn(athleteId, iso) {
  for (const a of assignmentsFor(athleteId)) {
    const block = get('blocks', a.blockId);
    if (block?.kind === 'warmup' && warmupScheduledOn(a, iso)) return { assignment: a, block };
  }
  return null;
}

// Strength workouts keep the plain id (all workouts before categories were
// strength); other categories get their own: "ath-1:2026-11-14:throwing".
export function logId(athleteId, iso, cat = 'strength') { return cat && cat !== 'strength' ? `${athleteId}:${iso}:${cat}` : `${athleteId}:${iso}`; }
export function logFor(athleteId, iso, cat = 'strength') { return get('logs', logId(athleteId, iso, cat)); }
// Every workout (not warmup) logged on a date, in category order.
export function logsOn(athleteId, iso) {
  return CATEGORIES.map((c) => logFor(athleteId, iso, c.k)).filter(Boolean);
}
// The warmup is logged on its own, next to the day's workout.
export function warmupLogFor(athleteId, iso) { return get('logs', `${athleteId}:${iso}:warmup`); }

// Each athlete's logs, oldest first. Pages ask for these many times over (the
// coach's Team page does for every athlete), so they're grouped once and the
// grouping is dropped whenever a log changes.
let logIndex = null;
export function logsFor(athleteId) {
  if (!logIndex) {
    logIndex = new Map();
    for (const l of all('logs')) { if (!logIndex.has(l.athleteId)) logIndex.set(l.athleteId, []); logIndex.get(l.athleteId).push(l); }
    for (const list of logIndex.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return (logIndex.get(athleteId) || []).slice();
}

// Every earlier session where the athlete ticked sets of an exercise, finished
// or not (only ticked sets count), newest first: [{date, unit, sets, note}].
export function exerciseHistory(athleteId, exerciseId, beforeIso) {
  const out = [];
  for (const l of logsFor(athleteId).filter((x) => x.date < beforeIso).reverse()) {
    for (const e of l.entries.filter((x) => x.exerciseId === exerciseId)) {
      const done = e.sets.filter((x) => x.done);
      if (done.length) out.push({ date: l.date, unit: e.unit, measure: e.measure || 'reps', sets: done, note: e.athleteNote || '' });
    }
  }
  return out;
}

// Gives the athlete a max for every exercise they've lifted but have no max
// for yet, estimated from their best logged set. Maxes already on file are
// left to Finish (which raises them) and to the coach. Returns what it added.
export function fillMaxes(athleteId) {
  const a = get('athletes', athleteId);
  if (!a) return [];
  const probe = { maxes: { ...a.maxes }, maxInfo: a.maxInfo };
  const res = applyEstimates(probe, estimateMaxes(logsFor(athleteId), { after: clearedAfter(a) }), { onlyMissing: true });
  if (res.added.length) put('athletes', { ...a, maxes: probe.maxes, maxInfo: probe.maxInfo });
  return res.added;
}

// Most recent logged sets for an exercise before a date ("last time").
export function lastTime(athleteId, exerciseId, beforeIso) {
  return exerciseHistory(athleteId, exerciseId, beforeIso)[0] || null;
}

// Only the athlete's own device creates or refreshes their logs just by opening
// a day. A coach previewing an athlete sees the same thing, but nothing is saved
// until they actually log a set; otherwise the coach's copy, which can be a
// few seconds behind, would upload over what the athlete just did.
const ownsLogs = () => demo || db.settings.me?.role !== 'coach';
const keepLog = (log) => (ownsLogs() ? put('logs', log) : log);

// What the athlete did before on this day of this program (or the program it
// was copied from), so weekly rules build on their actual sets.
const lastDone = (athleteId, block, dayIndex, week, beforeIso) => lastDoneFrom(logsFor(athleteId), block, dayIndex, week, beforeIso);

// Start (or reopen) a log for a planned session.
export function startLog(athleteId, iso, plan) {
  const cat = categoryOf(plan.block);
  const existing = logFor(athleteId, iso, cat);
  if (existing && existing.blockId === plan.block.id && existing.week === plan.week && existing.dayIndex === plan.dayIndex) return existing;
  const athlete = get('athletes', athleteId);
  const s = buildSession(plan.block, plan.dayIndex, plan.week, athlete, roundStep(), lastDone(athleteId, plan.block, plan.dayIndex, plan.week, iso));
  return keepLog({
    id: logId(athleteId, iso, cat), athleteId, date: iso, ...(cat === 'strength' ? {} : { category: cat }),
    assignmentId: plan.assignment.id, blockId: plan.block.id, week: plan.week, dayIndex: plan.dayIndex,
    name: s.name,
    entries: sessionEntries(s, unit()),
    sessionRpe: null, minutes: null, note: '', finished: false,
  });
}

// What a planned day would hold if opened now, without saving a log (Today's preview).
export function previewEntries(athleteId, iso, plan) {
  const s = buildSession(plan.block, plan.dayIndex, plan.week, get('athletes', athleteId), roundStep(), lastDone(athleteId, plan.block, plan.dayIndex, plan.week, iso));
  return s ? sessionEntries(s, unit()) : [];
}

export function startWarmupLog(athleteId, iso, w) {
  const existing = warmupLogFor(athleteId, iso);
  if (existing && existing.blockId === w.block.id) return existing;
  const s = buildSession(w.block, 0, 0, get('athletes', athleteId), roundStep());
  return keepLog({
    id: `${athleteId}:${iso}:warmup`, athleteId, date: iso, warmup: true,
    assignmentId: w.assignment.id, blockId: w.block.id, week: 0, dayIndex: 0, name: w.block.name,
    entries: sessionEntries(s, unit()),
    sessionRpe: null, minutes: null, note: '', finished: false,
  });
}

// Pick up coach edits made to the block since this log was started (see
// refreshEntries). Finished logs are history and stay as they were.
// When the coach gave this athlete their own copy of the program
// (block.copiedFrom), a workout already started follows the copy.
export function refreshLog(log) {
  if (!log || log.finished) return log;
  const asg = log.assignmentId && get('assignments', log.assignmentId);
  const copy = asg && asg.blockId !== log.blockId && get('blocks', asg.blockId);
  const block = copy?.copiedFrom === log.blockId ? copy : get('blocks', log.blockId);
  if (!block) return log;
  const s = buildSession(block, log.dayIndex, log.week, get('athletes', log.athleteId), roundStep(),
    log.warmup ? null : lastDone(log.athleteId, block, log.dayIndex, log.week, log.date));
  if (!s) return log;
  const entries = refreshEntries(log.entries, sessionEntries(s, unit()));
  const name = log.warmup ? log.name : s.name;
  if (name === log.name && block.id === log.blockId && JSON.stringify(entries) === JSON.stringify(log.entries)) return log;
  return keepLog({ ...log, name, entries, blockId: block.id });
}

// The day's log as it should be now. A log the athlete only opened (nothing
// logged yet) follows the program: if the coach since moved them to another
// program or day, or removed it, the old workout is replaced or dropped.
// Logs with anything in them, or a workout the athlete picked, stay put.
export function currentLog(athleteId, iso, cat = 'strength') {
  const log = logFor(athleteId, iso, cat);
  // A workout the athlete picked on a rest day stays put. A day switched to
  // another workout stays too, unless the program it came from has since been
  // removed (then, with nothing logged, it's a leftover like any other).
  const picked = log && (log.chosen || (log.switchedFrom !== undefined && (!log.assignmentId || get('assignments', log.assignmentId))));
  if (!log || picked || !untouchedLog(log)) return refreshLog(log);
  const plan = plannedIn(athleteId, iso, cat)[0];
  if (!plan) { if (ownsLogs()) del('logs', log.id); return null; }
  if (plan.block.id !== log.blockId || plan.week !== log.week || plan.dayIndex !== log.dayIndex) return startLog(athleteId, iso, plan);
  return refreshLog(log);
}

export function currentWarmupLog(athleteId, iso) {
  const log = warmupLogFor(athleteId, iso);
  if (!log || !untouchedLog(log)) return refreshLog(log);
  const w = warmupOn(athleteId, iso);
  if (!w) { if (ownsLogs()) del('logs', log.id); return null; }
  if (w.block.id !== log.blockId) return startWarmupLog(athleteId, iso, w);
  return refreshLog(log);
}

export function saveLog(log) {
  const athlete = get('athletes', log.athleteId);
  log.entries = log.entries.map((e) => tagPctOfMax(e, athlete, db.exercises));
  return put('logs', log);
}

// ---- starter data ----

function seedDemo() {
  for (const e of SEED_EXERCISES) db.exercises[e.id] = { ...e };
  db.blocks[SEED_BLOCK.id] = structuredClone(SEED_BLOCK);
}
