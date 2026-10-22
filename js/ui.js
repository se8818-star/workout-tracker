// Small view helpers shared by the athlete and coach screens.

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

export function closeSheet() { $$('.sheet-wrap').forEach((n) => n.remove()); }

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
