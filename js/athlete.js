// Athlete screens: today, the workout page (log, notes, swaps, switch), analytics, history.

import * as store from './store.js';
import { toISO, addDays, weekStart, sessionTotals, addTotals, emptyTotals, buildSession, nextOpenEntry, e1rm, estimateMaxes, applyEstimates, clearedAfter, logsWeight, repsText, weekItems, loggedWork, untouchedLog, PLYO_TIERS } from './calc.js';
import { weekSummary, loadTrend } from './summary.js';
import { esc, fmt, fmtDate, progTag, bindActions, sheet, closeSheet, ask, toast, stat, bars, linkify, demoAttrs, PATTERN_LABEL } from './ui.js';
import { timerSheet } from './timer.js';
import { videosEnabled, videoFresh, uploadVideo, videoUrl, removeVideos, VIDEO_MAX_SECS, VIDEO_MAX_MB, VIDEO_DAYS } from './sync.js';

const today = () => toISO(new Date());
// A finished workout raises a max by at most this factor on its own.
const MAX_JUMP = 1.2;

const isCoach = () => store.settings().me?.role === 'coach';

// A coach looking at an athlete's pages gets a way back to that athlete's coach page.
function coachBack(id) {
  if (!isCoach()) return '';
  const a = store.get('athletes', id);
  return `<a class="back" href="#/coach/athlete/${id}">‹ ${esc(a?.name || 'Athlete')}</a>`;
}

function dateStrip(athleteId, iso) {
  const mon = weekStart(iso);
  let html = '<nav class="date-strip" aria-label="Pick a day">';
  html += `<button class="icon-btn" data-action="goDate" data-date="${addDays(mon, -7)}" aria-label="Previous week">‹</button>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const plan = store.plannedOn(athleteId, d)[0];
    const planned = !!plan || !!store.warmupOn(athleteId, d);
    const log = store.logFor(athleteId, d);
    // The dot takes the color of the day's program (the one logged, if any).
    const prog = store.logProgram(log);
    const color = prog ? prog.color : plan ? store.programColor(plan.assignment) : null;
    const cls = [d === iso && 'on', d === today() && 'today', planned && 'planned', log?.finished && 'done', color != null && `pc${color}`].filter(Boolean).join(' ');
    html += `<button class="day ${cls}" data-action="goDate" data-date="${d}">
      <span>${fmtDate(d, { weekday: 'narrow' })}</span><b>${Number(d.slice(8))}</b><i${color != null ? ' class="pdot"' : ''}></i></button>`;
  }
  html += `<button class="icon-btn" data-action="goDate" data-date="${addDays(mon, 7)}" aria-label="Next week">›</button></nav>`;
  return html;
}

// 75 -> "1:15", 30 -> "30 s"
export function fmtSecs(n) {
  if (!n) return '';
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function targetText(set, measure, u, loaded = true) {
  // A % of max shows as the % until the athlete has a max on file.
  const w = !loaded ? null : store.showW(set.targetWeight ?? set.weight, u) || (set.targetPct != null ? `${set.targetPct}%` : null);
  if (measure === 'time') {
    const t = fmtSecs(set.targetSecs ?? set.secs);
    return w && t ? `${w} × ${t}` : t;
  }
  // A rep range shows as "10–15"; the athlete logs what they actually did.
  const n = set.targetReps ?? set.reps;
  const reps = set.targetReps != null ? repsText(n, set.targetRepsTo) : repsText(n, set.repsTo);
  const word = measure === 'breaths' ? 'breath' : 'rep';
  if (w) return `${w} × ${reps}`;
  return n ? `${reps} ${word}${reps === '1' ? '' : 's'}` : '';
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

// One line that says what an exercise is: "4 × 5 · 180 lb", "3 × 30 s", "3 × 5 @ 75%".
export function entrySummary(entry, ex = store.get('exercises', entry.exerciseId)) {
  const n = entry.sets.length;
  const measure = entry.measure || 'reps';
  if (measure === 'none') return n > 1 ? `${n} rounds` : 'Check off';
  if (!n) return '';
  const s = entry.sets[0];
  const u = s.unit || entry.unit || store.unit();
  const amount = measure === 'time' ? fmtSecs(s.targetSecs ?? s.secs) : repsText(s.targetReps ?? s.reps, s.targetRepsTo ?? s.repsTo);
  const loaded = logsWeight(entry, ex || {});
  const w = loaded ? store.showW(s.targetWeight ?? s.weight, u) : null;
  const load = w ? ` · ${fmt(w, 1)} ${u}` : loaded && s.targetPct != null ? ` @ ${s.targetPct}%` : '';
  const word = measure === 'breaths' ? ' breaths' : '';
  return amount ? `${n} × ${amount}${word}${load}` : `${n} set${n === 1 ? '' : 's'}${load}`;
}

function workoutCard(id, iso, title, sub, entries, log, pill = '') {
  const st = statusOf(log);
  const ex = store.exercisesById();
  const shown = entries.slice(0, 4);
  const more = entries.length - shown.length;
  const go = { done: 'View workout', live: 'Continue workout' }[st.cls] || 'Start workout';
  return `<a class="workout-card ${st.cls}" href="#/athlete/${id}/session/${iso}">
    <div class="wc-top">${sub}${st.cls ? `<span class="status ${st.cls}">${st.txt}</span>` : pill}</div>
    <h2>${esc(title)}</h2>
    <ul class="wc-list">${shown.map((e) => `<li><span>${esc(ex[e.exerciseId]?.name || e.exerciseId)}</span><span>${esc(entrySummary(e, ex[e.exerciseId]))}</span></li>`).join('')}
      ${more > 0 ? `<li class="more"><span>+ ${more} more</span><span></span></li>` : ''}</ul>
    <span class="btn">${go}</span></a>`;
}

function warmRow(id, iso, name, count, log) {
  const st = statusOf(log);
  return `<a class="warm-row" href="#/athlete/${id}/warmup/${iso}">
    <span class="badge ${st.cls === 'done' ? 'done' : 'warm'}">${st.cls === 'done' ? '✓' : 'W'}</span>
    <span class="grow"><b>Warmup</b><small>${esc(name)} · ${count} movement${count === 1 ? '' : 's'}</small></span>
    <span class="status ${st.cls || 'warm'}">${st.cls ? st.txt : 'Do first'}</span><span class="chev"></span></a>`;
}

// Today: the day's warmup and workout, with a preview of what's in it.
export function today_(root, { id }, query) {
  store.fillMaxes(id);
  const athlete = store.get('athletes', id);
  if (!athlete) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const iso = query.get('d') || today();
  const plans = store.plannedOn(id, iso);
  const log = store.currentLog(id, iso);
  // The assigned warmup gets its own row, above the workout.
  const wlog = store.currentWarmupLog(id, iso), w = store.warmupOn(id, iso);
  const warm = wlog ? warmRow(id, iso, wlog.name, wlog.entries.length, wlog)
    : w ? warmRow(id, iso, w.block.name, w.block.days[0].items.length, null) : '';

  let body;
  if (log) {
    const block = store.get('blocks', log.blockId);
    const prog = store.logProgram(log);
    body = workoutCard(id, iso, log.name, prog ? progTag(prog.name, prog.color, log.week) : '<span class="kicker">Workout</span>', log.entries, log);
  } else if (plans.length) {
    const p = plans[0];
    body = workoutCard(id, iso, p.block.days[p.dayIndex].name, progTag(p.block.name, store.programColor(p.assignment), p.week), store.previewEntries(id, iso, p), null,
      p.block.deloadWeek === p.week ? '<span class="status">Deload</span>' : '');
  } else {
    let next = null;
    for (let k = 1; k <= 14 && !next; k++) { const d = addDays(iso, k); const pl = store.plannedOn(id, d)[0]; if (pl) next = { d, name: pl.block.days[pl.dayIndex].name }; }
    body = `<div class="empty"><b>Rest day</b><p>${next ? `Next up: ${esc(next.name)}, ${fmtDate(next.d, { weekday: 'long', month: 'short', day: 'numeric' })}.` : 'Nothing is scheduled.'}</p>
      <button class="btn ghost" data-action="switch">Do a workout anyway</button></div>`;
  }
  // On more than one program, two can land on the same day: the newest is the
  // one shown, the others can be done instead while nothing is logged yet.
  const shownId = log ? log.assignmentId : plans[0]?.assignment.id;
  const others = (!log || untouchedLog(log)) ? plans.filter((p) => p.assignment.id !== shownId) : [];
  const also = others.map((p, k) => `<div class="also-today"><span class="grow"><span class="muted small">Also today</span><br>
      ${progTag(p.block.name, store.programColor(p.assignment), p.week)} <b>${esc(p.block.days[p.dayIndex].name)}</b></span>
      <button class="chip" data-action="doOther" data-k="${k}">Do this one instead</button></div>`).join('');
  const last = store.logsFor(id).filter((l) => !l.warmup && l.date < iso && loggedWork(l)).pop();

  root.innerHTML = `
    <header class="page-head">${coachBack(id)}<span class="kicker">${fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      <h1>Hey ${esc(athlete.name.split(' ')[0])}</h1></header>
    ${dateStrip(id, iso)}
    ${warm}${body}${also}
    ${last ? `<p class="last-line"><span>Last session</span><a href="#/athlete/${id}/session/${last.date}">${fmtDate(last.date, { weekday: 'short' })} · ${esc(last.name)}</a></p>` : ''}`;

  bindActions(root, {
    goDate: (el) => { location.hash = `#/athlete/${id}?d=${el.dataset.date}`; },
    doOther: (el) => {
      const l = store.startLog(id, iso, others[Number(el.dataset.k)]);
      l.chosen = true; // stays even with nothing logged, instead of going back to the newest program
      store.saveLog(l);
      location.hash = `#/athlete/${id}/session/${iso}`;
    },
    switch: () => switchSheet(id, iso, (plan) => {
      const l = store.startLog(id, iso, plan);
      l.chosen = true; // picked by the athlete, so it stays even with nothing logged
      store.saveLog(l);
      closeSheet();
      location.hash = `#/athlete/${id}/session/${iso}`;
    }),
  });
}

