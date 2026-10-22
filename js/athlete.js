// Athlete screens: today, the workout page (log, notes, swaps, switch), analytics, history.

import * as store from './store.js';
import { toISO, addDays, weekStart, sessionTotals, e1rm, PLYO_TIERS } from './calc.js';
import { weekSummary, loadTrend } from './summary.js';
import { esc, fmt, fmtDate, bindActions, sheet, closeSheet, toast, stat, bars, unitSeg, PATTERN_LABEL } from './ui.js';

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

// 75 -> "1:15", 30 -> "30 s"
export function fmtSecs(n) {
  if (!n) return '';
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function targetText(set, measure) {
  const w = store.showW(set.targetWeight ?? set.weight);
  if (measure === 'time') {
    const t = fmtSecs(set.targetSecs ?? set.secs);
    return w && t ? `${w} × ${t}` : t;
  }
  const reps = set.targetReps ?? set.reps;
  const word = measure === 'breaths' ? 'breath' : 'rep';
  if (w) return `${w} × ${reps}`;
  return reps ? `${reps} ${word}${reps === 1 ? '' : 's'}` : '';
}

// Group letters for supersets ("A1", "A2") or plain order numbers; warmup
// exercises are W1, W2...
function orderLabels(entries) {
  const seen = {};
  let n = 0;
  let w = 0;
  return entries.map((e) => {
    if (e.warmup) return `W${++w}`;
    if (!e.group) return String(++n);
    seen[e.group] = (seen[e.group] || 0) + 1;
    if (seen[e.group] === 1) n++;
    return `${e.group}${seen[e.group]}`;
  });
}

function statusOf(log) {
  if (!log) return { cls: '', txt: 'Not started' };
  if (log.finished) return { cls: 'done', txt: 'Done' };
  const done = log.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  return done ? { cls: 'live', txt: 'In progress' } : { cls: '', txt: 'Not started' };
}

function workoutCard(id, iso, title, sub, count, log) {
  const st = statusOf(log);
  return `<a class="workout-card ${st.cls}" href="#/athlete/${id}/session/${iso}">
    <div><span class="kicker">${esc(sub)}</span><h2>${esc(title)}</h2><p class="muted">${count} exercises</p></div>
    <div class="workout-go"><span class="status ${st.cls}">${st.txt}</span><span class="arrow" aria-hidden="true">›</span></div></a>`;
}

// Today: the day's workout(s) as cards. Tapping one opens the workout page.
export function today_(root, { id }, query) {
  const athlete = store.get('athletes', id);
  if (!athlete) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const iso = query.get('d') || today();
  const plans = store.plannedOn(id, iso);
  const log = store.logFor(id, iso);

  let body;
  if (log) {
    const block = store.get('blocks', log.blockId);
    body = workoutCard(id, iso, log.name, block ? `${block.name} · Week ${log.week + 1}` : 'Workout', log.entries.length, log);
  } else if (plans.length) {
    const p = plans[0];
    body = workoutCard(id, iso, p.block.days[p.dayIndex].name, `${p.block.name} · Week ${p.week + 1}${p.block.deloadWeek === p.week ? ' · Deload' : ''}`, p.block.days[p.dayIndex].items.length, null);
  } else {
    body = `<div class="empty"><p><b>Rest day.</b> Nothing is scheduled.</p>
      <button class="btn ghost" data-action="switch">Do a workout anyway</button></div>`;
  }

  root.innerHTML = `
    <header class="page-head"><span class="kicker">${fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      <h1>Hey ${esc(athlete.name.split(' ')[0])}</h1></header>
    ${dateStrip(id, iso)}
    ${body}`;

  bindActions(root, {
    goDate: (el) => { location.hash = `#/athlete/${id}?d=${el.dataset.date}`; },
    switch: () => switchSheet(id, iso, (plan) => {
      const l = store.startLog(id, iso, plan);
      store.saveLog(l);
      closeSheet();
      location.hash = `#/athlete/${id}/session/${iso}`;
    }),
  });
}

function entryCard(log, entry, i, label) {
  const ex = store.get('exercises', entry.exerciseId) || { name: entry.exerciseId };
  const last = store.lastTime(log.athleteId, entry.exerciseId, log.date);
  const units = store.unit();
  const measure = entry.measure || 'reps';
  const loaded = ex.loaded !== false && measure !== 'none' && measure !== 'breaths';
  const amount = (s) => (measure === 'time' ? fmtSecs(s.secs) : `${s.reps ?? ''}`);
  const lastTxt = last && measure !== 'none' ? `Last time: ${last.sets.map((s) => s.weight ? `${store.showW(s.weight)}×${amount(s)}` : amount(s)).join(', ')}` : '';
  // The box the athlete fills in: reps, breaths, seconds, or nothing for a check-off item.
  const k = measure === 'time' ? 'secs' : 'reps';
  const boxName = { time: 'Secs', breaths: 'Breaths' }[measure] || 'Reps';
  const box = (s, j) => (measure === 'none' ? '' : `<label class="field"><input type="number" inputmode="numeric" min="0" value="${s[k] ?? ''}" placeholder="${s[measure === 'time' ? 'targetSecs' : 'targetReps'] || ''}" data-action="setField" data-i="${i}" data-j="${j}" data-k="${k}" aria-label="${boxName}, set ${j + 1}"><span>${boxName.toLowerCase()}</span></label>`);
  const cols = `${loaded ? '' : 'no-load'} ${measure === 'none' ? 'check-only' : ''}`;
  const tags = [];
  if (entry.tempo) tags.push(`Tempo ${entry.tempo}`);
  if (entry.swappedFrom) tags.push(`Swapped from ${store.get('exercises', entry.swappedFrom)?.name || entry.swappedFrom}`);
  const rows = entry.sets.map((s, j) => `
    <div class="set ${s.done ? 'done' : ''} ${cols}">
      <span class="set-n">${j + 1}</span>
      <span class="target">${esc(measure === 'none' ? 'Tap when done' : targetText(s, measure))}</span>
      ${loaded ? `<label class="field"><input type="number" inputmode="decimal" min="0" step="any" value="${store.showW(s.weight) ?? ''}" placeholder="${store.showW(s.targetWeight) ?? ''}" data-action="setField" data-i="${i}" data-j="${j}" data-k="weight" aria-label="Weight, set ${j + 1}"><span>${units}</span></label>` : ''}
      ${box(s, j)}
      <button class="check" data-action="toggleSet" data-i="${i}" data-j="${j}" aria-pressed="${s.done}" aria-label="Mark set ${j + 1} done">✓</button>
    </div>`).join('');
  return `<article class="entry ${entry.sets.every((s) => s.done) ? 'complete' : ''}" id="entry-${i}">
    <header>
      <span class="order">${label}</span>
      <div class="entry-title"><h3>${esc(ex.name)}</h3>
        ${tags.length ? `<p class="tags">${esc(tags.join(' · '))}</p>` : ''}
        ${lastTxt ? `<p class="last">${esc(lastTxt)}</p>` : ''}</div>
      <button class="chip" data-action="swap" data-i="${i}">Swap</button>
    </header>
    ${entry.note ? `<p class="coach-note">${esc(entry.note)}</p>` : ''}
    ${ex.video ? `<a class="link small" href="${esc(ex.video)}" target="_blank" rel="noopener">▶ Watch demo</a>` : ''}
    ${measure === 'none' ? '' : `<div class="set-head ${cols}"><span>Set</span><span>Target</span>${loaded ? `<span>${units}</span>` : ''}<span>${boxName}</span><span></span></div>`}
    <div class="sets">${rows}</div>
    <div class="entry-foot">
      ${measure === 'none' ? '' : `<button class="link" data-action="addSet" data-i="${i}">+ Set</button>`}
      ${entry.sets.length > 1 ? `<button class="link muted-link" data-action="removeSet" data-i="${i}">− Set</button>` : ''}
      <span class="spacer"></span>
      <button class="link" data-action="toggleNote" data-i="${i}">${entry.athleteNote ? 'Edit note' : '+ Note'}</button>
    </div>
    <label class="note-field" ${entry.athleteNote ? '' : 'hidden'} id="note-${i}"><span>My note</span>
      <textarea rows="2" placeholder="How did it feel? Any pain?" data-action="entryNote" data-i="${i}">${esc(entry.athleteNote || '')}</textarea></label>
  </article>`;
}

function rpeButtons(val) {
  let h = '<div class="rpe" role="group" aria-label="Session RPE">';
  for (let r = 1; r <= 10; r++) h += `<button class="${val === r ? 'on' : ''}" data-action="sessionRpe" data-v="${r}">${r}</button>`;
  return h + '</div>';
}

// The workout page: every exercise in order with boxes for weight and reps.
export function session(root, { id, date }) {
  const athlete = store.get('athletes', id);
  if (!athlete) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const plans = store.plannedOn(id, date);
  let log = store.logFor(id, date);
  if (!log) {
    if (!plans.length) { location.hash = `#/athlete/${id}?d=${date}`; return; }
    log = store.startLog(id, date, plans[0]);
  }
  const block = store.get('blocks', log.blockId);
  const labels = orderLabels(log.entries);

  root.innerHTML = `
    <header class="page-head">
      <a class="back" href="#/athlete/${id}?d=${date}">‹ ${fmtDate(date)}</a>
      <span class="kicker">${esc(block ? `${block.name} · Week ${log.week + 1}` : '')}</span>
      <div class="row between"><h1>${esc(log.name)}</h1><div class="row gap">${unitSeg(store.unit())}<button class="chip" data-action="switch">Switch</button></div></div>
    </header>
    ${log.entries.map((e, i) => {
      // Headings split the warmup from the main work when there is a warmup.
      const head = e.warmup && !log.entries[i - 1]?.warmup ? '<h2 class="sec-head">Warmup</h2>'
        : !e.warmup && log.entries[i - 1]?.warmup ? '<h2 class="sec-head">Workout</h2>' : '';
      return head + entryCard(log, e, i, labels[i]);
    }).join('')}
    <button class="btn ghost wide" data-action="addExercise">+ Add an exercise</button>
    <section class="finish">
      <h2>Finish</h2>
      <p class="muted">How hard was the whole session? 1 is very easy, 10 is max effort.</p>
      ${rpeButtons(log.sessionRpe)}
      <label class="field-row"><span>Minutes</span><input type="number" inputmode="numeric" min="0" value="${log.minutes ?? ''}" data-action="minutes" aria-label="Session minutes"></label>
      <label class="note-field"><span>Note for coach</span>
        <textarea rows="2" placeholder="Sleep, soreness, anything coach should know" data-action="sessionNote">${esc(log.note || '')}</textarea></label>
      <button class="btn wide" data-action="finish">${log.finished ? 'Update workout' : 'Finish workout'}</button>
    </section>`;

  const rerender = () => { const y = window.scrollY; session(root, { id, date }); window.scrollTo(0, y); };
  const persist = () => store.saveLog(log);
  const markEntry = (i) => root.querySelector(`#entry-${i}`)?.classList.toggle('complete', log.entries[i].sets.every((s) => s.done));

  bindActions(root, {
    toggleSet: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      s.done = !s.done;
      // Ticking a set with empty boxes logs it exactly as prescribed.
      if (s.done) {
        if (s.reps == null) s.reps = s.targetReps ?? null;
        if (s.secs == null) s.secs = s.targetSecs ?? null;
        if (s.weight == null) s.weight = s.targetWeight ?? null;
        const row = el.closest('.set');
        for (const f of ['weight', 'reps', 'secs']) { const box = row.querySelector(`[data-k=${f}]`); if (box && s[f] != null) box.value = f === 'weight' ? store.showW(s[f]) : s[f]; }
      }
      el.setAttribute('aria-pressed', s.done);
      el.closest('.set').classList.toggle('done', s.done);
      markEntry(el.dataset.i);
      persist();
    },
    setField: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      const v = el.value === '' ? null : Number(el.value);
      s[el.dataset.k] = el.dataset.k === 'weight' ? store.readW(v) : v;
      persist();
    },
    setUnits: (el) => { store.setSetting('units', el.dataset.v); rerender(); },
    addSet: (el) => {
      const sets = log.entries[el.dataset.i].sets;
      const last = sets[sets.length - 1] || {};
      sets.push({ targetReps: last.targetReps ?? last.reps ?? null, targetSecs: last.targetSecs ?? last.secs ?? null, targetWeight: last.targetWeight ?? last.weight ?? null, reps: null, secs: null, weight: null, done: false });
      persist(); rerender();
    },
    removeSet: (el) => { log.entries[el.dataset.i].sets.pop(); persist(); rerender(); },
    toggleNote: (el) => { const n = root.querySelector(`#note-${el.dataset.i}`); n.hidden = false; n.querySelector('textarea').focus(); },
    entryNote: (el) => { log.entries[el.dataset.i].athleteNote = el.value; persist(); },
    sessionRpe: (el) => {
      log.sessionRpe = Number(el.dataset.v); persist();
      root.querySelectorAll('.rpe button').forEach((b) => b.classList.toggle('on', b === el));
    },
    minutes: (el) => { log.minutes = el.value === '' ? null : Number(el.value); persist(); },
    sessionNote: (el) => { log.note = el.value; persist(); },
    finish: () => {
      log.finished = true;
      // Update maxes when a logged set beats the estimated 1RM on file.
      const prs = [];
      for (const e of log.entries) {
        const best = Math.max(0, ...e.sets.filter((s) => s.done).map((s) => e1rm(s.weight, s.reps)));
        const cur = athlete.maxes?.[e.exerciseId];
        if (cur && best > cur) { athlete.maxes[e.exerciseId] = Math.round(best * 10) / 10; prs.push(store.get('exercises', e.exerciseId)?.name); }
      }
      if (prs.length) store.put('athletes', athlete);
      store.saveLog(log);
      toast(prs.length ? `Saved. New estimated max: ${prs.join(', ')}` : 'Workout saved');
      location.hash = `#/athlete/${id}?d=${date}`;
    },
    swap: (el) => swapSheet(log, Number(el.dataset.i), () => { persist(); rerender(); }),
    addExercise: () => pickExerciseSheet((exId) => {
      log.entries.push({ exerciseId: exId, note: '', sets: [{ targetReps: null, targetWeight: null, reps: null, weight: null, done: false }], addedByAthlete: true });
      persist(); rerender();
    }),
    switch: () => switchSheet(id, date, (plan) => {
      if (log.entries.some((e) => e.sets.some((s) => s.done)) && !confirm('Replace the sets you already logged today?')) return;
      store.del('logs', log.id);
      log = store.startLog(id, date, plan);
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
        // The old weight belongs to the old exercise; keep reps, clear the load.
        entry.sets.forEach((s) => { if (!s.done) { s.weight = null; s.targetWeight = null; } });
        closeSheet(); done();
      }
      if (e.target.closest('[data-other]')) pickExerciseSheet((to) => { entry.swappedFrom = original; entry.exerciseId = to; done(); });
    });
  });
}

