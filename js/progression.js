// Week-by-week changes written in plain words, e.g. "Increase reps by 1 per
// week until reps = 15, then reset reps to 10 and increase weight by 10."
// parseProgression reads the text into rules; applyProgression plays them
// forward from week 1 and writes each later week's numbers into item.byWeek.
// A sentence can be aimed at some weeks ("weeks 2-3", "from week 5"), days
// ("on Upper", "day 2"), exercises ("for bench and squat") or supersets
// ("superset A"); everything else keeps the numbers it has.
// No DOM or storage here so it can be tested with plain Node.

import { measureOf, isCount, isDeload, fromUnit, weekOverride, prescribedSets, prescribedReps, prescribedRepsTo, prescribedSecs, prescribedPct } from './calc.js';

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20 };
const NUM = '(\\d+(?:\\.\\d+)?)';

const FIELD_RES = [
  ['reps', /\b(reps?|repetitions?|breaths?)\b/],
  ['sets', /\bsets?\b/],
  ['secs', /\b(sec(ond)?s?|time)\b/],
  ['weight', /\b(weights?|load|lbs?|pounds?|kgs?|kilos?)\b|%|\bpercent\b/],
];
const fieldOf = (s) => FIELD_RES.find(([, re]) => re.test(s))?.[0] || null;
const unitOf = (s) => (/%|\bpercent\b/.test(s) ? '%' : /\b(kgs?|kilos?)\b/.test(s) ? 'kg' : /\b(lbs?|pounds?)\b/.test(s) ? 'lb' : null);