function entryCard(log, entry, i, label, fold = {}) {
  const ex = store.get('exercises', entry.exerciseId) || { name: entry.exerciseId };
  const last = store.lastTime(log.athleteId, entry.exerciseId, log.date);
  // Each set shows its weight in its own unit: the one the coach programmed
  // unless the athlete flipped that set.
  const eu = entry.unit || store.unit();
  const su = (s) => s.unit || eu;
  const measure = entry.measure || 'reps';
  const loaded = logsWeight(entry, ex);
  const amount = (s) => (measure === 'time' ? fmtSecs(s.secs) : `${s.reps ?? ''}`);
  const lastTxt = last && measure !== 'none' ? `Last time ${last.sets.map((s) => s.weight ? `${store.showW(s.weight, eu)}×${amount(s)}` : amount(s)).join(', ')}` : '';
  // The box the athlete fills in: reps, breaths, seconds, or nothing for a check-off item.
  const k = measure === 'time' ? 'secs' : 'reps';
  const boxName = { time: 'Secs', breaths: 'Breaths' }[measure] || 'Reps';
  const box = (s, j) => (measure === 'none' ? '' : `<label class="field"><input type="number" inputmode="numeric" min="0" value="${s[k] ?? ''}" placeholder="${(measure === 'time' ? s.targetSecs : repsText(s.targetReps, s.targetRepsTo)) || ''}" data-action="setField" data-i="${i}" data-j="${j}" data-k="${k}" aria-label="${boxName}, set ${j + 1}"><span>${boxName.toLowerCase()}</span></label>`);
  const cols = `${loaded ? '' : 'no-load'} ${measure === 'none' ? 'check-only' : ''}`;
  const tags = [];
  if (entry.tempo) tags.push(`Tempo ${entry.tempo}`);
  if (entry.basedOn != null && !entry.sets.every((s) => s.done)) tags.push(`Targets build on what you did in week ${entry.basedOn + 1}`);
  if (entry.swappedFrom) tags.push(`Swapped from ${store.get('exercises', entry.swappedFrom)?.name || entry.swappedFrom}`);
  const up = fold.current ? entry.sets.findIndex((s) => !s.done) : -1;
  const rows = entry.sets.map((s, j) => `
    <div class="set ${s.done ? 'done' : ''} ${j === up ? 'up' : ''} ${cols}">
      <span class="set-n">${j + 1}</span>
      ${measure === 'time' && (s.targetSecs ?? s.secs) ? `<button class="target timer-btn" data-action="timer" data-i="${i}" data-j="${j}" aria-label="Start a ${fmtSecs(s.targetSecs ?? s.secs)} timer for set ${j + 1}"><span class="timer-ico" aria-hidden="true">⏱</span>${esc(targetText(s, measure, su(s), loaded))}</button>`
        : `<span class="target">${esc(measure === 'none' ? 'Tap when done' : targetText(s, measure, su(s), loaded))}</span>`}
      ${loaded ? `<div class="field wfield"><input type="number" inputmode="decimal" min="0" step="any" value="${store.showW(s.weight, su(s)) ?? ''}" placeholder="${store.showW(s.targetWeight, su(s)) ?? ''}" data-action="setField" data-i="${i}" data-j="${j}" data-k="weight" aria-label="Weight in ${su(s)}, set ${j + 1}"><button class="unit-btn" data-action="setUnit" data-i="${i}" data-j="${j}" aria-label="Weight unit for set ${j + 1}: ${su(s)}. Tap to switch">${su(s)}</button></div>` : ''}
      ${box(s, j)}
      <button class="check" data-action="toggleSet" data-i="${i}" data-j="${j}" aria-pressed="${s.done}" aria-label="Mark set ${j + 1} done">✓</button>
    </div>${uploading.has(`${log.id}/${i}/${j}`) ? `<div class="set-video"><span class="muted small">Uploading set ${j + 1} video…</span></div>`
      : videoFresh(s.video) ? `<div class="set-video"><button class="vid-chip" data-action="playVideo" data-path="${esc(s.video.path)}">▶ Set ${j + 1} video</button><button class="link muted-link" data-action="removeVideo" data-i="${i}" data-j="${j}">Remove</button></div>` : ''}`).join('');
  const done = entry.sets.filter((s) => s.done).length;
  return `<article class="entry ${entry.warmup ? 'warm' : ''} ${entry.sets.length && done === entry.sets.length ? 'complete' : ''} ${fold.folded ? 'folded' : ''} ${fold.current ? 'current' : ''}" id="entry-${i}">
    <header class="entry-head" data-action="toggleOpen" data-i="${i}">
      <span class="order">${label}</span>
      <div class="entry-title"><h3>${esc(ex.name)}</h3>
        <p class="entry-sum">${esc(entrySummary(entry, ex))}</p>
        ${tags.length ? `<p class="tags">${esc(tags.join(' · '))}</p>` : ''}
        ${ex.video ? `<button class="demo-chip" ${demoAttrs(ex)}>▶ Demo</button>` : ''}
        ${lastTxt ? `<button class="last" data-action="history" data-i="${i}" aria-label="${esc(lastTxt)}. See all past sets">${esc(lastTxt)} <b>· History</b></button>` : ''}</div>
      <div class="entry-acts"><span class="pill green fold-pill">${done}/${entry.sets.length}</span>
        <button class="more-btn" data-action="entryMenu" data-i="${i}" aria-label="More for ${esc(ex.name)}">•••</button></div>
    </header>
    <div class="entry-body">
    ${entry.note ? `<p class="coach-note">${linkify(entry.note)}</p>` : ''}
    ${measure === 'none' ? '' : `<div class="set-head ${cols}"><span>Set</span><span>Target</span>${loaded ? `<span>${esc(eu)}</span>` : ''}<span>${boxName}</span><span></span></div>`}
    <div class="sets">${rows}</div>
    <div class="entry-foot">
      ${measure === 'none' ? '' : `<button class="link" data-action="addSet" data-i="${i}">+ Set</button>`}
      <button class="link muted-link" data-action="toggleNote" data-i="${i}">${entry.athleteNote ? 'Edit note' : 'Note'}</button>
      <button class="link muted-link" data-action="addVideo" data-i="${i}">Video</button>
    </div>
    <label class="note-field" ${entry.athleteNote ? '' : 'hidden'} id="note-${i}"><span>My note</span>
      <textarea rows="2" placeholder="How did it feel? Any pain?" data-action="entryNote" data-i="${i}">${esc(entry.athleteNote || '')}</textarea></label>
    </div>
  </article>`;
}

