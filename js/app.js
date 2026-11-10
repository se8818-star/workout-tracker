// Router and app shell. Routes are hash-based so the app works from any static host.

import * as store from './store.js';
import * as athleteViews from './athlete.js';
import * as coachViews from './coach.js';
import { esc, bindActions, toast, ask, styledSelects, demoLinks, closeSheet } from './ui.js';
import { startSync, gate, cloudEnabled, teamInfo, signout, setPassword } from './sync.js';

store.load({ cloud: cloudEnabled });

const routes = [
  [/^\/$/, home],
  [/^\/athlete\/([^/]+)$/, athleteViews.today_, ['id']],
  [/^\/athlete\/([^/]+)\/week$/, athleteViews.week, ['id']],
  [/^\/athlete\/([^/]+)\/session\/(\d{4}-\d{2}-\d{2})$/, athleteViews.session, ['id', 'date']],
  [/^\/athlete\/([^/]+)\/warmup\/(\d{4}-\d{2}-\d{2})$/, athleteViews.warmupSession, ['id', 'date']],
  [/^\/athlete\/([^/]+)\/history$/, athleteViews.history, ['id']],
  [/^\/coach$/, coachViews.board],
  [/^\/coach\/athlete\/([^/]+)$/, coachViews.athlete, ['id']],
  [/^\/coach\/blocks$/, coachViews.blocks],
  [/^\/coach\/block\/([^/]+)$/, coachViews.blockEditor, ['id']],
  [/^\/coach\/assign$/, coachViews.assign],
  [/^\/coach\/assignment\/([^/]+)$/, coachViews.assignmentEditor, ['id']],
  [/^\/coach\/assignment\/([^/]+)\/plan$/, coachViews.assignmentPlan, ['id']],
  [/^\/coach\/exercises$/, coachViews.exercises],
  [/^\/settings$/, settingsView],
];

// Tab bar line icons (24px grid, stroked with currentColor).
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  today: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  progress: svg('<path d="M5 20V11M12 20V5M19 20v-6"/>'),
  history: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>'),
  team: svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.7.6 2.7 2.1 3 4.4"/>'),
  programs: svg('<rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="11" width="16" height="9" rx="1.5"/>'),
  exercises: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
};

function me() { return store.settings().me || null; }

