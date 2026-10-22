// Coach screens: team board, athlete detail, block builder, assigning, exercise library.

import * as store from './store.js';
import { toISO, addDays, weekStart, buildSession, sessionTotals, addTotals, emptyTotals, parseQuickEntry, defaultWeekdays, PATTERNS, PLYO_TIERS } from './calc.js';
import { weekSummary, loadTrend } from './summary.js';
import { esc, fmt, fmtDate, bindActions, toast, stat, PATTERN_LABEL, $ } from './ui.js';

const today = () => toISO(new Date());
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- team board ----------

export function board(root, _p, query) {
  const mon = weekStart(query.get('d') || today());
  const athletes = store.all('athletes').sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
  const u = store.settings().units;
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
      <td>${fmt(w.done.tonnage)}</td>
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
      ${stat('Team tonnage', team.tonnage, null, ` ${u}`)}
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
    addAthlete: () => {
      const name = prompt('Athlete name');
      if (!name) return;
      const group = prompt('Group (e.g. Pitchers)', '') || '';
      store.put('athletes', { id: store.uid('ath'), name: name.trim(), group, maxes: {} });
      board(root, _p, query);
    },
  });
}

// ---------- athlete detail ----------

export function athlete(root, { id }) {
  const a = store.get('athletes', id);
  if (!a) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const ex = store.exercisesById();
  const u = store.settings().units;
  const w = weekSummary(id, weekStart(today()));
  const logs = store.logsFor(id).filter((l) => l.finished).reverse().slice(0, 12);
  const loaded = store.all('exercises').filter((x) => x.loaded).sort((x, y) => x.name.localeCompare(y.name));
  const asg = store.assignmentsFor(id);
  root.innerHTML = `
    <header class="page-head"><h1>${esc(a.name)}</h1><p class="muted">${esc(a.group || '')}</p>
      <div class="row gap"><a class="chip" href="#/athlete/${id}">Open athlete view</a><a class="chip" href="#/athlete/${id}/week">Weekly numbers</a></div></header>
    <div class="stats">
      ${stat('Sessions', w.sessionsDone, null, ` / ${w.sessionsPlanned}`)}
      ${stat('Tonnage', w.done.tonnage, null, ` ${u}`)}
      ${stat('Plyo contacts', w.done.contacts)}
      ${stat('Session load', w.load, null, ' AU')}
    </div>
    <section class="card"><h3>Programs</h3>
      ${asg.map((g) => { const b = store.get('blocks', g.blockId); return `<div class="row between"><span><b>${esc(b?.name || '?')}</b><br><small class="muted">from ${fmtDate(g.startDate)} · ${(g.weekdays || []).map((d) => WEEKDAYS[d]).join(', ')}</small></span><button class="chip" data-action="unassign" data-id="${g.id}">Remove</button></div>`; }).join('') || '<p class="muted">No program assigned.</p>'}
      <a class="link" href="#/coach/assign?athlete=${id}">+ Assign a program</a>
    </section>
    <section class="card"><h3>Maxes (${u})</h3>
      <p class="muted small">Prescribed weights come from these. They also update when a logged set beats them.</p>
      <div class="max-grid">${Object.entries(a.maxes || {}).map(([k, v]) => `<label class="field-row"><span>${esc(ex[k]?.name || k)}</span><input type="number" inputmode="decimal" value="${v}" data-action="setMax" data-ex="${k}"></label>`).join('')}</div>
      <div class="row gap"><select data-action="noop" id="new-max-ex" aria-label="Exercise">${loaded.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
        <input type="number" id="new-max-val" placeholder="Max" inputmode="decimal" aria-label="Max"><button class="chip" data-action="addMax">Add</button></div>
    </section>
    <section class="card"><h3>Recent sessions and notes</h3>
      ${logs.map((l) => {
        const t = sessionTotals(l, ex, true);
        const swaps = l.entries.filter((e) => e.swappedFrom).map((e) => `${ex[e.swappedFrom]?.name} → ${ex[e.exerciseId]?.name}`);
        const notes = l.entries.filter((e) => e.athleteNote).map((e) => `${ex[e.exerciseId]?.name}: ${e.athleteNote}`);
        return `<div class="log-item"><div class="row between"><b>${esc(l.name)}</b><span class="muted">${fmtDate(l.date)}</span></div>
          <p class="muted small">RPE ${l.sessionRpe ?? '–'} · ${l.minutes ?? '–'} min · ${fmt(t.tonnage)} ${u} · ${fmt(t.contacts)} contacts${l.switchedFrom ? ' · switched day' : ''}</p>
          ${l.note ? `<p class="note">“${esc(l.note)}”</p>` : ''}
          ${notes.map((n) => `<p class="note small">${esc(n)}</p>`).join('')}
          ${swaps.length ? `<p class="small muted">Swaps: ${esc(swaps.join(', '))}</p>` : ''}</div>`;
      }).join('') || '<p class="muted">Nothing logged yet.</p>'}
    </section>`;
  bindActions(root, {
    setMax: (el) => { a.maxes[el.dataset.ex] = Number(el.value); store.put('athletes', a); toast('Max saved'); },
    addMax: () => {
      const exId = $('#new-max-ex', root).value, v = Number($('#new-max-val', root).value);
      if (!v) return;
      a.maxes = { ...a.maxes, [exId]: v }; store.put('athletes', a); athlete(root, { id });
    },
    unassign: (el) => { if (confirm('Remove this program from the athlete? Logged sessions stay.')) { store.del('assignments', el.dataset.id); athlete(root, { id }); } },
  });
}