function rpeButtons(val) {
  let h = '<div class="rpe" role="group" aria-label="Session RPE">';
  for (let r = 1; r <= 10; r++) h += `<button class="${val === r ? 'on' : ''}" data-action="sessionRpe" data-v="${r}">${r}</button>`;
  return h + '</div>';
}

// The assigned warmup: the same page, logged separately from the workout.
export function warmupSession(root, params) { session(root, { ...params, warm: true }); }

// The workout page: every exercise in order with boxes for weight and reps.
// Effort / minutes / note in one line, e.g. "Effort 7/10 · 45 min · “felt good”".
function sessionSummary(log) {
  return [log.sessionRpe ? `Effort ${log.sessionRpe}/10` : '', log.minutes ? `${log.minutes} min` : '', log.note ? `“${esc(log.note)}”` : '']
    .filter(Boolean).join(' · ');
}

// A finished workout ends with a plain card instead of the pinned Finish bar,
// so nothing floats over the exercises once the work is done.
function finishedCard(log, warm) {
  const summary = sessionSummary(log);
  return `<div class="card finished-card">
      <div class="fc-head"><span class="fc-check" aria-hidden="true">✓</span><b>${warm ? 'Warmup' : 'Workout'} finished</b></div>
      ${summary ? `<p class="muted small">${summary}</p>` : ''}
      <button class="btn ghost" data-action="openFinish">Edit effort and notes</button>
    </div>`;
}