function normalize(text) {
  return ` ${String(text).toLowerCase()} `
    .replace(/[’']/g, '')
    .replace(/(\d)\s*(lbs?|kgs?|%)/g, '$1 $2')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\b/g, (w) => WORDS[w])
    .replace(/\b(a|an)\s+(?=(more\s+|extra\s+)?(reps?|sets?|breaths?|sec|second|lb|pound|kg|kilo|percent))/g, '1 ')
    .replace(/=+|==/g, ' = ')
    .replace(/\s+/g, ' ');
}

// One change: "add 1 rep", "increase weight by 10", "reset reps to 10", "+5 lb".
function parseAction(piece, prevOp = null) {
  const s = ` ${piece.trim()} `;
  const n = s.match(new RegExp(`([+-])?\\s*${NUM}`));
  if (!n) return null;
  const field = fieldOf(s);
  const unit = unitOf(s);
  if (!field) return null;
  const value = Number(n[2]);
  const toN = new RegExp(`\\bto\\s+${NUM}`).test(s);
  const down = /\b(decrease|reduce|drop|lower|subtract|remove|take|minus|cut|less|fewer)\b/.test(s) || n[1] === '-';
  const up = /\b(increase|add|raise|bump|up|grow|more|plus|progress|increment|extra)\b/.test(s) || n[1] === '+';
  let op;
  if (toN || /\b(reset|change|back|return|put|make|use)\b/.test(s)) op = 'set';
  else if (down) op = '-';
  else if (up) op = '+';
  // "add 1 rep and 5 lb": the second part shares the first part's verb.
  else if (prevOp && prevOp !== 'set') op = prevOp;
  // A plain number ("3 sets") is the number to use.
  else op = 'set';
  return { field, op, value, ...(unit ? { unit } : {}) };
}

function parseActions(clause) {
  const pieces = clause.split(/,|\band\b|\balso\b|&/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  // "increase reps and sets by 1": a piece with a field but no number borrows the next number.
  for (let i = 0; i < pieces.length; i++) {
    let a = parseAction(pieces[i], out[out.length - 1]?.op);
    if (!a && fieldOf(pieces[i]) && !/\d/.test(pieces[i]) && pieces[i + 1]) {
      const next = parseAction(pieces[i + 1]);
      if (next) a = { ...next, field: fieldOf(pieces[i]) };
    }
    if (a) out.push(a);
    else if (/\d/.test(pieces[i]) || fieldOf(pieces[i])) return null;
  }
  return out.length ? out : null;
}

// "reps = 15", "15 reps", "reps hit 15", "weight reaches 200 lb".
function parseCondition(clause) {
  const field = fieldOf(clause);
  const n = clause.match(new RegExp(NUM));
  if (!field || !n) return null;
  return { field, value: Number(n[1]), ...(unitOf(clause) ? { unit: unitOf(clause) } : {}) };
}

function parseEvery(s) {
  if (/\bevery other week\b|\bbiweekly\b|\bevery second week\b/.test(s)) return 2;
  const m = s.match(/\bevery\s+(\d+|two|three|four|five|six)\s*(?:st|nd|rd|th)?\s+weeks?\b/);
  if (m) return Number(m[1]) || WORDS[m[1]];
  return 1;
}
const stripEvery = (s) => s.replace(/\b(every other week|biweekly|every second week|every\s+(\d+|two|three|four|five|six)\s*(st|nd|rd|th)?\s+weeks?|per week|each week|every week|weekly|a week|\/\s*(wk|week)|week to week|week over week|from week to week)\b/g, ' ');

// ---- which weeks, days and exercises a sentence is for ----

const WK = '(?:weeks?|wks?)';
const N = '(\\d+)';
const WEEK_RES = {
  range: new RegExp(`\\b(?:in |on |for |during |only )?${WK} ${N}\\s*(?:-|–|to|through|thru)\\s*(?:${WK} )?${N}\\b`),
  from: new RegExp(`\\b(from|starting|start|beginning|after)(?: (?:in|at|on|with|from))? ${WK} ${N}(?: on(?:wards?)?| onwards?)?\\b`),
  on: new RegExp(`\\b(?:in |on |for |from )?${WK} ${N}(?: (?:on(?:wards?)?|onwards?|and (?:up|after|beyond|later|on))\\b|\\s*\\+)`),
  until: new RegExp(`\\b(until|till|through|thru|up to|to|before|by) ${WK} ${N}\\b`),
  list: new RegExp(`\\b(?:in |on |for |during |only )?${WK} ${N}((?:\\s*(?:,|and|&)\\s*${N})*)\\b`),
};

// Pulls the week part out of a sentence. Weeks are 1-based here, as the
// coach writes them. Returns { weeks: {from, to} | {list}, rest } or {rest}.
function takeWeeks(s) {
  let m = s.match(WEEK_RES.range);
  if (m) return { weeks: { from: Math.min(+m[1], +m[2]), to: Math.max(+m[1], +m[2]) }, rest: s.replace(m[0], ' ') };
  let from = null, to = null, rest = s;
  m = rest.match(WEEK_RES.from);
  if (m) { from = +m[2] + (m[1] === 'after' ? 1 : 0); rest = rest.replace(m[0], ' '); }
  else if ((m = rest.match(WEEK_RES.on))) { from = +m[1]; rest = rest.replace(m[0], ' '); }
  m = rest.match(WEEK_RES.until);
  if (m) { to = +m[2] - (m[1] === 'before' ? 1 : 0); rest = rest.replace(m[0], ' '); }
  if (from != null || to != null) return { weeks: { from: from ?? 2, to: to ?? Infinity }, rest };
  m = rest.match(WEEK_RES.list);
  if (m) return { weeks: { list: [+m[1], ...(m[2].match(/\d+/g) || []).map(Number)] }, rest: rest.replace(m[0], ' ') };
  return { rest };
}

export const inWeeks = (weeks, wk) => !weeks || (weeks.list ? weeks.list.includes(wk) : wk >= weeks.from && wk <= weeks.to);

// What the coach can name in a sentence: days, exercises and supersets of the block.
function namesIn(block, exercises) {
  if (!block) return null;
  const items = [];
  block.days.forEach((d, di) => d.items.forEach((it, ii) => {
    if (it.warmup) return;
    const shown = exercises?.[it.exerciseId]?.name || it.exerciseId;
    const name = shown.toLowerCase();
    items.push({ di, ii, name, shown, words: name.replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter(Boolean), group: (it.group || '').toLowerCase() });
  }));
  return { items, days: block.days.map((d) => (d.name || '').toLowerCase().trim()), dayNames: block.days.map((d, di) => d.name || `Day ${di + 1}`), groups: new Set(items.map((x) => x.group).filter(Boolean)) };
}

const STOP = new Set(['the', 'all', 'my', 'of', 'just', 'only']);
// One named thing: "day 2", "upper", "superset a", "bench", "squats".
function matchName(frag, ctx) {
  const f = frag.trim().replace(/^(the|all|my|just|only)\s+/, '').trim();
  if (!f || /^\d/.test(f) || fieldOf(` ${f} `) && !ctx.items.some((x) => x.name === f)) return null;
  let m = f.match(/^day (\d+)$/);
  if (m) return +m[1] >= 1 && +m[1] <= ctx.days.length ? { days: [+m[1] - 1], label: ctx.dayNames[+m[1] - 1] } : null;
  m = f.match(/^(?:superset|group) ([a-z])$|^([a-z]) (?:superset|group)$/);
  if (m) { const g = m[1] || m[2]; return ctx.groups.has(g) ? { groups: [g], label: `superset ${g.toUpperCase()}` } : null; }
  const di = ctx.days.indexOf(f);
  if (di >= 0 && f.length >= 3) return { days: [di], label: ctx.dayNames[di] };
  const words = f.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  if (!words.length) return null;
  const has = (x, w) => x.words.some((n) => n.startsWith(w) || (w.length > 2 && w.endsWith('s') && n.startsWith(w.slice(0, -1))));
  const hits = ctx.items.filter((x) => x.name === f || words.every((w) => has(x, w)));
  return hits.length ? { items: hits.map((x) => `${x.di}:${x.ii}`), label: [...new Set(hits.map((x) => x.shown))].join(', ') } : null;
}

// A list of names ("bench and squat", "upper, legs 2"); all of them must be known.
function matchList(text, ctx) {
  const parts = text.split(/,|&|\band\b|\+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = { days: [], items: [], groups: [], labels: [] };
  for (const p of parts) {
    const m = matchName(p, ctx);
    if (!m) return null;
    out.days.push(...(m.days || [])); out.items.push(...(m.items || [])); out.groups.push(...(m.groups || [])); out.labels.push(...m.label.split(', '));
  }
  return out;
}

const MARK = /\b(for|to|on|only on|only for|only|just on|just for|just|with)\s+([a-z][a-z0-9\s\-&,+]*?)(?=\s*(?:[,:;]|$|\b(?:from|in|starting|until|till|up|then|by|every|each|per|weekly|add|increase|decrease|drop|reduce|reset|change|raise|lower|bump|to|on|for|only|just|with|when|week|weeks|wk)\b|\d))/g;

// Pulls the days, exercises and supersets out of a sentence.
function takeTargets(s, ctx) {
  const t = { days: [], items: [], groups: [], labels: [] };
  if (!ctx) return { rest: s };
  const add = (m) => { for (const k of ['days', 'items', 'groups', 'labels']) t[k].push(...m[k]); };
  let rest = s;
  // "Bench and squat: add 5 lb"
  const lead = rest.match(/^\s*([^:]+):/);
  if (lead) { const m = matchList(lead[1], ctx); if (m) { add(m); rest = rest.slice(lead[0].length); } }
  // Day names as written ("legs 2", "full body tu").
  ctx.days.forEach((name, di) => {
    if (name.length < 3) return;
    const re = new RegExp(`(?:\\b(?:on|for|in|only on|just on)\\s+)?\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`);
    if (re.test(rest)) { add({ days: [di], items: [], groups: [], labels: [ctx.dayNames[di]] }); rest = rest.replace(re, ' '); }
  });
  // "for bench and squat", "on upper", "to superset a"
  const marked = () => { rest = rest.replace(MARK, (all, _mk, list) => { const m = matchList(list, ctx); if (!m) return all; add(m); return ' '; }); };
  marked();
  // Whole exercise names as written, longest first, wherever they are.
  for (const x of [...ctx.items].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`(?:\\b(?:for|to|on|only|just|with)\\s+(?:the\\s+)?)?\\b${x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:e?s)?(?![a-z0-9])`);
    if (x.name.length >= 4 && re.test(rest)) {
      const same = ctx.items.filter((y) => y.name === x.name).map((y) => `${y.di}:${y.ii}`);
      add({ items: same, days: [], groups: [], labels: [x.shown] });
      rest = rest.replace(re, ' ');
    }
  }
  marked();
  rest = rest.replace(/\b(?:on |for |in )?day (\d+)\b/g, (all, n) => { const m = matchName(`day ${n}`, ctx); if (!m) return all; add({ days: m.days, items: [], groups: [], labels: [m.label] }); return ' '; });
  rest = rest.replace(/\b(?:on |for |in |to )?(?:superset|group) ([a-z])\b/g, (all, g) => { const m = matchName(`superset ${g}`, ctx); if (!m) return all; add({ days: [], items: [], groups: m.groups, labels: [m.label] }); return ' '; });
  const any = t.days.length || t.items.length || t.groups.length;
  const unknown = rest.match(/\b(?:superset|group) [a-z]\b|\bday \d+\b/);
  return { rest, ...(unknown ? { unknown: unknown[0] } : {}), ...(any ? { targets: { days: [...new Set(t.days)], items: [...new Set(t.items)], groups: [...new Set(t.groups)], labels: [...new Set(t.labels)] } } : {}) };
}

// Whether a rule is meant for this item (day di, position ii).
export function ruleFor(rule, di, ii, item) {
  const t = rule.targets;
  if (!t) return true;
  if (t.days.length && !t.days.includes(di)) return false;
  if (!t.items.length && !t.groups.length) return true;
  return t.items.includes(`${di}:${ii}`) || t.groups.includes((item.group || '').toLowerCase());
}

// Returns { rules, error }. Each rule: { every, actions, until?, then?, weeks?,
// targets? }. Pass the block (and the exercise library, for names) so the
// words can name days, exercises and supersets.
export function parseProgression(text, block = null, exercises = null) {
  const ctx = namesIn(block, exercises);
  const rules = [];
  const sentences = normalize(text).split(/\.(?!\d)|;|\n|!/).map((x) => x.trim()).filter(Boolean);
  if (!sentences.length) return { rules, error: 'Write what should change, e.g. "Add 1 rep per week".' };
  for (const raw of sentences) {
    const s = ` ${raw} `;
    // "Continue this same progression" and the like: rules already repeat.
    if (!/\d/.test(s) && /\b(continue|repeat|keep|same|again|cycle|loop)\b/.test(s)) continue;
    const every = parseEvery(s);
    const w = takeWeeks(stripEvery(s));
    const tg = takeTargets(w.rest, ctx);
    if (tg.unknown) return { rules, error: `This program has no ${tg.unknown.replace(/ ([a-z])$/, (_, g) => ` ${g.toUpperCase()}`)}.` };
    const body = tg.rest.replace(/^[\s,:]+/, ' ');
    const scope = { ...(w.weeks ? { weeks: w.weeks } : {}), ...(tg.targets ? { targets: tg.targets } : {}) };
    if (w.weeks && (w.weeks.list ? w.weeks.list.every((x) => x < 2) : w.weeks.to < 2)) return { rules, error: 'Week 1 is the starting point. Change its numbers in the editor; this box changes weeks 2 and on.' };
    // "When reps hit 15, reset reps to 10 and add 10 lb": finishes the rule before it.
    const when = body.match(/^\s*(?:when|once|if|after|whenever)\b(.+?)(?:,|\bthen\b)(.+)$/);
    if (when && rules.length) {
      const until = parseCondition(when[1]);
      const then = parseActions(when[2]);
      if (!until || !then) return { rules, error: `I couldn't read "${raw.trim()}".` };
      Object.assign(rules[rules.length - 1], { until, then });
      continue;
    }
    const [mainUntil, ...rest] = body.split(/\bthen\b/);
    const [main, cond] = mainUntil.split(/\b(?:until|till|up to|as long as|while)\b/);
    const actions = parseActions(main);
    if (!actions) return { rules, error: `I couldn't read "${raw.trim()}". Try "Add 1 rep per week" or "Increase weight by 5 lb every 2 weeks".` };
    const rule = { every, actions, ...scope };
    if (cond) {
      rule.until = parseCondition(cond);
      if (!rule.until) return { rules, error: `I couldn't tell when to stop in "${raw.trim()}". Try "until reps = 15".` };
    }
    if (rest.length) {
      rule.then = parseActions(rest.join(' and '));
      if (!rule.then) return { rules, error: `I couldn't read what happens after "then" in "${raw.trim()}".` };
      if (!rule.until) return { rules, error: `"Then" needs an "until" first, e.g. "until reps = 15 then reset reps to 10".` };
    }
    rules.push(rule);
  }
  if (!rules.length) return { rules, error: 'Write what should change, e.g. "Add 1 rep per week".' };
  return { rules, error: null };
}

// ---- plain-language read-back, so the coach can check what was understood ----

const NAMES = { reps: 'reps', sets: 'sets', secs: 'seconds', weight: 'weight' };
function actionText(a, reset = false) {
  const u = a.field === 'weight' ? (a.unit === '%' ? '%' : a.unit ? ` ${a.unit}` : '') : '';
  if (a.op === 'set') return `${NAMES[a.field]} ${reset ? 'back to' : 'at'} ${a.value}${u}`;
  const own = a.field === 'weight' && !a.unit ? ' (in each exercise\'s lb or kg)' : '';
  return `${NAMES[a.field]} ${a.op === '+' ? '+' : '−'}${a.value}${u}${own}`;
}
function weeksText(w) {
  if (!w) return '';
  if (w.list) return w.list.length > 1 ? `weeks ${w.list.join(', ')}` : `week ${w.list[0]}`;
  if (w.to === Infinity) return `from week ${w.from}`;
  if (w.from <= 2 && w.from !== w.to) return `weeks 2–${w.to}`;
  return w.from === w.to ? `week ${w.from}` : `weeks ${w.from}–${w.to}`;
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export function describeRules(rules) {
  return rules.map((r) => {
    const steps = r.actions.some((a) => a.op !== 'set');
    const head = [weeksText(r.weeks), r.targets ? `only ${r.targets.labels.join(', ')}` : '',
      steps && !r.weeks?.list ? (r.every === 1 ? 'each week' : `every ${r.every} weeks`) : ''].filter(Boolean).join(', ') || 'every week';
    let t = `${cap(head)}: ${r.actions.map((a) => actionText(a)).join(', ')}`;
    if (r.until && r.then) t += `, until ${NAMES[r.until.field]} = ${r.until.value}. When the next step would go past that: ${r.then.map((a) => actionText(a, true)).join(', ')}, then keep going`;
    else if (r.until) t += `, stopping at ${NAMES[r.until.field]} = ${r.until.value}`;
    return `${t}.`;
  });
}

// ---- playing the rules forward ----

// Which number on this item a field means, or null when it doesn't fit
// (reps on a timed hold, pounds on a % of max lift, weight on no load).
function slot(item, field, unit) {
  const m = measureOf(item);
  if (m === 'none') return null;
  if (field === 'reps') return isCount(m) ? 'reps' : null;
  if (field === 'secs') return m === 'time' ? 'secs' : null;
  if (field === 'sets') return 'sets';
  if (m === 'breaths') return null;
  if (item.pct != null) return unit === '%' ? 'pct' : null;
  if (item.weight != null) return 'weight';
  return null;
}

function applyOne(state, a, item, k) {
  let v;
  if (k === 'weight') {
    if (a.unit === '%') v = a.op === 'set' ? null : state.weight * (1 + (a.op === '+' ? a.value : -a.value) / 100);
    else {
      const lb = fromUnit(a.value, a.unit || item.unit || 'lb');
      v = a.op === 'set' ? lb : state.weight + (a.op === '+' ? lb : -lb);
    }
    if (v == null) return;
  } else {
    v = a.op === 'set' ? a.value : state[k] + (a.op === '+' ? a.value : -a.value);
  }
  state[k] = Math.max(k === 'sets' ? 1 : 0, v);
}

// An item's numbers for one week as the program has them now (its own week
// numbers, weekly rule and deload included). Weight stays unrounded.
function baseWeek(item, b, w) {
  const prog = item.progression || {};
  let weight = weekOverride(item, w, 'weight');
  if (weight == null) {
    weight = (item.weight ?? 0) + (prog.type === 'add_weight' ? (prog.step || 0) * w : 0);
    if (isDeload(b, w)) weight *= 0.9;
  }
  return { sets: prescribedSets(item, b, w), reps: prescribedReps(item, w), repsTo: prescribedRepsTo(item, w), secs: prescribedSecs(item, w), weight, pct: prescribedPct(item, w, b) ?? 0 };
}

// Plays the rules over one item. Returns { fields, weeks: [{vals, own}] } for
// weeks 2..N, or null when no rule fits the item. A number is "owned" from
// the first week a rule covering it starts; owned numbers carry on from week
// to week, the rest stay as the program has them. A rule that only sets
// numbers ("weeks 2-3: 2 sets") lets go of them after its weeks.
export function playItem(item, block, rules) {
  const fits = rules.map((r) => {
    const actions = r.actions.map((a) => ({ a, k: slot(item, a.field, a.unit) })).filter((x) => x.k);
    if (!actions.length) return null;
    const until = r.until && { ...r.until, k: slot(item, r.until.field, r.until.unit) };
    if (until && !until.k) return null;
    const then = (r.then || []).map((a) => ({ a, k: slot(item, a.field, a.unit) })).filter((x) => x.k);
    // Named weeks ("week 6", "weeks 3 and 5") are one-offs: each is changed
    // from what it had, and the weeks after go back to the program.
    const oneOff = Boolean(r.weeks?.list);
    const setOnly = oneOff || (actions.every((x) => x.a.op === 'set') && !then.length);
    return { every: r.every, actions, until, then: r.then ? then : null, weeks: r.weeks, setOnly, oneOff, n: 0 };
  }).filter(Boolean);
  if (!fits.length) return null;
  const fields = [...new Set(fits.flatMap((r) => [...r.actions, ...(r.then || [])].map((x) => x.k)))];
  const base = Array.from({ length: block.weeks }, (_, w) => baseWeek(item, block, w));
  let state = { ...base[0] };
  let prev = base[0];
  const owner = new Map();
  const weeks = [];
  for (let w = 1; w < block.weeks; w++) {
    const wk = w + 1;
    const active = fits.filter((r) => inWeeks(r.weeks, wk));
    // Set-only rules let go of their numbers once their weeks are over.
    for (const [k, r] of owner) if (r.setOnly && !active.includes(r)) owner.delete(k);
    // Numbers no rule owns follow the program as it is.
    for (const k of Object.keys(state)) if (!owner.has(k)) state[k] = prev[k];
    for (const r of active) for (const { k } of [...r.actions, ...(r.then || [])]) if (!owner.has(k) || r.setOnly) owner.set(k, r);
    const deload = isDeload(block, w);
    if (!deload) {
      for (const r of active) {
        r.n += 1;
        if (!r.setOnly && r.n % r.every) continue;
        const next = { ...state };
        if (r.oneOff) for (const { k } of r.actions) next[k] = base[w][k];
        for (const { a, k } of r.actions) applyOne(next, a, item, k);
        if (r.until) {
          const k = r.until.k;
          const lim = k === 'weight' && r.until.unit !== '%' ? fromUnit(r.until.value, r.until.unit || item.unit || 'lb') : r.until.value;
          const dir = r.actions.find((x) => x.k === k)?.a.op;
          const past = dir === '-' ? next[k] < lim : dir === '+' ? next[k] > lim : state[k] >= lim;
          if (past) {
            if (r.then) { const t = { ...state }; for (const { a, k: tk } of r.then) applyOne(t, a, item, tk); state = t; } else { next[k] = lim; state = next; }
            continue;
          }
        }
        state = next;
      }
      prev = base[w];
    }
    // The deload week takes this week's numbers, halved and lighter, and the progression waits a week.
    const vals = { ...base[w] };
    for (const k of owner.keys()) {
      vals[k] = state[k];
      if (deload) vals[k] = { sets: Math.max(1, Math.ceil(state.sets / 2)), weight: state.weight * 0.9, pct: Math.round(state.pct * 0.9 * 2) / 2 }[k] ?? state[k];
    }
    vals.pct = Math.round(vals.pct * 2) / 2;
    weeks.push({ vals, own: new Set(owner.keys()), base: base[w] });
  }
  return { fields, weeks };
}

// Writes the rules into a copy of the block. `days` limits it to some days
// (indexes); warmups are left alone. An item's own "each week" rule for a
// number the words now cover is dropped, since the words replace it; the
// weeks the words don't reach keep the numbers that rule gave them.
// Returns { block, changed: [{di, ii}], skipped: [{di, ii}], replaced: [{di, ii}] }.
const RULE_FIELD = { add_reps: 'reps', add_secs: 'secs', add_weight: 'weight', add_pct: 'pct' };
export function applyProgression(block, rules, days = null) {
  const b = structuredClone(block);
  const changed = [], skipped = [], replaced = [];
  b.days.forEach((d, di) => {
    if (days && !days.includes(di)) return;
    d.items.forEach((item, ii) => {
      if (item.warmup) return;
      const mine = rules.filter((r) => ruleFor(r, di, ii, item));
      if (!mine.length) return;
      const r = playItem(item, b, mine);
      if (!r) { skipped.push({ di, ii }); return; }
      const ruleField = RULE_FIELD[item.progression?.type];
      const replacing = r.fields.includes(ruleField);
      const width = item.repsTo > item.reps ? item.repsTo - item.reps : 0;
      const byWeek = item.byWeek || {};
      r.weeks.forEach(({ vals, own, base }, i) => {
        const w = i + 1;
        const wk = { ...byWeek[w] };
        for (const k of r.fields) {
          if (!own.has(k) && !(replacing && k === ruleField)) continue;
          wk[k] = k === 'weight' ? Math.round(vals.weight * 100) / 100 : vals[k];
          // A rep range moves as a whole: "+1 rep" on 10-15 gives 11-16.
          if (k === 'reps') {
            delete wk.repsTo;
            const top = own.has('reps') ? (width ? vals.reps + width : null) : base.repsTo;
            if (top != null) wk.repsTo = top;
          }
        }
        if (Object.keys(wk).length) byWeek[w] = wk;
      });
      if (Object.keys(byWeek).length) item.byWeek = byWeek;
      if (replacing) { delete item.progression; replaced.push({ di, ii }); }
      changed.push({ di, ii });
    });
  });
  return { block: b, changed, skipped, replaced };
}

// Removes every week-only number in the chosen days (week 1 stays as it is).
export function clearWeeks(block, days = null) {
  const b = structuredClone(block);
  b.days.forEach((d, di) => { if (!days || days.includes(di)) d.items.forEach((it) => { if (!it.warmup) delete it.byWeek; }); });
  return b;
}