// With allowNew (coach side), typing a name that isn't in the library offers
// to create it on the spot.
export function pickExerciseSheet(onPick, { allowNew = false } = {}) {
  const all = store.all('exercises').sort((a, b) => a.name.localeCompare(b.name));
  const html = `<input type="search" class="search" placeholder="Search exercises" aria-label="Search exercises">
    ${allowNew ? '<button class="btn ghost wide pick-new" data-new hidden></button>' : ''}
    <ul class="pick">${all.map((x) => `<li data-name="${esc(x.name.toLowerCase())}"><button data-pick="${x.id}">${esc(x.name)} <small>${PATTERN_LABEL[x.pattern] || ''}</small></button></li>`).join('')}</ul>`;
  sheet('Pick exercise', html, (w) => {
    const q = w.querySelector('.search');
    const add = w.querySelector('[data-new]');
    q.focus();
    q.addEventListener('input', () => {
      const v = q.value.toLowerCase().trim();
      w.querySelectorAll('li[data-name]').forEach((li) => { li.hidden = !li.dataset.name.includes(v); });
      if (add) {
        add.hidden = !v || all.some((x) => x.name.toLowerCase() === v);
        add.textContent = `+ New exercise "${q.value.trim()}"`;
      }
    });
    w.addEventListener('click', (e) => {
      if (e.target.closest('[data-new]')) {
        const x = store.put('exercises', { id: store.uid('ex'), name: q.value.trim(), pattern: 'other', body: 'full', loaded: false, alts: [] });
        toast(`Added "${x.name}" to the library. Set its movement type there.`);
        closeSheet(); onPick(x.id); return;
      }
      const b = e.target.closest('[data-pick]');
      if (b) { closeSheet(); onPick(b.dataset.pick); }
    });
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
  const u = store.unit();
  const w = store.showW;
  const t = cur.done;
  const patterns = Object.keys(PATTERN_LABEL).filter((p) => (t.setsByPattern[p] || cur.planned.setsByPattern[p]));
  const sessions = cur.days.filter((d) => d.log);

  root.innerHTML = `
    <header class="page-head"><span class="kicker">Analytics</span>
      <div class="row between"><h1>Week of ${fmtDate(mon, { month: 'short', day: 'numeric' })}</h1>
      <div class="row gap">
        <a class="chip" href="#/athlete/${id}/week?d=${addDays(mon, -7)}" aria-label="Previous week">‹</a>
        <a class="chip" href="#/athlete/${id}/week?d=${addDays(mon, 7)}" aria-label="Next week">›</a>
      </div></div></header>
    <div class="stats">
      ${stat('Sessions', cur.sessionsDone, null, ` / ${cur.sessionsPlanned}`)}
      ${stat('Tonnage', w(t.tonnage), w(prev.done.tonnage), ` ${u}`)}
      ${stat('Plyo contacts', t.contacts, prev.done.contacts)}
      ${stat('High-intensity contacts', t.highContacts, prev.done.highContacts)}
      ${stat('Total reps', t.reps, prev.done.reps)}
      ${stat('Session load', cur.load, prev.load, ' AU')}
      ${t.sprintMeters || cur.planned.sprintMeters ? stat('Sprint meters', t.sprintMeters, prev.done.sprintMeters, ' m') : ''}
      ${t.throws ? stat('Throws', t.throws, prev.done.throws) : ''}
    </div>
    <section class="card"><h3>Each workout</h3>
      ${sessions.length ? `<div class="scroll-x"><table class="tbl compact"><thead><tr><th>Workout</th><th>${u}</th><th>Contacts</th><th>Sets</th><th>RPE</th></tr></thead><tbody>
        ${sessions.map((d) => `<tr><td><a href="#/athlete/${id}/session/${d.iso}">${esc(d.log.name)}</a><br><small class="muted">${fmtDate(d.iso)}</small></td>
          <td>${fmt(w(d.totals.tonnage))}</td><td>${fmt(d.totals.contacts)}</td><td>${fmt(d.totals.sets)}</td><td>${d.log.sessionRpe ?? '–'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No workouts logged this week yet.</p>'}
    </section>
    <section class="card">
      <h3>Planned vs done</h3>
      <table class="tbl"><thead><tr><th></th><th>Planned</th><th>Done</th></tr></thead><tbody>
        <tr><td>Tonnage (${u})</td><td>${fmt(w(cur.planned.tonnage))}</td><td>${fmt(w(t.tonnage))}</td></tr>
        <tr><td>Plyo contacts</td><td>${fmt(cur.planned.contacts)}</td><td>${fmt(t.contacts)}</td></tr>
        <tr><td>Sets</td><td>${fmt(cur.planned.sets)}</td><td>${fmt(t.sets)}</td></tr>
        <tr><td>Reps at 80%+ of max</td><td>${fmt(cur.planned.zones.z80 + cur.planned.zones.z90)}</td><td>${fmt(t.zones.z80 + t.zones.z90)}</td></tr>
      </tbody></table>
    </section>
    <section class="card"><h3>Sets by movement</h3>
      ${patterns.length ? bars(patterns.map((p) => ({ label: PATTERN_LABEL[p], value: t.setsByPattern[p] || 0, sub: `of ${cur.planned.setsByPattern[p] || 0}` }))) : '<p class="muted">Nothing logged yet this week.</p>'}
    </section>
    <section class="card"><h3>Tonnage by day</h3>
      ${bars(cur.days.map((d) => ({ label: fmtDate(d.iso, { weekday: 'short' }), value: Math.round(w(d.totals.tonnage)) })), ` ${u}`)}
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
  const u = store.unit();
  const athlete = store.get('athletes', id);
  const maxes = Object.entries(athlete?.maxes || {});
  root.innerHTML = `
    <header class="page-head"><h1>History</h1></header>
    ${maxes.length ? `<section class="card"><h3>Current maxes</h3><ul class="kv">${maxes.map(([k, v]) => `<li><span>${esc(ex[k]?.name || k)}</span><b>${fmt(store.showW(v), 1)} ${u}</b></li>`).join('')}</ul></section>` : ''}
    ${logs.map((l) => {
      const t = sessionTotals(l, ex, true);
      const notes = l.entries.filter((e) => e.athleteNote).map((e) => `${ex[e.exerciseId]?.name}: ${e.athleteNote}`);
      return `<a class="card log-row" href="#/athlete/${id}?d=${l.date}">
        <div><b>${esc(l.name)}</b><p class="muted">${fmtDate(l.date)} · RPE ${l.sessionRpe ?? '–'} · ${l.minutes ?? '–'} min</p>
        ${l.note ? `<p class="note">“${esc(l.note)}”</p>` : ''}${notes.map((n) => `<p class="note small">${esc(n)}</p>`).join('')}</div>
        <div class="right"><b>${fmt(store.showW(t.tonnage))}</b> <small>${u}</small><br><b>${fmt(t.contacts)}</b> <small>contacts</small></div></a>`;
    }).join('') || '<p class="empty">No finished sessions yet.</p>'}`;
}