export function session(root, { id, date, warm = false }) {
  const athlete = store.get('athletes', id);
  if (!athlete) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const plans = warm ? [] : store.plannedOn(id, date);
  let log = warm ? store.currentWarmupLog(id, date) : store.currentLog(id, date);
  if (!log) {
    const w = warm && store.warmupOn(id, date);
    if (!w && !plans.length) { location.hash = `#/athlete/${id}?d=${date}`; return; }
    log = w ? store.startWarmupLog(id, date, w) : store.startLog(id, date, plans[0]);
  }
  const block = store.get('blocks', log.blockId);
  const labels = orderLabels(log.entries);

  const folds = foldState(log);
  const counts = () => log.entries.reduce((a, e) => [a[0] + e.sets.filter((x) => x.done).length, a[1] + e.sets.length], [0, 0]);
  const [nDone, nAll] = counts();
  const backTo = isCoach() ? `#/coach/athlete/${id}` : `#/athlete/${id}?d=${date}`;
  root.innerHTML = `
    <div class="session-bar">
      <div class="sb-row"><a class="back" href="${backTo}">${isCoach() ? esc(athlete.name) : fmtDate(date)}</a>${warm ? '' : '<button class="chip" data-action="switch">Switch day</button>'}</div>
      <div class="sb-row"><span class="sb-title">${esc(warm ? 'Warmup' : log.name)}</span><span class="sb-count" id="sb-count"><b>${nDone}</b> of ${nAll} sets</span></div>
      <div class="progress"><i id="sb-bar" style="width:${nAll ? (nDone / nAll) * 100 : 0}%"></i></div>
    </div>
    <p class="kicker">${warm ? 'Before your workout' : block ? (() => { const pg = store.logProgram(log); return progTag(pg.name, pg.color, log.week); })() : ''}${log.finished ? ' · <b class="warn-text" style="color:var(--turf)">Finished</b>' : ''}</p>
    ${!warm && isCoach() && log.assignmentId && store.get('assignments', log.assignmentId) && block ? `<a class="btn ghost coach-change" href="#/coach/assignment/${log.assignmentId}/plan?w=${log.week}&day=${log.dayIndex}">Change ${esc(athlete.name.split(' ')[0])}'s program</a>` : ''}
    <div style="height:10px"></div>
    ${warm ? log.entries.map((e, i) => entryCard(log, e, i, labels[i], folds[i])).join('') : log.entries.map((e, i) => {
      // Headings split the warmup from the main work when there is a warmup.
      const head = e.warmup && !log.entries[i - 1]?.warmup ? '<h2 class="sec-head warm-head">Warmup</h2>'
        : !e.warmup && log.entries[i - 1]?.warmup ? '<h2 class="sec-head">Workout</h2>' : '';
      return head + entryCard(log, e, i, labels[i], folds[i]);
    }).join('')}
    <button class="btn ghost wide" data-action="addExercise">+ Add an exercise</button>
    ${log.finished ? finishedCard(log, warm)
      : `${log.note || log.sessionRpe ? `<p class="muted small" style="margin-top:14px">${sessionSummary(log)}</p>` : ''}
    <div class="finish-bar"><button class="btn dark" data-action="openFinish">Finish ${warm ? 'warmup' : 'workout'}</button></div>`}`;

  const rerender = () => { const y = window.scrollY; session(root, { id, date, warm }); window.scrollTo(0, y); };
  const persist = () => store.saveLog(log);
  const unitOf = (i, j) => log.entries[i].sets[j].unit || log.entries[i].unit || store.unit();
  const markEntry = (i) => root.querySelector(`#entry-${i}`)?.classList.toggle('complete', log.entries[i].sets.every((s) => s.done));

  // Saves the workout as finished and updates maxes. `auto` is when the last
  // set was just ticked: the workout finishes by itself (RPE and minutes are
  // optional) and the athlete stays on the page.
  const complete = (auto = false) => {
    log.finished = true;
    // Every lift with a weight sets or raises that exercise's max, estimated
    // with the rep-max formula. A jump of more than MAX_JUMP (or a weight far
    // over the target) is more likely a typo (2250 for 225), so it's left for
    // the coach to confirm instead of changing every future load.
    delete log.maxFlags;
    const res = applyEstimates(athlete, estimateMaxes([log], { after: clearedAfter(athlete), withTypos: true }), { jump: MAX_JUMP });
    const nameOf = (x) => store.get('exercises', x)?.name || 'Exercise';
    const prs = [...res.added, ...res.raised].map(nameOf), odd = res.flagged.map((f) => nameOf(f.exerciseId));
    if (res.flagged.length) log.maxFlags = res.flagged;
    if (prs.length) store.put('athletes', athlete);
    store.saveLog(log);
    const done = auto ? `All sets done, ${warm ? 'warmup' : 'workout'} finished` : warm ? 'Warmup saved' : 'Workout saved';
    toast(odd.length ? `${done}. ${odd.join(', ')}: big jump, so your max wasn't changed. Check the weight you typed.`
      : prs.length ? `${done}. New max: ${prs.join(', ')}` : done);
    if (auto) rerender(); else location.hash = `#/athlete/${id}?d=${date}`;
  };
  // An exercise was just finished: fold it, open the next unfinished one
  // (the rest of a superset first) and bring it into view. A header tapped
  // shut earlier doesn't keep the next exercise closed.
  const openNext = (i) => {
    const o = foldOverrides(log), k = nextOpenEntry(log.entries, i);
    delete o[i];
    if (k == null) { setTimeout(rerender, 250); return; }
    foldFocus.set(log.id, k);
    const g = log.entries[k].group;
    log.entries.forEach((e, n) => { if (n === k || (g && e.group === g && !e.warmup === !log.entries[k].warmup)) delete o[n]; });
    setTimeout(() => {
      rerender();
      const card = root.querySelector(`#entry-${k}`);
      if (!card) return;
      const r = card.getBoundingClientRect(), bar = root.querySelector('.session-bar')?.getBoundingClientRect().bottom || 0;
      // Only scroll when the top of the next exercise isn't comfortably on screen.
      if (r.top < bar + 8 || r.top > window.innerHeight * 0.6) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: window.scrollY + r.top - bar - 10, behavior: smooth ? 'smooth' : 'auto' });
      }
    }, 250);
  };
  const allDone = () => log.entries.some((e) => e.sets.length) && log.entries.every((e) => e.sets.every((x) => x.done));

  bindActions(root, {
    toggleSet: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      s.done = !s.done;
      // Ticking a set with empty boxes logs it exactly as prescribed (the
      // bottom of a rep range).
      if (s.done) {
        if (s.reps == null) s.reps = s.targetReps ?? null;
        if (s.secs == null) s.secs = s.targetSecs ?? null;
        if (s.weight == null && logsWeight(log.entries[el.dataset.i], store.get('exercises', log.entries[el.dataset.i].exerciseId))) s.weight = s.targetWeight ?? null;
        const row = el.closest('.set');
        for (const f of ['weight', 'reps', 'secs']) { const box = row.querySelector(`[data-k=${f}]`); if (box && s[f] != null) box.value = f === 'weight' ? store.showW(s[f], unitOf(el.dataset.i, el.dataset.j)) : s[f]; }
      }
      el.setAttribute('aria-pressed', s.done);
      el.closest('.set').classList.toggle('done', s.done);
      markEntry(el.dataset.i);
      persist();
      const [d, n] = counts();
      root.querySelector('#sb-count').innerHTML = `<b>${d}</b> of ${n} sets`;
      root.querySelector('#sb-bar').style.width = `${n ? (d / n) * 100 : 0}%`;
      if (s.done && !log.finished && allDone()) { complete(true); return; }
      // An exercise just finished: fold it and open the next one.
      if (s.done && log.entries[el.dataset.i].sets.every((x) => x.done)) { openNext(Number(el.dataset.i)); return; }
      // Move the "next set" outline along.
      const card = root.querySelector(`#entry-${el.dataset.i}`);
      if (card?.classList.contains('current')) {
        const k = log.entries[el.dataset.i].sets.findIndex((x) => !x.done);
        card.querySelectorAll('.set').forEach((r, j) => r.classList.toggle('up', j === k));
      }
    },
    // Timed sets: the target opens a countdown for the assigned seconds.
    // When time is up the athlete can tick the set from the pop-up.
    timer: (el) => {
      const { i, j } = el.dataset, e = log.entries[i], s = e.sets[j];
      const name = store.get('exercises', e.exerciseId)?.name || 'Timer';
      timerSheet({
        secs: s.targetSecs ?? s.secs, title: name, sub: `Set ${Number(j) + 1} of ${e.sets.length}`,
        onDone: s.done ? null : () => {
          if (!log.entries[i]?.sets[j] || log.entries[i].sets[j].done) return;
          root.querySelector(`.check[data-i="${i}"][data-j="${j}"]`)?.click();
        },
      });
    },
    setField: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      const v = el.value === '' ? null : Number(el.value);
      s[el.dataset.k] = el.dataset.k === 'weight' ? store.readW(v, unitOf(el.dataset.i, el.dataset.j)) : v;
      persist();
    },
    // Flip one set between kg and lb. The stored weight doesn't change, only how it reads.
    setUnit: (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      s.unit = unitOf(el.dataset.i, el.dataset.j) === 'kg' ? 'lb' : 'kg';
      persist(); rerender();
    },
    addSet: (el) => {
      const e = log.entries[el.dataset.i], sets = e.sets;
      const last = sets[sets.length - 1] || {};
      e.setsChanged = true;
      sets.push({ targetReps: last.targetReps ?? last.reps ?? null, ...(last.targetRepsTo != null ? { targetRepsTo: last.targetRepsTo } : {}), targetSecs: last.targetSecs ?? last.secs ?? null, targetWeight: last.targetWeight ?? last.weight ?? null, ...(last.targetPct != null ? { targetPct: last.targetPct } : {}), ...(last.unit ? { unit: last.unit } : {}), reps: null, secs: null, weight: null, done: false });
      persist(); rerender();
    },
    removeSet: (el) => { const e = log.entries[el.dataset.i]; e.sets.pop(); e.setsChanged = true; persist(); rerender(); },
    toggleNote: (el) => { const n = root.querySelector(`#note-${el.dataset.i}`); n.hidden = false; n.querySelector('textarea').focus(); },
    entryNote: (el) => { log.entries[el.dataset.i].athleteNote = el.value; persist(); },
    sessionRpe: (el) => {
      log.sessionRpe = Number(el.dataset.v); persist();
      root.querySelectorAll('.rpe button').forEach((b) => b.classList.toggle('on', b === el));
    },
    minutes: (el) => { log.minutes = el.value === '' ? null : Number(el.value); persist(); },
    sessionNote: (el) => { log.note = el.value; persist(); },
    finish: () => complete(),
    toggleOpen: (el, ev) => {
      if (ev.target.closest('button, a, input, textarea')) return;
      const i = Number(el.dataset.i), o = foldOverrides(log);
      o[i] = root.querySelector(`#entry-${i}`).classList.contains('folded');
      rerender();
    },
    entryMenu: (el) => {
      const i = Number(el.dataset.i), e = log.entries[i];
      const name = store.get('exercises', e.exerciseId)?.name || 'Exercise';
      const items = [
        ['editEntry', 'Change how it\'s logged', 'reps, time, weight'],
        ['swap', 'Swap for another exercise', ''],
        ['history', 'Past sets', ''],
        ...(e.measure !== 'none' && e.sets.length > 1 ? [['removeSet', 'Remove last set', '']] : []),
      ];
      sheet(name, `<ul class="menu-list">${items.map(([a, t, sub]) => `<li><button data-m="${a}"><span>${t}</span>${sub ? `<small>${sub}</small>` : ''}</button></li>`).join('')}</ul>`, (w) => {
        w.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-m]'); if (!b) return;
          closeSheet();
          const fake = { dataset: { i: String(i) } };
          ({ editEntry: () => editEntrySheet(e, () => { persist(); rerender(); }), swap: () => swapSheet(log, i, () => { persist(); rerender(); }),
            history: () => historySheet(log, e), removeSet: () => { e.sets.pop(); e.setsChanged = true; persist(); rerender(); } })[b.dataset.m](fake);
        });
      });
    },
    openFinish: () => {
      const wrap = sheet(log.finished ? 'Effort and notes' : `Finish ${warm ? 'warmup' : 'workout'}`, `
        ${warm ? '' : `<p class="muted">How hard was the whole session? 1 is very easy, 10 is max effort.</p>
        ${rpeButtons(log.sessionRpe)}
        <label class="field-row"><span>Minutes</span><input type="number" inputmode="numeric" min="0" value="${log.minutes ?? ''}" data-f="minutes" aria-label="Session minutes"></label>`}
        <label class="note-field"><span>Note for coach</span>
          <textarea rows="3" placeholder="Sleep, soreness, anything coach should know" data-f="note">${esc(log.note || '')}</textarea></label>
        <button class="btn wide" data-f="go">${log.finished ? 'Save' : `Finish ${warm ? 'warmup' : 'workout'}`}</button>`, (w) => {
        w.addEventListener('click', (ev) => {
          const r = ev.target.closest('.rpe button');
          if (r) { log.sessionRpe = Number(r.dataset.v); persist(); w.querySelectorAll('.rpe button').forEach((b) => b.classList.toggle('on', b === r)); }
          if (ev.target.closest('[data-f="go"]')) { closeSheet(); if (log.finished) { persist(); toast('Saved'); rerender(); } else complete(); }
        });
        w.addEventListener('change', (ev) => {
          const f = ev.target.dataset.f;
          if (f === 'minutes') { log.minutes = ev.target.value === '' ? null : Number(ev.target.value); persist(); }
          if (f === 'note') { log.note = ev.target.value; persist(); }
        });
      });
      return wrap;
    },
    history: (el) => historySheet(log, log.entries[el.dataset.i]),
    editEntry: (el) => editEntrySheet(log.entries[el.dataset.i], () => { persist(); rerender(); }),
    swap: (el) => swapSheet(log, Number(el.dataset.i), () => { persist(); rerender(); }),
    addVideo: (el) => {
      if (!videosEnabled()) return toast('Videos need the online app, not the demo.');
      const i = Number(el.dataset.i), sets = log.entries[i].sets;
      const go = (j) => pickVideo(async (file, secs) => {
        const s = log.entries[i].sets[j], key = `${log.id}/${i}/${j}`;
        uploading.add(key); rerender();
        try {
          const path = await uploadVideo(id, file);
          const old = s.video?.path;
          s.video = { path, at: new Date().toISOString(), secs: secs || null };
          if (old) removeVideos([old]);
          toast('Video added. Your coach can watch it.');
        } catch (e) { toast(`Couldn't upload: ${e.message}`); }
        uploading.delete(key); persist(); rerender();
      });
      if (sets.length === 1) return go(0);
      sheet('Video for which set?', `<ul class="pick">${sets.map((s, j) => `<li><button data-j="${j}">Set ${j + 1}${videoFresh(s.video) ? ' <small>has a video (replace)</small>' : ''}</button></li>`).join('')}</ul>`, (w) => {
        w.addEventListener('click', (e) => { const b = e.target.closest('[data-j]'); if (b) { closeSheet(); go(Number(b.dataset.j)); } });
      });
    },
    removeVideo: async (el) => {
      const s = log.entries[el.dataset.i].sets[el.dataset.j];
      if (!await ask('Your coach won\'t be able to watch it anymore.', { title: 'Remove this video?', ok: 'Remove video', danger: true })) return;
      await removeVideos([s.video.path]);
      delete s.video; persist(); rerender();
    },
    playVideo: (el) => videoSheet(el.dataset.path),
    addExercise: () => pickExerciseSheet((exId) => {
      const x = store.get('exercises', exId);
      log.entries.push({ exerciseId: exId, ...(x?.measure ? { measure: x.measure } : {}), unit: store.unit(), note: '', sets: [{ targetReps: null, targetSecs: null, targetWeight: null, reps: null, secs: null, weight: null, done: false }], addedByAthlete: true });
      persist(); rerender();
    }),
    switch: () => switchSheet(id, date, async (plan) => {
      if (log.entries.some((e) => e.sets.some((s) => s.done)) && !await ask('The sets you already logged today are replaced.', { title: 'Switch workout?', ok: 'Switch', danger: true })) return;
      store.del('logs', log.id);
      log = store.startLog(id, date, plan);
      log.switchedFrom = plans[0] ? { week: plans[0].week, dayIndex: plans[0].dayIndex } : null;
      store.saveLog(log);
      closeSheet(); rerender();
    }),
  });
}

