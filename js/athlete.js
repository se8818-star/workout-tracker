// Athlete screens: today's workout (log, notes, swaps, switch), my week, history.

import * as store from './store.js';
import { toISO, addDays, weekStart, sessionTotals, e1rm, buildSession, PLYO_TIERS } from './calc.js';
import { weekSummary, loadTrend } from './summary.js';
import { esc, fmt, fmtDate, bindActions, sheet, closeSheet, toast, stat, bars, PATTERN_LABEL, $ } from './ui.js';

const today = () => toISO(new Date());

function dateStrip(athleteId, iso) {
  const mon = weekStart(iso);
  let html = '<nav class="date-strip" aria-label="Pick a day">';
  html += `<button class="icon-btn" data-action="goDate" data-date="${addDays(mon, -7)}" aria-label="Previous week">‹</button>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const planned = store.plannedOn(athleteId, d).length > 0;
    const log = store.logFor(athleteId, d);
    const cls = [d === iso && 'on', d === today() && 'today', planned && 'planned', log?.finished && 'done'].filter(Boolean).join(' ');
    html += `<button class="day ${cls}" data-action="goDate" data-date="${d}">
      <span>${fmtDate(d, { weekday: 'narrow' })}</span><b>${Number(d.slice(8))}</b><i></i></button>`;
  }
  html += `<button class="icon-btn" data-action="goDate" data-date="${addDays(mon, 7)}" aria-label="Next week">›</button></nav>`;
  return html;
}

function prescriptionText(set) {
  const parts = [];
  if (set.reps) parts.push(`${set.reps} reps`);
  if (set.weight) parts.push(`${set.weight} ${store.settings().units}`);
  if (set.rpe) parts.push(`RPE ${set.rpe}`);
  return parts.join(' · ');
}

function totalsBar(log) {
  const t = sessionTotals(log, store.exercisesById(), true);
  return `<div class="totals" id="live-totals">
    <div><b>${fmt(t.tonnage)}</b><span>${store.settings().units} moved</span></div>
    <div><b>${fmt(t.contacts)}</b><span>plyo contacts</span></div>
    <div><b>${fmt(t.sets)}</b><span>sets done</span></div>
  </div>`;
}

function entryCard(log, entry, i) {
  const ex = store.get('exercises', entry.exerciseId) || { name: entry.exerciseId };
  const last = store.lastTime(log.athleteId, entry.exerciseId, log.date);
  const units = store.settings().units;
  const lastTxt = last ? `Last time (${fmtDate(last.date, { month: 'short', day: 'numeric' })}): ${last.sets.map((s) => s.weight ? `${s.weight}×${s.reps}` : `${s.reps}`).join(', ')}` : '';
  const tags = [];
  if (ex.contactsPerRep) tags.push(`${ex.contactsPerRep} contact${ex.contactsPerRep > 1 ? 's' : ''}/rep · tier ${ex.plyoTier}`);
  if (entry.swappedFrom) tags.push(`swapped from ${store.get('exercises', entry.swappedFrom)?.name || entry.swappedFrom}`);
  const rows = entry.sets.map((s, j) => `
    <div class="set ${s.done ? 'done' : ''}">
      <span class="set-n">${j + 1}</span>
      <label class="field"><input type="number" inputmode="numeric" min="0" value="${s.reps ?? ''}" data-action="setField" data-i="${i}" data-j="${j}" data-k="reps" aria-label="Reps, set ${j + 1}"><span>reps</span></label>
      ${ex.loaded !== false ? `<label class="field"><input type="number" inputmode="decimal" min="0" step="any" value="${s.weight ?? ''}" data-action="setField" data-i="${i}" data-j="${j}" data-k="weight" aria-label="Weight, set ${j + 1}"><span>${units}</span></label>` : '<span class="field ghost"></span>'}
      <button class="check" data-action="toggleSet" data-i="${i}" data-j="${j}" aria-pressed="${s.done}" aria-label="Mark set ${j + 1} done">✓</button>
    </div>`).join('');
  return `<article class="card entry" id="entry-${i}">
    <header>
      <div><h3>${esc(ex.name)}</h3>${tags.length ? `<p class="tags">${esc(tags.join(' · '))}</p>` : ''}</div>
      <div class="entry-actions">
        <button class="chip" data-action="swap" data-i="${i}">Swap</button>
        <button class="chip" data-action="allDone" data-i="${i}" title="Mark every set done as prescribed">All ✓</button>
      </div>
    </header>
    ${entry.note ? `<p class="coach-note">Coach: ${esc(entry.note)}</p>` : ''}
    ${ex.video ? `<a class="link small" href="${esc(ex.video)}" target="_blank" rel="noopener">▶ Watch demo</a>` : ''}
    ${lastTxt ? `<p class="last">${esc(lastTxt)}</p>` : ''}
    <div class="sets">${rows}</div>
    <div class="entry-foot">
      <button class="link" data-action="addSet" data-i="${i}">+ Add set</button>
      ${entry.sets.length > 1 ? `<button class="link" data-action="removeSet" data-i="${i}">− Remove set</button>` : ''}
    </div>
    <label class="note-field"><span>My note</span>
      <textarea rows="1" placeholder="How did it feel? Any pain?" data-action="entryNote" data-i="${i}">${esc(entry.athleteNote || '')}</textarea></label>
  </article>`;
}

function rpeButtons(val) {
  let h = '<div class="rpe" role="group" aria-label="Session RPE">';
  for (let r = 1; r <= 10; r++) h += `<button class="${val === r ? 'on' : ''}" data-action="sessionRpe" data-v="${r}">${r}</button>`;
  return h + '</div>';
}

export function today_(root, { id }, query) {
  const athlete = store.get('athletes', id);
  if (!athlete) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const iso = query.get('d') || today();
  const plans = store.plannedOn(id, iso);
  let log = store.logFor(id, iso);

  let body = '';
  if (log) {
    const sub = log.blockId ? `${store.get('blocks', log.blockId)?.name || ''} · week ${log.week + 1}` : '';
    body = `
      <div class="session-head">
        <div><h2>${esc(log.name)}</h2><p class="muted">${esc(sub)}</p></div>
        <button class="chip" data-action="switch">Switch workout</button>
      </div>
      ${totalsBar(log)}
      ${log.entries.map((e, i) => entryCard(log, e, i)).join('')}
      <button class="btn ghost wide" data-action="addExercise">+ Add an exercise</button>
      <section class="card finish">
        <h3>Finish session</h3>
        <p class="muted">How hard was the whole session? (1 = very easy, 10 = max effort)</p>
        ${rpeButtons(log.sessionRpe)}
        <label class="field-row"><span>Minutes</span><input type="number" inputmode="numeric" min="0" value="${log.minutes ?? ''}" data-action="minutes" aria-label="Session minutes"></label>
        <label class="note-field"><span>Session note for coach</span>
          <textarea rows="2" placeholder="Sleep, soreness, anything coach should know" data-action="sessionNote">${esc(log.note || '')}</textarea></label>
        <button class="btn wide" data-action="finish">${log.finished ? 'Saved ✓ (tap to update)' : 'Finish and save'}</button>
      </section>`;
  } else if (plans.length) {
    const p = plans[0];
    const s = buildSession(p.block, p.dayIndex, p.week, athlete, store.settings().rounding);
    const ex = store.exercisesById();
    body = `
      <div class="session-head"><div><h2>${esc(s.name)}</h2><p class="muted">${esc(p.block.name)} · week ${p.week + 1}${p.block.deloadWeek === p.week ? ' · deload' : ''}</p></div>
        <button class="chip" data-action="switch">Switch workout</button></div>
      <ul class="preview">${s.items.map((it) => `<li><b>${esc(ex[it.exerciseId]?.name || it.exerciseId)}</b>
        <span>${it.sets.length} × ${prescriptionText(it.sets[0])}</span></li>`).join('')}</ul>
      <button class="btn wide" data-action="start">Start workout</button>`;
  } else {
    body = `<div class="empty"><p><b>Nothing scheduled.</b> Rest day, or pick a session to do today.</p>
      <button class="btn" data-action="switch">Pick a workout</button></div>`;
  }

  root.innerHTML = `
    <header class="page-head"><h1>${esc(athlete.name.split(' ')[0])}'s training</h1><p class="muted">${fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })}</p></header>
    ${dateStrip(id, iso)}
    <div id="session">${body}</div>`;

  const rerender = () => today_(root, { id }, query);
  const persist = () => { store.saveLog(log); const t = $('#live-totals', root); if (t) t.outerHTML = totalsBar(log); };

  bindActions(root, {
    goDate: (el) => { location.hash = `#/athlete/${id}?d=${el.dataset.date}`; },
    start: () => { log = store.startLog(id, iso, plans[0]); rerender(); },
    toggleSet: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      s.done = !s.done;
      el.setAttribute('aria-pressed', s.done);
      el.closest('.set').classList.toggle('done', s.done);
      persist();
    },
    allDone: (el) => { log.entries[el.dataset.i].sets.forEach((s) => { s.done = true; }); persist(); rerender(); },
    setField: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      s[el.dataset.k] = el.value === '' ? null : Number(el.value);
      persist();
    },
    addSet: (el) => {
      const sets = log.entries[el.dataset.i].sets;
      const last = sets[sets.length - 1] || { reps: 5, weight: null };
      sets.push({ ...last, done: false });
      persist(); rerender();
    },
    removeSet: (el) => { log.entries[el.dataset.i].sets.pop(); persist(); rerender(); },
    entryNote: (el) => { log.entries[el.dataset.i].athleteNote = el.value; persist(); },
    sessionRpe: (el) => { log.sessionRpe = Number(el.dataset.v); persist(); rerender(); },
    minutes: (el) => { log.minutes = el.value === '' ? null : Number(el.value); persist(); },
    sessionNote: (el) => { log.note = el.value; persist(); },
    finish: () => {
      log.finished = true;
      // Update maxes when a logged set beats the estimated 1RM on file.
      const prs = [];
      for (const e of log.entries) {
        const best = Math.max(0, ...e.sets.filter((s) => s.done).map((s) => e1rm(s.weight, s.reps)));
        const cur = athlete.maxes?.[e.exerciseId];
        if (cur && best > cur) { athlete.maxes[e.exerciseId] = Math.round(best); prs.push(store.get('exercises', e.exerciseId)?.name); }
      }
      if (prs.length) store.put('athletes', athlete);
      store.saveLog(log);
      toast(prs.length ? `Saved. New estimated max: ${prs.join(', ')}` : 'Session saved');
      rerender();
    },
    swap: (el) => swapSheet(log, Number(el.dataset.i), () => { persist(); rerender(); }),
    addExercise: () => pickExerciseSheet((exId) => {
      log.entries.push({ exerciseId: exId, note: '', sets: [{ reps: 5, weight: null, done: false }], addedByAthlete: true });
      persist(); rerender();
    }),
    switch: () => switchSheet(id, iso, (plan) => {
      if (log && log.entries.some((e) => e.sets.some((s) => s.done)) && !confirm('Replace the sets you already logged today?')) return;
      if (log) store.del('logs', log.id);
      log = store.startLog(id, iso, plan);
      log.switchedFrom = plans[0] ? { week: plans[0].week, dayIndex: plans[0].dayIndex } : null;
      store.saveLog(log);
      closeSheet(); rerender();
    }),
  });
}