// ---------- blocks ----------

export function blocks(root) {
  const list = store.all('blocks').sort((a, b) => a.name.localeCompare(b.name));
  root.innerHTML = `
    <header class="page-head"><h1>Programs and blocks</h1><p class="muted">Build a block once, then assign it to anyone.</p></header>
    ${list.map((b) => `<div class="card row between">
      <a href="#/coach/block/${b.id}"><b>${esc(b.name)}</b><br><small class="muted">${b.weeks} weeks · ${b.days.length} days/week${b.deloadWeek != null ? ` · deload week ${b.deloadWeek + 1}` : ''}</small></a>
      <div class="row gap"><button class="chip" data-action="dup" data-id="${b.id}">Copy</button><button class="chip" data-action="del" data-id="${b.id}">Delete</button></div></div>`).join('')}
    <button class="btn" data-action="new">+ New block</button>`;
  bindActions(root, {
    new: () => {
      const b = store.put('blocks', { id: store.uid('block'), name: 'New block', weeks: 4, deloadWeek: null, days: [{ name: 'Day 1', items: [] }] });
      location.hash = `#/coach/block/${b.id}`;
    },
    dup: (el) => {
      const b = structuredClone(store.get('blocks', el.dataset.id));
      b.id = store.uid('block'); b.name += ' (copy)';
      store.put('blocks', b); blocks(root);
    },
    del: (el) => {
      const used = store.all('assignments').some((a) => a.blockId === el.dataset.id);
      if (!confirm(used ? 'This block is assigned to athletes. Delete it anyway?' : 'Delete this block?')) return;
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

function itemRow(item, di, ii, ex) {
  const x = ex[item.exerciseId];
  const loadType = item.pct != null ? 'pct' : item.weight != null ? 'weight' : 'none';
  const prog = item.progression || { type: 'none' };
  const loadedEx = store.all('exercises').filter((e) => e.loaded).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="item" data-di="${di}" data-ii="${ii}">
    <div class="item-top">
      <b>${esc(x?.name || item.exerciseId)}</b>
      ${x?.contactsPerRep ? `<span class="pill">${x.contactsPerRep}c/rep · T${x.plyoTier}</span>` : ''}
      <span class="spacer"></span>
      <button class="icon-btn" data-action="itemUp" title="Move up" aria-label="Move up">↑</button>
      <button class="icon-btn" data-action="itemDown" title="Move down" aria-label="Move down">↓</button>
      <button class="icon-btn" data-action="itemDel" title="Remove" aria-label="Remove">✕</button>
    </div>
    <div class="item-fields">
      <label>Sets<input type="number" min="1" value="${item.sets}" data-action="itemField" data-k="sets"></label>
      <label>Reps<input type="number" min="0" value="${item.reps}" data-action="itemField" data-k="reps"></label>
      ${x?.loaded ? `<label>Load<select data-action="loadType"><option value="none" ${loadType === 'none' ? 'selected' : ''}>None</option><option value="pct" ${loadType === 'pct' ? 'selected' : ''}>% of max</option><option value="weight" ${loadType === 'weight' ? 'selected' : ''}>Fixed weight</option></select></label>
      ${loadType === 'pct' ? `<label>%<input type="number" step="0.5" value="${item.pct}" data-action="itemField" data-k="pct"></label>
        <label>Max from<select data-action="itemField" data-k="maxFrom"><option value="">${esc(x.name)}</option>${loadedEx.filter((e) => e.id !== item.exerciseId).map((e) => `<option value="${e.id}" ${item.maxFrom === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
      ${loadType === 'weight' ? `<label>${store.settings().units}<input type="number" step="any" value="${item.weight}" data-action="itemField" data-k="weight"></label>` : ''}` : ''}
      <label>RPE<input type="number" step="0.5" min="1" max="10" value="${item.rpe ?? ''}" data-action="itemField" data-k="rpe"></label>
      <label>Each week<select data-action="progType">
        <option value="none" ${prog.type === 'none' ? 'selected' : ''}>Same</option>
        ${x?.loaded ? `<option value="add_pct" ${prog.type === 'add_pct' ? 'selected' : ''}>+ % of max</option>
        <option value="add_weight" ${prog.type === 'add_weight' ? 'selected' : ''}>+ weight</option>` : ''}
        <option value="add_reps" ${prog.type === 'add_reps' ? 'selected' : ''}>+ reps</option></select></label>
      ${prog.type !== 'none' ? `<label>By<input type="number" step="0.5" value="${prog.step ?? ''}" data-action="progStep"></label>` : ''}
      <label>Superset<input type="text" maxlength="2" value="${esc(item.group || '')}" placeholder="A" data-action="itemField" data-k="group"></label>
    </div>
    <input class="item-note" type="text" placeholder="Coaching note (optional)" value="${esc(item.note || '')}" data-action="itemField" data-k="note">
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

  root.innerHTML = `
    <header class="page-head"><a class="link" href="#/coach/blocks">‹ All blocks</a>
      <input class="title-input" value="${esc(b.name)}" data-action="blockName" aria-label="Block name"></header>
    <section class="card row gap wrap">
      <label class="field-row"><span>Weeks</span><input type="number" min="1" max="52" value="${b.weeks}" data-action="weeks"></label>
      <label class="field-row"><span>Deload week</span><select data-action="deload"><option value="">None</option>${Array.from({ length: b.weeks }, (_, i) => `<option value="${i}" ${b.deloadWeek === i ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>
      <label class="field-row"><span>Preview week</span><select data-action="previewWeek">${Array.from({ length: b.weeks }, (_, i) => `<option value="${i}" ${week === i ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>
    </section>
    <p class="muted small">Write week 1. The "each week" rules fill in the later weeks; the deload week halves sets and drops load 10%. <span id="week-tot">${weekLine(weekTot)}</span></p>
    ${b.days.map((d, di) => `
      <section class="card day-card" data-di="${di}">
        <div class="row between gap">
          <input class="day-name" value="${esc(d.name)}" data-action="dayName" data-di="${di}" aria-label="Day name">
          <div class="row gap">
            <button class="chip" data-action="dayCopy" data-di="${di}">Copy day</button>
            <button class="chip" data-action="dayDel" data-di="${di}">Delete</button>
          </div>
        </div>
        <p class="muted small day-tot" data-di="${di}">${dayLine(dayTots[di])}</p>
        ${d.items.map((it, ii) => itemRow(it, di, ii, ex)).join('')}
        <div class="quick">
          <textarea rows="2" placeholder="Quick add, one per line:&#10;Back squat 4x5 @80% +2.5%/wk&#10;Box jump 3x5" data-di="${di}" aria-label="Quick add exercises"></textarea>
          <button class="chip" data-action="quickAdd" data-di="${di}">Add</button>
        </div>
      </section>`).join('')}
    <button class="btn ghost wide" data-action="addDay">+ Add day</button>
    <a class="btn wide" href="#/coach/assign?block=${b.id}">Assign this block</a>`;

  // Typing in a field only saves and refreshes the totals; a full redraw would
  // swallow the next tap. Structural changes (add/move/remove) redraw, keeping focus.
  const refreshTotals = () => {
    const t = totals();
    $('#week-tot', root).innerHTML = weekLine(t.wk);
    root.querySelectorAll('.day-tot').forEach((el) => { el.textContent = dayLine(t.days[el.dataset.di]); });
  };
  const save = (rerender = true) => {
    store.put('blocks', b);
    if (!rerender) { refreshTotals(); return; }
    const scrollY = window.scrollY;
    blockEditor(root, { id }, query);
    window.scrollTo(0, scrollY);
  };
  const itemOf = (el) => { const r = el.closest('.item'); return { di: Number(r.dataset.di), ii: Number(r.dataset.ii) }; };
  const num = (v) => (v === '' ? null : Number(v));

  bindActions(root, {
    blockName: (el) => { b.name = el.value; save(false); },
    weeks: (el) => { b.weeks = Math.max(1, Number(el.value) || 1); if (b.deloadWeek >= b.weeks) b.deloadWeek = null; save(); },
    deload: (el) => { b.deloadWeek = el.value === '' ? null : Number(el.value); save(); },
    previewWeek: (el) => { location.hash = `#/coach/block/${id}?w=${el.value}`; },
    dayName: (el) => { b.days[el.dataset.di].name = el.value; save(false); },
    dayCopy: (el) => { const d = structuredClone(b.days[el.dataset.di]); d.name += ' (copy)'; b.days.splice(Number(el.dataset.di) + 1, 0, d); save(); },
    dayDel: (el) => { if (confirm('Delete this day?')) { b.days.splice(el.dataset.di, 1); save(); } },
    addDay: () => { b.days.push({ name: `Day ${b.days.length + 1}`, items: [] }); save(); },
    itemField: (el) => {
      const { di, ii } = itemOf(el);
      const k = el.dataset.k;
      const it = b.days[di].items[ii];
      if (['note', 'group', 'maxFrom'].includes(k)) it[k] = el.value || undefined;
      else it[k] = num(el.value);
      save(false);
    },
    loadType: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      delete it.pct; delete it.weight;
      if (el.value === 'pct') it.pct = 70;
      if (el.value === 'weight') it.weight = 45;
      // Keep the weekly rule meaningful for the new load type.
      const pt = it.progression?.type;
      if (el.value === 'weight' && pt === 'add_pct') it.progression = { type: 'add_weight', step: 5 };
      if (el.value === 'pct' && pt === 'add_weight') it.progression = { type: 'add_pct', step: 2.5 };
      if (el.value === 'none' && (pt === 'add_pct' || pt === 'add_weight')) it.progression = undefined;
      save();
    },
    progType: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      const defaults = { add_pct: 2.5, add_weight: 5, add_reps: 1 };
      it.progression = el.value === 'none' ? undefined : { type: el.value, step: defaults[el.value] };
      save();
    },
    progStep: (el) => { const { di, ii } = itemOf(el); b.days[di].items[ii].progression.step = num(el.value); save(false); },
    itemUp: (el) => { const { di, ii } = itemOf(el); if (ii > 0) { const a = b.days[di].items; [a[ii - 1], a[ii]] = [a[ii], a[ii - 1]]; save(); } },
    itemDown: (el) => { const { di, ii } = itemOf(el); const a = b.days[di].items; if (ii < a.length - 1) { [a[ii + 1], a[ii]] = [a[ii], a[ii + 1]]; save(); } },
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
        for (const k of ['pct', 'weight', 'rpe', 'progression']) if (q[k] != null) item[k] = q[k];
        b.days[di].items.push(item);
      }
      save();
      if (bad.length) toast(`Couldn't read: ${bad.join('; ')}. Use "Name 3x5 @80%".`);
    },
  });
}

// ---------- assign ----------

export function assign(root, _p, query) {
  const blocksList = store.all('blocks');
  const athletes = store.all('athletes').sort((a, b) => a.name.localeCompare(b.name));
  const groups = [...new Set(athletes.map((a) => a.group).filter(Boolean))];
  const pre = query.get('athlete');
  const blockId = query.get('block') || blocksList[0]?.id;
  const block = store.get('blocks', blockId);
  if (!block) {
    root.innerHTML = '<header class="page-head"><h1>Assign a program</h1></header><div class="empty"><p>Build a block first, then assign it here.</p><a class="btn" href="#/coach/blocks">Go to programs</a></div>';
    return;
  }
  // Default to this week so the program shows up for athletes right away.
  const startMon = weekStart(today());
  const wd = defaultWeekdays(block.days.length);
  root.innerHTML = `
    <header class="page-head"><h1>Assign a program</h1></header>
    <section class="card form">
      <label class="field-row"><span>Block</span><select id="as-block" data-action="pickBlock">${blocksList.map((b) => `<option value="${b.id}" ${b.id === blockId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <label class="field-row"><span>Start date</span><input type="date" id="as-start" value="${startMon}"></label>
      <fieldset><legend>Training days (${block.days.length} per week, in order)</legend>
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
      const blk = $('#as-block', root).value;
      const start = $('#as-start', root).value;
      const weekdays = [...root.querySelectorAll('input[name=wd]:checked')].map((c) => Number(c.value));
      const ids = [...root.querySelectorAll('input[name=ath]:checked')].map((c) => c.value);
      const nDays = store.get('blocks', blk).days.length;
      if (!ids.length) return toast('Pick at least one athlete');
      if (weekdays.length !== nDays) return toast(`Pick exactly ${nDays} training days`);
      for (const athleteId of ids) store.put('assignments', { id: store.uid('asg'), athleteId, blockId: blk, startDate: start, weekdays });
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