// Which exercises are open on the workout page. By default the first
// unfinished exercise (and the rest of its superset) is open and everything
// else is folded to one line; a tap on a header overrides that for the visit.
// Finishing an exercise moves the open one along (foldFocus), even past an
// exercise the athlete skipped.
const foldTaps = new Map();
const foldFocus = new Map();
const foldOverrides = (log) => { if (!foldTaps.has(log.id)) foldTaps.set(log.id, {}); return foldTaps.get(log.id); };
function foldState(log) {
  const o = foldOverrides(log);
  const isDone = (e) => e.sets.length > 0 && e.sets.every((x) => x.done);
  const f = foldFocus.get(log.id);
  const first = f != null && log.entries[f] && !isDone(log.entries[f]) ? f : log.entries.findIndex((e) => !isDone(e));
  const grp = first >= 0 ? log.entries[first].group : null;
  return log.entries.map((e, i) => {
    const auto = i === first || (grp && e.group === grp && !isDone(e) && e.warmup === log.entries[first].warmup);
    const open = o[i] ?? auto;
    return { folded: !open, current: open && !isDone(e) && auto };
  });
}

// Sets with a clip on its way up (kept off the log so a closed tab can't leave it stuck).
const uploading = new Set();

// Pick or record a clip, checking length and size before it uploads.
function pickVideo(onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > VIDEO_MAX_MB * 1024 * 1024) return toast(`That video is too big (over ${VIDEO_MAX_MB} MB). Keep it under ${VIDEO_MAX_SECS} seconds.`);
    const secs = await videoSecs(file);
    if (secs > VIDEO_MAX_SECS + 1) return toast(`Keep it under ${VIDEO_MAX_SECS} seconds. Trim it in your Photos app first.`);
    onFile(file, Number.isFinite(secs) ? Math.round(secs) : null);
  });
  input.click();
}

