// Small view helpers shared by the athlete and coach screens.

import { embedFor, splitLinks } from './video.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

// The lb / kg switch shown on pages with weights. Views handle data-action="setUnits".
export function unitSeg(u) {
  return `<div class="seg unit-seg" role="group" aria-label="Weight unit">${['lb', 'kg'].map((v) =>
    `<button class="${u === v ? 'on' : ''}" data-action="setUnits" data-v="${v}" aria-pressed="${u === v}">${v}</button>`).join('')}</div>`;
}

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// Delegate clicks/changes on [data-action] elements to a handler map.
export function bindActions(root, handlers) {
  const run = (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const name = el.dataset.action;
    const fn = handlers[name];
    if (!fn) return;
    const isField = el.matches('input, select, textarea');
    if (ev.type === 'click' && isField) return;
    if (ev.type !== 'click' && !isField) return;
    fn(el, ev);
  };
  // Views re-render into the same root, so drop the previous view's listeners.
  root._unbind?.();
  root.addEventListener('click', run);
  root.addEventListener('change', run);
  root._unbind = () => { root.removeEventListener('click', run); root.removeEventListener('change', run); };
}

export function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// Bottom sheet for pickers (swap exercise, switch workout).
export function sheet(title, html, bind) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">${html}</div></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeSheet(); });
  document.body.append(wrap);
  bind?.(wrap);
  return wrap;
}

export function closeSheet() { $$('.sheet-wrap').forEach((n) => { n._onClose?.(); n.remove(); }); }

// In-app replacement for confirm(). Resolves true on OK, false on Cancel / ✕ / backdrop.
export function ask(message, { title = 'Are you sure?', ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = sheet(title, `<p class="ask-msg">${esc(message)}</p>
      <div class="ask-btns"><button class="btn ghost" data-close>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button></div>`);
    wrap.classList.add('ask');
    wrap._onClose = () => resolve(false);
    wrap.querySelector('[data-ok]').addEventListener('click', () => { wrap._onClose = null; closeSheet(); resolve(true); });
    wrap.querySelector('[data-ok]').focus();
  });
}

// In-app replacement for prompt(). fields: [{ k, label, value, placeholder }]. Resolves { k: value } or null.
export function askFields(title, fields, { ok = 'Save', cancel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const wrap = sheet(title, `<form class="ask-form">
      ${fields.map((f) => `<label class="ask-field"><span>${esc(f.label)}</span><input name="${esc(f.k)}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder ?? '')}" autocomplete="off"></label>`).join('')}
      <div class="ask-btns"><button type="button" class="btn ghost" data-close>${esc(cancel)}</button><button class="btn">${esc(ok)}</button></div></form>`);
    wrap.classList.add('ask');
    wrap._onClose = () => resolve(null);
    const form = wrap.querySelector('form'), first = form.querySelector('input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!first.value.trim()) { first.focus(); return; }
      const out = Object.fromEntries(fields.map((f) => [f.k, form.elements[f.k].value.trim()]));
      wrap._onClose = null; closeSheet(); resolve(out);
    });
    first.focus(); first.select();
  });
}

// Exercise demo video in a pop-up over the app, so athletes never leave
// their workout. Links the app can't play inside (some sites block it) get
// a button that opens them in a new tab instead.
export function demoSheet(link, title = 'Demo video') {
  const e = embedFor(link);
  const open = `<a class="link small" href="${esc(link)}" target="_blank" rel="noopener">Open in a new tab ↗</a>`;
  const player = !e ? `<p class="ask-msg">This link can't play inside the app.</p><a class="btn wide" href="${esc(link)}" target="_blank" rel="noopener">Open video ↗</a>`
    : e.kind === 'file' ? `<video class="demo-video" src="${esc(e.src)}" controls playsinline autoplay></video>`
    : `<div class="demo-frame ${e.tall ? 'tall' : ''}"><iframe src="${esc(e.src)}" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  const wrap = sheet(title, `${player}${e ? `<p class="demo-foot">${open}</p>` : ''}`);
  wrap.classList.add('demo');
  return wrap;
}

// Text with any links turned into buttons that open the demo pop-up, or
// plain new-tab links for sites the app can't play inside.
export function linkify(text) {
  return splitLinks(text).map((p) => {
    if (!p.url) return esc(p.text);
    if (embedFor(p.url)) return `<button type="button" class="demo-link" data-demo="${esc(p.url)}">▶ Watch video</button>`;
    let host = p.url;
    try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch { /* keep the raw link */ }
    return `<a class="demo-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(host)} ↗</a>`;
  }).join('');
}

// Any [data-demo] button anywhere opens its link in the demo pop-up (or a
// new tab when the site won't play inside the app).
export function demoLinks() {
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-demo]');
    if (!el) return;
    ev.preventDefault();
    if (!embedFor(el.dataset.demo)) {
      const w = window.open(el.dataset.demo, '_blank');
      if (w) { w.opener = null; return; }
    }
    demoSheet(el.dataset.demo, el.dataset.title || 'Demo video');
  });
}

