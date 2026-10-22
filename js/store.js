// Data layer. Everything lives in one object saved to localStorage, so the app
// works offline and in demo mode. When Supabase is configured (js/config.js),
// sync.js mirrors these same records to the database.

import { SEED_EXERCISES, SEED_BLOCK } from './seed.js';
export { SEED_EXERCISES };
import { buildSession, scheduledOn, tagPctOfMax } from './calc.js';

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

// What is planned for an athlete on a date: [{assignment, block, week, dayIndex}]
export function plannedOn(athleteId, iso) {
  const out = [];
  for (const a of assignmentsFor(athleteId)) {
    const block = get('blocks', a.blockId);
    if (!block) continue;
    const at = scheduledOn(a, block, iso);
    if (at) out.push({ assignment: a, block, ...at });
  }
  return out;
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
  const s = buildSession(plan.block, plan.dayIndex, plan.week, athlete, db.settings.rounding);
  return put('logs', {
    id: logId(athleteId, iso), athleteId, date: iso,
    assignmentId: plan.assignment.id, blockId: plan.block.id, week: plan.week, dayIndex: plan.dayIndex,
    name: s.name,
    // Prescribed numbers become targets; the boxes start empty for the athlete to fill.
    entries: s.items.map((it) => ({ ...it, sets: it.sets.map((x) => ({ targetReps: x.reps, targetSecs: x.secs, targetWeight: x.weight, rpe: x.rpe, reps: null, secs: null, weight: null, done: false })) })),
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