// Length of a clip, or NaN when the browser can't read it (the size check still applies).
function videoSecs(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video'), url = URL.createObjectURL(file);
    let settled = false;
    const done = (d) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(d); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(NaN);
    setTimeout(() => done(NaN), 8000);
    v.src = url;
  });
}

// Play a form-check clip in a sheet (athlete or coach).
export function videoSheet(path) {
  sheet('Form video', `<video class="form-video" controls playsinline autoplay></video>
    <p class="muted small">Videos are kept for ${VIDEO_DAYS} days.</p>`, async (w) => {
    try { w.querySelector('video').src = await videoUrl(path); } catch (e) { toast(`Couldn't load the video: ${e.message}`); }
  });
}

// Everything the athlete has logged for an exercise, newest first, so they
// can pick a weight mid-workout.
function historySheet(log, entry) {
  const ex = store.get('exercises', entry.exerciseId) || { name: entry.exerciseId };
  const past = store.exerciseHistory(log.athleteId, entry.exerciseId, log.date);
  const u = entry.unit || store.unit();
  const amount = (s, m) => (m === 'time' ? fmtSecs(s.secs) : m === 'breaths' ? `${s.reps ?? ''} breaths` : `${s.reps ?? ''}`);
  const setText = (s, h) => (s.weight ? `${store.showW(s.weight, s.unit || h.unit || u)} ${s.unit || h.unit || u} × ${amount(s, h.measure)}` : amount(s, h.measure) || 'Done');
  // Heaviest set and estimated max, shown in this workout's unit.
  let best = null;
  for (const h of past) for (const s of h.sets) if (s.weight && s.reps && (!best || e1rm(s.weight, s.reps) > e1rm(best.weight, best.reps))) best = s;
  const html = `${best ? `<div class="hist-best"><span>Best set</span><b>${store.showW(best.weight, u)} ${u} × ${best.reps}</b><span>Est. max ${fmt(store.showW(e1rm(best.weight, best.reps), u))} ${u}</span></div>` : ''}
    <ol class="hist">${past.map((h) => `<li><div class="hist-date">${esc(fmtDate(h.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>
      <ol class="hist-sets">${h.sets.map((s) => `<li>${esc(setText(s, h))}</li>`).join('')}</ol>
      ${h.note ? `<p class="muted small">${esc(h.note)}</p>` : ''}</li>`).join('')}</ol>`;
  sheet(`${ex.name} history`, html);
}

// Change how one exercise is logged in this workout: reps, time, breaths or a
// plain check-off, and whether it gets a weight box. It only changes this
// day's log; the coach's program and the exercise library stay as they are.
const LOG_AS = [['reps', 'Reps'], ['time', 'Time'], ['breaths', 'Breaths'], ['none', 'Check off']];
function editEntrySheet(entry, done) {
  const ex = store.get('exercises', entry.exerciseId);
  let m = entry.measure || 'reps';
  let weight = logsWeight({ ...entry, measure: 'reps' }, ex);
  const html = `<p class="muted">Only changes this workout. Your coach's program stays the same.</p>
    <p class="sheet-label">Log it as</p>
    <div class="seg" role="group" aria-label="Log it as">${LOG_AS.map(([v, label]) =>
      `<button class="${m === v ? 'on' : ''}" data-m="${v}" aria-pressed="${m === v}">${label}</button>`).join('')}</div>
    <label class="check-row edit-weight"><input type="checkbox" ${weight ? 'checked' : ''}> Log the weight I use</label>
    <div class="ask-btns"><button class="btn ghost" data-close>Cancel</button><button class="btn" data-save>Save</button></div>`;
  sheet(ex?.name || 'Edit exercise', html, (w) => {
    const box = w.querySelector('.edit-weight');
    const sync = () => {
      w.querySelectorAll('[data-m]').forEach((b) => { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-pressed', b.dataset.m === m); });
      // Breathing drills and check-offs never take a weight.
      box.hidden = m === 'none' || m === 'breaths';
    };
    sync();
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (b) { m = b.dataset.m; sync(); }
      if (!e.target.closest('[data-save]')) return;
      weight = box.querySelector('input').checked;
      if (m === 'reps') delete entry.measure; else entry.measure = m;
      if (weight === (ex?.loaded !== false)) delete entry.load; else entry.load = weight;
      entry.athleteEdited = true;
      const open = entry.sets.filter((s) => !s.done);
      if (!logsWeight(entry, ex)) open.forEach((s) => { s.weight = null; });
      // A check-off is one tap, so extra empty sets go.
      if (m === 'none' && entry.sets.length > 1 && !entry.sets.some((s) => s.done)) entry.sets = entry.sets.slice(0, 1);
      closeSheet(); done();
    });
  });
}

function swapSheet(log, i, done) {
  const entry = log.entries[i];
  const ex = store.get('exercises', entry.exerciseId);
  const original = entry.swappedFrom || entry.exerciseId;
  const alts = [...new Set([...(store.get('exercises', original)?.alts || []), original])].filter((x) => x !== entry.exerciseId);
  const list = alts.map((a) => store.get('exercises', a)).filter((x) => x && (!x.hidden || x.id === original));
  const html = `<p class="muted">Same movement as ${esc(ex?.name)}. Your sets and reps stay the same.</p>
    <ul class="pick">${list.map((x) => `<li><button data-pick="${x.id}">${esc(x.name)}${x.id === original ? ' <small>(original)</small>' : ''}</button></li>`).join('') || '<li class="muted">No swaps set up for this exercise yet.</li>'}</ul>
    <button class="link" data-other>Pick any other exercise…</button>`;
  const swapTo = (to) => {
    entry.swappedFrom = to === original ? undefined : original;
    entry.exerciseId = to;
    // The old weight belongs to the old exercise; keep reps, clear the load.
    entry.sets.forEach((s) => { if (!s.done) { s.weight = null; s.targetWeight = null; delete s.targetPct; } });
  };
  sheet('Swap exercise', html, (w) => {
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) {
        const to = b.dataset.pick;
        swapTo(to);
        closeSheet(); done();
      }
      if (e.target.closest('[data-other]')) pickExerciseSheet((to) => { swapTo(to); done(); });
    });
  });
}