function swapSheet(log, i, done) {
  const entry = log.entries[i];
  const ex = store.get('exercises', entry.exerciseId);
  const original = entry.swappedFrom || entry.exerciseId;
  const alts = [...new Set([...(store.get('exercises', original)?.alts || []), original])].filter((x) => x !== entry.exerciseId);
  const list = alts.map((a) => store.get('exercises', a)).filter(Boolean);
  const html = `<p class="muted">Same movement as ${esc(ex?.name)}. Your sets and reps stay the same.</p>
    <ul class="pick">${list.map((x) => `<li><button data-pick="${x.id}">${esc(x.name)}${x.id === original ? ' <small>(original)</small>' : ''}</button></li>`).join('') || '<li class="muted">No swaps set up for this exercise yet.</li>'}</ul>
    <button class="link" data-other>Pick any other exercise…</button>`;
  sheet('Swap exercise', html, (w) => {
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) {
        const to = b.dataset.pick;
        entry.swappedFrom = to === original ? undefined : original;
        entry.exerciseId = to;
        if (store.get('exercises', to)?.loaded === false) entry.sets.forEach((s) => { s.weight = null; });
        closeSheet(); done();
      }
      if (e.target.closest('[data-other]')) pickExerciseSheet((to) => { entry.swappedFrom = original; entry.exerciseId = to; done(); });
    });
  });
}

