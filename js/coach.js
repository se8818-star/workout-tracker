// Coach screens: team board, athlete detail, block builder, assigning, exercise library.

import * as store from './store.js';
import { toISO, addDays, weekStart, buildSession, sessionTotals, addTotals, emptyTotals, parseQuickEntry, defaultWeekdays, measureOf, isCount, fromUnit, PATTERNS, PLYO_TIERS } from './calc.js';
import { weekSummary, loadTrend } from './summary.js';
import { esc, fmt, fmtDate, bindActions, toast, stat, unitSeg, ask, askFields, PATTERN_LABEL, $ } from './ui.js';
import { pickExerciseSheet } from './athlete.js';
import { TEMPLATES } from './templates.js';
import { removeAthleteLogin } from './sync.js';

const today = () => toISO(new Date());
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- team board ----------

export function board(root, _p, query) {
  const mon = weekStart(query.get('d') || today());
  const athletes = store.all('athletes').sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
  const u = store.unit();
  let team = { tonnage: 0, contacts: 0, done: 0, planned: 0 };
  const rows = athletes.map((a) => {
    const w = weekSummary(a.id, mon);
    const trend = loadTrend(a.id, today());
    team.tonnage += w.done.tonnage; team.contacts += w.done.contacts; team.done += w.sessionsDone; team.planned += w.sessionsPlanned;
    const lastNote = store.logsFor(a.id).filter((l) => l.finished && (l.note || l.entries.some((e) => e.athleteNote))).pop();
    const noteTxt = lastNote ? (lastNote.note || lastNote.entries.find((e) => e.athleteNote)?.athleteNote) : '';
    const missed = w.days.filter((d) => d.planned && d.iso < today() && !d.log?.finished).length;
    const flag = missed ? `<span class="pill warn">${missed} missed</span>` : (trend.ratio > 1.5 ? '<span class="pill warn">load spike</span>' : '');
    return `<tr>
      <td><a href="#/coach/athlete/${a.id}"><b>${esc(a.name)}</b></a><br><small class="muted">${esc(a.group || '')}</small></td>
      <td>${w.sessionsDone}/${w.sessionsPlanned} ${flag}</td>
      <td>${fmt(store.showW(w.done.tonnage))}</td>
      <td>${fmt(w.done.contacts)}</td>
      <td>${fmt(w.load)}</td>
      <td class="note-cell">${noteTxt ? `“${esc(noteTxt)}”<br><small class="muted">${fmtDate(lastNote.date, { month: 'short', day: 'numeric' })}</small>` : ''}</td>
    </tr>`;
  }).join('');
  root.innerHTML = `
    <header class="page-head"><h1>Team this week</h1>
      <div class="row gap"><a class="chip" href="#/coach?d=${addDays(mon, -7)}">‹ Prev</a><span class="muted">${fmtDate(mon, { month: 'short', day: 'numeric' })}</span><a class="chip" href="#/coach?d=${addDays(mon, 7)}">Next ›</a></div></header>
    <div class="stats">
      ${stat('Sessions done', team.done, null, ` / ${team.planned}`)}
      ${stat('Team tonnage', store.showW(team.tonnage), null, ` ${u}`)}
      ${stat('Team plyo contacts', team.contacts)}
    </div>
    <div class="card scroll-x"><table class="tbl board">
      <thead><tr><th>Athlete</th><th>Sessions</th><th>Tonnage (${u})</th><th>Contacts</th><th>Load (AU)</th><th>Latest note</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">No athletes yet.</td></tr>'}</tbody></table></div>
    <div class="row gap wrap">
      <a class="btn" href="#/coach/assign">Assign a program</a>
      <button class="btn ghost" data-action="addAthlete">+ Add athlete</button>
    </div>`;
  bindActions(root, {
    addAthlete: async () => {
      const f = await askFields('Add athlete', [{ k: 'name', label: 'Name' }, { k: 'group', label: 'Group', placeholder: 'e.g. Pitchers' }], { ok: 'Add athlete' });
      if (!f) return;
      store.put('athletes', { id: store.uid('ath'), name: f.name, group: f.group, maxes: {} });
      board(root, _p, query);
    },
  });
}

// ---------- athlete detail ----------

