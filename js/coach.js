// Coach screens: team board, athlete detail, block builder, assigning, exercise library.

import * as store from './store.js';
import { toISO, addDays, daysBetween, weekStart, buildSession, sessionTotals, addTotals, emptyTotals, parseQuickEntry, defaultWeekdays, measureOf, isCount, fromUnit, prescribedSets, prescribedReps, prescribedRepsTo, parseReps, repsText, prescribedSecs, prescribedPct, prescribedWeight, weekOverride, offInWeek, exerciseInWeek, loggedWork, assignmentStatus, scheduledOn, libraryView, libraryMatch, patternOf, filterCount, EST_MAX_REPS, PATTERNS, PLYO_TIERS } from './calc.js';
import { weekSummary, loadTrend } from './summary.js';
import { esc, fmt, fmtDate, progTag, bindActions, toast, stat, unitSeg, ask, askFields, choose, sheet, closeSheet, demoSheet, demoAttrs, PATTERN_LABEL, $ } from './ui.js';
import { changeItem, removeItem, restoreItem, addItem, weekView } from './plan.js';
import { pickExerciseSheet, videoSheet, maxPicker, pickMax, sessionHref, dayCards } from './athlete.js';
import { TEMPLATES } from './templates.js';
import { planLibraryImport } from './libimport.js';
import { parseProgression, describeRules, applyProgression, clearWeeks } from './progression.js';
import { removeAthleteLogin, removeVideos, videoFresh, hasLogin, cloudEnabled } from './sync.js';

const today = () => toISO(new Date());
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- team board ----------

export function board(root, _p, query) {
  const mon = weekStart(query.get('d') || today());
  const isNow = mon === weekStart(today());
  const show = query.get('show') || '';
  const groups = [...new Set(store.all('athletes').map((a) => a.group).filter(Boolean))].sort();
  const group = query.get('g') || '';
  const athletes = store.all('athletes').filter((a) => !group || a.group === group);
  const u = store.unit();
  const t = today();
  let team = { tonnage: 0, contacts: 0, done: 0, planned: 0 };
  const counts = { today: 0, due: 0, missed: 0 };
  const people = athletes.map((a) => {
    const w = weekSummary(a.id, mon);
    const trend = loadTrend(a.id, t);
    team.tonnage += w.done.tonnage; team.contacts += w.done.contacts; team.done += w.sessionsDone; team.planned += w.sessionsPlanned;
    const lastNote = store.logsFor(a.id).filter((l) => loggedWork(l) && (l.note || l.entries.some((e) => e.athleteNote))).pop();
    const noteTxt = lastNote ? (lastNote.note || lastNote.entries.find((e) => e.athleteNote)?.athleteNote) : '';
    // Planned days gone by with nothing finished, less workouts done on other days (moved days aren't missed).
    const undone = w.days.filter((d) => d.planned && d.iso < t && !loggedWork(d.log));
    const moved = w.days.filter((d) => !d.planned && d.iso <= t && loggedWork(d.log)).length;
    const missed = Math.max(0, undone.length - moved);
    const td = w.days.find((d) => d.iso === t);
    const trainedToday = isNow && td && loggedWork(td.log);
    const dueToday = isNow && td && td.planned && !loggedWork(td.log);
    if (trainedToday) counts.today++;
    if (dueToday) counts.due++;
    if (missed) counts.missed++;
    // One dot a day: done, missed, planned (today outlined), or nothing.
    const dots = w.days.map((d) => {
      const c = loggedWork(d.log) ? 'd' : d.planned && d.iso < t && missed ? 'm' : d.iso === t && d.planned ? 't' : d.planned ? 'p' : '';
      return `<i class="${c}" title="${fmtDate(d.iso)}"></i>`;
    }).join('');
    const firstMiss = missed ? undone[0] : null;
    const flag = missed ? `<span class="pill red">Missed ${missed > 1 ? missed : fmtDate(firstMiss.iso, { weekday: 'short' })}</span>`
      : trend.ratio > 1.5 ? '<span class="pill warn">Load spike</span>'
      : trainedToday ? '<span class="pill green">Trained today</span>' : '';
    const initials = a.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
    const html = `<a href="#/coach/athlete/${a.id}"><span class="avatar">${esc(initials)}</span>
      <span class="grow"><span class="name">${esc(a.name)}</span><span class="dots" aria-label="${w.sessionsDone} of ${w.sessionsPlanned} sessions">${dots}</span>
        ${noteTxt ? `<span class="sub" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">“${esc(noteTxt)}”</span>` : hasLogin(a.id) === false ? '<span class="sub">Not signed up yet</span>' : ''}</span>
      <span class="right">${flag || `${w.sessionsDone}/${w.sessionsPlanned}`}</span><span class="chev"></span></a>`;
    return { a, html, missed, trainedToday, dueToday, rank: missed ? 0 : dueToday ? 1 : trainedToday ? 3 : 2 };
  });
  const filtered = people.filter((p) => (show === 'missed' ? p.missed : show === 'due' ? p.dueToday : show === 'today' ? p.trainedToday : true))
    .sort((x, y) => x.rank - y.rank || x.a.name.localeCompare(y.a.name));
  const q = (o) => { const p = new URLSearchParams({ d: mon, ...(group ? { g: group } : {}), ...(show ? { show } : {}), ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); return `#/coach?${p}`; };
  const tile = (key, label, n, bad = false) => `<a href="${q({ show: show === key ? '' : key })}" class="${bad && n ? 'bad' : ''} ${show === key ? 'on' : ''}"><span class="stat-label">${label}</span><b>${n}</b></a>`;
  root.innerHTML = `
    <header class="page-head"><div class="head-row"><div><span class="kicker">${isNow ? 'This week' : 'Week of'} · ${fmtDate(mon, { month: 'short', day: 'numeric' })}</span><h1>Team</h1></div>
      <div class="row gap"><span class="week-nav"><a class="icon-btn" href="${q({ d: addDays(mon, -7) })}" aria-label="Previous week">‹</a><a class="icon-btn" href="${q({ d: addDays(mon, 7) })}" aria-label="Next week">›</a></span>
      <button class="round-btn" data-action="plus" aria-label="Add">+</button></div></div></header>
    ${isNow ? `<div class="attention">${tile('today', 'Trained today', counts.today)}${tile('due', 'Still to go', counts.due)}${tile('missed', 'Missed', counts.missed, true)}</div>`
      : `<div class="attention">${tile('missed', 'Missed', counts.missed, true)}<div><span class="stat-label">Sessions</span><b>${team.done}<small class="muted" style="font-size:0.9rem"> / ${team.planned}</small></b></div><div><span class="stat-label">Athletes</span><b>${athletes.length}</b></div></div>`}
    <div class="list-head" style="margin-top:18px"><span>${filtered.length} athlete${filtered.length === 1 ? '' : 's'}${show ? ` · <a href="${q({ show: '' })}">show all</a>` : ''}</span>
      ${groups.length > 1 ? `<select data-action="group" aria-label="Group" style="width:auto;min-height:34px;padding:4px 10px"><option value="">All groups</option>${groups.map((g) => `<option ${g === group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}</div>
    ${filtered.length ? `<div class="list">${filtered.map((p) => p.html).join('')}</div>` : `<p class="empty">${athletes.length ? 'Nobody here right now.' : '<b>No athletes yet</b>Tap + to add one, or share the team code from More.'}</p>`}
    <div class="card team-totals"><div><span class="stat-label">Sessions</span><b>${team.done} / ${team.planned}</b></div><div><span class="stat-label">Volume</span><b>${fmt(store.showW(team.tonnage))} ${u}</b></div><div style="text-align:right"><span class="stat-label">Plyo contacts</span><b>${fmt(team.contacts)}</b></div></div>`;
  const addAthlete = async () => {
    const f = await askFields('Add athlete', [{ k: 'name', label: 'Name' }, { k: 'group', label: 'Group', placeholder: 'e.g. Pitchers' }], { ok: 'Add athlete' });
    if (!f) return;
    store.put('athletes', { id: store.uid('ath'), name: f.name, group: f.group, maxes: {} });
    if (cloudEnabled) toast(`Added. When ${f.name} signs up with the team code, they pick their name and get what you assigned.`);
    board(root, _p, query);
  };
  bindActions(root, {
    group: (el) => { location.hash = q({ g: el.value }); },
    plus: () => {
      sheet('Add', `<ul class="menu-list"><li><a href="#/coach/assign">Assign a program</a></li><li><button data-m="athlete">Add an athlete</button></li><li><button data-m="block">New program</button></li></ul>`, (w) => {
        w.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-m]'); if (!b) return;
          closeSheet();
          if (b.dataset.m === 'athlete') return addAthlete();
          const nb = store.put('blocks', { id: store.uid('block'), name: 'New program', weeks: 4, deloadWeek: null, days: [{ name: 'Day 1', items: [] }] });
          location.hash = `#/coach/block/${nb.id}`;
        });
      });
    },
  });
}

// ---------- athlete detail ----------


export function athlete(root, { id }, query = new URLSearchParams()) {
  store.fillMaxes(id);
  const a = store.get('athletes', id);
  if (!a) { root.innerHTML = '<p class="empty">Athlete not found.</p>'; return; }
  const ex = store.exercisesById();
  const u = store.unit();
  const w = weekSummary(id, weekStart(today()));
  // Workouts with ticked sets show even if the athlete never tapped Finish, and
  // warmups show when they hold a form video.
  const hasVid = (l) => l.entries.some((e) => e.sets.some((s) => videoFresh(s.video)));
  const logs = store.logsFor(id).filter((l) => (loggedWork(l) && !l.warmup) || hasVid(l)).reverse().slice(0, 12);
  const loaded = store.all('exercises').filter((x) => x.loaded && !x.hidden).sort((x, y) => x.name.localeCompare(y.name));
  const asg = store.assignmentsFor(id);
  const tab = ['overview', 'program', 'maxes', 'log'].includes(query.get('tab')) ? query.get('tab') : 'overview';
  const initials = a.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const asgs = asg.map((g) => ({ g, b: store.get('blocks', g.blockId) })).map((x) => ({ ...x, s: x.b ? asgState(x.g, x.b) : { st: 'ended', txt: 'Program deleted' } }))
    .sort((x, y) => ORDER[x.s.st] - ORDER[y.s.st]);
  const asgCard = ({ g, b, s }) => {
    const w = b && isWarmup(b);
    const pr = b && !w ? store.programProgress(g, today()) : null;
    const last = pr ? (pr.last && { date: pr.last }) : store.logsFor(id).filter((l) => l.assignmentId === g.id && loggedWork(l)).pop();
    const wkNow = b && !w && s.st === 'active' ? Math.floor(daysBetween(g.startDate, today()) / 7) + 1 : null;
    const color = store.programColor(g);
    // Workouts done from this program out of its days so far: the bar fills as they're done.
    const count = pr && s.st !== 'upcoming' ? `<div class="prog-count"><span>${pr.due || pr.done ? `<b>${pr.done}</b> of ${pr.due} workout${pr.due === 1 ? '' : 's'} done so far` : 'No workouts due yet'}</span><span class="muted">${pr.total} in all</span></div>
      <div class="prog-bar" title="${pr.done} of ${pr.total} workouts done"><i style="width:${pr.total ? Math.min(100, Math.round(pr.done / pr.total * 100)) : 0}%"></i></div>` : '';
    return `<div class="asg-card asg-row ${s.st} ${w ? '' : `prog pc${color}`}">
      <div class="row between">${w ? `<b>${esc(b?.name || '?')} <small class="tag-warm">Warmup</small></b>` : progTag(b?.name || '?', color)}${stateTag(s.st === 'active' ? { st: 'active', txt: 'Active' } : s)}</div>
      ${wkNow ? `<div class="row between small muted" style="margin-top:6px"><span>Week ${wkNow} of ${b.weeks}</span><span>ends ${shortDate(g.endDate || addDays(g.startDate, b.weeks * 7 - 1))}</span></div>` : ''}
      ${count}
      <small class="muted">${last ? `Last logged ${shortDate(last.date)} · ` : ''}${(g.weekdays || []).map((d) => WEEKDAYS[d]).join(', ')}${s.st !== 'active' ? ` · from ${fmtDate(g.startDate)}${g.endDate ? ` to ${fmtDate(g.endDate)}` : ''}` : ''}</small>
      <div class="asg-acts">${w ? `<a class="link" href="#/coach/assignment/${g.id}">Edit</a>` : `<a class="link" href="#/coach/assignment/${g.id}/plan">Change workouts</a><a class="link" href="#/coach/assignment/${g.id}">Schedule</a>`}<button class="link muted-link" data-action="unassign" data-id="${g.id}">Remove</button></div></div>`;
  };
  const current = asgs.filter((x) => x.s.st === 'active' || x.s.st === 'warmup');
  // Program cards under a heading per category (Warmup, Strength, Throwing...).
  const byCategory = (list) => [['warmup', 'Warmup'], ...store.CATEGORIES.map((c) => [c.k, c.label])].map(([k, label]) => {
    const mine = list.filter((x) => (x.b && isWarmup(x.b) ? 'warmup' : store.categoryOf(x.b)) === k);
    return mine.length ? `<h4 class="cat-head">${label}</h4>${mine.map(asgCard).join('')}` : '';
  }).join('');
  const dayColor = (d) => { const pg = store.logProgram(d.log); if (pg) return pg.color; const p = store.plannedOn(id, d.iso)[0]; return p ? store.programColor(p.assignment) : null; };
  // Each day opens the athlete's own Today page for that day (a preview: the
  // coach's device saves nothing just from looking). On a computer, hovering
  // a day shows the same cards in a small pop-over first.
  const days = w.days.map((d) => { const c = dayColor(d); return `<a class="day ${d.iso === today() ? 'today on' : ''} ${d.planned ? 'planned' : ''} ${loggedWork(d.log) ? 'done' : ''} ${c != null ? `pc${c}` : ''}" style="min-height:0" href="#/athlete/${id}?d=${d.iso}" data-peek="${d.iso}" aria-label="See ${esc(a.name.split(' ')[0])}'s ${fmtDate(d.iso, { weekday: 'long' })}"><span>${fmtDate(d.iso, { weekday: 'narrow' })}</span><b style="width:30px;height:30px;font-size:0.88rem">${Number(d.iso.slice(8))}</b><i${c != null ? ' class="pdot"' : ''}></i></a>`; }).join('');
  const logHtml = (list) => list.map((l) => {
        const t = sessionTotals(l, ex, true);
        const swaps = l.entries.filter((e) => e.swappedFrom).map((e) => `${ex[e.swappedFrom]?.name} → ${ex[e.exerciseId]?.name}`);
        const notes = l.entries.filter((e) => e.athleteNote).map((e) => `${ex[e.exerciseId]?.name}: ${e.athleteNote}`);
        const vids = l.entries.flatMap((e) => e.sets.map((s, j) => (videoFresh(s.video) ? `<button class="vid-chip" data-action="playVideo" data-path="${esc(s.video.path)}">▶ ${esc(ex[e.exerciseId]?.name || '')} · set ${j + 1}</button>` : ''))).join('');
        const pg = store.logProgram(l);
        return `<div class="log-item"><div class="row between"><span><a class="log-open" href="${sessionHref(l)}">${esc(l.name)}</a>${l.warmup ? ' <small class="tag-warm">Warmup</small>' : ''}${l.finished ? '' : ' <small class="muted">not finished</small>'}</span><span class="muted small">${fmtDate(l.date)}</span></div>
          ${pg ? `<p class="small" style="margin:4px 0 0">${progTag(pg.name, pg.color, l.week)}</p>` : ''}
          <p class="muted small">Effort ${l.sessionRpe ?? '–'} · ${l.minutes ?? '–'} min · ${fmt(store.showW(t.tonnage))} ${u}${t.contacts ? ` · ${fmt(t.contacts)} contacts` : ''}${l.switchedFrom ? ' · switched day' : ''}</p>
          ${l.note ? `<p class="note">“${esc(l.note)}”</p>` : ''}
          ${notes.map((n) => `<p class="note small">${esc(n)}</p>`).join('')}
          ${swaps.length ? `<p class="small muted">Swaps: ${esc(swaps.join(', '))}</p>` : ''}
          ${(l.maxFlags || []).map((f) => `<p class="small warn-text">Check: ${esc(ex[f.exerciseId]?.name || '')} suggests a max of ${fmt(store.showW(f.est))} ${u}. Not saved; change it on the Maxes tab if it's real.</p>`).join('')}
          ${vids ? `<div class="row gap wrap vids">${vids}</div>` : ''}</div>`;
      }).join('') || '<p class="muted">Nothing logged yet.</p>';
  const views = {
    overview: `
      <section class="card"><div class="row between"><h3 style="margin:0">This week</h3><span class="muted small">${w.sessionsDone} of ${w.sessionsPlanned} · ${fmt(store.showW(w.done.tonnage))} ${u}</span></div>
        <div class="date-strip" style="margin:8px -6px 0">${days}</div>
        <p class="muted small peek-hint">Tap a day to see it the way ${esc(a.name.split(' ')[0])} does.</p></section>
      <section class="card">${current.length ? byCategory(current) : '<p class="muted">No program running right now.</p>'}
        <a class="link" href="#/coach/assign?athlete=${id}">+ Assign a program or warmup</a></section>
      <div class="list-head"><span>Recent sessions</span><a href="#/coach/athlete/${id}?tab=log">See all</a></div>
      <section class="card">${logHtml(logs.slice(0, 3))}</section>`,
    program: `<section class="card">${byCategory(asgs) || '<p class="muted">No program assigned.</p>'}
      <a class="link" href="#/coach/assign?athlete=${id}">+ Assign a program or warmup</a></section>`,
    maxes: `<section class="card"><div class="row between"><h3 style="margin:0">Maxes</h3>${unitSeg(u)}</div>
      ${maxPicker(a, ex, u, { edit: true, choices: loaded })}
      <p class="muted small">Worked out for you from logged lifts (rep-max formula, sets of ${EST_MAX_REPS} reps or fewer). A new best raises a max by up to 20%; bigger jumps are flagged in the log for you to check. Type a number to set a max yourself; it stays until a logged set beats it. Clear the box to remove that max.</p></section>`,
    log: `<div class="stats">
      ${stat('Sessions this week', w.sessionsDone, null, ` / ${w.sessionsPlanned}`)}
      ${stat('Volume', store.showW(w.done.tonnage), null, ` ${u}`)}
      ${stat('Plyo contacts', w.done.contacts)}
      ${stat('Session load', w.load, null, ' AU')}</div>
      <section class="card">${logHtml(logs)}</section>`,
  };
  root.innerHTML = `
    <header class="page-head"><div class="row between"><a class="back" href="#/coach">Team</a><button class="more-btn" data-action="menu" aria-label="More">•••</button></div>
      <div class="row gap" style="gap:12px;margin-top:4px"><span class="avatar big">${esc(initials)}</span><div style="min-width:0"><h1 style="font-size:1.9rem">${esc(a.name)}</h1>
        <p class="muted small">${esc([a.group, [...new Set(current.filter((x) => x.b && !isWarmup(x.b)).flatMap((x) => x.g.weekdays || []))].sort().map((d) => WEEKDAYS[d]).join(', ')].filter(Boolean).join(' · trains '))}</p></div></div></header>
    <nav class="tabs-seg" aria-label="Sections">${[['overview', 'Overview'], ['program', 'Program'], ['maxes', 'Maxes'], ['log', 'Log']].map(([k, label]) => `<a href="#/coach/athlete/${id}${k === 'overview' ? '' : `?tab=${k}`}" class="${tab === k ? 'on' : ''}">${label}</a>`).join('')}</nav>
    ${views[tab]}`;
  const handlers = {
    menu: () => sheet(a.name, `<ul class="menu-list"><li><a href="#/athlete/${id}">Open athlete view</a></li><li><a href="#/athlete/${id}/week">Weekly numbers</a></li><li><a href="#/coach/assign?athlete=${id}">Assign a program</a></li></ul>
      <div class="menu-gap"></div><ul class="menu-list"><li><button class="danger" data-m="remove">Remove from team</button></li></ul>
      <p class="muted small" style="margin-top:10px">Removing cuts off ${esc(a.name.split(' ')[0])}'s access and deletes their programs, logs and notes.</p>`, (wr) => {
      wr.querySelector('[data-m="remove"]').addEventListener('click', () => { closeSheet(); handlers.removeAthlete(); });
    }),
    removeAthlete: async () => {
      if (!await ask(`${a.name} loses access right away. Their programs, logs and notes are deleted too. This can't be undone.`, { title: `Remove ${a.name}?`, ok: 'Remove from team', danger: true })) return;
      try { await removeAthleteLogin(id); } catch (e) { toast(`Couldn't remove: ${e.message}`); return; }
      removeVideos(store.logsFor(id).flatMap((l) => l.entries.flatMap((e) => e.sets.map((s) => s.video?.path).filter(Boolean))));
      for (const g of store.assignmentsFor(id)) store.del('assignments', g.id);
      for (const l of store.logsFor(id)) store.del('logs', l.id);
      store.del('athletes', id);
      toast(`${a.name} removed`);
      location.hash = '#/coach';
    },
    playVideo: (el) => videoSheet(el.dataset.path),
    setMax: (el) => {
      const k = el.dataset.ex;
      // A removed max isn't estimated again from the lifts already logged,
      // only from new ones.
      if ((el.value === '' || !Number(el.value)) && a.maxes?.[k] == null) return;
      if (el.value === '' || !Number(el.value)) { delete a.maxes[k]; a.maxInfo = { ...a.maxInfo, [k]: { cleared: today() } }; store.put('athletes', a); toast('Max removed'); athlete(root, { id }, query); return; }
      a.maxes[k] = store.readW(Number(el.value)); a.maxInfo = { ...a.maxInfo }; delete a.maxInfo[k]; store.put('athletes', a); toast('Max saved'); athlete(root, { id }, query);
    },
    setUnits: (el) => { store.setSetting('units', el.dataset.v); athlete(root, { id }, query); },
    pickMax: (el) => { pickMax(el); athlete(root, { id }, query); },
    unassign: async (el) => { if (await ask('Logged sessions stay.', { title: 'Remove this program?', ok: 'Remove program', danger: true })) { store.del('assignments', el.dataset.id); athlete(root, { id }, query); } },
  };
  bindActions(root, handlers);
  peekDays(root, id);
}

