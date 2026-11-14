// Weekly roll-ups for one athlete: planned vs done, built from store + calc.

import * as store from './store.js';
import { addDays, buildSession, sessionTotals, addTotals, emptyTotals, sessionLoad, tagPctOfMax, loggedWork } from './calc.js';

export function weekSummary(athleteId, monday) {
  const ex = store.exercisesById();
  const athlete = store.get('athletes', athleteId);
  let planned = emptyTotals();
  let done = emptyTotals();
  let sessionsPlanned = 0, sessionsDone = 0, load = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(monday, i);
    // One workout a day per category (the newest program when two in the
    // same category overlap), so each category counts as its own session.
    const seen = new Set();
    const plans = store.plannedOn(athleteId, iso).filter((p) => { const c = store.categoryOf(p.block); if (seen.has(c)) return false; seen.add(c); return true; });
    for (const p of plans) {
      const s = buildSession(p.block, p.dayIndex, p.week, athlete, store.roundStep());
      s.items = s.items.map((it) => tagPctOfMax(it, athlete, ex));
      planned = addTotals(planned, sessionTotals(s, ex, false));
      sessionsPlanned++;
    }
    const logs = store.logsOn(athleteId, iso);
    let dayTotals = emptyTotals();
    for (const log of logs) {
      const t = sessionTotals(log, ex, true);
      dayTotals = addTotals(dayTotals, t);
      done = addTotals(done, t);
      // Ticked sets count as a session done even if Finish wasn't tapped.
      if (loggedWork(log)) { sessionsDone++; load += sessionLoad(log); }
    }
    // `log`: the day's first workout with work in it (or the first opened), for pages that show one.
    const log = logs.find(loggedWork) || logs[0] || null;
    days.push({ iso, planned: plans.length > 0, plannedCount: plans.length, log, logs, totals: dayTotals });
  }
  return { planned, done, sessionsPlanned, sessionsDone, load, days };
}

// 7-day vs 28-day average session load. Above ~1.5 is a big jump worth a conversation.
export function loadTrend(athleteId, todayIso) {
  let acute = 0, chronic = 0;
  const logs = store.logsFor(athleteId).filter((l) => !l.warmup);
  // The ratio means little until there are about three weeks of history.
  const enough = logs.length && Math.round((new Date(todayIso) - new Date(logs[0].date)) / 86400000) >= 21;
  for (const l of logs) {
    if (!loggedWork(l) || l.warmup || l.date > todayIso) continue;
    const age = Math.round((new Date(todayIso) - new Date(l.date)) / 86400000);
    if (age < 7) acute += sessionLoad(l);
    if (age < 28) chronic += sessionLoad(l);
  }
  const chronicWeekly = chronic / 4;
  return { acute, chronicWeekly, ratio: enough && chronicWeekly ? acute / chronicWeekly : null };
}