export function athlete(root, { id }) {
  const a = store.get('athletes', id);
  if (!a) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const ex = store.exercisesById();
  const u = store.unit();
  const w = weekSummary(id, weekStart(today()));
  const logs = store.logsFor(id).filter((l) => l.finished).reverse().slice(0, 12);
  const loaded = store.all('exercises').filter((x) => x.loaded).sort((x, y) => x.name.localeCompare(y.name));
  const asg = store.assignmentsFor(id);
  root.innerHTML = `
    <header class="page-head"><a class="back" href="#/coach">‹ Team</a><h1>${esc(a.name)}</h1><p class="muted">${esc(a.group || '')}</p>
      <div class="row gap"><a class="chip" href="#/athlete/${id}">Open athlete view</a><a class="chip" href="#/athlete/${id}/week">Weekly numbers</a></div></header>
    <div class="stats">
      ${stat('Sessions', w.sessionsDone, null, ` / ${w.sessionsPlanned}`)}
      ${stat('Tonnage', store.showW(w.done.tonnage), null, ` ${u}`)}
      ${stat('Plyo contacts', w.done.contacts)}
      ${stat('Session load', w.load, null, ' AU')}
    </div>
    <section class="card"><h3>Programs</h3>
      ${asg.map((g) => { const b = store.get('blocks', g.blockId); const w = b && isWarmup(b); return `<div class="row between ${w ? 'asg-warm' : ''}"><span><b>${esc(b?.name || '?')}</b>${w ? ' <small class="tag-warm">Warmup</small>' : ''}<br><small class="muted">from ${fmtDate(g.startDate)}${g.endDate ? ` to ${fmtDate(g.endDate)}` : ''} · ${(g.weekdays || []).map((d) => WEEKDAYS[d]).join(', ')}</small></span><button class="chip" data-action="unassign" data-id="${g.id}">Remove</button></div>`; }).join('') || '<p class="muted">No program assigned.</p>'}
      <a class="link" href="#/coach/assign?athlete=${id}">+ Assign a program or warmup</a>
    </section>
    <section class="card"><div class="row between"><h3>Maxes (${u})</h3>${unitSeg(u)}</div>
      <p class="muted small">Prescribed weights come from these. They also update when a logged set beats them.</p>
      <div class="max-grid">${Object.entries(a.maxes || {}).map(([k, v]) => `<label class="field-row"><span>${esc(ex[k]?.name || k)}</span><input type="number" inputmode="decimal" step="any" value="${store.showW(v)}" data-action="setMax" data-ex="${k}"></label>`).join('')}</div>
      <div class="row gap"><select data-action="noop" id="new-max-ex" aria-label="Exercise">${loaded.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
        <input type="number" id="new-max-val" placeholder="Max" inputmode="decimal" aria-label="Max"><button class="chip" data-action="addMax">Add</button></div>
    </section>
    <section class="card"><h3>Recent sessions and notes</h3>
      ${logs.map((l) => {
        const t = sessionTotals(l, ex, true);
        const swaps = l.entries.filter((e) => e.swappedFrom).map((e) => `${ex[e.swappedFrom]?.name} → ${ex[e.exerciseId]?.name}`);
        const notes = l.entries.filter((e) => e.athleteNote).map((e) => `${ex[e.exerciseId]?.name}: ${e.athleteNote}`);
        return `<div class="log-item"><div class="row between"><b>${esc(l.name)}</b><span class="muted">${fmtDate(l.date)}</span></div>
          <p class="muted small">RPE ${l.sessionRpe ?? '–'} · ${l.minutes ?? '–'} min · ${fmt(store.showW(t.tonnage))} ${u} · ${fmt(t.contacts)} contacts${l.switchedFrom ? ' · switched day' : ''}</p>
          ${l.note ? `<p class="note">“${esc(l.note)}”</p>` : ''}
          ${notes.map((n) => `<p class="note small">${esc(n)}</p>`).join('')}
          ${swaps.length ? `<p class="small muted">Swaps: ${esc(swaps.join(', '))}</p>` : ''}</div>`;
      }).join('') || '<p class="muted">Nothing logged yet.</p>'}
    </section>
    <section class="card"><h3>Remove from team</h3>
      <p class="muted small">${esc(a.name.split(' ')[0])} loses access right away. Their programs, logs and notes are deleted. To come back they'd need the team code again.</p>
      <button class="btn ghost wide danger" data-action="removeAthlete">Remove ${esc(a.name)}</button>
    </section>`;
  bindActions(root, {
    removeAthlete: async () => {
      if (!await ask(`${a.name} loses access right away. Their programs, logs and notes are deleted too. This can't be undone.`, { title: `Remove ${a.name}?`, ok: 'Remove from team', danger: true })) return;
      try { await removeAthleteLogin(id); } catch (e) { toast(`Couldn't remove: ${e.message}`); return; }
      for (const g of store.assignmentsFor(id)) store.del('assignments', g.id);
      for (const l of store.logsFor(id)) store.del('logs', l.id);
      store.del('athletes', id);
      toast(`${a.name} removed`);
      location.hash = '#/coach';
    },
    setMax: (el) => { a.maxes[el.dataset.ex] = store.readW(Number(el.value)); store.put('athletes', a); toast('Max saved'); },
    setUnits: (el) => { store.setSetting('units', el.dataset.v); athlete(root, { id }); },
    addMax: () => {
      const exId = $('#new-max-ex', root).value, v = Number($('#new-max-val', root).value);
      if (!v) return;
      a.maxes = { ...a.maxes, [exId]: store.readW(v) }; store.put('athletes', a); athlete(root, { id });
    },
    unassign: async (el) => { if (await ask('Logged sessions stay.', { title: 'Remove this program?', ok: 'Remove program', danger: true })) { store.del('assignments', el.dataset.id); athlete(root, { id }); } },
  });
}

// ---------- blocks ----------

// Saved warmups live with the blocks (kind 'warmup', one day) so they sync the
// same way. A coach loads one into program days, or assigns it to athletes like
// a block, and it then runs in front of their program on its weekdays.
const isWarmup = (b) => b.kind === 'warmup';

