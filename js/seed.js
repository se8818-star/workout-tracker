// Starter exercise library and demo data. Coaches can add their own exercises.
// contactsPerRep: ground contacts per rep for plyos (a bound "rep" of 10 bounds = 10).
// plyoTier: 1 (low) to 6 (shock); see PLYO_TIERS in calc.js.
// alts: exercise ids that train the same pattern, offered as swaps.

const E = (id, name, pattern, body, extra = {}) => ({ id, name, pattern, body, loaded: true, alts: [], ...extra });
const P = (id, name, tier, contactsPerRep = 1, extra = {}) =>
  ({ id, name, pattern: 'plyo', body: 'lower', loaded: false, contactsPerRep, plyoTier: tier, alts: [], ...extra });

export const SEED_EXERCISES = [
  E('back-squat', 'Back squat', 'squat', 'lower', { alts: ['front-squat', 'trap-bar-deadlift', 'goblet-squat', 'safety-bar-squat'] }),
  E('front-squat', 'Front squat', 'squat', 'lower', { alts: ['back-squat', 'safety-bar-squat', 'goblet-squat'] }),
  E('safety-bar-squat', 'Safety bar squat', 'squat', 'lower', { alts: ['back-squat', 'front-squat'] }),
  E('goblet-squat', 'Goblet squat', 'squat', 'lower', { alts: ['front-squat', 'split-squat'] }),
  E('split-squat', 'Rear-foot elevated split squat', 'squat', 'lower', { alts: ['reverse-lunge', 'goblet-squat'] }),
  E('reverse-lunge', 'Reverse lunge', 'squat', 'lower', { alts: ['split-squat'] }),
  E('trap-bar-deadlift', 'Trap bar deadlift', 'hinge', 'lower', { alts: ['deadlift', 'back-squat', 'rdl'] }),
  E('deadlift', 'Deadlift', 'hinge', 'lower', { alts: ['trap-bar-deadlift', 'rdl'] }),
  E('rdl', 'Romanian deadlift', 'hinge', 'lower', { alts: ['db-rdl', 'single-leg-rdl', 'hip-thrust'] }),
  E('db-rdl', 'Dumbbell RDL', 'hinge', 'lower', { alts: ['rdl', 'single-leg-rdl'] }),
  E('single-leg-rdl', 'Single-leg RDL', 'hinge', 'lower', { alts: ['db-rdl', 'rdl'] }),
  E('hip-thrust', 'Hip thrust', 'hinge', 'lower', { alts: ['rdl', 'glute-bridge'] }),
  E('glute-bridge', 'Glute bridge', 'hinge', 'lower', { loaded: false, alts: ['hip-thrust'] }),
  E('nordic', 'Nordic hamstring curl', 'hinge', 'lower', { loaded: false, alts: ['rdl'] }),
  E('bench', 'Bench press', 'push', 'upper', { alts: ['db-bench', 'landmine-press', 'push-up'] }),
  E('db-bench', 'Dumbbell bench press', 'push', 'upper', { alts: ['bench', 'push-up'] }),
  E('landmine-press', 'Landmine press', 'push', 'upper', { alts: ['db-bench', 'half-kneel-db-press'] }),
  E('half-kneel-db-press', 'Half-kneeling DB press', 'push', 'upper', { alts: ['landmine-press'] }),
  E('push-up', 'Push-up', 'push', 'upper', { loaded: false, alts: ['db-bench'] }),
  E('pull-up', 'Pull-up', 'pull', 'upper', { loaded: false, alts: ['lat-pulldown', 'db-row'] }),
  E('lat-pulldown', 'Lat pulldown', 'pull', 'upper', { alts: ['pull-up'] }),
  E('db-row', 'Dumbbell row', 'pull', 'upper', { alts: ['cable-row', 'inverted-row'] }),
  E('cable-row', 'Seated cable row', 'pull', 'upper', { alts: ['db-row', 'inverted-row'] }),
  E('inverted-row', 'Inverted row', 'pull', 'upper', { loaded: false, alts: ['db-row'] }),
  E('face-pull', 'Face pull', 'pull', 'upper', { alts: ['band-pull-apart'] }),
  E('band-pull-apart', 'Band pull-apart', 'pull', 'upper', { loaded: false, alts: ['face-pull'] }),
  E('farmer-carry', 'Farmer carry', 'carry', 'full', { alts: ['suitcase-carry'] }),
  E('suitcase-carry', 'Suitcase carry', 'carry', 'full', { alts: ['farmer-carry'] }),
  E('pallof', 'Pallof press', 'core', 'full', { loaded: false, alts: ['dead-bug'] }),
  E('dead-bug', 'Dead bug', 'core', 'full', { loaded: false, alts: ['pallof'] }),
  E('med-ball-rot', 'Med ball rotational throw', 'core', 'full', { loaded: false, alts: ['med-ball-scoop'] }),
  E('med-ball-scoop', 'Med ball scoop toss', 'core', 'full', { loaded: false, alts: ['med-ball-rot'] }),
  P('pogo', 'Pogo hops (x10)', 1, 10, { alts: ['line-hop'] }),
  P('line-hop', 'Line hops (x10)', 1, 10, { alts: ['pogo'] }),
  P('squat-jump', 'Squat jump', 1, 1, { alts: ['cmj'] }),
  P('cmj', 'Countermovement jump', 2, 1, { alts: ['squat-jump', 'broad-jump'] }),
  P('broad-jump', 'Broad jump', 2, 1, { alts: ['cmj'] }),
  P('lateral-bound', 'Lateral bound (each side)', 3, 2, { alts: ['skater-hop'] }),
  P('skater-hop', 'Skater hop (each side)', 3, 2, { alts: ['lateral-bound'] }),
  P('hurdle-hop', 'Hurdle hops (x5)', 3, 5, { alts: ['pogo'] }),
  P('bounds', 'Alternate-leg bounds (x10)', 3, 10, { alts: ['skater-hop'] }),
  P('box-jump', 'Box jump', 4, 1, { alts: ['cmj', 'broad-jump'] }),
  P('depth-jump', 'Depth jump', 5, 1, { alts: ['box-jump', 'hurdle-hop'] }),
  P('drop-landing', 'Drop landing (high box)', 6, 1, { alts: ['depth-jump'] }),
  { id: 'sprint-10', name: 'Sprint 10 m', pattern: 'sprint', body: 'lower', loaded: false, metersPerRep: 10, alts: ['sprint-20'] },
  { id: 'sprint-20', name: 'Sprint 20 m', pattern: 'sprint', body: 'lower', loaded: false, metersPerRep: 20, alts: ['sprint-10'] },
  { id: 'sprint-30', name: 'Sprint 30 m', pattern: 'sprint', body: 'lower', loaded: false, metersPerRep: 30, alts: ['sprint-20'] },
  { id: 'long-toss', name: 'Long toss (throws)', pattern: 'throw', body: 'upper', loaded: false, alts: ['flat-ground'] },
  { id: 'flat-ground', name: 'Flat ground (throws)', pattern: 'throw', body: 'upper', loaded: false, alts: ['long-toss'] },
  { id: 'bullpen', name: 'Bullpen (pitches)', pattern: 'throw', body: 'upper', loaded: false, alts: ['flat-ground'] },
];