// With allowNew (coach side), typing a name that isn't in the library offers
// to create it on the spot.
export function pickExerciseSheet(onPick, { allowNew = false } = {}) {
  const all = store.all('exercises').filter((x) => !x.hidden).sort((a, b) => a.name.localeCompare(b.name));
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
        const x = store.put('exercises', { id: store.uid('ex'), name: q.value.trim(), pattern: 'other', body: 'full', loaded: true, alts: [] });
        toast(`Added "${x.name}" to the library. Set its movement type there.`);
        closeSheet(); onPick(x.id); return;
      }
      const b = e.target.closest('[data-pick]');
      if (b) { closeSheet(); onPick(b.dataset.pick); }
    });
  });
}

function switchSheet(athleteId, iso, onPick) {
  const groups = store.assignmentsFor(athleteId).map((a) => ({ a, block: store.get('blocks', a.blockId) })).filter((g) => g.block && g.block.kind !== 'warmup');
  if (!groups.length) { toast('No program assigned yet. Ask your coach.'); return; }
  const html = groups.map(({ a, block }) => {
    const curWeek = Math.max(0, Math.min(block.weeks - 1, Math.floor((new Date(iso) - new Date(a.startDate)) / (7 * 86400000))));
    let h = `<h3>${progTag(block.name, store.programColor(a))}</h3><p class="muted">Pick any day. Week ${curWeek + 1} is this week.</p>`;
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

  // Mid-week, compare with the same days of last week, not the whole of it.
  const isNow = mon === weekStart(today());
  const upto = isNow ? cur.days.findIndex((d) => d.iso === today()) : 6;
  const prevSoFar = prev.days.slice(0, upto + 1).reduce((acc, d) => addTotals(acc, d.totals), emptyTotals());
  const prevSessions = prev.days.slice(0, upto + 1).filter((d) => loggedWork(d.log)).length;
  const vs = isNow ? 'vs this point last week' : 'vs last week';
  const delta = (v, p) => {
    if (!p) return `<span class="delta">${v ? 'new this week' : '—'}</span>`;
    const pct = Math.round(((v - p) / p) * 100);
    return `<span class="delta ${pct > 0 ? 'up' : ''} ${pct > 30 ? 'big' : ''}" title="${vs}">${pct === 0 ? 'same' : `${pct > 0 ? '+' : ''}${pct}%`}</span>`;
  };
  const big = (n) => (n >= 10000 ? `${fmt(n / 1000, 1)}k` : fmt(n));
  const extras = [
    t.highContacts ? ['High-intensity contacts', fmt(t.highContacts)] : null,
    t.reps ? ['Total reps', fmt(t.reps)] : null,
    cur.load ? ['Session load', `${fmt(cur.load)} AU`] : null,
    t.sprintMeters ? ['Sprint', `${fmt(t.sprintMeters)} m`] : null,
    t.throws ? ['Throws', fmt(t.throws)] : null,
  ].filter(Boolean);
  const maxDay = Math.max(1, ...cur.days.map((d) => Math.max(d.totals.tonnage, d.planned ? planTonnage(id, d.iso) : 0)));

  root.innerHTML = `
    <header class="page-head">${coachBack(id)}<h1>Progress</h1></header>
    <div class="row between" style="margin:0 2px 10px"><b>Week of ${fmtDate(mon, { month: 'short', day: 'numeric' })}</b>
      <div class="week-nav">
        <a class="icon-btn" href="#/athlete/${id}/week?d=${addDays(mon, -7)}" aria-label="Previous week">‹</a>
        <a class="icon-btn" href="#/athlete/${id}/week?d=${addDays(mon, 7)}" aria-label="Next week">›</a>
      </div></div>
    <div class="stat-strip">
      <div class="stat"><span class="stat-label">Sessions</span><span class="stat-value">${cur.sessionsDone}<small>/ ${cur.sessionsPlanned}</small></span>${delta(cur.sessionsDone, prevSessions)}</div>
      <div class="stat"><span class="stat-label">Volume</span><span class="stat-value">${big(w(t.tonnage))}<small>${u}</small></span>${delta(t.tonnage, prevSoFar.tonnage)}</div>
      <div class="stat"><span class="stat-label">Contacts</span><span class="stat-value">${fmt(t.contacts)}</span>${delta(t.contacts, prevSoFar.contacts)}</div>
    </div>
    ${extras.length ? `<p class="extra-stats">${extras.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('')}</p>` : ''}
    <p class="muted small" style="margin:-6px 4px 14px">Changes are ${vs}.</p>
    <section class="card"><div class="row between"><h3 style="margin:0">Volume by day</h3><span class="muted small">${u}</span></div>
      <div class="day-cols-chart">${cur.days.map((d) => {
        const done = d.totals.tonnage, plan = d.planned ? planTonnage(id, d.iso) : 0;
        const h = (v) => `${Math.max(3, Math.round((v / maxDay) * 100))}%`;
        return `<div title="${fmtDate(d.iso)}: ${fmt(w(done))} ${u}"><span class="col">${plan && !done ? `<i class="plan" style="height:${h(plan)}"></i>` : ''}${done ? `<i class="done" style="height:${h(done)}"></i>` : ''}${!plan && !done ? '<i class="min"></i>' : ''}</span>${fmtDate(d.iso, { weekday: 'narrow' })}</div>`;
      }).join('')}</div>
      <p class="chart-key">Solid is done, dashed is planned.</p>
    </section>
    <section class="card"><h3>Sets by movement</h3>
      ${patterns.length ? bars(patterns.map((p) => ({ label: PATTERN_LABEL[p], value: t.setsByPattern[p] || 0, sub: `of ${cur.planned.setsByPattern[p] || 0}` }))) : '<p class="muted">Nothing logged yet this week.</p>'}
    </section>
    <h3 class="list-head" style="margin-top:20px">Workouts this week</h3>
    ${sessions.length ? `<div class="list">${sessions.map((d) => `<a href="#/athlete/${id}/session/${d.iso}"><span class="grow"><span class="name">${esc(d.log.name)}</span><br><span class="sub">${fmtDate(d.iso)} · ${fmt(d.totals.sets)} sets${d.log.sessionRpe ? ` · effort ${d.log.sessionRpe}` : ''}</span></span><span class="right"><b>${fmt(w(d.totals.tonnage))}</b> ${u}</span><span class="chev"></span></a>`).join('')}</div>`
      : '<p class="muted" style="margin:0 4px 14px">No workouts logged this week yet.</p>'}
    <section class="card"><h3>Planned vs done</h3>
      <ul class="kv">
        <li><span>Volume (${u})</span><span><b>${fmt(w(t.tonnage))}</b> <span class="muted">of ${fmt(w(cur.planned.tonnage))}</span></span></li>
        <li><span>Plyo contacts</span><span><b>${fmt(t.contacts)}</b> <span class="muted">of ${fmt(cur.planned.contacts)}</span></span></li>
        <li><span>Sets</span><span><b>${fmt(t.sets)}</b> <span class="muted">of ${fmt(cur.planned.sets)}</span></span></li>
        <li><span>Reps at 80%+ of max</span><span><b>${fmt(t.zones.z80 + t.zones.z90)}</b> <span class="muted">of ${fmt(cur.planned.zones.z80 + cur.planned.zones.z90)}</span></span></li>
      </ul>
    </section>
    <section class="card"><h3>Load trend</h3>
      ${trend.ratio == null
        ? `<p class="muted">Last 7 days: ${fmt(trend.acute)} AU. The 7-day vs 4-week comparison appears after about three weeks of logging.</p>`
        : `<p>Last 7 days: <b>${fmt(trend.acute)} AU</b>, 4-week weekly average: <b>${fmt(trend.chronicWeekly)} AU</b>, ratio <b class="${trend.ratio > 1.5 ? 'warn' : ''}">${fmt(trend.ratio, 2)}</b>.</p>
           <p class="muted">Above about 1.5 means a big jump. Worth a word with your coach, not a diagnosis.</p>`}
    </section>
    <p class="muted small">Session load = session effort (1–10) × minutes. Plyo tiers: ${Object.entries(PLYO_TIERS).filter(([k]) => k >= 5).map(([, v]) => v).join(', ')} count as high intensity.</p>`;
}

// Planned volume for one day (the dashed bars on Progress).
function planTonnage(athleteId, iso) {
  const p = store.plannedOn(athleteId, iso)[0];
  if (!p) return 0;
  const ex = store.exercisesById();
  const a = store.get('athletes', athleteId);
  const s = buildSession(p.block, p.dayIndex, p.week, a, store.roundStep());
  return s ? sessionTotals(s, ex, false).tonnage : 0;
}

// Where a max came from: "est. from 185 × 5, Nov 3" or "typed in".

// One exercise at a time: a dropdown of exercises (ones with a max first,
// showing it) and the chosen one's max below. `edit` adds a box to change it.
const pickedMax = {};
export function maxPicker(a, ex, u, { edit = false, choices = [] } = {}) {
  const maxes = a?.maxes || {};
  const name = (k) => ex[k]?.name || k;
  const withMax = Object.keys(maxes).sort((x, y) => name(x).localeCompare(name(y)));
  const rest = edit ? choices.map((x) => x.id).filter((k) => maxes[k] == null) : [];
  const ids = [...withMax, ...rest];
  if (!ids.length) return '';
  let k = pickedMax[a.id];
  if (!ids.includes(k)) k = ids[0];
  pickedMax[a.id] = k;
  const v = maxes[k];
  const opt = (x) => `<option value="${esc(x)}" ${x === k ? 'selected' : ''}>${esc(name(x))}${maxes[x] != null ? ` · ${fmt(store.showW(maxes[x], u), 1)} ${u}` : ''}</option>`;
  return `<div class="max-pick">
    <select data-action="pickMax" data-athlete="${esc(a.id)}" aria-label="Exercise">${withMax.map(opt).join('')}${rest.length ? `<option disabled>── No max yet ──</option>${rest.map(opt).join('')}` : ''}</select>
    <div class="max-show"><span class="stat-label">${esc(name(k))}</span>
      ${edit ? `<label class="max-edit"><input type="number" inputmode="decimal" step="any" value="${v != null ? store.showW(v, u) : ''}" placeholder="No max yet" data-action="setMax" data-ex="${esc(k)}" aria-label="Max for ${esc(name(k))}"><span>${u}</span></label>`
        : `<b class="stat-value">${fmt(store.showW(v, u), 1)} <small>${u}</small></b>`}
      <small class="max-src">${v != null ? maxSource(a, k, u) : 'Type a number to set one, or it fills in after a logged set.'}</small></div></div>`;
}
export const pickMax = (el) => { pickedMax[el.dataset.athlete] = el.value; };

export function maxSource(a, k, u = store.unit()) {
  const m = a?.maxInfo?.[k];
  return m?.est ? `est. from ${fmt(store.showW(m.weight, u), 1)} ${u} × ${m.reps}${m.date ? `, ${fmtDate(m.date, { month: 'short', day: 'numeric' })}` : ''}` : 'typed in';
}

export function history(root, { id }) {
  store.fillMaxes(id);
  const logs = store.logsFor(id).filter((l) => loggedWork(l) && !l.warmup).reverse();
  const ex = store.exercisesById();
  const u = store.unit();
  const athlete = store.get('athletes', id);
  const maxes = Object.entries(athlete?.maxes || {});
  root.innerHTML = `
    <header class="page-head">${coachBack(id)}<h1>History</h1></header>
    ${maxes.length ? `<section class="card"><h3>Current maxes</h3>${maxPicker(athlete, ex, u)}</section>` : ''}
    ${logs.length ? (() => {
      // Grouped by week, newest first, as list rows.
      const weeks = [];
      for (const l of logs) { const wk = weekStart(l.date); if (weeks[weeks.length - 1]?.wk !== wk) weeks.push({ wk, logs: [] }); weeks[weeks.length - 1].logs.push(l); }
      return weeks.map(({ wk, logs: ls }) => `<div class="list-head"><span>Week of ${fmtDate(wk, { month: 'short', day: 'numeric' })}</span><span>${ls.length} session${ls.length === 1 ? '' : 's'}</span></div>
        <div class="list">${ls.map((l) => {
          const t = sessionTotals(l, ex, true);
          const notes = [l.note, ...l.entries.filter((e) => e.athleteNote).map((e) => `${ex[e.exerciseId]?.name}: ${e.athleteNote}`)].filter(Boolean);
          return `<a href="#/athlete/${id}/session/${l.date}"><span class="grow"><span class="name">${esc(l.name)}${l.finished ? '' : ' <small class="muted">not finished</small>'}</span><br>
            <span class="sub">${(() => { const pg = store.logProgram(l); return pg ? `${progTag(pg.name, pg.color)} ` : ''; })()}${fmtDate(l.date)}${l.sessionRpe ? ` · effort ${l.sessionRpe}` : ''}${l.minutes ? ` · ${l.minutes} min` : ''}</span>
            ${notes.length ? `<br><span class="sub note">“${esc(notes.join(' · '))}”</span>` : ''}</span>
            <span class="right"><b>${fmt(store.showW(t.tonnage))}</b> ${u}${t.contacts ? `<br>${fmt(t.contacts)} contacts` : ''}</span><span class="chev"></span></a>`;
        }).join('')}</div>`).join('');
    })() : '<p class="empty"><b>No sessions yet</b>Finished workouts show up here.</p>'}`;
  bindActions(root, { pickMax: (el) => { pickMax(el); history(root, { id }); } });
}