export function blocks(root) {
  const all = store.all('blocks').sort((a, b) => a.name.localeCompare(b.name));
  const row = (b, sub) => `<div class="card row between">
      <a href="#/coach/block/${b.id}"><b>${esc(b.name)}</b><br><small class="muted">${sub}</small></a>
      <div class="row gap">${isWarmup(b) ? `<a class="chip" href="#/coach/assign?block=${b.id}">Assign</a>` : ''}<button class="chip" data-action="dup" data-id="${b.id}">Copy</button><button class="chip" data-action="del" data-id="${b.id}">Delete</button></div></div>`;
  const tpl = (t) => `<div class="card row between">
        <span><b>${esc(t.name)}</b><br><small class="muted">${esc(t.about)}</small></span>
        <button class="chip" data-action="useTemplate" data-id="${t.id}">Add</button></div>`;
  root.innerHTML = `
    <header class="page-head"><h1>Programs and blocks</h1><p class="muted">Build a block once, then assign it to anyone.</p></header>
    ${all.filter((b) => !isWarmup(b)).map((b) => row(b, `${b.weeks} weeks · ${b.days.length} days/week${b.deloadWeek != null ? ` · deload week ${b.deloadWeek + 1}` : ''}`)).join('')}
    <button class="btn" data-action="new">+ New block</button>
    <h2 class="sec-head">Warmups</h2>
    <p class="muted">Assign a warmup to athletes and it shows up in front of their workout. You can also load one into a program day from that day's Warmup section.</p>
    ${all.filter(isWarmup).map((b) => row(b, `${b.days[0]?.items.length || 0} exercises`)).join('')}
    <button class="btn ghost" data-action="newWarmup">+ New warmup</button>
    <section class="templates">
      <h3>Start from a template</h3>
      ${TEMPLATES.filter((t) => !t.kind).map(tpl).join('')}
      ${TEMPLATES.filter((t) => t.kind === 'warmup').map(tpl).join('')}
    </section>`;
  bindActions(root, {
    new: () => {
      const b = store.put('blocks', { id: store.uid('block'), name: 'New block', weeks: 4, deloadWeek: null, days: [{ name: 'Day 1', items: [] }] });
      location.hash = `#/coach/block/${b.id}`;
    },
    newWarmup: () => {
      const b = store.put('blocks', { id: store.uid('block'), kind: 'warmup', name: 'New warmup', weeks: 1, deloadWeek: null, days: [{ name: 'Warmup', items: [] }] });
      location.hash = `#/coach/block/${b.id}`;
    },
    // Copies the template into this team's programs, adding any exercises
    // the library is missing, then opens it for editing or assigning.
    useTemplate: (el) => {
      const t = TEMPLATES.find((x) => x.id === el.dataset.id);
      for (const e of t.exercises) if (!store.get('exercises', e.id)) store.put('exercises', structuredClone(e));
      const b = store.put('blocks', { ...structuredClone(t.block), id: store.uid('block') });
      toast(`Added "${b.name}". Assign it from here when you're ready.`);
      location.hash = `#/coach/block/${b.id}`;
    },
    dup: (el) => {
      const b = structuredClone(store.get('blocks', el.dataset.id));
      b.id = store.uid('block'); b.name += ' (copy)';
      store.put('blocks', b); blocks(root);
    },
    del: async (el) => {
      const used = store.all('assignments').some((a) => a.blockId === el.dataset.id);
      const warm = isWarmup(store.get('blocks', el.dataset.id) || {});
      const msg = warm ? 'Programs that already loaded it keep their copy.' : used ? 'This block is assigned to athletes.' : 'This can\'t be undone.';
      if (!await ask(msg, { title: warm ? 'Delete this warmup?' : 'Delete this block?', ok: 'Delete', danger: true })) return;
      store.del('blocks', el.dataset.id); blocks(root);
    },
  });
}

function findExercise(name) {
  const n = name.toLowerCase().trim();
  const all = store.all('exercises');
  return all.find((x) => x.name.toLowerCase() === n)
    || all.find((x) => x.id === n.replace(/\s+/g, '-'))
    || all.find((x) => x.name.toLowerCase().startsWith(n))
    || all.find((x) => x.name.toLowerCase().includes(n));
}

