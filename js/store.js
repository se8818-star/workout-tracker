// Data layer. Everything lives in one object saved to localStorage, so the app
// works offline and in demo mode. When Supabase is configured (js/config.js),
// sync.js mirrors these same records to the database.

import { SEED_EXERCISES, SEED_BLOCK } from './seed.js';
export { SEED_EXERCISES };
import { buildSession, lastDoneFrom, sessionEntries, refreshEntries, untouchedLog, assignmentStatus, daysBetween, scheduledOn, warmupScheduledOn, tagPctOfMax, toUnit, fromUnit, LB_PER_KG } from './calc.js';

let KEY = 'wt-db-v1';
export const KINDS = ['exercises', 'athletes', 'blocks', 'assignments', 'logs'];

let db = null;
const listeners = new Set();

function blank() {
  return { exercises: {}, athletes: {}, blocks: {}, assignments: {}, logs: {}, settings: { units: 'lb', rounding: 5 }, dirty: {} };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode: keep in memory */ }
  for (const fn of listeners) fn();
}

// Local mode starts with the exercise library and a sample program, but no
// athletes. Cloud mode starts empty and fills from Supabase.
let demo = true;
export function load({ cloud = false } = {}) {
  demo = !cloud;
  KEY = cloud ? 'wt-cloud-v1' : 'wt-db-v1';
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
  if (!db) { db = blank(); if (demo) seedDemo(); }
  db.dirty ||= {};
  return db;
}

export const isDemo = () => demo;

// Records arriving from the server: saved locally without marking them dirty.
// Returns true only if something actually changed (our own uploads come back
// as echoes, and re-rendering for those would wipe whatever is being typed).
export function applyRemote(kind, id, data) {
  if (!db[kind]) return false;
  if (db.dirty[`${kind}/${id}`]) {
    // A local edit is waiting to upload; it wins, except that a workout
    // finished on another device beats an unfinished copy here.
    if (!(kind === 'logs' && data?.finished && !db[kind][id]?.finished)) return false;
    delete db.dirty[`${kind}/${id}`];
  }
  const cur = db[kind][id];
  if (!data) { if (!cur) return false; delete db[kind][id]; return true; }
  if (cur && JSON.stringify(cur) === JSON.stringify(data)) return false;
  db[kind][id] = data;
  return true;
}
export function flush() { save(); }

export function clearAll() { db = blank(); save(); }

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const settings = () => db.settings;
export function setSetting(k, v) { db.settings[k] = v; save(); }

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
  db[kind][obj.id] = obj;
  db.dirty[`${kind}/${obj.id}`] = { n: mark() };
  save();
  return obj;
}

// Many records in one go (e.g. adding a whole exercise library): saves once.
export function putMany(kind, objs) {
  const at = new Date().toISOString();
  for (const obj of objs) {
    obj.updatedAt = at;
    db[kind][obj.id] = obj;
    db.dirty[`${kind}/${obj.id}`] = { n: mark() };
  }
  if (objs.length) save();
  return objs;
}

// A deleted record keeps its contents on the server, so the database can still
// tell whose it was and the athlete's phone hears about the delete too.
export function del(kind, id) {
  const data = db[kind][id];
  delete db[kind][id];
  db.dirty[`${kind}/${id}`] = { n: mark(), deleted: true, ...(data ? { data } : {}) };
  save();
}

// [[key, mark]]; mark is { n, deleted?, data? } (true / 'deleted' from older versions).
export const dirtyKeys = () => Object.entries(db.dirty);
export const isDeleted = (mark) => mark === 'deleted' || Boolean(mark?.deleted);
// Clear only marks that haven't changed since they were read: [[key, mark]].
export function clearDirty(entries) {
  for (const [k, m] of entries) if (db.dirty[k] === m) delete db.dirty[k];
  save();
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function reset() { db = blank(); if (demo) seedDemo(); save(); }

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

// The warmup assigned for a date: {assignment, block} or null.
export function warmupOn(athleteId, iso) {
  for (const a of assignmentsFor(athleteId)) {
    const block = get('blocks', a.blockId);
    if (block?.kind === 'warmup' && warmupScheduledOn(a, iso)) return { assignment: a, block };
  }
  return null;
}

export function logId(athleteId, iso) { return `${athleteId}:${iso}`; }
export function logFor(athleteId, iso) { return get('logs', logId(athleteId, iso)); }
// The warmup is logged on its own, next to the day's workout.
export function warmupLogFor(athleteId, iso) { return get('logs', `${logId(athleteId, iso)}:warmup`); }

export function logsFor(athleteId) {
  return all('logs').filter((l) => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
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
  const existing = logFor(athleteId, iso);
  if (existing && existing.blockId === plan.block.id && existing.week === plan.week && existing.dayIndex === plan.dayIndex) return existing;
  const athlete = get('athletes', athleteId);
  const s = buildSession(plan.block, plan.dayIndex, plan.week, athlete, roundStep(), lastDone(athleteId, plan.block, plan.dayIndex, plan.week, iso));
  return keepLog({
    id: logId(athleteId, iso), athleteId, date: iso,
    assignmentId: plan.assignment.id, blockId: plan.block.id, week: plan.week, dayIndex: plan.dayIndex,
    name: s.name,
    entries: sessionEntries(s, unit()),
    sessionRpe: null, minutes: null, note: '', finished: false,
  });
}

export function startWarmupLog(athleteId, iso, w) {
  const existing = warmupLogFor(athleteId, iso);
  if (existing && existing.blockId === w.block.id) return existing;
  const s = buildSession(w.block, 0, 0, get('athletes', athleteId), roundStep());
  return keepLog({
    id: `${logId(athleteId, iso)}:warmup`, athleteId, date: iso, warmup: true,
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
export function currentLog(athleteId, iso) {
  const log = logFor(athleteId, iso);
  // A workout someone picked or switched to stays put, unless the program it
  // came from has since been removed (then it's a leftover like any other).
  const picked = log && (log.chosen || log.switchedFrom !== undefined) && (!log.assignmentId || get('assignments', log.assignmentId));
  if (!log || picked || !untouchedLog(log)) return refreshLog(log);
  const plan = plannedOn(athleteId, iso)[0];
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