export function pickExerciseSheet(onPick) {
  const all = store.all('exercises').sort((a, b) => a.name.localeCompare(b.name));
  const html = `<input type="search" class="search" placeholder="Search exercises" aria-label="Search exercises">
    <ul class="pick">${all.map((x) => `<li data-name="${esc(x.name.toLowerCase())}"><button data-pick="${x.id}">${esc(x.name)} <small>${PATTERN_LABEL[x.pattern] || ''}</small></button></li>`).join('')}</ul>`;
  sheet('Pick exercise', html, (w) => {
    const q = w.querySelector('.search');
    q.focus();
    q.addEventListener('input', () => {
      const v = q.value.toLowerCase();
      w.querySelectorAll('li[data-name]').forEach((li) => { li.hidden = !li.dataset.name.includes(v); });
    });
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { closeSheet(); onPick(b.dataset.pick); } });
  });
}

function switchSheet(athleteId, iso, onPick) {
  const groups = store.assignmentsFor(athleteId).map((a) => ({ a, block: store.get('blocks', a.blockId) })).filter((g) => g.block);
  if (!groups.length) { toast('No program assigned yet. Ask your coach.'); return; }
  const html = groups.map(({ a, block }) => {
    const curWeek = Math.max(0, Math.min(block.weeks - 1, Math.floor((new Date(iso) - new Date(a.startDate)) / (7 * 86400000))));
    let h = `<h3>${esc(block.name)}</h3><p class="muted">Pick any day. Week ${curWeek + 1} is this week.</p>`;
    for (let w = 0; w < block.weeks; w++) {
      h += `<details ${w === curWeek ? 'open' : ''}><summary>Week ${w + 1}${block.deloadWeek === w ? ' (deload)' : ''}</summary><ul class="pick">`;
      block.days.forEach((d, di) => {
        const doneOn = store.logsFor(athleteId).find((l) => l.blockId === block.id && l.week === w && l.dayIndex === di && l.finished);
        h += `<li><button data-a="${a.id}" data-w="${w}" data-d="${di}">${esc(d.name)}${doneOn ? ` <small>done ${fmtDate(doneOn.date, { month: 'short', day: 'numeric' })}</small>` : ''}</button></li>`;
      });
      h += '</ul></details>';
    }
    return h;
  }).join('');
  sheet('Switch workout', html, (w) => {
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const g = groups.find((x) => x.a.id === b.dataset.a);
      onPick({ assignment: g.a, block: g.block, week: Number(b.dataset.w), dayIndex: Number(b.dataset.d) });
    });
  });
}