// Hover pop-over for the coach's week strip: what the athlete's Today page
// shows for that day. Only on devices with a real mouse; a tap just opens it.
function peekDays(root, id) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let pop = null, t = null;
  const hide = () => { clearTimeout(t); pop?.remove(); pop = null; };
  const show = (el) => {
    hide();
    const iso = el.dataset.peek;
    pop = document.createElement('div');
    pop.className = 'day-peek';
    pop.setAttribute('role', 'tooltip');
    pop.innerHTML = `<p class="kicker">${fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })}</p>${dayCards(id, iso, { peek: true }).html}<p class="muted small">Click to open</p>`;
    document.body.append(pop);
    const r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, innerWidth - pw - 8));
    const below = r.bottom + 8 + ph <= innerHeight - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - ph - 8)}px`;
  };
  root.querySelectorAll('[data-peek]').forEach((el) => {
    el.addEventListener('mouseenter', () => { if (!fine.matches) return; clearTimeout(t); t = setTimeout(() => show(el), 180); });
    el.addEventListener('mouseleave', hide);
    el.addEventListener('click', hide);
  });
  // Gone when the page redraws or changes.
  const prev = root._unbind;
  root._unbind = () => { prev?.(); hide(); };
}

// ---------- blocks ----------

// Saved warmups live with the blocks (kind 'warmup', one day) so they sync the
// same way. A coach loads one into program days, or assigns it to athletes like
// a block; it then shows as its own card on the athlete's day, logged on its own.
const isWarmup = (b) => b.kind === 'warmup';
const shortDate = (iso) => fmtDate(iso, { month: 'short', day: 'numeric' });

// Where one athlete's assignment stands today, for the coach's pages:
// { st: 'active' | 'hidden' | 'upcoming' | 'ended' | 'warmup', txt }.
// 'hidden' is a program whose dates are running but another program that
// started later takes over the athlete's days, so they never see it.
function asgState(g, b) {
  const iso = today();
  const st = assignmentStatus(g, b, iso);
  if (st === 'upcoming') return { st, txt: `Starts ${shortDate(g.startDate)}` };
  if (st === 'ended') {
    const last = addDays(g.startDate, b.weeks * 7 - 1);
    return { st, txt: `Ended ${shortDate(isWarmup(b) || (g.endDate && g.endDate < last) ? g.endDate : last)}` };
  }
  if (isWarmup(b)) return { st: 'warmup', txt: 'Running' };
  // Several programs can run at once, each on its own days. One is hidden
  // only when it no longer gets any days (another copy of the same program
  // took over).
  const shows = Array.from({ length: 14 }, (_, k) => addDays(iso, k)).some((d) => store.plannedOn(g.athleteId, d).some((p) => p.assignment.id === g.id));
  const ahead = Array.from({ length: 14 }, (_, k) => addDays(iso, k)).some((d) => scheduledOn(g, b, d));
  const wk = `week ${Math.floor(daysBetween(g.startDate, iso) / 7) + 1} of ${b.weeks}`;
  return shows || !ahead ? { st: 'active', txt: `Active now, ${wk}` } : { st: 'hidden', txt: `A newer copy of this program took over its days (${wk})` };
}
const ORDER = { active: 0, warmup: 1, hidden: 2, upcoming: 3, ended: 4 };
const stateTag = (s) => `<span class="asg-state ${s.st}">${esc(s.txt)}</span>`;

// Everyone on a block, active first: [{ g, a, s }].
function onBlock(blockId) {
  const b = store.get('blocks', blockId);
  return store.all('assignments').filter((g) => g.blockId === blockId)
    .map((g) => ({ g, a: store.get('athletes', g.athleteId), s: asgState(g, b) }))
    .filter((x) => x.a)
    .sort((x, y) => ORDER[x.s.st] - ORDER[y.s.st] || x.a.name.localeCompare(y.a.name));
}
const whoLine = (list) => `<span class="who-list">${list.map(({ a, s }) => `<span class="who-item"><a href="#/coach/athlete/${a.id}">${esc(a.name)}</a> ${stateTag(s)}</span>`).join('')}</span>`;

export function blocks(root) {
  const all = store.all('blocks').sort((a, b) => a.name.localeCompare(b.name));
  // Who's on it, as one line: "4 athletes · 4 active now". Tap to see each person.
  const whoSum = (who) => {
    if (!who.length) return '<span class="who-sum">Not assigned to anyone</span>';
    const active = who.filter((x) => x.s.st === 'active' || x.s.st === 'warmup').length;
    const wk = who.find((x) => x.s.st === 'active')?.s.txt.match(/week \d+ of \d+/)?.[0];
    return `<details class="who-sum"><summary>${who.length} athlete${who.length === 1 ? '' : 's'}${active ? ` · ${active} active${wk && active === who.length ? `, ${wk}` : ''}` : ''}</summary><p class="small who">${whoLine(who)}</p></details>`;
  };
  const row = (b, sub) => `<div class="card block-row">
      <div class="row between"><h3 style="margin:0"><a href="#/coach/block/${b.id}">${esc(b.name)}</a></h3>
        <button class="more-btn" data-action="menu" data-id="${b.id}" aria-label="More for ${esc(b.name)}">•••</button></div>
      <small class="muted">${sub}</small>
      ${whoSum(onBlock(b.id))}
      <div class="asg-acts" style="margin-top:6px"><a class="link" href="#/coach/block/${b.id}">Edit</a><a class="link" href="#/coach/assign?block=${b.id}">Assign</a></div></div>`;
  const tpl = (t) => `<li><span class="grow"><span class="name">${esc(t.name)}</span><br><span class="sub">${esc(t.about)}</span></span>
        <button class="chip" data-action="useTemplate" data-id="${t.id}">Add</button></li>`;
  root.innerHTML = `
    <header class="page-head"><div class="head-row"><h1>Programs</h1><button class="round-btn" data-action="new" aria-label="New program">+</button></div>
      <p class="muted">Build a program once, then assign it to anyone.</p></header>
    ${all.filter((b) => !isWarmup(b)).map((b) => row(b, `${store.categoryLabel(store.categoryOf(b))} · ${b.weeks} weeks · ${b.days.length} days a week${b.deloadWeek != null ? ` · deload week ${b.deloadWeek + 1}` : ''}`)).join('') || '<p class="empty"><b>No programs yet</b>Tap + or start from a template below.</p>'}
    <div class="list-head" style="margin-top:26px"><span>Warmups</span><button class="link" data-action="newWarmup">+ New warmup</button></div>
    <p class="muted small" style="margin:0 4px 10px">Assign a warmup and it shows above the athlete's workout. You can also load one into a program day.</p>
    ${all.filter(isWarmup).map((b) => row(b, `${b.days[0]?.items.length || 0} exercises`)).join('')}
    <section class="templates">
      <div class="list-head"><span>Start from a template</span></div>
      <ul class="list">${TEMPLATES.filter((t) => !t.kind).map(tpl).join('')}${TEMPLATES.filter((t) => t.kind === 'warmup').map(tpl).join('')}</ul>
    </section>`;
  const handlers = {
    new: () => {
      const b = store.put('blocks', { id: store.uid('block'), name: 'New program', weeks: 4, deloadWeek: null, days: [{ name: 'Day 1', items: [] }] });
      location.hash = `#/coach/block/${b.id}`;
    },
    newWarmup: () => {
      const b = store.put('blocks', { id: store.uid('block'), kind: 'warmup', name: 'New warmup', weeks: 1, deloadWeek: null, days: [{ name: 'Warmup', items: [] }] });
      location.hash = `#/coach/block/${b.id}`;
    },
    // Copies the template into this team's programs, adding any exercises
    // (or demo videos) the library is missing, then opens it for editing or assigning.
    useTemplate: async (el) => {
      const t = TEMPLATES.find((x) => x.id === el.dataset.id);
      // Name it (and pick its category) first, so copies don't all keep the template's name.
      const warmT = t.kind === 'warmup';
      const f = await askFields(`Add "${t.name}"`, [{ k: 'name', label: 'Name', value: '', placeholder: warmT ? 'e.g. Pitchers warmup' : 'e.g. Spring 2027 strength' },
        ...(warmT ? [] : [{ k: 'category', label: 'Category', options: store.CATEGORIES.map((c) => [c.k, c.label]), value: t.block.category || 'strength' }])], { ok: 'Add' });
      if (!f) return;
      for (const e of t.exercises) {
        const have = store.get('exercises', e.id);
        if (!have) store.put('exercises', structuredClone(e));
        else if (e.video && !have.video) store.put('exercises', { ...have, video: e.video });
      }
      const nb = { ...structuredClone(t.block), id: store.uid('block'), name: f.name };
      if (!warmT) { if (f.category && f.category !== 'strength') nb.category = f.category; else delete nb.category; }
      const b = store.put('blocks', nb);
      toast(`Added "${b.name}". Assign it from here when you're ready.`);
      location.hash = `#/coach/block/${b.id}`;
    },
    menu: (el) => {
      const b = store.get('blocks', el.dataset.id);
      sheet(b.name, `<ul class="menu-list"><li><a href="#/coach/block/${b.id}">Edit</a></li><li><a href="#/coach/assign?block=${b.id}">Assign</a></li><li><button data-m="dup">Make a copy</button></li></ul>
        <div class="menu-gap"></div><ul class="menu-list"><li><button class="danger" data-m="del">Delete ${isWarmup(b) ? 'warmup' : 'program'}</button></li></ul>`, (w) => {
        w.addEventListener('click', (ev) => {
          const m = ev.target.closest('[data-m]'); if (!m) return;
          closeSheet();
          handlers[m.dataset.m]({ dataset: { id: b.id } });
        });
      });
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
  };
  bindActions(root, handlers);
}