// A number with − / + buttons either side, for sets and reps.
// A number with − / + buttons either side, for sets, reps and seconds.
function stepper(label, k, value, min, step = 1) {
  return `<div class="stepper"><span>${label}</span>
    <div class="stepper-row"><button class="step-btn" data-action="step" data-k="${k}" data-d="${-step}" aria-label="Less ${label.toLowerCase()}">−</button>
    <input type="number" inputmode="numeric" min="${min}" step="${step}" value="${value ?? ''}" data-action="itemField" data-k="${k}" aria-label="${label}">
    <button class="step-btn" data-action="step" data-k="${k}" data-d="${step}" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
}

const MEASURES = [['reps', 'Reps'], ['time', 'Time'], ['breaths', 'Breaths'], ['none', 'No sets']];

function itemRow(item, di, ii, ex, label) {
  const x = ex[item.exerciseId];
  const loadType = item.pct != null ? 'pct' : item.weight != null ? 'weight' : 'none';
  const prog = item.progression || { type: 'none' };
  const measure = measureOf(item);
  const iu = item.unit || store.unit();
  const loadedEx = store.all('exercises').filter((e) => e.loaded).sort((a, b) => a.name.localeCompare(b.name));
  // Less-used settings stay folded away unless one is already in use.
  const extrasOpen = item.rpe != null || prog.type !== 'none' || item.group;
  return `<div class="item" data-di="${di}" data-ii="${ii}">
    <div class="item-top">
      <span class="item-n">${esc(label)}</span>
      <button class="item-name" data-action="itemPick" title="Change exercise">${esc(x?.name || item.exerciseId)}</button>
      ${x?.contactsPerRep ? `<span class="pill">${x.contactsPerRep}c/rep · T${x.plyoTier}</span>` : ''}
      <span class="spacer"></span>
      <button class="icon-btn" data-action="itemUp" title="Move up" aria-label="Move up">↑</button>
      <button class="icon-btn" data-action="itemDown" title="Move down" aria-label="Move down">↓</button>
      <button class="icon-btn" data-action="itemDel" title="Remove" aria-label="Remove">✕</button>
    </div>
    <div class="seg" role="group" aria-label="Measure by">${MEASURES.map(([v, label]) =>
      `<button class="${measure === v ? 'on' : ''}" data-action="measure" data-v="${v}" aria-pressed="${measure === v}">${label}</button>`).join('')}</div>
    ${measure === 'none' ? '<p class="muted small item-none">No sets or reps. The athlete just checks it off.</p>' : `<div class="item-main">
      ${stepper('Sets', 'sets', item.sets, 1)}
      <span class="times" aria-hidden="true">×</span>
      ${measure === 'time' ? stepper('Seconds', 'secs', item.secs, 0, 5) : stepper(measure === 'breaths' ? 'Breaths' : 'Reps', 'reps', item.reps, 0)}
    </div>`}
    ${x?.loaded && measure !== 'none' && measure !== 'breaths' ? `<div class="item-fields">
      <label>Load<select data-action="loadType"><option value="none" ${loadType === 'none' ? 'selected' : ''}>None</option><option value="pct" ${loadType === 'pct' ? 'selected' : ''}>% of max</option><option value="weight" ${loadType === 'weight' ? 'selected' : ''}>Fixed weight</option></select></label>
      <div class="unit-field"><span>Unit</span><div class="seg unit-seg" role="group" aria-label="Weight unit">${['lb', 'kg'].map((v) =>
        `<button class="${iu === v ? 'on' : ''}" data-action="itemUnit" data-v="${v}" aria-pressed="${iu === v}">${v}</button>`).join('')}</div></div>
      ${loadType === 'pct' ? `<label>%<input type="number" step="0.5" value="${item.pct}" data-action="itemField" data-k="pct"></label>
        <label>Max from<select data-action="itemField" data-k="maxFrom"><option value="">${esc(x.name)}</option>${loadedEx.filter((e) => e.id !== item.exerciseId).map((e) => `<option value="${e.id}" ${item.maxFrom === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
      ${loadType === 'weight' ? `<label>${iu}<input type="number" step="any" value="${store.showW(item.weight, iu)}" data-action="itemField" data-k="weight"></label>` : ''}
    </div>` : ''}
    <div class="item-notes">
      <label>Tempo<input type="text" placeholder="e.g. 3-1-1-0" value="${esc(item.tempo || '')}" data-action="itemField" data-k="tempo"></label>
      <label>Notes<textarea class="item-note" rows="2" placeholder="Cues, rest, setup… the athlete sees this" data-action="itemField" data-k="note">${esc(item.note || '')}</textarea></label>
    </div>
    <details class="item-extra" ${extrasOpen ? 'open' : ''}><summary>RPE, weekly progression, superset</summary>
      <div class="item-fields">
        <label>RPE<input type="number" step="0.5" min="1" max="10" value="${item.rpe ?? ''}" data-action="itemField" data-k="rpe"></label>
        <label>Each week<select data-action="progType">
          <option value="none" ${prog.type === 'none' ? 'selected' : ''}>Same</option>
          ${x?.loaded ? `<option value="add_pct" ${prog.type === 'add_pct' ? 'selected' : ''}>+ % of max</option>
          <option value="add_weight" ${prog.type === 'add_weight' ? 'selected' : ''}>+ weight</option>` : ''}
          ${isCount(measure) ? `<option value="add_reps" ${prog.type === 'add_reps' ? 'selected' : ''}>+ ${measure === 'breaths' ? 'breaths' : 'reps'}</option>` : ''}
          ${measure === 'time' ? `<option value="add_secs" ${prog.type === 'add_secs' ? 'selected' : ''}>+ seconds</option>` : ''}</select></label>
        ${prog.type !== 'none' ? `<label>By<input type="number" step="0.5" value="${(prog.type === 'add_weight' ? store.showW(prog.step, iu) : prog.step) ?? ''}" data-action="progStep"></label>` : ''}
        <label>Superset<input type="text" maxlength="2" value="${esc(item.group || '')}" placeholder="A" data-action="itemField" data-k="group"></label>
      </div>
    </details>
  </div>`;
}

function plannedDayTotals(block, di, week) {
  const ex = store.exercisesById();
  // Tonnage depends on each athlete's max; contacts and sets do not.
  const s = buildSession(block, di, week, { maxes: {} }, 5);
  return sessionTotals(s, ex, false);
}

export function blockEditor(root, { id }, query) {
  const b = store.get('blocks', id);
  if (!b) { root.innerHTML = '<p class="empty">Block not found.</p>'; return; }
  const ex = store.exercisesById();
  const week = Math.min(Number(query.get('w') || 0), b.weeks - 1);
  const totals = () => {
    let wk = emptyTotals();
    const days = b.days.map((_, di) => { const t = plannedDayTotals(b, di, week); wk = addTotals(wk, t); return t; });
    return { wk, days };
  };
  const weekLine = (t) => `Week ${week + 1} plan: <b>${fmt(t.sets)}</b> sets, <b>${fmt(t.contacts)}</b> plyo contacts (${fmt(t.highContacts)} high), ${fmt(t.sprintMeters)} m sprinting.`;
  const dayLine = (t) => `${fmt(t.sets)} sets · ${fmt(t.contacts)} contacts${t.sprintMeters ? ` · ${t.sprintMeters} m` : ''}`;
  const { wk: weekTot, days: dayTots } = totals();
  // One day is open at a time, picked from the tabs; a second can sit beside it.
  const day = Math.min(Number(query.get('day') || 0), Math.max(0, b.days.length - 1));
  let other = query.get('with') === null || query.get('with') === '' ? null : Number(query.get('with'));
  if (other === day || other >= b.days.length) other = null;
  // Each exercise keeps the unit the coach programmed it in; athletes start there.
  let stamped = false;
  for (const d of b.days) for (const it of d.items) if (!it.unit) { it.unit = store.unit(); stamped = true; }
  if (stamped) store.put('blocks', b);
  const warmups = store.all('blocks').filter(isWarmup).sort((x, y) => x.name.localeCompare(y.name));
  const warmItems = (d, di) => d.items.map((it, ii) => (it.warmup ? itemRow(it, di, ii, ex, `W${d.items.slice(0, ii + 1).filter((x) => x.warmup).length}`) : '')).join('');
  const dayCard = (di) => {
    const d = b.days[di];
    return `
      <section class="card day-card" data-di="${di}">
        <div class="row between gap">
          <input class="day-name" value="${esc(d.name)}" data-action="dayName" data-di="${di}" aria-label="Day name">
          <div class="row gap">
            <button class="chip" data-action="dayCopy" data-di="${di}">Copy day</button>
            <button class="chip" data-action="dayDel" data-di="${di}">Delete</button>
          </div>
        </div>
        <p class="muted small day-tot" data-di="${di}">${dayLine(dayTots[di])}</p>
        <div class="sec warm-sec">
          <h4>Warmup</h4>
          ${warmItems(d, di)}
          <div class="row gap wrap">
            <button class="chip" data-action="itemAdd" data-di="${di}" data-warm="1">+ Warmup exercise</button>
            ${warmups.length ? `<select class="warm-load" data-action="warmLoad" data-di="${di}" aria-label="Load a saved warmup"><option value="">Load a saved warmup…</option>${warmups.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select>` : ''}
            ${d.items.some((x) => x.warmup) && b.days.length > 1 ? `<button class="chip" data-action="warmCopy" data-di="${di}">Copy warmup to other days</button>` : ''}
            ${d.items.some((x) => x.warmup) ? `<button class="chip" data-action="warmSave" data-di="${di}">Save as a warmup</button>` : ''}
          </div>
        </div>
        <div class="sec">
          <h4>Workout</h4>
          ${d.items.map((it, ii) => (it.warmup ? '' : itemRow(it, di, ii, ex, it.group || String(d.items.slice(0, ii + 1).filter((x) => !x.warmup).length)))).join('')}
        </div>
        <button class="btn ghost wide add-ex" data-action="itemAdd" data-di="${di}">+ Add exercise</button>
        <details class="quick-wrap"><summary>Or type a list</summary>
          <div class="quick">
            <textarea rows="2" placeholder="One per line:&#10;Back squat 4x5 @80% +2.5%/wk&#10;Box jump 3x5" data-di="${di}" aria-label="Quick add exercises"></textarea>
            <button class="chip" data-action="quickAdd" data-di="${di}">Add</button>
          </div>
        </details>
      </section>`;
  };

  root.innerHTML = isWarmup(b) ? `
    <header class="page-head"><a class="link" href="#/coach/blocks">‹ All blocks</a>
      <input class="title-input" value="${esc(b.name)}" data-action="blockName" aria-label="Warmup name"></header>
    <p class="muted small">A saved warmup. <a href="#/coach/assign?block=${b.id}">Assign it</a> to athletes, or load it into a program day from that day's Warmup section. Changes here reach assigned athletes on their next workout, but not programs that already loaded a copy.</p>
    <section class="card day-card" data-di="0"><div class="sec warm-sec">
      ${warmItems(b.days[0], 0)}
      <button class="chip" data-action="itemAdd" data-di="0" data-warm="1">+ Warmup exercise</button>
    </div></section>` : `
    <header class="page-head"><a class="link" href="#/coach/blocks">‹ All blocks</a>
      <input class="title-input" value="${esc(b.name)}" data-action="blockName" aria-label="Block name"></header>
    <section class="card row gap wrap">
      <label class="field-row"><span>Weeks</span><input type="number" min="1" max="52" value="${b.weeks}" data-action="weeks"></label>
      <label class="field-row"><span>Deload week</span><select data-action="deload"><option value="">None</option>${Array.from({ length: b.weeks }, (_, i) => `<option value="${i}" ${b.deloadWeek === i ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>
      <label class="field-row"><span>Preview week</span><select data-action="previewWeek">${Array.from({ length: b.weeks }, (_, i) => `<option value="${i}" ${week === i ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>
    </section>
    <p class="muted small">Write week 1. The "each week" rules fill in the later weeks; the deload week halves sets and drops load 10%. <span id="week-tot">${weekLine(weekTot)}</span></p>
    <nav class="day-tabs" aria-label="Days">
      ${b.days.map((d, di) => `<button class="day-tab ${di === day ? 'on' : ''} ${di === other ? 'side' : ''}" data-action="pickDay" data-di="${di}" aria-pressed="${di === day}">${esc(d.name || `Day ${di + 1}`)}</button>`).join('')}
      <button class="day-tab add" data-action="addDay">+ Day</button>
    </nav>
    ${b.days.length > 1 ? `<label class="side-pick">Side by side with
      <select data-action="pickOther"><option value="">Nothing</option>${b.days.map((d, di) => (di === day ? '' : `<option value="${di}" ${di === other ? 'selected' : ''}>${esc(d.name || `Day ${di + 1}`)}</option>`)).join('')}</select></label>` : ''}
    <div class="day-cols ${other != null ? 'two' : ''}">${b.days.length ? [day, other].filter((di) => di != null).map(dayCard).join('') : '<p class="empty">No days yet. Tap "+ Day".</p>'}</div>
    <a class="btn wide" href="#/coach/assign?block=${b.id}">Assign this block</a>`;

  // Typing in a field only saves and refreshes the totals; a full redraw would
  // swallow the next tap. Structural changes (add/move/remove) redraw, keeping focus.
  const refreshTotals = () => {
    const t = totals();
    const wt = $('#week-tot', root); if (wt) wt.innerHTML = weekLine(t.wk);
    root.querySelectorAll('.day-tot').forEach((el) => { el.textContent = dayLine(t.days[el.dataset.di]); });
  };
  const save = (rerender = true) => {
    store.put('blocks', b);
    if (!rerender) { refreshTotals(); return; }
    const scrollY = window.scrollY;
    blockEditor(root, { id }, query);
    window.scrollTo(0, scrollY);
  };
  // Change which days are shown without a page jump.
  const view = (changes) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(changes)) { if (v == null) q.delete(k); else q.set(k, v); }
    history.replaceState(null, '', `#/coach/block/${id}?${q}`);
    blockEditor(root, { id }, q);
  };
  const itemOf = (el) => { const r = el.closest('.item'); return { di: Number(r.dataset.di), ii: Number(r.dataset.ii) }; };
  const num = (v) => (v === '' ? null : Number(v));

  bindActions(root, {
    blockName: (el) => { b.name = el.value; save(false); },
    weeks: (el) => { b.weeks = Math.max(1, Number(el.value) || 1); if (b.deloadWeek >= b.weeks) b.deloadWeek = null; save(); },
    deload: (el) => { b.deloadWeek = el.value === '' ? null : Number(el.value); save(); },
    previewWeek: (el) => view({ w: el.value }),
    pickDay: (el) => { const di = Number(el.dataset.di); view({ day: di, with: di === other ? day : other }); },
    pickOther: (el) => view({ with: el.value || null }),
    dayName: (el) => {
      b.days[el.dataset.di].name = el.value;
      const tab = root.querySelector(`.day-tab[data-di="${el.dataset.di}"]`); if (tab) tab.textContent = el.value || `Day ${Number(el.dataset.di) + 1}`;
      save(false);
    },
    dayCopy: (el) => {
      const di = Number(el.dataset.di);
      const d = structuredClone(b.days[di]); d.name += ' (copy)'; b.days.splice(di + 1, 0, d);
      store.put('blocks', b); view({ day: di + 1, with: null });
    },
    dayDel: async (el) => {
      if (!await ask(`"${b.days[el.dataset.di].name}" and its exercises are removed from this block.`, { title: 'Delete this day?', ok: 'Delete day', danger: true })) return;
      b.days.splice(el.dataset.di, 1);
      store.put('blocks', b); view({ day: Math.max(0, Math.min(day, b.days.length - 1)), with: null });
    },
    addDay: () => { b.days.push({ name: `Day ${b.days.length + 1}`, items: [] }); store.put('blocks', b); view({ day: b.days.length - 1 }); },
    itemField: (el) => {
      const { di, ii } = itemOf(el);
      const k = el.dataset.k;
      const it = b.days[di].items[ii];
      if (['note', 'tempo', 'group', 'maxFrom'].includes(k)) it[k] = el.value.trim() || undefined;
      else if (k === 'weight') it[k] = store.readW(num(el.value), it.unit);
      else it[k] = num(el.value);
      save(false);
    },
    loadType: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      delete it.pct; delete it.weight;
      if (el.value === 'pct') it.pct = 70;
      const kg = it.unit === 'kg';
      if (el.value === 'weight') it.weight = kg ? store.readW(20, 'kg') : 45;
      // Keep the weekly rule meaningful for the new load type.
      const pt = it.progression?.type;
      if (el.value === 'weight' && pt === 'add_pct') it.progression = { type: 'add_weight', step: kg ? store.readW(2.5, 'kg') : 5 };
      if (el.value === 'pct' && pt === 'add_weight') it.progression = { type: 'add_pct', step: 2.5 };
      if (el.value === 'none' && (pt === 'add_pct' || pt === 'add_weight')) it.progression = undefined;
      save();
    },
    progType: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      const defaults = { add_pct: 2.5, add_weight: it.unit === 'kg' ? store.readW(2.5, 'kg') : 5, add_reps: 1, add_secs: 5 };
      it.progression = el.value === 'none' ? undefined : { type: el.value, step: defaults[el.value] };
      save();
    },
    progStep: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      const prog = it.progression;
      prog.step = prog.type === 'add_weight' ? store.readW(num(el.value), it.unit) : num(el.value);
      save(false);
    },
    step: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      const k = el.dataset.k;
      it[k] = Math.max(k === 'sets' ? 1 : 0, (it[k] || 0) + Number(el.dataset.d));
      // Update the box in place; a full redraw would lose the next quick tap.
      el.parentElement.querySelector('input').value = it[k];
      save(false);
    },
    measure: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      const v = el.dataset.v;
      if (v === 'reps') delete it.measure; else it.measure = v;
      if (v === 'time' && it.secs == null) it.secs = 30;
      if (v === 'breaths' && it.reps == null) it.reps = 5;
      if (!isCount(v) && it.reps == null) delete it.reps;
      // Breathing drills carry no load.
      if (v === 'breaths') { delete it.pct; delete it.weight; delete it.maxFrom; }
      // A weekly rule only makes sense for the measure it was written for.
      const pt = it.progression?.type;
      if ((pt === 'add_reps' && !isCount(v)) || (pt === 'add_secs' && v !== 'time') || v === 'none'
        || (v === 'breaths' && ['add_pct', 'add_weight'].includes(pt))) it.progression = undefined;
      save();
    },
    itemPick: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      pickExerciseSheet((exId) => {
        it.exerciseId = exId;
        if (!store.get('exercises', exId)?.loaded) {
          delete it.pct; delete it.weight; delete it.maxFrom;
          if (['add_pct', 'add_weight'].includes(it.progression?.type)) it.progression = undefined;
        }
        save();
      }, { allowNew: true });
    },
    itemAdd: (el) => {
      const di = Number(el.dataset.di);
      const warm = Boolean(el.dataset.warm);
      pickExerciseSheet((exId) => {
        const a = b.days[di].items;
        // Warmup exercises stay together at the top of the day.
        const at = warm ? a.filter((x) => x.warmup).length : a.length;
        a.splice(at, 0, warm ? { exerciseId: exId, warmup: true, sets: 1, reps: 10 } : { exerciseId: exId, sets: 3, reps: 8 });
        save();
        root.querySelector(`.item[data-di="${di}"][data-ii="${at}"]`)?.scrollIntoView({ block: 'center' });
      }, { allowNew: true });
    },
    itemUnit: (el) => { const { di, ii } = itemOf(el); b.days[di].items[ii].unit = el.dataset.v; save(); },
    warmLoad: async (el) => {
      const di = Number(el.dataset.di);
      const w = store.get('blocks', el.value);
      if (!w) return;
      const hasWarm = (d) => d.items.some((x) => x.warmup);
      if (hasWarm(b.days[di]) && !await ask(`This day already has a warmup. Swap it for "${w.name}"?`, { title: 'Replace warmup?', ok: 'Replace' })) { el.value = ''; return; }
      const load = (d) => { d.items = [...w.days[0].items.map((x) => ({ ...structuredClone(x), warmup: true })), ...d.items.filter((x) => !x.warmup)]; };
      load(b.days[di]);
      if (b.days.length > 1 && await ask(`Use "${w.name}" on the other ${b.days.length - 1} day(s) too?`, { title: 'Every day?', ok: 'Use on every day', cancel: 'Just this day' })) b.days.forEach(load);
      save();
      toast(`Loaded "${w.name}"`);
    },
    warmSave: async (el) => {
      const f = await askFields('Save warmup', [{ k: 'name', label: 'Name', value: `${b.name} warmup` }]);
      if (!f) return;
      const name = f.name;
      const items = structuredClone(b.days[el.dataset.di].items.filter((x) => x.warmup));
      store.put('blocks', { id: store.uid('block'), kind: 'warmup', name: name.trim(), weeks: 1, deloadWeek: null, days: [{ name: 'Warmup', items }] });
      save();
      toast(`Saved "${name.trim()}" to your warmups`);
    },
    warmCopy: async (el) => {
      const di = Number(el.dataset.di);
      const warm = b.days[di].items.filter((x) => x.warmup);
      if (!await ask(`The warmup on the other ${b.days.length - 1} day(s) is replaced with this one.`, { title: 'Copy warmup?', ok: 'Copy to every day' })) return;
      b.days.forEach((d, i) => { if (i !== di) d.items = [...structuredClone(warm), ...d.items.filter((x) => !x.warmup)]; });
      save();
      toast('Warmup copied to every day');
    },
    // Moves stay inside the item's own section (warmup or workout).
    itemUp: (el) => { const { di, ii } = itemOf(el); const a = b.days[di].items; if (ii > 0 && !a[ii - 1].warmup === !a[ii].warmup) { [a[ii - 1], a[ii]] = [a[ii], a[ii - 1]]; save(); } },
    itemDown: (el) => { const { di, ii } = itemOf(el); const a = b.days[di].items; if (ii < a.length - 1 && !a[ii + 1].warmup === !a[ii].warmup) { [a[ii + 1], a[ii]] = [a[ii], a[ii + 1]]; save(); } },
    itemDel: (el) => { const { di, ii } = itemOf(el); b.days[di].items.splice(ii, 1); save(); },
    quickAdd: (el) => {
      const di = Number(el.dataset.di);
      const ta = root.querySelector(`textarea[data-di="${di}"]`);
      const bad = [];
      for (const line of ta.value.split('\n').filter((l) => l.trim())) {
        const q = parseQuickEntry(line);
        if (!q) { bad.push(line); continue; }
        let x = findExercise(q.name);
        if (!x) {
          x = store.put('exercises', { id: store.uid('ex'), name: q.name, pattern: 'other', body: 'full', loaded: q.pct != null || q.weight != null, alts: [] });
          toast(`Added "${q.name}" to the library. Set its movement type there.`);
        }
        const item = { exerciseId: x.id, sets: q.sets, reps: q.reps };
        for (const k of ['pct', 'rpe', 'progression']) if (q[k] != null) item[k] = q[k];
        // Typed weights are in this device's unit unless the line says lb or kg.
        item.unit = q.progUnit || store.unit();
        if (q.weight != null) item.weight = store.readW(q.weight, item.unit);
        if (q.progression?.type === 'add_weight') item.progression.step = fromUnit(q.progression.step, item.unit);
        b.days[di].items.push(item);
      }
      save();
      if (bad.length) toast(`Couldn't read: ${bad.join('; ')}. Use "Name 3x5 @80%".`);
    },
  });
}