export function week(root, { id }, query) {
  const iso = query.get('d') || today();
  const mon = weekStart(iso);
  const cur = weekSummary(id, mon);
  const prev = weekSummary(id, addDays(mon, -7));
  const trend = loadTrend(id, addDays(mon, 6) < today() ? addDays(mon, 6) : today());
  const u = store.settings().units;
  const t = cur.done;
  const patterns = Object.keys(PATTERN_LABEL).filter((p) => (t.setsByPattern[p] || cur.planned.setsByPattern[p]));

  root.innerHTML = `
    <header class="page-head"><h1>Week of ${fmtDate(mon, { month: 'short', day: 'numeric' })}</h1>
      <div class="row gap">
        <a class="chip" href="#/athlete/${id}/week?d=${addDays(mon, -7)}">‹ Prev</a>
        <a class="chip" href="#/athlete/${id}/week?d=${addDays(mon, 7)}">Next ›</a>
      </div></header>
    <div class="stats">
      ${stat('Sessions', cur.sessionsDone, null, ` / ${cur.sessionsPlanned}`)}
      ${stat('Tonnage', t.tonnage, prev.done.tonnage, ` ${u}`)}
      ${stat('Plyo contacts', t.contacts, prev.done.contacts)}
      ${stat('High-intensity contacts', t.highContacts, prev.done.highContacts)}
      ${stat('Total reps', t.reps, prev.done.reps)}
      ${stat('Session load', cur.load, prev.load, ' AU')}
      ${t.sprintMeters || cur.planned.sprintMeters ? stat('Sprint meters', t.sprintMeters, prev.done.sprintMeters, ' m') : ''}
      ${t.throws ? stat('Throws', t.throws, prev.done.throws) : ''}
    </div>
    <section class="card">
      <h3>Planned vs done</h3>
      <table class="tbl"><thead><tr><th></th><th>Planned</th><th>Done</th></tr></thead><tbody>
        <tr><td>Tonnage (${u})</td><td>${fmt(cur.planned.tonnage)}</td><td>${fmt(t.tonnage)}</td></tr>
        <tr><td>Plyo contacts</td><td>${fmt(cur.planned.contacts)}</td><td>${fmt(t.contacts)}</td></tr>
        <tr><td>Sets</td><td>${fmt(cur.planned.sets)}</td><td>${fmt(t.sets)}</td></tr>
        <tr><td>Reps at 80%+ of max</td><td>${fmt(cur.planned.zones.z80 + cur.planned.zones.z90)}</td><td>${fmt(t.zones.z80 + t.zones.z90)}</td></tr>
      </tbody></table>
    </section>
    <section class="card"><h3>Sets by movement</h3>
      ${patterns.length ? bars(patterns.map((p) => ({ label: PATTERN_LABEL[p], value: t.setsByPattern[p] || 0, sub: `of ${cur.planned.setsByPattern[p] || 0}` }))) : '<p class="muted">Nothing logged yet this week.</p>'}
    </section>
    <section class="card"><h3>Tonnage by day</h3>
      ${bars(cur.days.map((d) => ({ label: fmtDate(d.iso, { weekday: 'short' }), value: Math.round(d.totals.tonnage) })), ` ${u}`)}
    </section>
    <section class="card"><h3>Load trend</h3>
      ${trend.ratio == null
        ? `<p class="muted">Last 7 days: ${fmt(trend.acute)} AU. The 7-day vs 4-week comparison appears after about three weeks of logging.</p>`
        : `<p>Last 7 days: <b>${fmt(trend.acute)} AU</b>, 4-week weekly average: <b>${fmt(trend.chronicWeekly)} AU</b>, ratio <b class="${trend.ratio > 1.5 ? 'warn' : ''}">${fmt(trend.ratio, 2)}</b>.</p>
           <p class="muted">Above about 1.5 means a big jump. Worth a word with your coach, not a diagnosis.</p>`}
    </section>
    <p class="muted small">Session load = session RPE × minutes. Plyo tiers: ${Object.entries(PLYO_TIERS).filter(([k]) => k >= 5).map(([, v]) => v).join(', ')} count as high intensity.</p>`;
}

