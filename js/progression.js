// Week-by-week changes written in plain words, e.g. "Increase reps by 1 per
// week until reps = 15, then reset reps to 10 and increase weight by 10."
// parseProgression reads the text into rules; applyProgression plays them
// forward from week 1 and writes each later week's numbers into item.byWeek.
// No DOM or storage here so it can be tested with plain Node.

import { measureOf, isCount, isDeload, fromUnit } from './calc.js';

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
  if (toN || /\b(reset|change|back|return|put)\b/.test(s)) op = 'set';
  else if (down) op = '-';
  else if (up) op = '+';
  // "add 1 rep and 5 lb": the second part shares the first part's verb.
  else if (prevOp && prevOp !== 'set') op = prevOp;
  else return null;
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

// Returns { rules, error }. Each rule: { every, actions, until?, then? }.
export function parseProgression(text) {
  const rules = [];
  const sentences = normalize(text).split(/\.(?!\d)|;|\n|!/).map((x) => x.trim()).filter(Boolean);
  if (!sentences.length) return { rules, error: 'Write what should change, e.g. "Add 1 rep per week".' };
  for (const raw of sentences) {
    const s = ` ${raw} `;
    // "Continue this same progression" and the like: rules already repeat.
    if (!/\d/.test(s) && /\b(continue|repeat|keep|same|again|cycle|loop)\b/.test(s)) continue;
    const every = parseEvery(s);
    const body = stripEvery(s);
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
    const rule = { every, actions };
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
function actionText(a) {
  const u = a.field === 'weight' ? (a.unit === '%' ? '%' : a.unit ? ` ${a.unit}` : '') : '';
  if (a.op === 'set') return `${NAMES[a.field]} back to ${a.value}${u}`;
  const own = a.field === 'weight' && !a.unit ? ' (in each exercise\'s lb or kg)' : '';
  return `${NAMES[a.field]} ${a.op === '+' ? '+' : '−'}${a.value}${u}${own}`;
}
export function describeRules(rules) {
  return rules.map((r) => {
    let t = `${r.every === 1 ? 'Each week' : `Every ${r.every} weeks`}: ${r.actions.map(actionText).join(', ')}`;
    if (r.until && r.then) t += `, until ${NAMES[r.until.field]} = ${r.until.value}. When the next step would go past that: ${r.then.map(actionText).join(', ')}, then keep going`;
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

// Plays the rules over one item. Returns { fields, weeks: [{reps, ...}] } for
// weeks 2..N, or null when no rule fits the item.
export function playItem(item, block, rules) {
  const fits = rules.map((r) => {
    const actions = r.actions.map((a) => ({ a, k: slot(item, a.field, a.unit) })).filter((x) => x.k);
    if (!actions.length) return null;
    const until = r.until && { ...r.until, k: slot(item, r.until.field, r.until.unit) };
    if (until && !until.k) return null;
    const then = (r.then || []).map((a) => ({ a, k: slot(item, a.field, a.unit) })).filter((x) => x.k);
    return { every: r.every, actions, until, then: r.then ? then : null };
  }).filter(Boolean);
  if (!fits.length) return null;
  const fields = [...new Set(fits.flatMap((r) => [...r.actions, ...(r.then || [])].map((x) => x.k)))];
  let state = { sets: item.sets || 1, reps: item.reps || 0, secs: item.secs || 0, weight: item.weight ?? 0, pct: item.pct ?? 0 };
  const weeks = [];
  let step = 0;
  for (let w = 1; w < block.weeks; w++) {
    if (isDeload(block, w)) {
      // The deload week takes this week's numbers, halved and lighter, and the progression waits a week.
      weeks.push({ ...state, sets: Math.max(1, Math.ceil(state.sets / 2)), weight: state.weight * 0.9, pct: Math.round(state.pct * 0.9 * 2) / 2 });
      continue;
    }
    step += 1;
    for (const r of fits) {
      if (step % r.every) continue;
      const next = { ...state };
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
    weeks.push({ ...state, pct: Math.round(state.pct * 2) / 2 });
  }
  return { fields, weeks };
}

// Writes the rules into a copy of the block. `days` limits it to some days
// (indexes); warmups are left alone. An item's own "each week" rule for a
// number the words now cover is dropped, since the words replace it.
// Returns { block, changed: [{di, ii}], skipped: [{di, ii}], replaced: [{di, ii}] }.
const RULE_FIELD = { add_reps: 'reps', add_secs: 'secs', add_weight: 'weight', add_pct: 'pct' };
export function applyProgression(block, rules, days = null) {
  const b = structuredClone(block);
  const changed = [], skipped = [], replaced = [];
  b.days.forEach((d, di) => {
    if (days && !days.includes(di)) return;
    d.items.forEach((item, ii) => {
      if (item.warmup) return;
      const r = playItem(item, b, rules);
      if (!r) { skipped.push({ di, ii }); return; }
      const byWeek = item.byWeek || {};
      r.weeks.forEach((st, i) => {
        const w = i + 1;
        byWeek[w] = { ...byWeek[w] };
        for (const k of r.fields) byWeek[w][k] = k === 'weight' ? Math.round(st.weight * 100) / 100 : st[k];
        // A rep range moves as a whole: "+1 rep" on 10-15 gives 11-16.
        if (r.fields.includes('reps')) {
          delete byWeek[w].repsTo;
          if (item.repsTo > item.reps) byWeek[w].repsTo = st.reps + (item.repsTo - item.reps);
        }
      });
      item.byWeek = byWeek;
      if (r.fields.includes(RULE_FIELD[item.progression?.type])) { delete item.progression; replaced.push({ di, ii }); }
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