function findExercise(name) {
  const n = name.toLowerCase().trim();
  const all = store.all('exercises');
  return all.find((x) => x.name.toLowerCase() === n)
    || all.find((x) => x.id === n.replace(/\s+/g, '-'))
    || all.find((x) => x.name.toLowerCase().startsWith(n))
    || all.find((x) => x.name.toLowerCase().includes(n));
}

// A number with − / + buttons either side, for sets, reps and seconds.
// `own` marks a number set for this week only.
function stepper(label, k, value, min, step = 1, own = false) {
  return `<div class="stepper ${own ? 'wk-own' : ''}"><span>${label}</span>
    <div class="stepper-row"><button class="step-btn" data-action="step" data-k="${k}" data-d="${-step}" aria-label="Less ${label.toLowerCase()}">−</button>
    <input type="number" inputmode="numeric" min="${min}" step="${step}" value="${value ?? ''}" data-action="itemField" data-k="${k}" aria-label="${label}">
    <button class="step-btn" data-action="step" data-k="${k}" data-d="${step}" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
}

// The reps box takes one number or a range like "10-15". The − / + buttons
// move both ends of a range.
function repsStepper(label, reps, repsTo, own = false) {
  return `<div class="stepper reps-stepper ${own ? 'wk-own' : ''}"><span>${label}</span>
    <div class="stepper-row"><button class="step-btn" data-action="step" data-k="reps" data-d="-1" aria-label="Less ${label.toLowerCase()}">−</button>
    <input type="text" autocomplete="off" placeholder="10-15" value="${repsText(reps, repsTo, '-')}" data-action="repsField" data-k="reps" aria-label="${label}, one number or a range like 10-15">
    <button class="step-btn" data-action="step" data-k="reps" data-d="1" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
}

const MEASURES = [['reps', 'Reps'], ['time', 'Time'], ['breaths', 'Breaths'], ['none', 'No sets']];

// Switch a program item to another measure, keeping its numbers sensible.
function setMeasure(it, v) {
  if (v === 'reps') delete it.measure; else it.measure = v;
  if (v === 'time' && it.secs == null) it.secs = 30;
  if (v === 'breaths' && it.reps == null) it.reps = 5;
  if (!isCount(v) && it.reps == null) delete it.reps;
  // Breathing drills carry no load.
  if (v === 'breaths') clearLoad(it);
  // A weekly rule only makes sense for the measure it was written for.
  const pt = it.progression?.type;
  if ((pt === 'add_reps' && !isCount(v)) || (pt === 'add_secs' && v !== 'time') || v === 'none'
    || (v === 'breaths' && ['add_pct', 'add_weight'].includes(pt))) it.progression = undefined;
}

function clearLoad(it) {
  delete it.pct; delete it.weight; delete it.maxFrom;
  if (['add_pct', 'add_weight'].includes(it.progression?.type)) it.progression = undefined;
}

// A new program item starts the way its exercise is usually logged.
function newItem(exId, warm) {
  const it = warm ? { exerciseId: exId, warmup: true, sets: 1, reps: 10 } : { exerciseId: exId, sets: 3, reps: 8 };
  const m = store.get('exercises', exId)?.measure;
  if (m && m !== 'reps') setMeasure(it, m);
  if (m === 'time') delete it.reps;
  return it;
}

// The numbers that change week to week. Week 1 is the item itself; later
// weeks can override them in item.byWeek.
const WEEK_KEYS = ['sets', 'reps', 'secs', 'pct', 'weight'];
const hasOwn = (item, week) => WEEK_KEYS.some((k) => weekOverride(item, week, k) != null) || offInWeek(item, week) || exerciseInWeek(item, week) !== item.exerciseId;

// Sets an item's number for one week. A value that matches what the weekly
// rule would give anyway isn't kept, so later rule changes still reach it.
function setWeekValue(it, b, week, k, v) {
  it.byWeek = it.byWeek || {};
  const wk = { ...it.byWeek[week] };
  delete wk[k];
  it.byWeek[week] = wk;
  const ruled = { sets: () => prescribedSets(it, b, week), reps: () => prescribedReps(it, week), secs: () => prescribedSecs(it, week) }[k];
  if (v != null && !(ruled && ruled() === v)) wk[k] = v;
  if (!Object.keys(wk).length) delete it.byWeek[week];
  if (!Object.keys(it.byWeek).length) delete it.byWeek;
}

// Reps for one week: a number or a range, kept together. A week that matches
// what the rule would give anyway isn't kept.
function setWeekReps(it, week, r) {
  it.byWeek = it.byWeek || {};
  const wk = { ...it.byWeek[week] };
  delete wk.reps; delete wk.repsTo;
  it.byWeek[week] = wk;
  const same = r.reps === prescribedReps(it, week) && (r.repsTo ?? null) === prescribedRepsTo(it, week);
  if (r.reps != null && !same) { wk.reps = r.reps; if (r.repsTo != null) wk.repsTo = r.repsTo; }
  if (!Object.keys(wk).length) delete it.byWeek[week];
  if (!Object.keys(it.byWeek).length) delete it.byWeek;
}

function setReps(it, r) {
  it.reps = r.reps;
  if (r.repsTo != null) it.repsTo = r.repsTo; else delete it.repsTo;
}

// What an item shows on a week tab: that week's numbers, rule and deload included.
function weekNumbers(item, b, week) {
  if (!week || item.warmup) return { sets: item.sets, reps: item.reps, repsTo: prescribedRepsTo(item, 0), secs: item.secs, pct: item.pct, weight: item.weight, own: {} };
  const own = Object.fromEntries(WEEK_KEYS.map((k) => [k, weekOverride(item, week, k) != null]));
  return {
    sets: prescribedSets(item, b, week), reps: prescribedReps(item, week), repsTo: prescribedRepsTo(item, week), secs: prescribedSecs(item, week),
    pct: prescribedPct(item, week, b), weight: item.weight != null ? prescribedWeight(item, null, week, b, store.roundStep()) : null, own,
  };
}

