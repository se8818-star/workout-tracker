// Coach edit mode on an athlete's workout page. A coach (or a helper coach
// looking at an athlete they coach) can change everything about the day right
// where the athlete does it: swap, add, remove and reorder exercises, sets,
// reps, seconds, load, target RPE, tempo, notes, how it's logged and
// supersets. Every change is saved to the athlete's own program (a copy is
// made first when others share it, or when it's the head coach's program and
// a helper coach is editing). After a change the coach picks "Just week N" or
// "Rest of the program" (plan.js).
//
// The coach's device never writes the athlete's log here: only the program
// changes. The athlete's workout picks the change up when it's opened
// (store.refreshLog): sets already logged stay exactly as logged.

import * as store from './store.js';
import { parseReps, repsText, untouchedLog, RPE_STEPS } from './calc.js';
import { esc, progTag, bindActions, toast, choose, sheet, closeSheet, ask } from './ui.js';
import { changeItem, removeItem, restoreItem, addItem, moveItem, setItemMeasure, setItemLoad, setItemGroup, weekView } from './plan.js';
import { ownBlock, planNums } from './coach.js';
import { pickExerciseSheet } from './athlete.js';

const LOG_AS = [['reps', 'Reps'], ['time', 'Time'], ['breaths', 'Breaths'], ['none', 'Check off']];
const MEASURE_WORD = { time: 'Timed', breaths: 'Breaths', none: 'Check off' };

// The athlete's program behind a workout, when the coach can change it from
// here: the log's assignment still exists and still points at the program
// the log came from (or the athlete's own copy of it). Finished workouts are
// history, so they aren't edited here.
export function editTarget(log) {
  if (!log || log.finished || !log.assignmentId) return null;
  const g = store.get('assignments', log.assignmentId);
  const b = g && store.get('blocks', g.blockId);
  const a = store.get('athletes', log.athleteId);
  if (!g || !b || !a || !b.days[log.dayIndex]) return null;
  if (b.id !== log.blockId && b.copiedFrom !== log.blockId) return null;
  return { g, b, a, week: Math.max(0, Math.min(b.weeks - 1, log.week || 0)), day: log.dayIndex };
}

// The day's exercises as the athlete gets them this week, with buttons.
// `toggle` is the "Edit | Athlete's view" switch from the workout page,
// `rerender` draws the page again after a change.
export function editView(log, { warm, toggle, backTo, backLabel }) {
  const t = editTarget(log);
  const { g, b, a, week, day } = t;
  const first = a.name.split(' ')[0];
  const ex = store.exercisesById();
  const others = store.all('assignments').filter((x) => x.blockId === b.id && x.id !== g.id).map((x) => store.get('athletes', x.athleteId)?.name).filter(Boolean);
  const items = b.days[day].items.map((it, ii) => ({ it, ii }));
  const unitOf = (it) => it.unit || store.unit();
  const counter = { warm: 0, main: 0 };
  const card = ({ it, ii }) => {
    const v = weekView(it, b, week);
    const x = ex[v.exerciseId];
    const label = v.off ? '–' : it.group ? `${it.group}` : String(++counter[it.warmup || warm ? 'warm' : 'main']);
    const tags = [];
    if (!v.off) {
      if (MEASURE_WORD[v.measure]) tags.push(MEASURE_WORD[v.measure]);
      if (v.tempo) tags.push(`Tempo ${v.tempo}`);
      if (v.rpe !== '' && v.measure !== 'none') tags.push(`Target RPE ${v.rpe}`);
      if (it.group) tags.push(`Superset ${it.group}`);
    }
    return `<div class="card plan-item ce-item ${v.off ? 'off' : ''}" data-ii="${ii}">
      <span class="item-n">${esc(label)}</span>
      <button class="ce-main" data-action="${v.off ? 'putBack' : 'edit'}" aria-label="${v.off ? 'Put back' : 'Change'} ${esc(x?.name || v.exerciseId)}">
        <h3>${esc(x?.name || v.exerciseId)}</h3>
        <p class="plan-nums">${v.off ? `Not in week ${week + 1}` : esc(planNums(v, unitOf(it)))}</p>
        ${tags.length ? `<p class="ce-tags">${esc(tags.join(' · '))}</p>` : ''}
        ${!v.off && v.note ? `<p class="ce-note">${esc(v.note)}</p>` : ''}</button>
      <div class="plan-acts ce-acts">${v.off ? '<button class="chip" data-action="putBack">Put back</button>'
        : `<button class="chip" data-action="edit">Change</button>
          <span class="ce-move"><button class="icon-btn" data-action="up" aria-label="Move up">↑</button><button class="icon-btn" data-action="down" aria-label="Move down">↓</button></span>
          <button class="chip ce-remove" data-action="remove">Remove</button>`}</div></div>`;
  };
  const warmItems = warm ? [] : items.filter(({ it }) => it.warmup);
  const mainItems = warm ? items : items.filter(({ it }) => !it.warmup);
  const started = !untouchedLog(log);
  const html = `
    <div class="session-bar">
      <div class="sb-row"><a class="back" href="${backTo}">${esc(backLabel)}</a>${toggle}</div>
      <div class="sb-row"><span class="sb-title">${esc(warm ? 'Warmup' : b.days[day].name || log.name)}</span><span class="sb-count">Editing</span></div>
    </div>
    <p class="kicker">${warm ? esc(b.name) : progTag(b.name, store.programColor(g), week)}</p>
    <p class="coach-peek ce-peek"><b>Edit mode</b> Tap any exercise to change it. Changes save to ${esc(first)}'s program${warm ? '' : `, and you pick just week ${week + 1} or the rest of the program`}.
      ${others.length ? `${esc(others.join(', '))} ${others.length > 1 ? 'are' : 'is'} on it too, so your first change makes a copy just for ${esc(first)}.`
        : !store.canEditBlock(b) ? `It's the head coach's ${warm ? 'warmup' : 'program'}, so your first change makes a copy just for ${esc(first)}.` : ''}
      ${started ? `${esc(first)} has started this workout: sets already logged stay as they are.` : ''}</p>
    ${warmItems.length ? `<h2 class="sec-head warm-head">Warmup</h2>${warmItems.map(card).join('')}<h2 class="sec-head">Workout</h2>` : ''}
    ${mainItems.map(card).join('') || '<p class="muted">No exercises on this day yet.</p>'}
    <button class="btn ghost wide" data-action="add">+ Add an exercise</button>
    <p class="muted small ce-links">${warm ? '' : `More: <a class="link" href="#/coach/assignment/${g.id}/plan?w=${week}&day=${day}">every day and week</a> · `}<a class="link" href="#/coach/assignment/${g.id}">schedule</a> · <a class="link" href="#/coach/block/${b.id}?w=${week}&day=${day}">full program editor</a></p>`;
  return html;
}