export const PATTERN_LABEL = {
  squat: 'Squat', hinge: 'Hinge', push: 'Push', pull: 'Pull', carry: 'Carry', core: 'Core',
  plyo: 'Plyo', sprint: 'Sprint', throw: 'Throwing', other: 'Other',
};

// Horizontal bar list: [{label, value, sub?}] scaled to the largest value.
export function bars(rows, unit = '') {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row"><span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(r.value / max) * 100}%"></span></span>
      <span class="bar-val">${fmt(r.value)}${unit}${r.sub ? ` <small>${esc(r.sub)}</small>` : ''}</span></div>`).join('')}</div>`;
}

// One stat tile with an optional comparison against a previous value.
export function stat(label, value, prev, unit = '') {
  let delta = '';
  if (prev != null && prev > 0) {
    const pct = Math.round(((value - prev) / prev) * 100);
    const cls = pct > 15 ? 'up big' : pct < -15 ? 'down big' : pct >= 0 ? 'up' : 'down';
    delta = `<span class="delta ${cls}">${pct >= 0 ? '+' : ''}${pct}% vs last wk</span>`;
  }
  return `<div class="stat"><span class="stat-label">${esc(label)}</span><span class="stat-value">${fmt(value)}<small>${unit}</small></span>${delta}</div>`;
}

// Styled dropdowns. Each <select> stays in the page (hidden) and keeps its
// value and change events, so the screens' code is unchanged; a button and a
// menu in the app's style stand in front of it.
const valueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

function closeMenu() { $$('.dd-menu').forEach((m) => { m._btn?.setAttribute('aria-expanded', 'false'); m.remove(); }); }

function openMenu(sel, btn) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'dd-menu';
  menu.setAttribute('role', 'listbox');
  menu._btn = btn;
  const opt = (o) => `<button type="button" role="option" class="dd-opt ${o.selected ? 'on' : ''}" data-v="${esc(o.value)}" aria-selected="${o.selected}" ${o.disabled ? 'disabled' : ''}>${esc(o.textContent)}</button>`;
  menu.innerHTML = [...sel.children].map((c) => (c.tagName === 'OPTGROUP'
    ? `<div class="dd-group">${esc(c.label)}</div>${[...c.children].map(opt).join('')}` : opt(c))).join('');
  document.body.append(menu);
  // Below the button, or above it when there isn't room.
  const r = btn.getBoundingClientRect(), h = menu.offsetHeight, below = innerHeight - r.bottom;
  menu.style.minWidth = `${r.width}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${below >= h + 8 || below > r.top ? r.bottom + 4 : r.top - h - 4}px`;
  menu.style.maxHeight = `${Math.max(160, (below >= h + 8 || below > r.top ? below : r.top) - 12)}px`;
  btn.setAttribute('aria-expanded', 'true');
  (menu.querySelector('.dd-opt.on') || menu.querySelector('.dd-opt'))?.focus();
  menu.addEventListener('click', (e) => {
    const o = e.target.closest('.dd-opt');
    if (!o) return;
    closeMenu(); btn.focus();
    if (o.dataset.v === sel.value) return;
    sel.value = o.dataset.v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  menu.addEventListener('keydown', (e) => {
    const opts = $$('.dd-opt:not([disabled])', menu), i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length]?.focus(); }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); btn.focus(); }
  });
}

function enhance(sel) {
  sel._dd = true;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `dd-btn ${sel.className}`;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const name = sel.getAttribute('aria-label') || sel.closest('label')?.firstChild?.textContent?.trim();
  const sync = () => {
    btn.innerHTML = `<span class="dd-val">${esc(sel.selectedOptions[0]?.textContent || '')}</span><span class="dd-caret" aria-hidden="true"></span>`;
    if (name) btn.setAttribute('aria-label', `${name}: ${sel.selectedOptions[0]?.textContent || ''}`);
    btn.disabled = sel.disabled;
  };
  // Code that sets select.value directly (e.g. resetting after Cancel) updates the button too.
  Object.defineProperty(sel, 'value', { get() { return valueProp.get.call(this); }, set(v) { valueProp.set.call(this, v); sync(); }, configurable: true });
  sel.addEventListener('change', sync);
  sel.classList.add('dd-native');
  sel.tabIndex = -1;
  sel.after(btn);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (btn.getAttribute('aria-expanded') === 'true') closeMenu(); else openMenu(sel, btn);
  });
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(sel, btn); } });
  sync();
}

export function styledSelects() {
  const run = () => document.querySelectorAll('select:not(.dd-native)').forEach((s) => { if (!s._dd) enhance(s); });
  run();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dd-menu, .dd-btn')) closeMenu(); });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', (e) => { if (!e.target.closest?.('.dd-menu')) closeMenu(); }, true);
  window.addEventListener('hashchange', closeMenu);
}