// A 4-week strength block used for the demo team.
export const SEED_BLOCK = {
  id: 'block-demo',
  name: 'Off-season strength, 4 weeks',
  weeks: 4,
  deloadWeek: 3,
  days: [
    {
      name: 'Day 1: Lower',
      items: [
        { exerciseId: 'pogo', sets: 3, reps: 1, note: 'Stiff ankles, quick off the ground' },
        { exerciseId: 'box-jump', sets: 3, reps: 4 },
        { exerciseId: 'back-squat', sets: 4, reps: 5, pct: 75, progression: { type: 'add_pct', step: 2.5 } },
        { exerciseId: 'rdl', sets: 3, reps: 8, pct: 60, maxFrom: 'deadlift' },
        { exerciseId: 'split-squat', sets: 3, reps: 8, weight: 40, progression: { type: 'add_weight', step: 5 }, note: 'DBs per hand' },
        { exerciseId: 'pallof', sets: 3, reps: 10 },
      ],
    },
    {
      name: 'Day 2: Upper',
      items: [
        { exerciseId: 'med-ball-rot', sets: 3, reps: 5 },
        { exerciseId: 'bench', sets: 4, reps: 5, pct: 75, progression: { type: 'add_pct', step: 2.5 } },
        { exerciseId: 'db-row', sets: 4, reps: 10, weight: 60, progression: { type: 'add_weight', step: 5 } },
        { exerciseId: 'half-kneel-db-press', sets: 3, reps: 8, weight: 35 },
        { exerciseId: 'pull-up', sets: 3, reps: 6, progression: { type: 'add_reps', step: 1 } },
        { exerciseId: 'face-pull', sets: 3, reps: 15, weight: 30 },
      ],
    },
    {
      name: 'Day 3: Power',
      items: [
        { exerciseId: 'sprint-10', sets: 6, reps: 1 },
        { exerciseId: 'lateral-bound', sets: 3, reps: 4 },
        { exerciseId: 'depth-jump', sets: 3, reps: 3, note: '12 inch box, stick nothing, bounce out' },
        { exerciseId: 'trap-bar-deadlift', sets: 4, reps: 3, pct: 80, progression: { type: 'add_pct', step: 2.5 } },
        { exerciseId: 'hip-thrust', sets: 3, reps: 8, weight: 185, progression: { type: 'add_weight', step: 10 } },
        { exerciseId: 'farmer-carry', sets: 3, reps: 1, weight: 70, note: '30 yards' },
      ],
    },
  ],
};

export const SEED_ATHLETES = [
  { id: 'ath-1', name: 'Jake Morales', group: 'Pitchers', maxes: { 'back-squat': 315, deadlift: 405, bench: 225, 'trap-bar-deadlift': 425 } },
  { id: 'ath-2', name: 'Tyler Chen', group: 'Pitchers', maxes: { 'back-squat': 275, deadlift: 365, bench: 205, 'trap-bar-deadlift': 385 } },
  { id: 'ath-3', name: 'Marcus Reed', group: 'Position', maxes: { 'back-squat': 355, deadlift: 455, bench: 265, 'trap-bar-deadlift': 475 } },
];