function nav(path) {
  const m = path ? me() : null;
  let items = [];
  if (m?.role === 'athlete') {
    const id = m.athleteId;
    items = [[`#/athlete/${id}`, 'Today', ICONS.today], [`#/athlete/${id}/week`, 'Progress', ICONS.progress], [`#/athlete/${id}/history`, 'History', ICONS.history], ['#/settings', 'More', ICONS.more]];
  } else if (m?.role === 'coach') {
    items = [['#/coach', 'Team', ICONS.team], ['#/coach/blocks', 'Programs', ICONS.programs], ['#/coach/exercises', 'Exercises', ICONS.exercises], ['#/settings', 'More', ICONS.more]];
  }
  const el = document.getElementById('nav');
  el.hidden = !items.length;
  // Highlight the tab whose path is the longest prefix of the current one.
  const active = items.map(([h]) => h.slice(1)).filter((p) => path === p || path.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  el.innerHTML = items.map(([href, label, icon]) =>
    `<a href="${href}" class="${href.slice(1) === active ? 'on' : ''}">${icon}${label}</a>`).join('');
}

// Sync calls this with keepScroll so a background refresh doesn't jump the page.
function render(keepScroll = false) {
  const y = window.scrollY;
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const query = new URLSearchParams(qs || '');
  const root = document.getElementById('view');
  root._unbind?.();
  root._unbind = null;
  // A pop-up belongs to the page it was opened on.
  if (keepScroll !== true) closeSheet();
  // Play the page entrance only when navigating, not on background refreshes.
  // The class comes off again so in-place redraws (ticking a set) stay still.
  clearTimeout(root._enterT);
  root.classList.toggle('enter', keepScroll !== true);
  root._enterT = setTimeout(() => root.classList.remove('enter'), 900);
  if (gate(root)) { nav(''); return; }
  if (cloudEnabled && path === '/') { const m = me(); location.hash = m.role === 'coach' ? '#/coach' : `#/athlete/${m.athleteId}`; return; }
  if (!me() && path !== '/') { location.hash = '#/'; return; }
  // Athletes only see their own pages: no coach screens, no other athletes.
  const m = me();
  const other = path.match(/^\/athlete\/([^/]+)/);
  if (m?.role === 'athlete' && (path.startsWith('/coach') || (other && other[1] !== m.athleteId))) { location.hash = `#/athlete/${m.athleteId}`; return; }
  for (const [re, view, keys = []] of routes) {
    const m = path.match(re);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    view(root, params, query);
    nav(path);
    window.scrollTo(0, keepScroll === true ? y : 0);
    return;
  }
  root.innerHTML = '<p class="empty">Page not found. <a href="#/">Home</a></p>';
}

function home(root) {
  const athletes = store.all('athletes').sort((a, b) => a.name.localeCompare(b.name));
  root.innerHTML = `
    <header class="page-head hero"><h1>Chunky Training</h1>
      <p class="muted">Demo mode: everything is saved on this device. Pick who you are to try it.</p></header>
    <section class="card">
      <h3>I'm the coach</h3>
      <button class="btn wide" data-action="coach">Open coach view</button>
    </section>
    <section class="card">
      <h3>I'm an athlete</h3>
      ${athletes.length ? `<ul class="pick">${athletes.map((a) => `<li><button data-action="athlete" data-id="${a.id}">${esc(a.name)} <small>${esc(a.group || '')}</small></button></li>`).join('')}</ul>`
        : '<p class="muted">No athletes yet. Open the coach view and tap "+ Add athlete".</p>'}
    </section>`;
  bindActions(root, {
    coach: () => { store.setSetting('me', { role: 'coach' }); location.hash = '#/coach'; },
    athlete: (el) => { store.setSetting('me', { role: 'athlete', athleteId: el.dataset.id }); location.hash = `#/athlete/${el.dataset.id}`; },
  });
}

function settingsView(root) {
  const s = store.settings();
  root.innerHTML = `
    <header class="page-head"><h1>More</h1></header>
    ${me()?.role === 'coach' ? `<section class="card">${teamInfo() ? `<p>Team <b>${esc(teamInfo().team?.name)}</b>. Athletes join with code <b class="code">${esc(teamInfo().team?.join_code)}</b></p>` : ''}<a class="btn wide" href="#/coach/assign">Assign a program</a></section>` : ''}
    <section class="card form">
      <label class="field-row"><span>Units</span><select data-action="units"><option ${s.units === 'lb' ? 'selected' : ''}>lb</option><option ${s.units === 'kg' ? 'selected' : ''}>kg</option></select></label>
      <label class="field-row"><span>Round weights to (${s.units})</span><input type="number" step="0.5" min="0" value="${s.units === 'kg' ? (s.roundingKg ?? 2.5) : s.rounding}" data-action="rounding"></label>
      <p class="muted small">Weights are saved once and shown in each person's unit, so a coach in kg and an athlete in lb see the same load.</p>
    </section>
    <section class="card">
      <h3>Put it on your phone</h3>
      <p class="muted">iPhone: open this page in Safari, tap Share, then "Add to Home Screen". Android: Chrome menu, then "Install app". It then opens like a normal app and works without signal.</p>
    </section>
    ${cloudEnabled ? `<section class="card form"><h3>Password</h3>
      <p class="muted small">Sign in with your email and this password. Forgot it? Use "Sign in with an email code" on the sign-in page.</p>
      <label class="field-row"><span>New password</span><input type="password" id="set-pw" autocomplete="new-password" placeholder="8+ characters"></label>
      <button class="btn ghost wide" data-action="savePassword">Save password</button></section>` : ''}
    <section class="card">
      <button class="btn ghost wide" data-action="switchUser">${cloudEnabled ? 'Sign out' : 'Switch user'}</button>
      <button class="btn ghost wide" data-action="export">Export all data (JSON)</button>
      ${cloudEnabled ? '' : '<button class="btn ghost wide danger" data-action="reset">Reset demo data</button>'}
    </section>`;
  bindActions(root, {
    units: (el) => { store.setSetting('units', el.value); settingsView(root); },
    rounding: (el) => store.setSetting(s.units === 'kg' ? 'roundingKg' : 'rounding', Number(el.value) || 0),
    savePassword: async () => {
      const pw = root.querySelector('#set-pw').value;
      if (pw.length < 8) return toast('Use at least 8 characters');
      try { await setPassword(pw); root.querySelector('#set-pw').value = ''; toast('Password saved'); } catch (e) { toast(e.message); }
    },
    switchUser: () => { if (cloudEnabled) return signout(); store.setSetting('me', null); location.hash = '#/'; },
    export: () => {
      const data = Object.fromEntries(store.KINDS.map((k) => [k, store.all(k)]));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `training-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    },
    reset: async () => { if (await ask('Everything on this device is erased and the demo reloads.', { title: 'Reset demo?', ok: 'Reset', danger: true })) { store.reset(); toast('Demo data reset'); location.hash = '#/'; } },
  });
}

window.addEventListener('hashchange', () => render());
styledSelects();
demoLinks();
render();
startSync(() => render(true));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