function weekNote(item, b, wk) {
  const swap = exerciseInWeek(item, wk) !== item.exerciseId ? ` Week ${wk + 1} does <b>${esc(store.get('exercises', exerciseInWeek(item, wk))?.name || exerciseInWeek(item, wk))}</b> instead.` : '';
  return hasOwn(item, wk) ? `<b>Week ${wk + 1} has its own numbers.</b>${swap} <button class="link" data-action="weekReset">Reset</button>`
    : `Week ${wk + 1}: from week 1${item.progression ? ' and the weekly rule' : ''}${b.deloadWeek === wk ? ', deload' : ''}. Change a number to set it for this week only.`;
}

// One cell of the progression preview: "3×10 · 135 lb".
function weekCell(item, b, w) {
  const n = weekNumbers(item, b, w);
  const m = measureOf(item);
  if (m === 'none') return '✓';
  let t = `${n.sets}×${m === 'time' ? `${n.secs}s` : repsText(n.reps, n.repsTo)}`;
  if (item.pct != null) t += ` · ${n.pct}%`;
  else if (item.weight != null) t += ` · ${store.showW(n.weight, item.unit || store.unit())} ${item.unit || store.unit()}`;
  return t;
}

// Reads the coach's words, shows every week of what would change, and applies it on OK.
function progressionSheet(b, text, scope, done) {
  const p = parseProgression(text, b, store.exercisesById());
  if (p.error) return toast(p.error);
  const days = scope === '' ? null : [Number(scope)];
  const r = applyProgression(b, p.rules, days);
  const ex = store.exercisesById();
  const name = (di, ii) => esc(ex[b.days[di].items[ii].exerciseId]?.name || b.days[di].items[ii].exerciseId);
  const weeks = Array.from({ length: r.block.weeks }, (_, w) => w);
  const html = `<div class="prog-read"><span class="kicker">I read this as</span><ul>${describeRules(p.rules).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    ${r.changed.length ? `<div class="prog-table-wrap"><table class="prog-table"><thead><tr><th>Exercise</th>${weeks.map((w) => `<th>Wk ${w + 1}${r.block.deloadWeek === w ? ' D' : ''}</th>`).join('')}</tr></thead>
      <tbody>${r.changed.map(({ di, ii }) => `<tr><th>${name(di, ii)}${b.days.length > 1 ? `<small>${esc(b.days[di].name)}</small>` : ''}</th>${weeks.map((w) => `<td>${weekCell(r.block.days[di].items[ii], r.block, w)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">None of the exercises fit this. Check that they use reps, time or a weight that matches.</p>'}
    ${r.skipped.length ? `<p class="muted small">Left as they are (the change doesn't fit them, e.g. no weight set or timed): ${r.skipped.map(({ di, ii }) => name(di, ii)).join(', ')}.</p>` : ''}
    ${r.replaced.length ? `<p class="muted small">This replaces the "each week" rule on ${r.replaced.map(({ di, ii }) => name(di, ii)).join(', ')}.</p>` : ''}
    ${r.block.deloadWeek != null ? '<p class="muted small">The deload week gets half the sets and 10% less load, and the progression picks up again after it.</p>' : ''}
    <div class="ask-btns"><button class="btn ghost" data-close>Cancel</button>${r.changed.length ? `<button class="btn" data-ok>Apply to ${r.changed.length} exercise${r.changed.length > 1 ? 's' : ''}</button>` : ''}</div>`;
  const wrap = sheet('Preview every week', html);
  wrap.classList.add('prog-sheet');
  wrap.querySelector('[data-ok]')?.addEventListener('click', () => {
    b.days = r.block.days;
    closeSheet();
    done();
    toast('Weeks updated');
  });
}

function itemRow(item, di, ii, ex, label, b = null, week = 0, open = true) {
  const x = ex[item.exerciseId];
  const wk = week && !item.warmup ? week : 0;
  const nums = weekNumbers(item, b, wk);
  const loadType = item.pct != null ? 'pct' : item.weight != null ? 'weight' : 'none';
  const prog = item.progression || { type: 'none' };
  const measure = measureOf(item);
  const iu = item.unit || store.unit();
  const loadedEx = store.all('exercises').filter((e) => e.loaded).sort((a, b) => a.name.localeCompare(b.name));
  // Less-used settings stay folded away unless one is already in use.
  const extrasOpen = item.rpe != null || prog.type !== 'none' || item.group;
  const off = !item.warmup && b && offInWeek(item, week);
  const sum = off ? `Left out of week ${week + 1}` : itemSummary(item, b, wk);
  return `<div class="item ${off ? 'item-off' : ''} ${open ? '' : 'folded'}" data-di="${di}" data-ii="${ii}" ${open ? '' : 'data-action="itemToggle"'}>
    <div class="item-top">
      <span class="item-n">${esc(label)}</span>
      ${open ? `<button class="item-name" data-action="itemPick" title="Change exercise">${esc(x?.name || item.exerciseId)}</button>
      ${x?.contactsPerRep ? `<span class="pill">${x.contactsPerRep}c/rep · T${x.plyoTier}</span>` : ''}
      <span class="spacer"></span>
      <button class="icon-btn" data-action="itemUp" title="Move up" aria-label="Move up">↑</button>
      <button class="icon-btn" data-action="itemDown" title="Move down" aria-label="Move down">↓</button>
      <button class="icon-btn" data-action="itemDel" title="Remove" aria-label="Remove">✕</button>`
      : `<span class="item-head-text"><b>${esc(x?.name || item.exerciseId)}</b><span class="item-sum">${esc(sum)}</span></span>`}
      <button class="icon-btn item-toggle" data-action="itemToggle" aria-expanded="${open}" aria-label="${open ? 'Fold' : 'Open'} ${esc(x?.name || 'exercise')}"></button>
    </div>
    <div class="item-body">
    ${off ? `<p class="wk-note small"><b>Left out of week ${week + 1}.</b> <button class="link" data-action="weekReset">Put back</button></p>` : ''}
    <div class="item-measure"><div class="seg" role="group" aria-label="Measure by">${MEASURES.map(([v, label]) =>
      `<button class="${measure === v ? 'on' : ''}" data-action="measure" data-v="${v}" aria-pressed="${measure === v}">${label}</button>`).join('')}</div>
      ${x ? `<a class="link small" href="#/coach/exercises?edit=${x.id}&back=${encodeURIComponent(location.hash)}" title="Weight, how it's usually logged, swaps, demo video">Edit exercise ✎</a>` : ''}
      ${x?.video ? `<button class="link small" ${demoAttrs(x)}>▶ Demo</button>` : ''}</div>
    ${measure === 'none' ? '<p class="muted small item-none">No sets or reps. The athlete just checks it off.</p>' : `<div class="item-main">
      ${stepper('Sets', 'sets', nums.sets, 1, 1, nums.own.sets)}
      <span class="times" aria-hidden="true">×</span>
      ${measure === 'time' ? stepper('Seconds', 'secs', nums.secs, 0, 5, nums.own.secs) : repsStepper(measure === 'breaths' ? 'Breaths' : 'Reps', nums.reps, nums.repsTo, nums.own.reps)}
    </div>`}
    ${wk ? `<p class="wk-note small">${weekNote(item, b, wk)}</p>` : ''}
    ${x && measure !== 'none' && measure !== 'breaths' ? `<div class="item-fields">
      <label>Load<select data-action="loadType"><option value="none" ${loadType === 'none' ? 'selected' : ''}>None</option><option value="pct" ${loadType === 'pct' ? 'selected' : ''}>% of max</option><option value="weight" ${loadType === 'weight' ? 'selected' : ''}>Fixed weight</option></select></label>
      <div class="unit-field"><span>Unit</span><div class="seg unit-seg" role="group" aria-label="Weight unit">${['lb', 'kg'].map((v) =>
        `<button class="${iu === v ? 'on' : ''}" data-action="itemUnit" data-v="${v}" aria-pressed="${iu === v}">${v}</button>`).join('')}</div></div>
      ${loadType === 'pct' ? `<label class="${nums.own.pct ? 'wk-own' : ''}">%<input type="number" step="0.5" value="${nums.pct}" data-action="itemField" data-k="pct"></label>
        <label>Max from<select data-action="itemField" data-k="maxFrom"><option value="">${esc(x.name)}</option>${loadedEx.filter((e) => e.id !== item.exerciseId).map((e) => `<option value="${e.id}" ${item.maxFrom === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
      ${loadType === 'weight' ? `<label class="${nums.own.weight ? 'wk-own' : ''}">${iu}<input type="number" step="any" value="${store.showW(nums.weight, iu)}" data-action="itemField" data-k="weight"></label>` : ''}
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
          ${x?.loaded || loadType !== 'none' ? `<option value="add_pct" ${prog.type === 'add_pct' ? 'selected' : ''}>+ % of max</option>
          <option value="add_weight" ${prog.type === 'add_weight' ? 'selected' : ''}>+ weight</option>` : ''}
          ${isCount(measure) ? `<option value="add_reps" ${prog.type === 'add_reps' ? 'selected' : ''}>+ ${measure === 'breaths' ? 'breaths' : 'reps'}</option>` : ''}
          ${measure === 'time' ? `<option value="add_secs" ${prog.type === 'add_secs' ? 'selected' : ''}>+ seconds</option>` : ''}</select></label>
        ${prog.type !== 'none' ? `<label>By<input type="number" step="0.5" value="${(prog.type === 'add_weight' ? store.showW(prog.step, iu) : prog.step) ?? ''}" data-action="progStep"></label>` : ''}
        <label>Superset<input type="text" maxlength="2" value="${esc(item.group || '')}" placeholder="A" data-action="itemField" data-k="group"></label>
      </div>
    </details>
    </div>
  </div>`;
}

// How an exercise reads when folded: "4 × 5 @ 75% · +2.5% a week".
function itemSummary(item, b, wk) {
  const n = weekNumbers(item, b, wk);
  const m = measureOf(item);
  if (m === 'none') return 'Check off, no sets';
  const u = item.unit || store.unit();
  let t = `${n.sets ?? '?'} × ${m === 'time' ? fmtSecsShort(n.secs) : `${repsText(n.reps, n.repsTo) || '?'}${m === 'breaths' ? ' breaths' : ''}`}`;
  if (item.pct != null) t += ` @ ${n.pct}%${item.maxFrom ? ` of ${store.get('exercises', item.maxFrom)?.name || 'max'}` : ''}`;
  else if (item.weight != null) t += ` · ${fmt(store.showW(n.weight, u), 1)} ${u}`;
  const p = item.progression;
  if (p && p.type !== 'none' && p.step) {
    t += ` · ${{ add_pct: `+${p.step}%`, add_weight: `+${fmt(store.showW(p.step, u), 1)} ${u}`, add_reps: `+${p.step} rep${p.step === 1 ? '' : 's'}`, add_secs: `+${p.step} s` }[p.type] || ''} a week`;
  }
  if (item.tempo) t += ` · tempo ${item.tempo}`;
  return t;
}
const fmtSecsShort = (n) => (!n ? '? s' : n < 60 ? `${n} s` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`);

// Which exercises are open in the program editor (per visit). Everything
// else reads as one line; new exercises open so their numbers can be set.
const openItems = new Set();

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
  const weekHasOwn = (w) => b.days.some((d) => d.items.some((it) => !it.warmup && hasOwn(it, w)));
  const warmups = store.all('blocks').filter(isWarmup).sort((x, y) => x.name.localeCompare(y.name));
  const onIt = onBlock(id);
  const usedBy = onIt.length ? `<details class="assigned-note small who-sum"><summary>${onIt.length} athlete${onIt.length === 1 ? '' : 's'} on this ${isWarmup(b) ? 'warmup' : 'program'}</summary><p class="who">${whoLine(onIt)}</p><p class="muted">Edits reach their days that haven't been started. Finished workouts stay as logged. To change it for one person, use Change workouts on their page.</p></details>` : '';
  const isOpen = (di, ii) => openItems.has(`${id}:${di}:${ii}`);
  const warmItems = (d, di) => d.items.map((it, ii) => (it.warmup ? itemRow(it, di, ii, ex, `W${d.items.slice(0, ii + 1).filter((x) => x.warmup).length}`, null, 0, isOpen(di, ii)) : '')).join('');
  const dayCard = (di) => {
    const d = b.days[di];
    return `
      <section class="card day-card" data-di="${di}">
        <div class="row between gap">
          <input class="day-name" value="${esc(d.name)}" data-action="dayName" data-di="${di}" aria-label="Day name">
          <div class="row gap">
            <button class="chip" data-action="foldAll" data-di="${di}">${d.items.some((_, ii) => isOpen(di, ii)) ? 'Fold all' : 'Open all'}</button>
            <button class="more-btn" data-action="dayMenu" data-di="${di}" aria-label="More for this day">•••</button>
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
          ${d.items.map((it, ii) => (it.warmup ? '' : itemRow(it, di, ii, ex, it.group || String(d.items.slice(0, ii + 1).filter((x) => !x.warmup).length), b, week, isOpen(di, ii)))).join('')}
        </div>
        <button class="btn ghost wide add-ex" data-action="itemAdd" data-di="${di}">+ Add exercise</button>
        <details class="quick-wrap"><summary>Or type a list</summary>
          <div class="quick">
            <textarea rows="2" placeholder="One per line:&#10;Back squat 4x5 @80% +2.5%/wk&#10;DB row 3x10-15&#10;Box jump 3x5" data-di="${di}" aria-label="Quick add exercises"></textarea>
            <button class="chip" data-action="quickAdd" data-di="${di}">Add</button>
          </div>
        </details>
      </section>`;
  };

  root.innerHTML = isWarmup(b) ? `
    <header class="page-head"><a class="back" href="#/coach/blocks">Programs</a>
      <input class="title-input" value="${esc(b.name)}" data-action="blockName" aria-label="Warmup name"></header>
    ${usedBy}
    <p class="muted small">A saved warmup. <a href="#/coach/assign?block=${b.id}">Assign it</a> to athletes, or load it into a program day from that day's Warmup section. Changes here reach assigned athletes on days they haven't started yet, but not programs that already loaded a copy.</p>
    <section class="card day-card" data-di="0"><div class="sec warm-sec">
      ${warmItems(b.days[0], 0)}
      <button class="chip" data-action="itemAdd" data-di="0" data-warm="1">+ Warmup exercise</button>
    </div></section>` : `
    <header class="page-head"><a class="back" href="#/coach/blocks">Programs</a>
      <input class="title-input" value="${esc(b.name)}" data-action="blockName" aria-label="Block name"></header>
    ${usedBy}
    <section class="card row gap wrap">
      <label class="field-row"><span>Category</span><select data-action="category">${store.CATEGORIES.map((c) => `<option value="${c.k}" ${store.categoryOf(b) === c.k ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
      <label class="field-row"><span>Weeks</span><input type="number" min="1" max="52" value="${b.weeks}" data-action="weeks"></label>
      <label class="field-row"><span>Deload week</span><select data-action="deload"><option value="">None</option>${Array.from({ length: b.weeks }, (_, i) => `<option value="${i}" ${b.deloadWeek === i ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>
    </section>
    <nav class="day-tabs week-tabs" aria-label="Weeks">
      ${Array.from({ length: b.weeks }, (_, w) => `<button class="day-tab ${w === week ? 'on' : ''} ${w && weekHasOwn(w) ? 'own' : ''}" data-action="pickWeek" data-w="${w}" aria-pressed="${w === week}">Wk ${w + 1}${b.deloadWeek === w ? ' · D' : ''}</button>`).join('')}
    </nav>
    <p class="muted small">${week ? `<b>Week ${week + 1}.</b> Sets, reps and weight you change here are for this week only (marked red). Exercises, notes and the order are the same every week.` : 'Week 1 is the starting point. The "each week" rules fill in the later weeks, and the deload week halves sets and drops load 10%. Tap a week to change its numbers.'} <span id="week-tot">${weekLine(weekTot)}</span></p>
    <details class="card prog-card" ${query.get('prog') ? 'open' : ''}><summary>Change every week at once</summary>
      <p class="muted small">Describe the progression in your own words, one change per line. Aim a line at some weeks, a day, a superset or exercises by naming them. You'll see every week before anything changes. Warmups are left alone.</p>
      <textarea id="prog-text" rows="4" placeholder="Increase reps by 1 per week until reps = 15, then reset reps to 10 and increase weight by 10.&#10;Weeks 2-3: 2 sets. Week 4 on: 3 sets.&#10;From week 5, add 5 lb per week to bench and squat."></textarea>
      <div class="row gap wrap prog-row">
        <select id="prog-scope" aria-label="Which days"><option value="">Whole program</option>${b.days.map((d, di) => `<option value="${di}">Only ${esc(d.name || `Day ${di + 1}`)}</option>`).join('')}</select>
        <button class="btn" data-action="progPreview">Preview</button>
        ${b.days.some((d) => d.items.some((it) => it.byWeek)) ? '<button class="chip" data-action="progClear">Clear week changes</button>' : ''}
      </div>
      <p class="muted small">Examples: "Add 1 rep per week up to 12 reps". "Add a set every 2 weeks". "Weeks 2-3: 2 sets". "From week 5, add 5 lb per week to bench". "On Upper, add 2.5% per week until week 6". "Superset A: 3 sets from week 4". "Week 6: drop sets by 1" (a named week is a one-off). Weights without lb or kg use each exercise's own unit.</p>
    </details>
    <nav class="day-tabs" aria-label="Days">
      ${b.days.map((d, di) => `<button class="day-tab ${di === day ? 'on' : ''} ${di === other ? 'side' : ''}" data-action="pickDay" data-di="${di}" aria-pressed="${di === day}">${esc(d.name || `Day ${di + 1}`)}</button>`).join('')}
      <button class="day-tab add" data-action="addDay">+ Day</button>
    </nav>
    ${b.days.length > 1 ? `<label class="side-pick">Side by side with
      <select data-action="pickOther"><option value="">Nothing</option>${b.days.map((d, di) => (di === day ? '' : `<option value="${di}" ${di === other ? 'selected' : ''}>${esc(d.name || `Day ${di + 1}`)}</option>`)).join('')}</select></label>` : ''}
    <div class="day-cols ${other != null ? 'two' : ''}">${b.days.length ? [day, other].filter((di) => di != null).map(dayCard).join('') : '<p class="empty">No days yet. Tap "+ Day".</p>'}</div>
    <a class="btn wide" href="#/coach/assign?block=${b.id}">Assign this program</a>`;

  // Keep the open week's tab in sight on long programs.
  const wt = $('.week-tabs', root), on = wt?.querySelector('.on');
  if (on && on.offsetLeft + on.offsetWidth > wt.clientWidth) wt.scrollLeft = on.offsetLeft - wt.clientWidth / 2 + on.offsetWidth / 2;
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
  const swapOpen = (di, x, y) => { const kx = `${id}:${di}:${x}`, ky = `${id}:${di}:${y}`; const ox = openItems.has(kx), oy = openItems.has(ky); openItems.delete(kx); openItems.delete(ky); if (ox) openItems.add(ky); if (oy) openItems.add(kx); };
  const itemOf = (el) => { const r = el.closest('.item'); return { di: Number(r.dataset.di), ii: Number(r.dataset.ii) }; };
  const num = (v) => (v === '' ? null : Number(v));
  // Show which numbers are this week's own without a redraw.
  const markOwn = (el, it) => {
    const box = el.closest('.stepper, label');
    box?.classList.toggle('wk-own', weekOverride(it, week, el.dataset.k) != null);
    const tab = root.querySelector(`.week-tabs [data-w="${week}"]`); tab?.classList.toggle('own', weekHasOwn(week));
    const note = el.closest('.item')?.querySelector('.wk-note'); if (note) note.innerHTML = weekNote(it, b, week);
  };

  const handlers = {
    blockName: (el) => { b.name = el.value; save(false); },
    weeks: (el) => { b.weeks = Math.max(1, Number(el.value) || 1); if (b.deloadWeek >= b.weeks) b.deloadWeek = null; save(); },
    // Strength, Throwing, Speed or Rehab: each is its own workout on the athlete's day.
    category: (el) => { if (el.value === 'strength') delete b.category; else b.category = el.value; save(false); toast(`Now a ${store.categoryLabel(el.value)} program`); },
    deload: (el) => { b.deloadWeek = el.value === '' ? null : Number(el.value); save(); },
    pickWeek: (el) => view({ w: el.dataset.w }),
    weekReset: (el) => { const { di, ii } = itemOf(el); const it = b.days[di].items[ii]; if (it.byWeek) { delete it.byWeek[week]; if (!Object.keys(it.byWeek).length) delete it.byWeek; } save(); },
    progPreview: () => progressionSheet(b, $('#prog-text', root).value, $('#prog-scope', root).value, () => { store.put('blocks', b); view({ prog: null }); }),
    progClear: async () => {
      const scope = $('#prog-scope', root).value;
      if (!await ask(`Weeks 2 to ${b.weeks} go back to week 1 and the "each week" rules${scope === '' ? '' : ` on ${b.days[scope].name}`}.`, { title: 'Clear week changes?', ok: 'Clear', danger: true })) return;
      const c = clearWeeks(b, scope === '' ? null : [Number(scope)]);
      b.days = c.days; save(); toast('Week changes cleared');
    },
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
      if (week && !it.warmup && WEEK_KEYS.includes(k)) {
        let v = num(el.value);
        if (k === 'weight') v = store.readW(v, it.unit);
        setWeekValue(it, b, week, k, v);
        markOwn(el, it);
        return save(false);
      }
      if (['note', 'tempo', 'group', 'maxFrom'].includes(k)) it[k] = el.value.trim() || undefined;
      else if (k === 'weight') it[k] = store.readW(num(el.value), it.unit);
      else it[k] = num(el.value);
      save(false);
    },
    repsField: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      const r = parseReps(el.value);
      el.classList.toggle('bad', !r);
      if (!r) return toast('Type one number, or a range like 10-15');
      if (week && !it.warmup) { setWeekReps(it, week, r); markOwn(el, it); }
      else setReps(it, r);
      save(false);
    },
    loadType: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      delete it.pct; delete it.weight;
      for (const w of Object.values(it.byWeek || {})) { delete w.pct; delete w.weight; }
      if (el.value === 'pct') it.pct = 70;
      const kg = it.unit === 'kg';
      if (el.value === 'weight') it.weight = kg ? store.readW(20, 'kg') : 45;
      // Keep the weekly rule meaningful for the new load type.
      const pt = it.progression?.type;
      if (el.value === 'weight' && pt === 'add_pct') it.progression = { type: 'add_weight', step: kg ? store.readW(2.5, 'kg') : 5 };
      if (el.value === 'pct' && pt === 'add_weight') it.progression = { type: 'add_pct', step: 2.5 };
      if (el.value === 'none' && (pt === 'add_pct' || pt === 'add_weight')) it.progression = undefined;
      // Giving an exercise a load means it uses a weight: athletes get a weight box and it counts toward tonnage.
      const ex = store.get('exercises', it.exerciseId);
      if (el.value !== 'none' && ex && !ex.loaded) store.put('exercises', { ...ex, loaded: true });
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
      const input = el.parentElement.querySelector('input');
      if (k === 'reps') {
        // Both ends of a range move together.
        const cur = parseReps(input.value) || { reps: it.reps, repsTo: it.repsTo };
        const d = Number(el.dataset.d);
        const lo = Math.max(0, (cur.reps || 0) + d);
        const r = { reps: lo, repsTo: cur.repsTo != null ? Math.max(lo + 1, cur.repsTo + d) : null };
        if (week && !it.warmup) { setWeekReps(it, week, r); markOwn(input, it); } else setReps(it, r);
        input.value = repsText(r.reps, r.repsTo, '-');
        input.classList.remove('bad');
        return save(false);
      }
      if (week && !it.warmup) {
        const v = Math.max(k === 'sets' ? 1 : 0, (Number(input.value) || 0) + Number(el.dataset.d));
        setWeekValue(it, b, week, k, v);
        input.value = v;
        markOwn(input, it);
        return save(false);
      }
      it[k] = Math.max(k === 'sets' ? 1 : 0, (it[k] || 0) + Number(el.dataset.d));
      // Update the box in place; a full redraw would lose the next quick tap.
      input.value = it[k];
      save(false);
    },
    measure: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      setMeasure(it, el.dataset.v);
      save();
    },
    itemPick: (el) => {
      const { di, ii } = itemOf(el);
      const it = b.days[di].items[ii];
      pickExerciseSheet((exId) => {
        it.exerciseId = exId;
        if (!store.get('exercises', exId)?.loaded) clearLoad(it);
        save();
      }, { allowNew: true });
    },
    itemToggle: (el, ev) => {
      if (el.classList.contains('item') && ev.target.closest('button:not(.item-toggle), a, input, select, textarea')) return;
      const { di, ii } = itemOf(el), k = `${id}:${di}:${ii}`;
      if (openItems.has(k)) openItems.delete(k); else openItems.add(k);
      save();
    },
    foldAll: (el) => {
      const di = Number(el.dataset.di), keys = b.days[di].items.map((_, ii) => `${id}:${di}:${ii}`);
      const anyOpen = keys.some((k) => openItems.has(k));
      keys.forEach((k) => (anyOpen ? openItems.delete(k) : openItems.add(k)));
      save();
    },
    dayMenu: (el) => {
      const di = Number(el.dataset.di);
      sheet(b.days[di].name || `Day ${di + 1}`, `<ul class="menu-list"><li><button data-m="dayCopy">Copy this day</button></li></ul><div class="menu-gap"></div><ul class="menu-list"><li><button class="danger" data-m="dayDel">Delete this day</button></li></ul>`, (w) => {
        w.addEventListener('click', (ev) => { const m = ev.target.closest('[data-m]'); if (!m) return; closeSheet(); handlers[m.dataset.m]({ dataset: { di: String(di) } }); });
      });
    },
    itemAdd: (el) => {
      const di = Number(el.dataset.di);
      const warm = Boolean(el.dataset.warm);
      pickExerciseSheet((exId) => {
        const a = b.days[di].items;
        // Warmup exercises stay together at the top of the day.
        const at = warm ? a.filter((x) => x.warmup).length : a.length;
        // Open state follows positions, so shift the ones below the new exercise.
        for (let k = a.length - 1; k >= at; k--) if (openItems.delete(`${id}:${di}:${k}`)) openItems.add(`${id}:${di}:${k + 1}`);
        openItems.add(`${id}:${di}:${at}`);
        a.splice(at, 0, newItem(exId, warm));
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
    itemUp: (el) => { const { di, ii } = itemOf(el); const a = b.days[di].items; if (ii > 0 && !a[ii - 1].warmup === !a[ii].warmup) { [a[ii - 1], a[ii]] = [a[ii], a[ii - 1]]; swapOpen(di, ii, ii - 1); save(); } },
    itemDown: (el) => { const { di, ii } = itemOf(el); const a = b.days[di].items; if (ii < a.length - 1 && !a[ii + 1].warmup === !a[ii].warmup) { [a[ii + 1], a[ii]] = [a[ii], a[ii + 1]]; swapOpen(di, ii, ii + 1); save(); } },
    itemDel: (el) => { const { di, ii } = itemOf(el); const n = b.days[di].items.length; b.days[di].items.splice(ii, 1); openItems.delete(`${id}:${di}:${ii}`); for (let k = ii + 1; k < n; k++) if (openItems.delete(`${id}:${di}:${k}`)) openItems.add(`${id}:${di}:${k - 1}`); save(); },
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
        for (const k of ['repsTo', 'pct', 'rpe', 'progression']) if (q[k] != null) item[k] = q[k];
        // Typed weights are in this device's unit unless the line says lb or kg.
        item.unit = q.progUnit || store.unit();
        if (q.weight != null) item.weight = store.readW(q.weight, item.unit);
        if (q.progression?.type === 'add_weight') item.progression.step = fromUnit(q.progression.step, item.unit);
        b.days[di].items.push(item);
      }
      save();
      if (bad.length) toast(`Couldn't read: ${bad.join('; ')}. Use "Name 3x5 @80%" or "Name 3x10-15".`);
    },
  };
  bindActions(root, handlers);
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
      ${warm ? '<p class="muted small">The warmup shows up as its own card above the athlete\'s workout on the days you pick.</p>' : ''}
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
    go: async () => {
      const start = $('#as-start', root).value;
      const end = warm ? $('#as-end', root).value : '';
      const weekdays = [...root.querySelectorAll('input[name=wd]:checked')].map((c) => Number(c.value));
      const ids = [...root.querySelectorAll('input[name=ath]:checked')].map((c) => c.value);
      if (!ids.length) return toast('Pick at least one athlete');
      if (warm && !weekdays.length) return toast('Pick at least one day');
      if (!warm && weekdays.length !== block.days.length) return toast(`Pick exactly ${block.days.length} training days`);
      if (end && end < start) return toast('End date is before the start date');
      // A new program normally takes over from the athlete's current one in
      // the same category (a Throwing program leaves their Strength one alone).
      const cat = store.categoryOf(block);
      const current = warm ? [] : ids.flatMap((aid) => store.assignmentsFor(aid).filter((g) => {
        const gb = store.get('blocks', g.blockId);
        return gb && !isWarmup(gb) && store.categoryOf(gb) === cat && (!g.endDate || g.endDate >= start) && assignmentStatus(g, gb, start) !== 'ended';
      }));
      if (current.length) {
        const names = [...new Set(current.map((g) => store.get('athletes', g.athleteId)?.name))].join(', ');
        const label = store.categoryLabel(cat);
        if (await ask(`${names} already ${current.length > 1 ? 'have' : 'has'} a ${label} program. Replace it from ${fmtDate(start)}? Their logged workouts stay. Or keep both: each runs on its own days with its own color, and on a day both land they pick one.`, { title: `Replace ${label} program?`, ok: 'Replace', cancel: 'Keep both' })) {
          for (const g of current) {
            if (g.startDate >= start) store.del('assignments', g.id);
            else store.put('assignments', { ...g, endDate: addDays(start, -1) });
          }
        }
      }
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

const loggedAs = (e) => [e.loaded ? 'Weight' : '', { time: 'Time', breaths: 'Breaths', none: 'Check off' }[e.measure] || 'Reps'].filter(Boolean).join(' + ');

// Program items (in this team's programs and saved warmups) that use an exercise.
function itemsUsing(exId) {
  const out = [];
  for (const b of store.all('blocks')) for (const d of b.days) for (const it of d.items) if (it.exerciseId === exId) out.push({ b, it });
  return out;
}

const LIB_VIEW = 'wt-library-view';
// The boxes in the exercise library's Filter panel.
const LIB_FILTERS = [
  { key: 'pattern', label: 'Movement', opts: PATTERNS.map((p) => [p, PATTERN_LABEL[p]]) },
  { key: 'body', label: 'Body', opts: [['lower', 'Lower'], ['upper', 'Upper'], ['full', 'Full']] },
  { key: 'measure', label: 'Logged as', opts: MEASURES },
  { key: 'extra', label: 'Other', opts: [['video', 'Has a demo video'], ['novideo', 'No demo video'], ['loaded', 'Uses a weight']] },
];

export function exercises(root, _p, query) {
  const editId = query.get('edit');
  // Opened from the program editor: Save and Cancel go back there.
  const back = (query.get('back') || '').startsWith('#/coach/') ? query.get('back') : '#/coach/exercises';
  const uses = editId ? itemsUsing(editId) : [];
  const list = store.all('exercises').filter((e) => !e.hidden).sort((a, b) => a.name.localeCompare(b.name));
  // Sort and filters are remembered on this device.
  let view = {};
  try { view = JSON.parse(localStorage.getItem(LIB_VIEW)) || {}; } catch { /* private mode */ }
  if (view.sort !== 'pattern') view.sort = 'name';
  const filters = {};
  for (const g of LIB_FILTERS) filters[g.key] = (Array.isArray(view.filters?.[g.key]) ? view.filters[g.key] : []).filter((v) => g.opts.some(([o]) => o === v));
  const x = editId ? (store.get('exercises', editId) || { id: '', name: '', pattern: 'other', body: 'full', loaded: true, alts: [] }) : null;
  const form = x ? `
    <section class="card form" id="ex-form">
      <h3>${x.id ? 'Edit' : 'New'} exercise</h3>
      <label class="field-row"><span>Name</span><input id="ex-name" value="${esc(x.name)}"></label>
      <label class="field-row"><span>Movement</span><select id="ex-pattern">${PATTERNS.map((p) => `<option value="${p}" ${x.pattern === p ? 'selected' : ''}>${PATTERN_LABEL[p]}</option>`).join('')}</select></label>
      <label class="field-row"><span>Body</span><select id="ex-body">${['lower', 'upper', 'full'].map((p) => `<option ${x.body === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="check-row"><input type="checkbox" id="ex-loaded" ${x.loaded ? 'checked' : ''}> Uses a weight (athletes get a weight box; counts toward tonnage)</label>
      <label class="field-row"><span>Logged as</span><select id="ex-measure">${MEASURES.map(([v, label]) => `<option value="${v}" ${(x.measure || 'reps') === v ? 'selected' : ''}>${v === 'none' ? 'Check off (no sets)' : label}</option>`).join('')}</select></label>
      ${uses.length ? `<label class="check-row"><input type="checkbox" id="ex-apply"> Also change how it's logged in programs that use it (${uses.length} place${uses.length > 1 ? 's' : ''})</label>
      <p class="muted small">Without this, only exercises you add from now on start this way. Athletes see changes on days they haven't started.</p>` : ''}
      <label class="field-row"><span>Plyo contacts per rep</span><input type="number" min="0" id="ex-contacts" value="${x.contactsPerRep ?? ''}" placeholder="blank if not a plyo"></label>
      <label class="field-row"><span>Plyo intensity</span><select id="ex-tier"><option value="">–</option>${Object.entries(PLYO_TIERS).map(([k, v]) => `<option value="${k}" ${String(x.plyoTier) === k ? 'selected' : ''}>${k}: ${v}</option>`).join('')}</select></label>
      <label class="field-row"><span>Sprint meters per rep</span><input type="number" min="0" id="ex-meters" value="${x.metersPerRep ?? ''}"></label>
      <label class="field-row"><span>Demo video</span><input type="url" id="ex-video" value="${esc(x.video || '')}" placeholder="Paste a YouTube, Vimeo or Drive link"></label>
      <label class="field-row"><span>Video password</span><input id="ex-video-pw" value="${esc(x.videoPassword || '')}" placeholder="Only if the video asks for one"></label>
      <p class="muted small ex-video-help">Athletes tap "Watch demo" on this exercise and it plays in a pop-up inside the app. <button class="link small" data-action="previewVideo">▶ Try it</button></p>
      <fieldset><legend>Swap options (same movement type)</legend><div class="checks tall">${list.filter((e) => e.id !== x.id && (e.pattern === x.pattern || x.alts?.includes(e.id))).map((e) => `<label class="check-row"><input type="checkbox" name="alt" value="${e.id}" ${x.alts?.includes(e.id) ? 'checked' : ''}> ${esc(e.name)}</label>`).join('')}</div></fieldset>
      <div class="row gap"><button class="btn" data-action="saveEx">Save</button><a class="btn ghost" href="${esc(back)}">Cancel</a></div>
      ${x.id ? `<button class="link danger-link" data-action="hideEx">Remove from library</button>` : ''}
    </section>` : '';
  root.innerHTML = `
    <header class="page-head"><h1>Exercise library</h1><p class="muted">${list.length} exercises. Plyo contacts and movement type drive the weekly numbers.</p></header>
    ${form}
    <section class="card lib-card" id="lib-card" hidden></section>
    <div class="row gap" style="margin-bottom:10px"><input type="search" class="search" id="ex-q" placeholder="Search" aria-label="Search exercises" style="margin:0"><a class="round-btn" href="#/coach/exercises?edit=new" aria-label="New exercise" title="New exercise">+</a></div>
    <div class="row gap wrap lib-view">
      <button class="chip filter-btn" id="ex-filter-btn" aria-expanded="false" aria-controls="ex-filters">Filter <b id="ex-filter-n"></b></button>
      <label class="lib-pick"><span>Sort</span><select id="ex-sort"><option value="name" ${view.sort === 'name' ? 'selected' : ''}>Name A–Z</option><option value="pattern" ${view.sort === 'pattern' ? 'selected' : ''}>Movement type</option></select></label>
    </div>
    <section class="card filter-panel" id="ex-filters" hidden>
      ${LIB_FILTERS.map((g) => `<fieldset class="filter-group"><legend>${g.label}</legend><div class="row gap wrap">${g.opts.map(([v, label]) => {
        const n = list.filter((e) => libraryMatch(e, { [g.key]: [v] })).length;
        return n || filters[g.key].includes(v) ? `<label class="check-chip"><input type="checkbox" data-fk="${g.key}" value="${v}" ${filters[g.key].includes(v) ? 'checked' : ''}> ${label} <small>${n}</small></label>` : '';
      }).join('')}</div></fieldset>`).join('')}
      <div class="row between"><button class="link" id="ex-filter-clear">Clear all</button><button class="btn" id="ex-filter-done">Done</button></div>
    </section>
    <p class="muted small" id="ex-showing"></p>
    <div class="card" style="padding:4px 4px"><table class="tbl lib-tbl"><thead><tr><th>Name</th><th>Movement</th><th>Logged as</th><th>Contacts/rep</th><th>Swaps</th></tr></thead><tbody id="ex-rows">
    </tbody></table></div>`;
  const q = $('#ex-q', root);
  const sortSel = $('#ex-sort', root);
  const panel = $('#ex-filters', root);
  const fBtn = $('#ex-filter-btn', root);
  const row = (e) => `<tr data-name="${esc(e.name.toLowerCase())}" data-grp="${patternOf(e)}"><td><a href="#/coach/exercises?edit=${e.id}">${esc(e.name)}</a>${e.video ? ` <button class="demo-mark" ${demoAttrs(e)} aria-label="Watch the ${esc(e.name)} demo">▶</button>` : ''}</td><td>${PATTERN_LABEL[e.pattern] || e.pattern}</td><td>${loggedAs(e)}</td><td>${e.contactsPerRep ? `${e.contactsPerRep} (T${e.plyoTier})` : ''}</td><td>${e.alts?.length || 0}</td></tr>`;
  // Search hides rows; a movement heading hides when none of its rows are left.
  const filter = () => {
    const t = q.value.toLowerCase();
    const left = {};
    root.querySelectorAll('tr[data-name]').forEach((r) => { r.hidden = !r.dataset.name.includes(t); if (!r.hidden) left[r.dataset.grp] = (left[r.dataset.grp] || 0) + 1; });
    root.querySelectorAll('tr[data-head]').forEach((h) => { const n = left[h.dataset.head] || 0; h.hidden = !n; h.querySelector('small').textContent = n; });
    const shown = Object.values(left).reduce((a, b) => a + b, 0);
    $('#ex-showing', root).textContent = shown === list.length ? '' : `Showing ${fmt(shown)} of ${fmt(list.length)}`;
  };
  const draw = () => {
    for (const g of LIB_FILTERS) filters[g.key] = [...panel.querySelectorAll(`input[data-fk="${g.key}"]:checked`)].map((c) => c.value);
    const prefs = { sort: sortSel.value, filters };
    const n = filterCount(filters);
    $('#ex-filter-n', root).textContent = n || '';
    fBtn.classList.toggle('on', n > 0);
    try { localStorage.setItem(LIB_VIEW, JSON.stringify(prefs)); } catch { /* private mode */ }
    const shown = libraryView(list, prefs);
    $('#ex-rows', root).innerHTML = shown.length
      ? shown.map((g) => (g.pattern ? `<tr class="grp-head" data-head="${esc(g.pattern)}"><th colspan="5">${esc(PATTERN_LABEL[g.pattern] || g.pattern)} <small>${g.items.length}</small></th></tr>` : '') + g.items.map(row).join('')).join('')
      : '<tr><td colspan="5" class="muted">Nothing matches these filters.</td></tr>';
    filter();
  };
  q.addEventListener('input', filter);
  sortSel.addEventListener('change', draw);
  panel.addEventListener('change', draw);
  const openPanel = (open) => { panel.hidden = !open; fBtn.setAttribute('aria-expanded', String(open)); };
  fBtn.addEventListener('click', () => openPanel(panel.hidden));
  $('#ex-filter-done', root).addEventListener('click', () => openPanel(false));
  $('#ex-filter-clear', root).addEventListener('click', () => { panel.querySelectorAll('input:checked').forEach((c) => { c.checked = false; }); draw(); });
  draw();
  if (x) $('#ex-form', root).scrollIntoView({ block: 'start' });
  else libraryCard(root);
  bindActions(root, {
    previewVideo: () => {
      const link = $('#ex-video', root).value.trim();
      if (!link) return toast('Paste a video link first');
      demoSheet(link, $('#ex-name', root).value.trim() || 'Demo video', $('#ex-video-pw', root).value.trim());
    },
    // Hidden rather than deleted, so past workouts and programs keep its name.
    hideEx: async () => {
      const msg = uses.length ? `It stays in the ${uses.length} program item${uses.length > 1 ? 's' : ''} that use it, and in past workouts, but can't be picked anymore.` : 'Past workouts keep its name. It just can\'t be picked anymore.';
      if (!await ask(msg, { title: `Remove "${x.name}"?`, ok: 'Remove', danger: true })) return;
      store.put('exercises', { ...x, hidden: true });
      toast('Removed from the library');
      location.hash = '#/coach/exercises';
    },
    saveEx: () => {
      const v = (s) => $(s, root).value;
      const name = v('#ex-name').trim();
      if (!name) return toast('Give it a name');
      const obj = {
        ...x, id: x.id || store.uid('ex'), name, pattern: v('#ex-pattern'), body: v('#ex-body'),
        loaded: $('#ex-loaded', root).checked,
        measure: v('#ex-measure') === 'reps' ? undefined : v('#ex-measure'),
        contactsPerRep: v('#ex-contacts') ? Number(v('#ex-contacts')) : undefined,
        plyoTier: v('#ex-tier') ? Number(v('#ex-tier')) : undefined,
        metersPerRep: v('#ex-meters') ? Number(v('#ex-meters')) : undefined,
        video: v('#ex-video').trim() || undefined,
        videoPassword: (v('#ex-video').trim() && v('#ex-video-pw').trim()) || undefined,
        alts: [...root.querySelectorAll('input[name=alt]:checked')].map((c) => c.value),
      };
      store.put('exercises', obj);
      // Bring programs in line: the new measure, and no load once it stops using a weight.
      const changed = new Set();
      if ($('#ex-apply', root)?.checked) {
        for (const { b, it } of uses) {
          if (measureOf(it) !== (obj.measure || 'reps')) { setMeasure(it, obj.measure || 'reps'); changed.add(b); }
          if (!obj.loaded && (it.pct != null || it.weight != null)) { clearLoad(it); changed.add(b); }
        }
        for (const b of changed) store.put('blocks', b);
      }
      toast(changed.size ? `Saved. Updated ${changed.size} program${changed.size > 1 ? 's' : ''}.` : 'Saved');
      location.hash = back;
    },
  });
}

// Offers the exercise video library (js/library.js, loaded only here) until
// every exercise in it is in this team's library.
async function libraryCard(root) {
  const { VIDEO_LIBRARY } = await import('./library.js');
  const card = $('#lib-card', root);
  if (!card || !card.isConnected) return;
  const plan = planLibraryImport(store.all('exercises'), VIDEO_LIBRARY);
  if (!plan.add.length && !plan.update.length) return;
  const parts = [plan.add.length && `${fmt(plan.add.length)} new exercises`, plan.update.length && `demo videos for ${plan.update.length} you already have`].filter(Boolean);
  card.hidden = false;
  card.innerHTML = `<h3>Exercise video library</h3>
    <p class="muted small">${fmt(VIDEO_LIBRARY.length)} exercises from the CSP exercise video database, each with its demo video. Adds ${parts.join(' and ')}. Nothing you already have is duplicated, and videos you set yourself stay.</p>
    <button class="btn" data-lib="add">Add video library</button>`;
  card.querySelector('[data-lib]').addEventListener('click', async () => {
    if (!await ask(`Adds ${parts.join(' and ')}. Movement types are guessed from the names, so check any you program with.`, { title: 'Add the video library?', ok: 'Add them' })) return;
    store.putMany('exercises', [...plan.update, ...plan.add]);
    toast(`Added ${parts.join(' and ')}`);
    exercises(root, {}, new URLSearchParams());
  });
}

// ---------- one athlete's program ----------

// Change an assignment in place: its days, start and end. The program itself
// is edited in the block editor (for everyone on it), or copied just for this
// athlete first. Logged workouts are never touched.
export function assignmentEditor(root, { id }) {
  const g = store.get('assignments', id);
  const b = g && store.get('blocks', g.blockId);
  const a = g && store.get('athletes', g.athleteId);
  if (!g || !b || !a) { root.innerHTML = '<p class="empty">Program not found.</p>'; return; }
  const warm = isWarmup(b);
  const others = [...new Set(store.all('assignments').filter((x) => x.blockId === b.id && x.athleteId !== a.id).map((x) => store.get('athletes', x.athleteId)?.name).filter(Boolean))];
  const first = a.name.split(' ')[0];
  root.innerHTML = `
    <header class="page-head"><a class="back" href="#/coach/athlete/${a.id}">‹ ${esc(a.name)}</a>
      <span class="kicker">${warm ? 'Warmup' : 'Program'} for ${esc(a.name)}</span><h1>${esc(b.name)}</h1></header>
    <section class="card form ${warm ? 'warm-form' : ''}"><h3>Schedule</h3>
      <label class="field-row"><span>Start date</span><input type="date" id="ae-start" value="${g.startDate}"></label>
      <label class="field-row"><span>End date (optional)</span><input type="date" id="ae-end" value="${g.endDate || ''}"></label>
      <fieldset><legend>${warm ? 'Days to do it' : `Training days (${b.days.length} per week, in order)`}</legend>
        <div class="row gap wrap">${WEEKDAYS.map((d, i) => `<label class="check-chip"><input type="checkbox" name="wd" value="${i}" ${(g.weekdays || []).includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></fieldset>
      ${warm ? '' : `<fieldset><legend>Color</legend><div class="row gap wrap color-pick">${Array.from({ length: store.PROGRAM_COLORS }, (_, c) => `<label class="swatch pc${c}"><input type="radio" name="pc" value="${c}" ${store.programColor(g) === c ? 'checked' : ''} aria-label="Color ${c + 1}"><i></i></label>`).join('')}</div>
        <p class="muted small">Tags this program on ${esc(first)}'s days and workouts, so it stands apart from their other programs.</p></fieldset>`}
      <p class="muted small">Workouts ${esc(first)} already logged stay where they are. Days not started yet follow the new schedule. Moving the start date also moves which week of the program each day falls in.</p>
      <button class="btn wide" data-action="save">Save schedule</button>
    </section>
    <section class="card"><h3>Exercises, sets and reps</h3>
      ${warm ? '' : `<p class="muted small">Change ${esc(first)}'s exercises, sets and reps week by week, for just one week or the rest of the program.${others.length ? ` Only ${esc(first)} gets the changes.` : ''}</p>
        <a class="btn" href="#/coach/assignment/${g.id}/plan">Change ${esc(first)}'s workouts</a><hr class="plan-sep">`}
      ${others.length ? `<p class="muted small">${esc(others.join(', '))} ${others.length > 1 ? 'are' : 'is'} on this ${warm ? 'warmup' : 'program'} too. Editing it changes it for everyone. Make a copy to change it just for ${esc(first)}.</p>
        <div class="row gap wrap"><button class="btn" data-action="copy">Make a copy just for ${esc(first)}</button><a class="btn ghost" href="#/coach/block/${b.id}">Edit for everyone</a></div>`
        : `<p class="muted small">Changes reach ${esc(first)}'s days that haven't been started. Finished workouts stay as logged.</p><a class="btn" href="#/coach/block/${b.id}">Edit ${warm ? 'warmup' : 'program'}</a>`}
    </section>`;
  bindActions(root, {
    save: () => {
      const start = $('#ae-start', root).value, end = $('#ae-end', root).value;
      const weekdays = [...root.querySelectorAll('input[name=wd]:checked')].map((c) => Number(c.value));
      if (!start) return toast('Pick a start date');
      if (end && end < start) return toast('End date is before the start date');
      if (warm && !weekdays.length) return toast('Pick at least one day');
      if (!warm && weekdays.length !== b.days.length) return toast(`Pick exactly ${b.days.length} training days`);
      const next = { ...g, startDate: start, weekdays };
      if (end) next.endDate = end; else delete next.endDate;
      const pc = root.querySelector('input[name=pc]:checked');
      if (pc) next.color = Number(pc.value);
      store.put('assignments', next);
      toast('Schedule saved');
      location.hash = `#/coach/athlete/${a.id}`;
    },
    copy: () => {
      const c = structuredClone(b);
      c.id = store.uid('block'); c.name = `${b.name} (${first})`; c.copiedFrom = b.id;
      store.put('blocks', c);
      store.put('assignments', { ...g, blockId: c.id });
      toast(`Copied. Changes here only reach ${first}.`);
      location.hash = `#/coach/block/${c.id}`;
    },
  });
}

// ---------- change one athlete's program, week by week ----------

// The program week an assignment is in today (0-based, kept inside the block).
function weekNow(g, b) {
  const w = Math.floor(daysBetween(g.startDate, today()) / 7);
  return Math.max(0, Math.min(b.weeks - 1, w));
}

// The block to change for this athlete. When others are on the same program
// they keep the original: this athlete gets their own copy first.
function ownBlock(g, b, a) {
  const shared = store.all('assignments').some((x) => x.blockId === b.id && x.id !== g.id);
  if (!shared) return b;
  const c = structuredClone(b);
  c.id = store.uid('block'); c.name = `${b.name} (${a.name.split(' ')[0]})`; c.copiedFrom = b.id;
  store.put('blocks', c);
  store.put('assignments', { ...g, blockId: c.id });
  return c;
}

// "3 × 8–10 · 75%", or "Check off".
function planNums(v, unit) {
  if (v.measure === 'none') return 'Check off';
  let t = `${v.sets} × ${v.measure === 'time' ? `${v.secs} s` : `${repsText(v.reps, v.repsTo)}${v.measure === 'breaths' ? ' breaths' : ''}`}`;
  if (v.pct != null) t += ` · ${v.pct}%`;
  else if (v.weight != null) t += ` · ${fmt(store.showW(v.weight, unit), 1)} ${unit}`;
  return t;
}

export function assignmentPlan(root, { id }, query) {
  const g = store.get('assignments', id);
  const b = g && store.get('blocks', g.blockId);
  const a = g && store.get('athletes', g.athleteId);
  if (!g || !b || !a || isWarmup(b)) { root.innerHTML = '<p class="empty">Program not found.</p>'; return; }
  const first = a.name.split(' ')[0];
  const now = weekNow(g, b);
  const week = Math.max(0, Math.min(b.weeks - 1, query.get('w') == null ? now : Number(query.get('w'))));
  const day = Math.max(0, Math.min(b.days.length - 1, Number(query.get('day') || 0)));
  const ex = store.exercisesById();
  const others = store.all('assignments').filter((x) => x.blockId === b.id && x.id !== g.id).map((x) => store.get('athletes', x.athleteId)?.name).filter(Boolean);
  const go = (w = week, d = day) => { location.hash = `#/coach/assignment/${id}/plan?w=${w}&day=${d}`; };
  const items = b.days[day].items.map((it, ii) => ({ it, ii })).filter(({ it }) => !it.warmup);
  let n = 0;
  root.innerHTML = `
    <header class="page-head"><a class="back" href="#/coach/athlete/${a.id}">‹ ${esc(a.name)}</a>
      <span class="kicker">${esc(first)}'s program</span><h1>${esc(b.name)}</h1>
      <p class="muted small">Change exercises, sets and reps right here. After each change you pick: just this week, or this week to the end. Workouts ${esc(first)} already finished stay as logged.</p></header>
    ${others.length ? `<p class="assigned-note small">${esc(others.join(', '))} ${others.length > 1 ? 'are' : 'is'} on this program too. Your first change makes a copy just for ${esc(first)}, so they keep theirs.</p>` : ''}
    <nav class="day-tabs week-tabs" aria-label="Weeks">
      ${Array.from({ length: b.weeks }, (_, w) => `<button class="day-tab ${w === week ? 'on' : ''} ${w === now ? 'now' : ''}" data-action="pickWeek" data-w="${w}" aria-pressed="${w === week}">Wk ${w + 1}${b.deloadWeek === w ? ' · D' : ''}</button>`).join('')}
    </nav>
    ${b.days.length > 1 ? `<nav class="day-tabs" aria-label="Days">${b.days.map((d, di) => `<button class="day-tab ${di === day ? 'on' : ''}" data-action="pickDay" data-d="${di}" aria-pressed="${di === day}">${esc(d.name || `Day ${di + 1}`)}</button>`).join('')}</nav>` : ''}
    ${items.map(({ it, ii }) => {
      const v = weekView(it, b, week);
      const x = ex[v.exerciseId];
      const label = v.off ? '–' : it.group || String(++n);
      return `<div class="card plan-item ${v.off ? 'off' : ''}" data-ii="${ii}">
        <span class="item-n">${esc(label)}</span>
        <div><h3>${esc(x?.name || v.exerciseId)}</h3>
          <p class="plan-nums ${v.off ? 'muted' : ''}">${v.off ? `Not in week ${week + 1}` : esc(planNums(v, it.unit || store.unit()))}</p></div>
        <div class="plan-acts">${v.off ? '<button class="chip" data-action="putBack">Put back</button>'
          : '<button class="chip" data-action="change">Change</button><button class="chip" data-action="remove">Remove</button>'}</div></div>`;
    }).join('') || '<p class="muted">No exercises on this day.</p>'}
    <button class="btn ghost wide" data-action="add">+ Add an exercise</button>
    <p class="muted small">Warmups, notes and tempo stay in the <a class="link" href="#/coach/block/${b.id}?w=${week}&day=${day}">full program editor</a>. Days and dates: <a class="link" href="#/coach/assignment/${id}">schedule</a>.</p>`;

  // Asks how far the change reaches, then saves it to this athlete's program.
  const apply = async (what, fn) => {
    let scope = 'week';
    if (week < b.weeks - 1) {
      const msg = `${what}${others.length ? ` Only ${first} gets this; ${others.join(', ')} stay${others.length > 1 ? '' : 's'} on the original.` : ''}`;
      scope = await choose('How long should this last?', msg, [
        { v: 'week', label: `Just week ${week + 1}`, sub: `Week ${week + 2} on stays as it was` },
        { v: 'rest', label: `Rest of the program`, sub: `Weeks ${week + 1} to ${b.weeks}` },
      ]);
      if (!scope) return;
    }
    const mine = ownBlock(g, b, a);
    store.put('blocks', fn(mine, scope));
    toast(`${scope === 'week' ? `Changed for week ${week + 1}` : `Changed from week ${week + 1} on`}${mine.id !== b.id ? `, in ${first}'s own copy` : ''}`);
    plan();
  };
  const plan = () => assignmentPlan(root, { id }, query);
  const iiOf = (el) => Number(el.closest('[data-ii]').dataset.ii);
  const exName = (exId) => store.get('exercises', exId)?.name || exId;

  bindActions(root, {
    pickWeek: (el) => go(Number(el.dataset.w), day),
    pickDay: (el) => go(week, Number(el.dataset.d)),
    remove: (el) => { const ii = iiOf(el); apply(`Take out ${exName(weekView(b.days[day].items[ii], b, week).exerciseId)}.`, (blk, scope) => removeItem(blk, day, ii, week, scope)); },
    putBack: (el) => { const ii = iiOf(el); apply(`Put ${exName(weekView(b.days[day].items[ii], b, week).exerciseId)} back in.`, (blk, scope) => restoreItem(blk, day, ii, week, scope)); },
    add: () => pickExerciseSheet((exId) => {
      const it = newItem(exId, false);
      it.unit = store.unit();
      changeSheet(it, { ...weekView(it, { ...b, deloadWeek: null }, 0) }, 'Add', (vals) => {
        const item = { ...it, exerciseId: vals.exerciseId, sets: vals.sets ?? it.sets, ...(vals.reps ? { reps: vals.reps.reps, ...(vals.reps.repsTo != null ? { repsTo: vals.reps.repsTo } : {}) } : {}),
          ...(vals.secs != null ? { secs: vals.secs } : {}), ...(vals.pct != null ? { pct: vals.pct } : {}), ...(vals.weight != null ? { weight: vals.weight } : {}) };
        if (item.repsTo == null) delete item.repsTo;
        apply(`Add ${exName(vals.exerciseId)}.`, (blk, scope) => addItem(blk, day, item, week, scope));
      });
    }, { allowNew: true }),
    change: (el) => {
      const ii = iiOf(el), it = b.days[day].items[ii], v = weekView(it, b, week);
      changeSheet(it, v, 'Next', (vals) => {
        const change = {};
        for (const k of ['exerciseId', 'sets', 'secs', 'pct', 'weight']) if (vals[k] != null && vals[k] !== v[k]) change[k] = vals[k];
        if (vals.reps && (vals.reps.reps !== v.reps || (vals.reps.repsTo ?? null) !== (v.repsTo ?? null))) change.reps = vals.reps;
        if (!Object.keys(change).length) return toast('Nothing changed');
        const bits = [];
        if (change.exerciseId) bits.push(`${exName(v.exerciseId)} → ${exName(change.exerciseId)}`);
        const after = { ...v, ...change, ...(change.reps || {}) };
        if (Object.keys(change).some((k) => k !== 'exerciseId')) bits.push(`${planNums(v, it.unit || store.unit())} → ${planNums(after, it.unit || store.unit())}`);
        apply(`${bits.join('. ')}.`, (blk, scope) => changeItem(blk, day, ii, week, change, scope));
      });
    },
  });
}

// The change panel for one exercise in one week: swap it, sets, reps (or
// seconds), and the % of max or weight. Calls done(values) on save.
function changeSheet(item, v, okLabel, done, state = null) {
  const s = state || { exerciseId: v.exerciseId, sets: v.sets, reps: repsText(v.reps, v.repsTo, '-'), secs: v.secs, pct: v.pct, weight: v.weight };
  const iu = item.unit || store.unit();
  const m = v.measure;
  const num = (label, k, val, step, min) => `<div class="stepper"><span>${label}</span><div class="stepper-row">
    <button class="step-btn" type="button" data-step="${k}" data-d="${-step}" aria-label="Less ${label.toLowerCase()}">−</button>
    <input type="number" inputmode="decimal" min="${min}" step="any" name="${k}" value="${val ?? ''}" aria-label="${label}">
    <button class="step-btn" type="button" data-step="${k}" data-d="${step}" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
  const html = `<form class="plan-fields">
    <div class="plan-ex"><b>${esc(store.get('exercises', s.exerciseId)?.name || s.exerciseId)}</b><button type="button" class="chip" data-swap>Swap exercise</button></div>
    ${m === 'none' ? '<p class="muted small">No sets or reps. The athlete just checks it off.</p>' : `<div class="item-main">
      ${num('Sets', 'sets', s.sets, 1, 1)}<span class="times" aria-hidden="true">×</span>
      ${m === 'time' ? num('Seconds', 'secs', s.secs, 5, 0) : `<div class="stepper reps-stepper"><span>${m === 'breaths' ? 'Breaths' : 'Reps'}</span><div class="stepper-row">
        <button class="step-btn" type="button" data-step="reps" data-d="-1" aria-label="Fewer">−</button>
        <input type="text" name="reps" autocomplete="off" placeholder="10-15" value="${esc(s.reps)}" aria-label="Reps, one number or a range like 10-15">
        <button class="step-btn" type="button" data-step="reps" data-d="1" aria-label="More">+</button></div></div>`}</div>
      ${v.pct != null ? num('% of max', 'pct', s.pct, 2.5, 0) : ''}
      ${v.weight != null ? num(`Weight (${iu})`, 'weight', store.showW(s.weight, iu) ?? '', iu === 'kg' ? 2.5 : 5, 0) : ''}`}
    <div class="ask-btns"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">${esc(okLabel)}</button></div></form>`;
  const wrap = sheet(store.get('exercises', v.exerciseId)?.name || 'Change exercise', html, (w) => {
    const f = w.querySelector('form');
    const read = () => {
      const val = (k) => (f.elements[k] && f.elements[k].value !== '' ? Number(f.elements[k].value) : null);
      if (f.elements.sets) s.sets = val('sets');
      if (f.elements.secs) s.secs = val('secs');
      if (f.elements.pct) s.pct = val('pct');
      // The weight is kept in lb: only read it back if the box was changed.
      const wb = f.elements.weight;
      if (wb && wb.value !== String(store.showW(s.weight, iu) ?? '')) s.weight = wb.value === '' ? null : store.readW(Number(wb.value), iu);
      if (f.elements.reps) s.reps = f.elements.reps.value.trim();
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
      if (e.target.closest('[data-swap]')) { read(); pickExerciseSheet((exId) => { s.exerciseId = exId; changeSheet(item, v, okLabel, done, s); }); }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      read();
      const out = { exerciseId: s.exerciseId };
      if (m !== 'none') {
        if (!s.sets || s.sets < 1) return toast('Sets must be at least 1');
        out.sets = Math.round(s.sets);
        if (m === 'time') out.secs = s.secs ?? 0;
        else {
          const r = parseReps(s.reps);
          if (!r || r.reps == null) return toast('Reps: one number or a range like 10-15');
          out.reps = r;
        }
        if (v.pct != null && s.pct != null) out.pct = s.pct;
        if (v.weight != null && s.weight != null) out.weight = Math.round(s.weight * 100) / 100;
      }
      closeSheet();
      done(out);
    });
  });
  wrap.classList.add('ask');
}