// ---------- assign ----------

export function assign(root, _p, query) {
  const all = store.all('blocks').sort((x, y) => x.name.localeCompare(y.name));
  const programs = all.filter((b) => !isWarmup(b)), warmups = all.filter(isWarmup);
  const athletes = store.all('athletes').sort((a, b) => a.name.localeCompare(b.name));
  const groups = [...new Set(athletes.map((a) => a.group).filter(Boolean))];
  const pre = query.get('athlete');
  const blockId = query.get('block') || programs[0]?.id || warmups[0]?.id;
  const block = store.get('blocks', blockId);
  if (!block) {
    root.innerHTML = '<header class="page-head"><h1>Assign a program</h1></header><div class="empty"><p>Build a block first, then assign it here.</p><a class="btn" href="#/coach/blocks">Go to programs</a></div>';
    return;
  }
  const warm = isWarmup(block);
  // Default to this week so the program shows up for athletes right away.
  const startMon = weekStart(today());
  // A warmup runs on any days the coach picks; default to the athlete's program days.
  const preDays = pre && store.assignmentsFor(pre).find((g) => !isWarmup(store.get('blocks', g.blockId) || {}))?.weekdays;
  const wd = warm ? (preDays || defaultWeekdays(3)) : defaultWeekdays(block.days.length);
  const opt = (b) => `<option value="${b.id}" ${b.id === blockId ? 'selected' : ''}>${esc(b.name)}</option>`;
  root.innerHTML = `
    <header class="page-head"><h1>Assign ${warm ? 'a warmup' : 'a program'}</h1></header>
    <section class="card form ${warm ? 'warm-form' : ''}">
      <label class="field-row"><span>Block</span><select id="as-block" data-action="pickBlock">
        ${programs.length ? `<optgroup label="Programs">${programs.map(opt).join('')}</optgroup>` : ''}
        ${warmups.length ? `<optgroup label="Warmups">${warmups.map(opt).join('')}</optgroup>` : ''}</select></label>
      ${warm ? '<p class="muted small">The warmup shows up in front of the athlete\'s workout on the days you pick. On a day with no program it\'s the whole session.</p>' : ''}
      <label class="field-row"><span>Start date</span><input type="date" id="as-start" value="${startMon}"></label>
      ${warm ? '<label class="field-row"><span>End date (optional)</span><input type="date" id="as-end"></label>' : ''}
      <fieldset><legend>${warm ? 'Days to do it' : `Training days (${block.days.length} per week, in order)`}</legend>
        <div class="row gap wrap">${WEEKDAYS.map((d, i) => `<label class="check-chip"><input type="checkbox" name="wd" value="${i}" ${wd.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></fieldset>
      <fieldset><legend>Athletes</legend>
        <div class="row gap wrap">${groups.map((g) => `<button class="chip" data-action="pickGroup" data-g="${esc(g)}">All ${esc(g)}</button>`).join('')}<button class="chip" data-action="pickAll">Everyone</button></div>
        <div class="checks">${athletes.map((a) => `<label class="check-row"><input type="checkbox" name="ath" value="${a.id}" data-g="${esc(a.group || '')}" ${a.id === pre ? 'checked' : ''}> ${esc(a.name)} <small class="muted">${esc(a.group || '')}</small></label>`).join('')}</div></fieldset>
      <button class="btn wide" data-action="go">Assign</button>
    </section>`;
  bindActions(root, {
    pickBlock: (el) => { location.hash = `#/coach/assign?block=${el.value}${pre ? `&athlete=${pre}` : ''}`; },
    pickGroup: (el) => { root.querySelectorAll('input[name=ath]').forEach((c) => { if (c.dataset.g === el.dataset.g) c.checked = true; }); },
    pickAll: () => { root.querySelectorAll('input[name=ath]').forEach((c) => { c.checked = true; }); },
    go: () => {
      const start = $('#as-start', root).value;
      const end = warm ? $('#as-end', root).value : '';
      const weekdays = [...root.querySelectorAll('input[name=wd]:checked')].map((c) => Number(c.value));
      const ids = [...root.querySelectorAll('input[name=ath]:checked')].map((c) => c.value);
      if (!ids.length) return toast('Pick at least one athlete');
      if (warm && !weekdays.length) return toast('Pick at least one day');
      if (!warm && weekdays.length !== block.days.length) return toast(`Pick exactly ${block.days.length} training days`);
      if (end && end < start) return toast('End date is before the start date');
      for (const athleteId of ids) {
        // One warmup at a time: a new warmup replaces the athlete's current one.
        if (warm) for (const g of store.assignmentsFor(athleteId)) if (isWarmup(store.get('blocks', g.blockId) || {})) store.del('assignments', g.id);
        store.put('assignments', { id: store.uid('asg'), athleteId, blockId: block.id, startDate: start, weekdays, ...(end ? { endDate: end } : {}) });
      }
      toast(`Assigned to ${ids.length} athlete${ids.length > 1 ? 's' : ''}`);
      location.hash = '#/coach';
    },
  });
}