// The handlers for editView. `redraw` draws the page again.
export function editActions(log, { warm, redraw }) {
  const iiOf = (el) => Number(el.closest('[data-ii]').dataset.ii);
  const exName = (exId) => store.get('exercises', exId)?.name || exId;
  // Fresh every time: a change before may have made the athlete a copy.
  const target = () => editTarget(log);

  // Saves `steps` (functions block -> block) to the athlete's program.
  // `scoped` steps get "Just week N / Rest of the program"; `whole` ones
  // apply to every week.
  const apply = async (what, { whole = [], scoped = null }) => {
    const t = target();
    if (!t) return;
    const { g, b, a, week } = t;
    const first = a.name.split(' ')[0];
    let scope = 'rest';
    if (scoped && week < b.weeks - 1 && !warm) {
      const others = store.all('assignments').filter((x) => x.blockId === b.id && x.id !== g.id).map((x) => store.get('athletes', x.athleteId)?.name).filter(Boolean);
      scope = await choose('How long should this last?', `${what}${others.length ? ` Only ${first} gets this; ${others.join(', ')} stay${others.length > 1 ? '' : 's'} on the original.` : ''}`, [
        { v: 'week', label: `Just week ${week + 1}`, sub: `Week ${week + 2} on stays as it was` },
        { v: 'rest', label: 'Rest of the program', sub: `Weeks ${week + 1} to ${b.weeks}` },
      ]);
      if (!scope) return;
    }
    const mine = ownBlock(g, b, a);
    let next = mine;
    for (const fn of whole) next = fn(next);
    if (scoped) next = scoped(next, scope);
    store.put('blocks', next);
    const copy = mine.id !== b.id ? `, in ${first}'s own copy` : '';
    toast(scoped && !warm && b.weeks > 1 ? `${scope === 'week' ? `Changed for week ${week + 1}` : `Changed from week ${week + 1} on`}${copy}` : `Saved to ${first}'s ${warm ? 'warmup' : 'program'}${copy}`);
    redraw();
  };

  return {
    edit: (el) => {
      const t = target(); if (!t) return;
      const ii = iiOf(el), it = t.b.days[t.day].items[ii];
      editSheet(it, weekView(it, t.b, t.week), { warm, okLabel: 'Save' }, (out) => {
        const { day, week } = t;
        const v = weekView(it, t.b, week);
        const whole = [], bits = [];
        if (out.measure !== v.measure) { whole.push((blk) => setItemMeasure(blk, day, ii, out.measure)); bits.push(`Logged as ${LOG_AS.find((x) => x[0] === out.measure)[1].toLowerCase()}`); }
        const kind = it.pct != null ? 'pct' : it.weight != null ? 'weight' : 'none';
        // Breathing drills and check-offs carry no load (setItemMeasure clears it).
        const noLoad = out.measure === 'none' || out.measure === 'breaths';
        const loadNow = noLoad ? 'none' : out.load;
        if (!noLoad && loadNow !== kind) {
          whole.push((blk) => setItemLoad(blk, day, ii, loadNow, loadNow === 'pct' ? out.pct : loadNow === 'weight' ? out.weight : null));
          bits.push(loadNow === 'none' ? 'No load' : loadNow === 'pct' ? `${out.pct ?? 70}% of max` : 'Fixed weight');
        }
        if ((out.group || '') !== (it.group || '')) { whole.push((blk) => setItemGroup(blk, day, ii, out.group)); bits.push(out.group ? `Superset ${out.group.toUpperCase()}` : 'Out of the superset'); }
        // The numbers and words that can differ week to week, compared with
        // what the week shows once the every-week changes are in.
        const after = whole.reduce((blk, fn) => fn(blk), t.b);
        const v2 = weekView(after.days[day].items[ii], after, week);
        const change = {};
        for (const k of ['exerciseId', 'sets', 'secs', 'note', 'tempo', 'rpe']) if (out[k] !== undefined && out[k] !== v2[k]) change[k] = out[k];
        if (loadNow === kind) for (const k of ['pct', 'weight']) if (out[k] != null && v2[k] != null && out[k] !== v2[k]) change[k] = out[k];
        if (out.reps && (out.reps.reps !== v2.reps || (out.reps.repsTo ?? null) !== (v2.repsTo ?? null))) change.reps = out.reps;
        if (change.exerciseId) bits.unshift(`${exName(v.exerciseId)} → ${exName(change.exerciseId)}`);
        if (['sets', 'reps', 'secs', 'pct', 'weight'].some((k) => k in change)) bits.push(planNums({ ...v2, ...change, ...(change.reps || {}) }, it.unit || store.unit()));
        if ('note' in change) bits.push(change.note ? 'New note' : 'Note removed');
        if ('tempo' in change) bits.push(change.tempo ? `Tempo ${change.tempo}` : 'No tempo');
        if ('rpe' in change) bits.push(change.rpe !== '' ? `Target RPE ${change.rpe}` : 'No target RPE');
        if (!whole.length && !Object.keys(change).length) return toast('Nothing changed');
        const scoped = Object.keys(change).length ? (blk, scope) => changeItem(blk, day, ii, week, change, scope) : null;
        const tail = whole.length && scoped ? ' (how it\'s logged, the load type and supersets change every week)' : '';
        apply(`${bits.join('. ')}.${tail}`, { whole, scoped });
      });
    },
    remove: async (el) => {
      const t = target(); if (!t) return;
      const ii = iiOf(el), name = exName(weekView(t.b.days[t.day].items[ii], t.b, t.week).exerciseId);
      if (warm || t.b.weeks < 2 || t.week === t.b.weeks - 1) {
        if (!await ask(`${name} comes out of ${t.a.name.split(' ')[0]}'s ${warm ? 'warmup' : 'program'}.`, { title: 'Remove exercise?', ok: 'Remove', danger: true })) return;
      }
      apply(`Take out ${name}.`, { scoped: (blk, scope) => removeItem(blk, t.day, ii, t.week, scope) });
    },
    putBack: (el) => {
      const t = target(); if (!t) return;
      const ii = iiOf(el);
      apply(`Put ${exName(weekView(t.b.days[t.day].items[ii], t.b, t.week).exerciseId)} back in.`, { scoped: (blk, scope) => restoreItem(blk, t.day, ii, t.week, scope) });
    },
    up: (el) => { const t = target(); if (t) apply('', { whole: [(blk) => moveItem(blk, t.day, iiOf(el), -1)] }); },
    down: (el) => { const t = target(); if (t) apply('', { whole: [(blk) => moveItem(blk, t.day, iiOf(el), 1)] }); },
    add: () => pickExerciseSheet((exId) => {
      const t = target(); if (!t) return;
      const x = store.get('exercises', exId);
      const m = x?.measure || 'reps';
      const it = { exerciseId: exId, ...(warm ? { sets: 1 } : { sets: 3 }), unit: store.unit() };
      if (m === 'time') { it.measure = 'time'; it.secs = 30; } else if (m === 'none') it.measure = 'none';
      else { it.reps = warm ? 10 : 8; if (m === 'breaths') { it.measure = 'breaths'; it.reps = 5; } }
      const v = weekView(it, { ...t.b, deloadWeek: null }, 0);
      editSheet(it, v, { warm, okLabel: 'Add', adding: true }, (out) => {
        let item = { ...it, exerciseId: out.exerciseId };
        item = setItemMeasure({ weeks: 1, days: [{ items: [item] }] }, 0, 0, out.measure).days[0].items[0];
        if (out.sets != null) item.sets = out.sets;
        if (out.secs != null) item.secs = out.secs;
        if (out.reps) { item.reps = out.reps.reps; if (out.reps.repsTo != null) item.repsTo = out.reps.repsTo; else delete item.repsTo; }
        if (out.measure !== 'none' && out.measure !== 'breaths') {
          if (out.load === 'pct') item.pct = out.pct ?? 70;
          if (out.load === 'weight') item.weight = out.weight ?? 0;
        }
        for (const k of ['note', 'tempo']) if (out[k]) item[k] = out[k];
        if (out.rpe !== '' && out.rpe != null) item.rpe = out.rpe;
        if (out.group) item.group = out.group.toUpperCase();
        if (warm) item.warmup = true;
        apply(`Add ${exName(out.exerciseId)}.`, { scoped: (blk, scope) => addItem(blk, t.day, item, t.week, scope) });
      });
    }, { allowNew: true }),
  };
}

