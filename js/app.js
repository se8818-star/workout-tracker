// Router and app shell. Routes are hash-based so the app works from any static host.

import * as store from './store.js';
import * as athleteViews from './athlete.js';
import * as coachViews from './coach.js';
import { esc, bindActions, toast } from './ui.js';
import { startSync, gate, cloudEnabled, teamInfo, signout } from './sync.js';

store.load({ cloud: cloudEnabled });

const routes = [
  [/^\/$/, home],
  [/^\/athlete\/([^/]+)$/, athleteViews.today_, ['id']],
  [/^\/athlete\/([^/]+)\/week$/, athleteViews.week, ['id']],
  [/^\/athlete\/([^/]+)\/session\/(\d{4}-\d{2}-\d{2})$/, athleteViews.session, ['id', 'date']],
  [/^\/athlete\/([^/]+)\/history$/, athleteViews.history, ['id']],
  [/^\/coach$/, coachViews.board],
  [/^\/coach\/athlete\/([^/]+)$/, coachViews.athlete, ['id']],
  [/^\/coach\/blocks$/, coachViews.blocks],
  [/^\/coach\/block\/([^/]+)$/, coachViews.blockEditor, ['id']],
  [/^\/coach\/assign$/, coachViews.assign],
  [/^\/coach\/exercises$/, coachViews.exercises],
  [/^\/settings$/, settingsView],
];

function me() { return store.settings().me || null; }

function nav(path) {
  const m = path ? me() : null;
  let items = [];
  if (m?.role === 'athlete') {
    const id = m.athleteId;
    items = [[`#/athlete/${id}`, 'Today', '◉'], [`#/athlete/${id}/week`, 'Analytics', '▤'], [`#/athlete/${id}/history`, 'History', '↺'], ['#/settings', 'More', '⋯']];
  } else if (m?.role === 'coach') {
    items = [['#/coach', 'Team', '◉'], ['#/coach/blocks', 'Programs', '▤'], ['#/coach/exercises', 'Exercises', '☰'], ['#/settings', 'More', '⋯']];
  }
  const el = document.getElementById('nav');
  el.hidden = !items.length;
  // Highlight the tab whose path is the longest prefix of the current one.
  const active = items.map(([h]) => h.slice(1)).filter((p) => path === p || path.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  el.innerHTML = items.map(([href, label, icon]) =>
    `<a href="${href}" class="${href.slice(1) === active ? 'on' : ''}"><span aria-hidden="true">${icon}</span>${label}</a>`).join('');
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
  // Play the page entrance only when navigating, not on background refreshes.
  // The class comes off again so in-place redraws (ticking a set) stay still.
  clearTimeout(root._enterT);
  root.classList.toggle('enter', keepScroll !== true);
  root._enterT = setTimeout(() => root.classList.remove('enter'), 900);
  if (gate(root)) { nav(''); return; }
  if (cloudEnabled && path === '/') { const m = me(); location.hash = m.role === 'coach' ? '#/coach' : `#/athlete/${m.athleteId}`; return; }
  if (!me() && path !== '/') { location.hash = '#/'; return; }
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
    <header class="page-head hero"><h1>Training log</h1>
      <p class="muted">Demo mode: everything is saved on this device. Pick who you are to try it.</p></header>
    <section class="card">
      <h3>I'm the coach</h3>
      <button class="btn wide" data-action="coach">Open coach view</button>
    </section>
    <section class="card">
      <h3>I'm an athlete</h3>
      <ul class="pick">${athletes.map((a) => `<li><button data-action="athlete" data-id="${a.id}">${esc(a.name)} <small>${esc(a.group || '')}</small></button></li>`).join('')}</ul>
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
      <label class="field-row"><span>Round weights to</span><input type="number" step="0.5" min="0" value="${s.rounding}" data-action="rounding"></label>
    </section>
    <section class="card">
      <h3>Put it on your phone</h3>
      <p class="muted">iPhone: open this page in Safari, tap Share, then "Add to Home Screen". Android: Chrome menu, then "Install app". It then opens like a normal app and works without signal.</p>
    </section>
    <section class="card">
      <button class="btn ghost wide" data-action="switchUser">${cloudEnabled ? 'Sign out' : 'Switch user'}</button>
      <button class="btn ghost wide" data-action="export">Export all data (JSON)</button>
      ${cloudEnabled ? '' : '<button class="btn ghost wide danger" data-action="reset">Reset demo data</button>'}
    </section>`;
  bindActions(root, {
    units: (el) => store.setSetting('units', el.value),
    rounding: (el) => store.setSetting('rounding', Number(el.value) || 0),
    switchUser: () => { if (cloudEnabled) return signout(); store.setSetting('me', null); location.hash = '#/'; },
    export: () => {
      const data = Object.fromEntries(store.KINDS.map((k) => [k, store.all(k)]));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `training-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    },
    reset: () => { if (confirm('Erase everything on this device and reload the demo?')) { store.reset(); toast('Demo data reset'); location.hash = '#/'; } },
  });
}

window.addEventListener('hashchange', () => render());
render();
startSync(() => render(true));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