// ---------- exercise library ----------

export function exercises(root, _p, query) {
  const editId = query.get('edit');
  const list = store.all('exercises').sort((a, b) => a.name.localeCompare(b.name));
  const x = editId ? (store.get('exercises', editId) || { id: '', name: '', pattern: 'other', body: 'full', loaded: true, alts: [] }) : null;
  const form = x ? `
    <section class="card form" id="ex-form">
      <h3>${x.id ? 'Edit' : 'New'} exercise</h3>
      <label class="field-row"><span>Name</span><input id="ex-name" value="${esc(x.name)}"></label>
      <label class="field-row"><span>Movement</span><select id="ex-pattern">${PATTERNS.map((p) => `<option value="${p}" ${x.pattern === p ? 'selected' : ''}>${PATTERN_LABEL[p]}</option>`).join('')}</select></label>
      <label class="field-row"><span>Body</span><select id="ex-body">${['lower', 'upper', 'full'].map((p) => `<option ${x.body === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="check-row"><input type="checkbox" id="ex-loaded" ${x.loaded ? 'checked' : ''}> Uses a weight (counts toward tonnage)</label>
      <label class="field-row"><span>Plyo contacts per rep</span><input type="number" min="0" id="ex-contacts" value="${x.contactsPerRep ?? ''}" placeholder="blank if not a plyo"></label>
      <label class="field-row"><span>Plyo intensity</span><select id="ex-tier"><option value="">–</option>${Object.entries(PLYO_TIERS).map(([k, v]) => `<option value="${k}" ${String(x.plyoTier) === k ? 'selected' : ''}>${k}: ${v}</option>`).join('')}</select></label>
      <label class="field-row"><span>Sprint meters per rep</span><input type="number" min="0" id="ex-meters" value="${x.metersPerRep ?? ''}"></label>
      <label class="field-row"><span>Video link</span><input type="url" id="ex-video" value="${esc(x.video || '')}" placeholder="https://"></label>
      <fieldset><legend>Swap options (same movement)</legend><div class="checks tall">${list.filter((e) => e.id !== x.id).map((e) => `<label class="check-row"><input type="checkbox" name="alt" value="${e.id}" ${x.alts?.includes(e.id) ? 'checked' : ''}> ${esc(e.name)}</label>`).join('')}</div></fieldset>
      <div class="row gap"><button class="btn" data-action="saveEx">Save</button><a class="btn ghost" href="#/coach/exercises">Cancel</a></div>
    </section>` : '';
  root.innerHTML = `
    <header class="page-head"><h1>Exercise library</h1><p class="muted">${list.length} exercises. Plyo contacts and movement type drive the weekly numbers.</p></header>
    ${form}
    <div class="row gap"><input type="search" class="search" id="ex-q" placeholder="Search" aria-label="Search exercises"><a class="btn" href="#/coach/exercises?edit=new">+ New</a></div>
    <div class="card"><table class="tbl"><thead><tr><th>Name</th><th>Movement</th><th>Contacts/rep</th><th>Swaps</th></tr></thead><tbody>
      ${list.map((e) => `<tr data-name="${esc(e.name.toLowerCase())}"><td><a href="#/coach/exercises?edit=${e.id}">${esc(e.name)}</a></td><td>${PATTERN_LABEL[e.pattern] || e.pattern}</td><td>${e.contactsPerRep ? `${e.contactsPerRep} (T${e.plyoTier})` : ''}</td><td>${e.alts?.length || 0}</td></tr>`).join('')}
    </tbody></table></div>`;
  const q = $('#ex-q', root);
  q.addEventListener('input', () => root.querySelectorAll('tr[data-name]').forEach((r) => { r.hidden = !r.dataset.name.includes(q.value.toLowerCase()); }));
  if (x) $('#ex-form', root).scrollIntoView({ block: 'start' });
  bindActions(root, {
    saveEx: () => {
      const v = (s) => $(s, root).value;
      const name = v('#ex-name').trim();
      if (!name) return toast('Give it a name');
      const obj = {
        ...x, id: x.id || store.uid('ex'), name, pattern: v('#ex-pattern'), body: v('#ex-body'),
        loaded: $('#ex-loaded', root).checked,
        contactsPerRep: v('#ex-contacts') ? Number(v('#ex-contacts')) : undefined,
        plyoTier: v('#ex-tier') ? Number(v('#ex-tier')) : undefined,
        metersPerRep: v('#ex-meters') ? Number(v('#ex-meters')) : undefined,
        video: v('#ex-video') || undefined,
        alts: [...root.querySelectorAll('input[name=alt]:checked')].map((c) => c.value),
      };
      store.put('exercises', obj);
      toast('Saved');
      location.hash = '#/coach/exercises';
    },
  });
}
