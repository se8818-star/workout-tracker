// Weekly roll-ups for one athlete: planned vs done, built from store + calc.

import * as store from './store.js';
import { addDays, buildSession, sessionTotals, addTotals, emptyTotals, sessionLoad, tagPctOfMax } from './calc.js';

export function weekSummary(athleteId, monday) {
  const ex = store.exercisesById();
  const athlete = store.get('athletes', athleteId);
  let planned = emptyTotals();
  let done = emptyTotals();
  let sessionsPlanned = 0, sessionsDone = 0, load = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(monday, i);
    const plans = store.plannedOn(athleteId, iso);
    for (const p of plans) {
      const s = buildSession(p.block, p.dayIndex, p.week, athlete, store.settings().rounding);
      s.items = s.items.map((it) => tagPctOfMax(it, athlete, ex));
      planned = addTotals(planned, sessionTotals(s, ex, false));
      sessionsPlanned++;
    }
    const log = store.logFor(athleteId, iso);
    let dayTotals = emptyTotals();
    if (log) {
      dayTotals = sessionTotals(log, ex, true);
      done = addTotals(done, dayTotals);
      if (log.finished) { sessionsDone++; load += sessionLoad(log); }
    }
    days.push({ iso, planned: plans.length > 0, log, totals: dayTotals });
  }
  return { planned, done, sessionsPlanned, sessionsDone, load, days };
}

// 7-day vs 28-day average session load. Above ~1.5 is a big jump worth a conversation.
export function loadTrend(athleteId, todayIso) {
  let acute = 0, chronic = 0;
  const logs = store.logsFor(athleteId);
  // The ratio means little until there are about three weeks of history.
  const enough = logs.length && Math.round((new Date(todayIso) - new Date(logs[0].date)) / 86400000) >= 21;
  for (const l of logs) {
    if (!l.finished || l.date > todayIso) continue;
    const age = Math.round((new Date(todayIso) - new Date(l.date)) / 86400000);
    if (age < 7) acute += sessionLoad(l);
    if (age < 28) chronic += sessionLoad(l);
  }
  const chronicWeekly = chronic / 4;
  return { acute, chronicWeekly, ratio: enough && chronicWeekly ? acute / chronicWeekly : null };
}
