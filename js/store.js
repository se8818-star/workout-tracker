// Data layer. Everything lives in one object saved to localStorage, so the app
// works offline and in demo mode. When Supabase is configured (js/config.js),
// sync.js mirrors these same records to the database.

import { SEED_EXERCISES, SEED_BLOCK, SEED_ATHLETES } from './seed.js';
export { SEED_EXERCISES };
import { buildSession, scheduledOn, toISO, addDays, weekStart, tagPctOfMax } from './calc.js';

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

// Demo mode seeds a sample team. Cloud mode starts empty and fills from Supabase.
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
export function applyRemote(kind, id, data) {
  if (!db[kind]) return;
  if (db.dirty[`${kind}/${id}`]) return; // a local edit is waiting to upload; it wins
  if (data) db[kind][id] = data; else delete db[kind][id];
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
    name: s.name, entries: s.items, sessionRpe: null, minutes: null, note: '', finished: false,
  });
}

export function saveLog(log) {
  const athlete = get('athletes', log.athleteId);
  log.entries = log.entries.map((e) => tagPctOfMax(e, athlete, db.exercises));
  return put('logs', log);
}

// ---- demo data ----

function seedDemo() {
  for (const e of SEED_EXERCISES) db.exercises[e.id] = { ...e };
  db.blocks[SEED_BLOCK.id] = structuredClone(SEED_BLOCK);
  for (const a of SEED_ATHLETES) db.athletes[a.id] = structuredClone(a);

  // Start the block on the Monday one week ago so there's history to look at.
  const today = toISO(new Date());
  const start = addDays(weekStart(today), -7);
  for (const a of SEED_ATHLETES) {
    db.assignments[`asg-${a.id}`] = { id: `asg-${a.id}`, athleteId: a.id, blockId: SEED_BLOCK.id, startDate: start, weekdays: [0, 2, 4] };
  }

  // Fill in last week's logs (and this week's up to yesterday) with small variations.
  const notes = ['Felt fast today', 'Lower back a little tight on RDLs', '', 'Great session', 'Slept badly, took it easy'];
  let n = 0;
  for (let iso = start; iso < today; iso = addDays(iso, 1)) {
    for (const a of SEED_ATHLETES) {
      const asg = db.assignments[`asg-${a.id}`];
      const at = scheduledOn(asg, SEED_BLOCK, iso);
      if (!at) continue;
      if (a.id === 'ath-2' && n % 4 === 3) { n++; continue; } // one athlete skips now and then
      const s = buildSession(SEED_BLOCK, at.dayIndex, at.week, a, 5);
      const entries = s.items.map((it) => tagPctOfMax({ ...it, sets: it.sets.map((x) => ({ ...x, done: true })) }, a, db.exercises));
      db.logs[logId(a.id, iso)] = {
        id: logId(a.id, iso), athleteId: a.id, date: iso, assignmentId: asg.id, blockId: SEED_BLOCK.id,
        week: at.week, dayIndex: at.dayIndex, name: s.name, entries,
        sessionRpe: 6 + (n % 3), minutes: 60 + (n % 3) * 5, note: notes[n % notes.length], finished: true,
        updatedAt: new Date().toISOString(),
      };
      n++;
    }
  }
}