export function history(root, { id }) {
  const logs = store.logsFor(id).filter((l) => l.finished).reverse();
  const ex = store.exercisesById();
  const u = store.settings().units;
  const athlete = store.get('athletes', id);
  const maxes = Object.entries(athlete?.maxes || {});
  root.innerHTML = `
    <header class="page-head"><h1>History</h1></header>
    ${maxes.length ? `<section class="card"><h3>Current maxes</h3><ul class="kv">${maxes.map(([k, v]) => `<li><span>${esc(ex[k]?.name || k)}</span><b>${fmt(v)} ${u}</b></li>`).join('')}</ul></section>` : ''}
    ${logs.map((l) => {
      const t = sessionTotals(l, ex, true);
      const notes = l.entries.filter((e) => e.athleteNote).map((e) => `${ex[e.exerciseId]?.name}: ${e.athleteNote}`);
      return `<a class="card log-row" href="#/athlete/${id}?d=${l.date}">
        <div><b>${esc(l.name)}</b><p class="muted">${fmtDate(l.date)} · RPE ${l.sessionRpe ?? '–'} · ${l.minutes ?? '–'} min</p>
        ${l.note ? `<p class="note">“${esc(l.note)}”</p>` : ''}${notes.map((n) => `<p class="note small">${esc(n)}</p>`).join('')}</div>
        <div class="right"><b>${fmt(t.tonnage)}</b> <small>${u}</small><br><b>${fmt(t.contacts)}</b> <small>contacts</small></div></a>`;
    }).join('') || '<p class="empty">No finished sessions yet.</p>'}`;
}
