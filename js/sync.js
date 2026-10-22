// Optional cloud sync with Supabase. With no keys in config.js this does nothing
// and the app runs in demo mode. With keys, people sign in with an emailed
// 6-digit code, coaches create a team, athletes join with the team code, and
// local records are mirrored to the `records` table (see supabase/schema.sql).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as store from './store.js';
import { esc, bindActions, toast, $ } from './ui.js';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !new URLSearchParams(location.search).has('demo');

let sb = null;          // supabase client
let user = null;
let membership = null;  // { team_id, role, athlete_id, team: { name, join_code } }
let ready = false;
let loadError = false;
let rerender = () => {};
let pushTimer = null;

export const teamInfo = () => membership;

export async function startSync(render) {
  rerender = render;
  if (!cloudEnabled) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true } });
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
  } catch (e) {
    // First visit with no connection: nothing cached yet to sign in with.
    console.warn(e);
    loadError = true; ready = true; rerender();
    return;
  }
  sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; });
  if (user) await loadMembership();
  ready = true;
  rerender();
  if (membership) {
    await syncNow();
    store.onChange(schedulePush);
    setInterval(syncNow, 30000);
    window.addEventListener('online', syncNow);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  }
}

async function loadMembership() {
  const { data, error } = await sb.from('members').select('team_id, role, athlete_id, teams(name, join_code)').eq('user_id', user.id).limit(1);
  if (error) {
    // Offline in the gym: keep using the team we last saw so logging still works.
    console.warn(error);
    membership = store.settings().membership || null;
    return;
  }
  const m = data?.[0];
  membership = m ? { team_id: m.team_id, role: m.role, athlete_id: m.athlete_id, team: m.teams } : null;
  store.setSetting('membership', membership);
  if (membership) {
    store.setSetting('me', membership.role === 'coach' ? { role: 'coach' } : { role: 'athlete', athleteId: membership.athlete_id });
  }
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1500);
}

export async function syncNow() {
  if (!membership || !navigator.onLine) return;
  await push();
  await pull();
}

async function push() {
  if (!membership || !navigator.onLine) return;
  const dirty = store.dirtyKeys();
  if (!dirty.length) return;
  const rows = dirty.map(([key, val]) => {
    const [kind, id] = key.split('/');
    const rec = store.get(kind, id);
    return { team_id: membership.team_id, kind, id, data: rec || {}, deleted: val === 'deleted' || !rec };
  });
  const { error } = await sb.from('records').upsert(rows);
  if (!error) { store.clearDirty(dirty.map(([k]) => k)); return; }
  // One bad row (e.g. an athlete editing something only a coach may) fails the
  // batch, so retry row by row and drop the ones the server refuses.
  const done = [];
  for (let i = 0; i < rows.length; i++) {
    const r = await sb.from('records').upsert(rows[i]);
    if (!r.error || r.error.code === '42501') done.push(dirty[i][0]);
  }
  store.clearDirty(done);
}

async function pull() {
  const last = store.settings().lastPull || '1970-01-01T00:00:00Z';
  // Re-read a 2-minute overlap so a write that committed late isn't skipped.
  const since = new Date(new Date(last).getTime() - 120000).toISOString();
  let changed = false, newest = last;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('records').select('kind, id, data, deleted, updated_at')
      .eq('team_id', membership.team_id).gt('updated_at', since).order('updated_at').range(from, from + 999);
    if (error) { console.warn(error); return; }
    for (const r of data) {
      if (store.applyRemote(r.kind, r.id, r.deleted ? null : r.data)) changed = true;
      if (r.updated_at > newest) newest = r.updated_at;
    }
    if (data.length < 1000) break;
  }
  if (newest !== last) store.setSetting('lastPull', newest);
  // Don't redraw under someone who is typing; the next pull will catch up.
  const typing = document.activeElement?.matches?.('input, textarea, select');
  if (changed && !typing) rerender();
}

// Renders the sign-in or team screen when needed. Returns true if it took over the page.
export function gate(root) {
  if (!cloudEnabled) return false;
  if (!ready) { root.innerHTML = '<p class="empty">Loading…</p>'; return true; }
  if (loadError) { root.innerHTML = '<p class="empty">Couldn\'t reach the server. Check your connection and reload.</p>'; return true; }
  if (!user) { loginView(root); return true; }
  if (!membership) { teamView(root); return true; }
  return false;
}

function loginView(root) {
  root.innerHTML = `
    <header class="page-head hero"><h1>Training log</h1><p class="muted">Sign in with your email. We'll send you a sign-in link (or a 6-digit code).</p></header>
    <section class="card form">
      <label class="field-row"><span>Email</span><input type="email" id="lg-email" autocomplete="email" inputmode="email"></label>
      <button class="btn wide" data-action="send">Send code</button>
      <div id="lg-code" hidden>
        <label class="field-row"><span>Code</span><input id="lg-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>
        <button class="btn wide" data-action="verify">Sign in</button>
      </div>
    </section>`;
  bindActions(root, {
    send: async () => {
      const email = $('#lg-email', root).value.trim();
      if (!email) return;
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return toast(error.message);
      $('#lg-code', root).hidden = false;
      toast('Check your email: tap the link, or type the code here.');
    },
    verify: async () => {
      const email = $('#lg-email', root).value.trim();
      const token = $('#lg-otp', root).value.trim();
      const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) return toast(error.message);
      user = data.user;
      await loadMembership();
      location.reload();
    },
  });
}

function teamView(root) {
  root.innerHTML = `
    <header class="page-head"><h1>Welcome</h1><p class="muted">Signed in as ${esc(user.email)}</p></header>
    <section class="card form"><h3>I'm an athlete</h3>
      <label class="field-row"><span>Team code</span><input id="tm-code" maxlength="6" autocapitalize="characters"></label>
      <label class="field-row"><span>Your name</span><input id="tm-name" autocomplete="name"></label>
      <label class="field-row"><span>Group</span><input id="tm-group" placeholder="e.g. Pitchers (optional)"></label>
      <button class="btn wide" data-action="join">Join team</button></section>
    <section class="card form"><h3>I'm a coach</h3>
      <label class="field-row"><span>Team name</span><input id="tm-team"></label>
      <button class="btn ghost wide" data-action="create">Create a team</button></section>
    <button class="link" data-action="signout">Sign out</button>`;
  bindActions(root, {
    join: async () => {
      const { error } = await sb.rpc('join_team', { code: $('#tm-code', root).value, athlete_name: $('#tm-name', root).value.trim(), athlete_group: $('#tm-group', root).value.trim() });
      if (error) return toast(error.message);
      location.reload();
    },
    create: async () => {
      const name = $('#tm-team', root).value.trim();
      if (!name) return toast('Name your team');
      const { error } = await sb.rpc('create_team', { team_name: name });
      if (error) return toast(error.message);
      // Give the new team the starter exercise library.
      for (const e of store.SEED_EXERCISES) store.put('exercises', { ...e });
      await loadMembership();
      await push();
      location.reload();
    },
    signout,
  });
}

export async function signout() {
  if (sb) await sb.auth.signOut();
  store.clearAll();
  location.reload();
}
