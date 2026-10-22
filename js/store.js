// Data layer. Everything lives in one object saved to localStorage, so the app
// works offline and in demo mode. When Supabase is configured (js/config.js),
// sync.js mirrors these same records to the database.

import { SEED_EXERCISES, SEED_BLOCK } from './seed.js';
export { SEED_EXERCISES };
import { buildSession, scheduledOn, warmupScheduledOn, tagPctOfMax, toUnit, fromUnit, LB_PER_KG } from './calc.js';

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
  if (db.dirty[`${kind}/${id}`]) return false; // a local edit is waiting to upload; it wins
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

export function put(kind, obj) {
  obj.updatedAt = new Date().toISOString();
  db[kind][obj.id] = obj;
  db.dirty[`${kind}/${obj.id}`] = true;
  save();
  return obj;
}

export function del(kind, id) {
  delete db[kind][id];
  db.dirty[`${kind}/${id}`] = 'deleted';
  save();
}

export const dirtyKeys = () => Object.entries(db.dirty);
export function clearDirty(keys) { for (const k of keys) delete db.dirty[k]; save(); }

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function reset() { db = blank(); if (demo) seedDemo(); save(); }

// ---- queries ----

export function assignmentsFor(athleteId) {
  return all('assignments').filter((a) => a.athleteId === athleteId);
}

// What is planned for an athlete on a date: [{assignment, block, week, dayIndex, warmup?}]
// An assigned warmup rides in front of that day's program (plan.warmup); on a
// day with no program it is the day's session by itself (plan.warmupOnly).
export function plannedOn(athleteId, iso) {
  const out = [], warm = [];
  for (const a of assignmentsFor(athleteId)) {
    const block = get('blocks', a.blockId);
    if (!block) continue;
    if (block.kind === 'warmup') {
      if (warmupScheduledOn(a, iso)) warm.push({ assignment: a, block, week: 0, dayIndex: 0, warmupOnly: true });
      continue;
    }
    const at = scheduledOn(a, block, iso);
    if (at) out.push({ assignment: a, block, ...at });
  }
  if (!out.length) return warm.slice(0, 1);
  if (warm.length) for (const p of out) p.warmup = warm[0].block;
  return out;
}

// The warmup block assigned for a date, if any.
export function warmupOn(athleteId, iso) {
  const p = plannedOn(athleteId, iso)[0];
  return p?.warmupOnly ? p.block : p?.warmup || null;
}

export function logId(athleteId, iso) { return `${athleteId}:${iso}`; }
export function logFor(athleteId, iso) { return get('logs', logId(athleteId, iso)); }

export function logsFor(athleteId) {
  return all('logs').filter((l) => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
}

// Most recent logged sets for an exercise before a date ("last time").
export function lastTime(athleteId, exerciseId, beforeIso) {
  const logs = logsFor(athleteId).filter((l) => l.date < beforeIso && l.finished).reverse();
  for (const l of logs) {
    const e = l.entries.find((x) => x.exerciseId === exerciseId);
    if (e) {
      const done = e.sets.filter((s) => s.done);
      if (done.length) return { date: l.date, sets: done };
    }
  }
  return null;
}

// Start (or reopen) a log for a planned session.
export function startLog(athleteId, iso, plan) {
  const existing = logFor(athleteId, iso);
  if (existing && existing.blockId === plan.block.id && existing.week === plan.week && existing.dayIndex === plan.dayIndex) return existing;
  const athlete = get('athletes', athleteId);
  const s = buildSession(plan.block, plan.dayIndex, plan.week, athlete, roundStep());
  // An assigned warmup takes the place of any warmup written into the program day.
  if (plan.warmup) s.items = [...buildSession(plan.warmup, 0, 0, athlete, roundStep()).items, ...s.items.filter((it) => !it.warmup)];
  return put('logs', {
    id: logId(athleteId, iso), athleteId, date: iso,
    assignmentId: plan.assignment.id, blockId: plan.block.id, week: plan.week, dayIndex: plan.dayIndex,
    ...(plan.warmup ? { warmupId: plan.warmup.id } : {}),
    name: s.name,
    // Prescribed numbers become targets; the boxes start empty for the athlete to fill.
    entries: s.items.map((it) => ({ ...it, unit: it.unit || unit(), sets: it.sets.map((x) => ({ targetReps: x.reps, targetSecs: x.secs, targetWeight: x.weight, rpe: x.rpe, reps: null, secs: null, weight: null, done: false })) })),
    sessionRpe: null, minutes: null, note: '', finished: false,
  });
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
