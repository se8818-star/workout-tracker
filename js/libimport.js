// Adding the exercise video library (js/library.js) to a team's own library.
// Matches by name, loosely ("DB" = "Dumbbell", "1-arm" = "Single-arm",
// plurals, punctuation), so nothing is added twice: exercises the team already
// has just get the video if they don't have one yet. Running it again is safe.

const SAME = { db: 'dumbbell', dbs: 'dumbbell', kb: 'kettlebell', kbs: 'kettlebell', bb: 'barbell', w: 'with', single: '1', one: '1', pushup: 'push up', pullup: 'pull up', chinup: 'chin up', situp: 'sit up', stepup: 'step up', '&': 'and' };

export function nameKey(name) {
  return String(name || '').toLowerCase()
    .replace(/w\//g, ' with ').replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map((t) => SAME[t] ?? t)
    .join(' ').split(' ')
    .map((t) => (t.length > 2 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .filter((t) => t !== 'with' && t !== 'the' && t !== 'a')
    .join(' ');
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// { add: [new exercises], update: [existing exercises with the video filled in] }
export function planLibraryImport(existing, library) {
  const byKey = new Map();
  for (const x of existing) if (!byKey.has(nameKey(x.name))) byKey.set(nameKey(x.name), x);
  const ids = new Set(existing.map((x) => x.id));
  const add = [], update = new Map();
  for (const e of library) {
    const key = nameKey(e.n);
    const have = byKey.get(key);
    if (have) {
      // Removed exercises stay removed; a video the coach already set stays.
      if (!have.hidden && !have.video && !update.has(have.id)) {
        update.set(have.id, { ...have, video: e.v, ...(e.pw ? { videoPassword: e.pw } : {}) });
      }
      continue;
    }
    let id = `vid-${slug(e.n)}`;
    for (let i = 2; ids.has(id); i++) id = `vid-${slug(e.n)}-${i}`;
    ids.add(id);
    const x = { id, name: e.n, pattern: e.p || 'other', body: e.b || 'full', loaded: Boolean(e.w), alts: [], video: e.v };
    if (e.pw) x.videoPassword = e.pw;
    if (e.m) x.measure = e.m;
    add.push(x);
    byKey.set(key, x);
  }
  return { add, update: [...update.values()] };
}