// One exercise, everything about it: swap, how it's logged, sets and reps
// (or seconds), load, target RPE, tempo, superset and note. done(values).
function editSheet(item, v, opts, done, state = null) {
  const iu = item.unit || store.unit();
  const s = state || {
    exerciseId: v.exerciseId, measure: v.measure, sets: v.sets ?? item.sets ?? 1, reps: repsText(v.reps, v.repsTo, '-'), secs: v.secs ?? item.secs ?? 30,
    load: item.pct != null ? 'pct' : item.weight != null ? 'weight' : 'none',
    pct: v.pct ?? item.pct ?? 70, weight: v.weight ?? item.weight ?? null,
    rpe: v.rpe ?? '', tempo: v.tempo || '', note: v.note || '', group: item.group || '',
  };
  const m = s.measure;
  const noLoad = m === 'none' || m === 'breaths';
  const num = (label, k, val, step, min) => `<div class="stepper"><span>${label}</span><div class="stepper-row">
    <button class="step-btn" type="button" data-step="${k}" data-d="${-step}" aria-label="Less ${label.toLowerCase()}">−</button>
    <input type="number" inputmode="decimal" min="${min}" step="any" name="${k}" value="${val ?? ''}" aria-label="${label}">
    <button class="step-btn" type="button" data-step="${k}" data-d="${step}" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
  const seg = (name, list, on) => `<div class="seg" role="group" aria-label="${name}">${list.map(([val, label]) => `<button type="button" class="${on === val ? 'on' : ''}" data-seg="${name}" data-v="${val}" aria-pressed="${on === val}">${label}</button>`).join('')}</div>`;
  const html = `<form class="plan-fields ce-fields">
    <div class="plan-ex"><b>${esc(store.get('exercises', s.exerciseId)?.name || s.exerciseId)}</b><button type="button" class="chip" data-swap>Swap exercise</button></div>
    <div><p class="sheet-label">Logged as</p>${seg('measure', LOG_AS, m)}</div>
    ${m === 'none' ? '<p class="muted small">No sets or reps. The athlete just checks it off.</p>' : `<div class="item-main">
      ${num('Sets', 'sets', s.sets, 1, 1)}<span class="times" aria-hidden="true">×</span>
      ${m === 'time' ? num('Seconds', 'secs', s.secs, 5, 0) : `<div class="stepper reps-stepper"><span>${m === 'breaths' ? 'Breaths' : 'Reps'}</span><div class="stepper-row">
        <button class="step-btn" type="button" data-step="reps" data-d="-1" aria-label="Fewer">−</button>
        <input type="text" name="reps" autocomplete="off" placeholder="10-15" value="${esc(s.reps)}" aria-label="Reps, one number or a range like 10-15">
        <button class="step-btn" type="button" data-step="reps" data-d="1" aria-label="More">+</button></div></div>`}</div>`}
    ${noLoad ? '' : `<div><p class="sheet-label">Load</p>${seg('load', [['none', 'None'], ['weight', 'Weight'], ['pct', '% of max']], s.load)}</div>
      ${s.load === 'pct' ? num('% of max', 'pct', s.pct, 2.5, 0) : s.load === 'weight' ? num(`Weight (${iu})`, 'weight', s.weight == null ? '' : store.showW(s.weight, iu), iu === 'kg' ? 2.5 : 5, 0) : ''}`}
    <div class="ce-row">
      ${m === 'none' ? '' : `<label class="ce-field"><span>Target RPE</span><select name="rpe"><option value="">None</option>${RPE_STEPS.map((r) => `<option value="${r}" ${String(s.rpe) === String(r) ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`}
      <label class="ce-field"><span>Tempo</span><input name="tempo" autocomplete="off" placeholder="3-1-1" value="${esc(s.tempo)}"></label>
      ${opts.warm ? '' : `<label class="ce-field"><span>Superset</span><input name="group" autocomplete="off" maxlength="3" placeholder="A" value="${esc(s.group)}"></label>`}
    </div>
    <label class="ce-field"><span>Note for the athlete</span><textarea name="note" rows="2" placeholder="Cues, links, how it should feel">${esc(s.note)}</textarea></label>
    <div class="ask-btns"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">${esc(opts.okLabel)}</button></div></form>`;
  const wrap = sheet(opts.adding ? 'Add exercise' : (store.get('exercises', v.exerciseId)?.name || 'Change exercise'), html, (w) => {
    const f = w.querySelector('form');
    const read = () => {
      const val = (k) => (f.elements[k] && f.elements[k].value !== '' ? Number(f.elements[k].value) : null);
      if (f.elements.sets) s.sets = val('sets');
      if (f.elements.secs) s.secs = val('secs');
      if (f.elements.pct) s.pct = val('pct');
      const wb = f.elements.weight;
      if (wb && wb.value !== String(s.weight == null ? '' : store.showW(s.weight, iu))) s.weight = wb.value === '' ? null : store.readW(Number(wb.value), iu);
      if (f.elements.reps) s.reps = f.elements.reps.value.trim();
      if (f.elements.rpe) s.rpe = f.elements.rpe.value === '' ? '' : Number(f.elements.rpe.value);
      s.tempo = f.elements.tempo.value.trim();
      if (f.elements.group) s.group = f.elements.group.value.trim().toUpperCase();
      s.note = f.elements.note.value.trim();
    };
    w.addEventListener('click', (e) => {
      const st = e.target.closest('[data-step]');
      if (st) {
        const k = st.dataset.step, d = Number(st.dataset.d), box = f.elements[k];
        if (k === 'reps') {
          const r = parseReps(box.value) || { reps: 0, repsTo: null };
          const lo = Math.max(0, (r.reps || 0) + d);
          box.value = repsText(lo, r.repsTo != null ? Math.max(lo, r.repsTo + d) : null, '-');
        } else box.value = Math.max(Number(box.min) || 0, Math.round(((Number(box.value) || 0) + d) * 100) / 100);
        return;
      }
      const sg = e.target.closest('[data-seg]');
      if (sg) {
        read();
        s[sg.dataset.seg] = sg.dataset.v;
        if (sg.dataset.seg === 'measure') {
          if (sg.dataset.v === 'time' && s.secs == null) s.secs = 30;
          if ((sg.dataset.v === 'reps' || sg.dataset.v === 'breaths') && !s.reps) s.reps = sg.dataset.v === 'breaths' ? '5' : '8';
        }
        editSheet(item, v, opts, done, s);
        return;
      }
      if (e.target.closest('[data-swap]')) { read(); pickExerciseSheet((exId) => { s.exerciseId = exId; editSheet(item, v, opts, done, s); }); }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      read();
      const out = { exerciseId: s.exerciseId, measure: m, load: noLoad ? 'none' : s.load, note: s.note, tempo: s.tempo, rpe: m === 'none' ? (v.rpe ?? '') : s.rpe, group: opts.warm ? (item.group || '') : s.group };
      if (m !== 'none') {
        if (!s.sets || s.sets < 1) return toast('Sets must be at least 1');
        out.sets = Math.round(s.sets);
        if (m === 'time') out.secs = s.secs ?? 0;
        else {
          const r = parseReps(s.reps);
          if (!r || r.reps == null) return toast('Reps: one number or a range like 10-15');
          out.reps = r;
        }
        if (out.load === 'pct') out.pct = s.pct ?? 70;
        if (out.load === 'weight') out.weight = s.weight == null ? 0 : Math.round(s.weight * 100) / 100;
      }
      closeSheet();
      done(out);
    });
  });
  wrap.classList.add('ask');
}

