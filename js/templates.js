// Ready-made programs a coach can copy into their own list from the Programs
// page. Each template brings the exercises it needs; any the team's library
// already has (same id) are left as they are, apart from picking up a demo
// video they don't have yet.

const X = (id, name, pattern, body, loaded = true, video) => ({ id, name, pattern, body, loaded, alts: [], ...(video ? { video } : {}) });

// RIR (reps in reserve) maps onto the app's RPE field: RIR 0 = RPE 10.
const it = (exerciseId, sets, reps, { rir, rest, range, note, tempo, measure, secs } = {}) => {
  const lines = [note, [range && `Reps ${range}`, rir != null && `RIR ${rir}`, rest && `Rest ${rest}`].filter(Boolean).join(' · ')].filter(Boolean);
  const item = { exerciseId, sets, reps };
  if (rir != null) item.rpe = 10 - (rir === '1/0' ? 0.5 : Number(rir));
  if (tempo) item.tempo = tempo;
  if (measure) item.measure = measure;
  if (secs != null) item.secs = secs;
  if (lines.length) item.note = lines.join('\n');
  return item;
};

const ARM_CUE = 'Drive your elbow down to your hip, not shrugging up & letting your upper back takeover. Keep your arm close & adducted to your torso';
const HOLD_3 = '3 second hold at the fully stretched and extended position on every rep.';

const FALL_2026_EXERCISES = [
  X('foam-roll', 'Foam roll', 'other', 'full', false),
  X('kb-90-90-switch', 'KB 90-90 hip switch', 'other', 'lower'),
  X('two-arm-hang', 'Two-arm hang', 'other', 'upper', false),
  X('jefferson-curl', 'Jefferson curl', 'other', 'full'),
  X('pushup-down-dog', 'Push-up to down dog with toe touch', 'other', 'full', false),
  X('band-calf-hops', 'Band-assisted calf hops', 'other', 'lower', false),
  X('scap-pullup', 'Scap pull-up', 'pull', 'upper', false),
  X('split-stance-pulse', 'Split stance pulses', 'other', 'lower', false),
  X('prone-shoulder-er', 'Prone shoulder external rotation', 'other', 'upper', false),
  X('bowler-squat-reach', 'Bowler squat with overhead reach', 'other', 'lower', false),
  X('half-kneel-t-rotation', 'Half-kneeling T-spine rotation', 'other', 'upper', false),
  X('kb-cossack-squat', 'KB Cossack squat', 'squat', 'lower'),
  X('pec-fly', 'Pec fly', 'push', 'upper'),
  X('sa-cable-row', 'Single arm cable row', 'pull', 'upper'),
  X('sa-leg-press', 'Single arm leg press (quad bias)', 'squat', 'lower'),
  X('prone-ham-curl', 'Prone hamstring curl', 'hinge', 'lower'),
  X('recline-curl', 'Recline curl', 'other', 'upper'),
  X('reverse-cuff-curl', 'Reverse grip cuff cable curl', 'other', 'upper'),
  X('cable-lateral-raise', 'Cable lateral raise', 'other', 'upper'),
  X('adductor-machine', 'Adductor machine', 'other', 'lower'),
  X('abductor-machine', 'Abductor machine (glute med)', 'other', 'lower'),
  X('straight-leg-calf-raise', 'Straight leg calf raise', 'other', 'lower'),
  X('wide-lat-pulldown', 'Wide grip lat pulldown', 'pull', 'upper'),
  X('incline-db-bench', 'Incline DB bench', 'push', 'upper'),
  X('sl-quad-extension', 'Single leg quad extension', 'other', 'lower'),
  X('quad-extension', 'Quad extension', 'other', 'lower'),
  X('b-stance-db-rdl', 'B-stance DB RDL', 'hinge', 'lower'),
  X('jm-press', 'JM press', 'push', 'upper'),
  X('decline-situp', 'Decline sit-up', 'core', 'full', false),
  X('hammer-curl', 'Hammer curl', 'other', 'upper'),
  X('seated-calf-raise', 'Seated calf raise', 'other', 'lower'),
  X('front-squat', 'Front squat', 'squat', 'lower'),
  X('seated-leg-curl', 'Seated leg curl', 'hinge', 'lower'),
  X('back-extension', 'Back extension', 'hinge', 'lower', false),
  X('machine-row-kelso', 'Mid-back machine row + Kelso', 'pull', 'upper'),
  X('katana-tricep-ext', 'Katana tricep extension', 'other', 'upper'),
  X('ab-twist-cable-crunch', 'Ab twist + cable crunch', 'core', 'full'),
  X('squat-curl', 'Squat curl', 'other', 'upper'),
  X('sa-cable-pulldown-reach', 'SA cable pulldown with opposite arm reach', 'pull', 'upper'),
  X('sa-tricep-pressdown', 'SA tricep pressdown', 'other', 'upper'),
  X('sa-rear-delt-fly', 'SA rear delt fly', 'pull', 'upper'),
];

// The sheet's warmup is a separate saved warmup; a coach loads it into any
// program day's warmup section. Rows the sheet gave no sets for default to 1 set.
const w = (exerciseId, sets, reps, opts = {}) => ({ ...it(exerciseId, sets, reps, opts), warmup: true });
const warm = () => [
  w('foam-roll', 1, null, { measure: 'none', note: 'IT band/TFL, quads, hip flexors, hamstrings, adductors, lats, pecs, T-spine, foot arches (baseball)' }),
  w('kb-90-90-switch', 1, 5, { note: '8 kg KB, 5 each side' }),
  w('two-arm-hang', 1, null, { measure: 'none', note: 'No excessive back arching' }),
  w('jefferson-curl', 1, null, { measure: 'none', note: '6 deep breaths, exhale fully, roll through each vertebra on the way down' }),
  w('pushup-down-dog', 1, 5, { note: '5 each side, one fluid motion' }),
  w('band-calf-hops', 1, 100, { note: 'Springy and reactive, arms at your sides, 3-5 inches off the ground' }),
  w('scap-pullup', 1, 10, { note: 'Retract the shoulder blades to start a pull-up' }),
  w('split-stance-pulse', 1, 50, { note: '50 each side. Drop to about 90 degrees at each joint, then rise above neutral' }),
  w('prone-shoulder-er', 3, null, { measure: 'time', secs: 3, note: 'Right arm only. Half roller or water bottle under the shoulder, ribcage tucked' }),
  w('bowler-squat-reach', 1, 6, { note: '6 each side, whole foot (tripod) on the ground' }),
  w('half-kneel-t-rotation', 1, 8, { note: '8 each side, follow the reaching arm with your head' }),
  w('kb-cossack-squat', 1, 5, { note: '12 kg KB, 5 each side. Straight leg long, as low as comfortable' }),
];

const FALL_2026_BLOCK = {
  name: 'Fall 2026',
  weeks: 10,
  deloadWeek: null,
  days: [
    {
      name: 'Day 1: Full body',
      items: [
        it('pec-fly', 3, 10, { range: '10-12', rir: '1/0', rest: '3-5 min', tempo: '3-1-X-1', note: '3 second eccentric + 1 second pause at full stretch + 1 second pause at peak contraction on every rep' }),
        it('sa-cable-row', 3, 8, { range: '8-10', rest: '3-5 min (4-5 min from week 7)', note: '2 second hold at fully stretched position / 1 second hold at peak contraction on every rep' }),
        it('sa-leg-press', 3, 8, { range: '8-10', rest: '2 min', note: 'Rest pause set, fail 3 total times' }),
        it('prone-ham-curl', 3, 8, { range: '8-10', rir: 1, rest: '3-5 min', note: '2 second hold at fully stretched position / 2 second hold at peak contraction on every rep. Arms should be in the scapular plane with elbows fully locked out.' }),
        it('recline-curl', 2, null, { rest: '2 min', note: HOLD_3 }),
        it('reverse-cuff-curl', 2, 8, { range: '8-10', rest: '2 min', note: HOLD_3 }),
        it('cable-lateral-raise', 2, null, { rest: '2 min', note: HOLD_3 }),
        it('adductor-machine', 2, null, { rest: '2 min', note: HOLD_3 }),
        it('straight-leg-calf-raise', 2, null, { rest: '2 min', note: HOLD_3 }),
      ],
    },
    {
      name: 'Day 2: Full body',
      items: [
        it('wide-lat-pulldown', 3, 8, { range: '8-10', rir: 1, rest: '3-5 min', note: "Scaps should retract when all the way at the bottom position and shoulders shouldn't round forwards" }),
        it('incline-db-bench', 3, 8, { range: '8-10', rir: 0, rest: '3-5 min', note: 'Keep ribs down and elbows tucked, but not all the way at your sides' }),
        it('sl-quad-extension', 3, 8, { range: '8-10', rir: 0, rest: '3-5 min', note: 'FULL ROM' }),
        it('b-stance-db-rdl', 3, 8, { range: '8-10', rir: 0, rest: '3-5 min', note: 'Knees up' }),
        it('jm-press', 2, null, { rir: 0, rest: '3-5 min', note: ARM_CUE }),
        it('decline-situp', 2, null, { rir: 0, rest: '3-5 min', note: 'Mini foam roller + seatbelt on the bench' }),
        it('hammer-curl', 2, null, { rir: 0, rest: '3-5 min', note: 'Pause 2s at bottom' }),
        it('seated-calf-raise', 2, null, { rir: 0, rest: '3-5 min', note: 'Pause 2s at bottom' }),
        it('abductor-machine', 2, null),
      ],
    },
    {
      name: 'Day 3: Legs',
      items: [
        it('front-squat', 3, null, { rir: 1, rest: '3-5 min', note: 'Feet hip width apart. Slight bend at the knees but I want you to feel this in your hamstrings. Keep the bar close to your body' }),
        it('seated-leg-curl', 3, 6, { range: '6-10', rir: 0, rest: '3-5 min', note: 'Fully contract & squeeze as hard as possible on every rep here. Fully control the eccentric, fight the rep on the way down. Briefly pause at the bottom of the rep while your quads are in the fully stretched position, keeping tension on them; the weight should not be resting on the stack here. Keep your butt down on the seat & hold yourself down.' }),
        it('adductor-machine', 3, 8, { range: '8-10', rest: '3-5 min', note: '1 second pause at bottom' }),
        it('quad-extension', 3, 8, { range: '8-10', rir: 0, rest: '3-5 min', note: 'Briefly pause the bottom of each rep before exploding up. As always, CONTROL the eccentric & maintain the same tempo on every rep' }),
        it('back-extension', 2, null, { rir: 1, rest: '3-5 min', note: 'Keep your back straight and use your glutes. This is a GLUTE exercise not back' }),
        it('abductor-machine', 2, null, { rest: '3-5 min' }),
      ],
    },
    {
      name: 'Day 4: Upper',
      items: [
        it('incline-db-bench', 3, 8, { range: '8-10', rir: '1/0', rest: '3-5 min', note: ARM_CUE }),
        it('machine-row-kelso', 3, 8, { range: '8-10', rir: '1/0', rest: '3-5 min', note: "This HAS to get full retraction especially when you do kelsos. And it has to be back and down. Not up. Otherwise you'll be very sad" }),
        it('katana-tricep-ext', 2, 8, { range: '8-10', rir: '1/0', rest: '3-5 min', note: ARM_CUE }),
        it('cable-lateral-raise', 2, 8, { range: '8-10', rir: '1/0', rest: '3-5 min' }),
        it('ab-twist-cable-crunch', 2, 8, { range: '8-10', rir: '1/0', rest: '3-5 min' }),
        it('squat-curl', 2, 8, { range: '8-10', rir: '1/0', rest: '3-5 min' }),
        it('sa-cable-pulldown-reach', 2, 8, { range: '8-10', rir: 0, rest: '3-5 min', note: 'Scapular plane, RIBS DOWN, tuck hips' }),
        it('sa-tricep-pressdown', 2, 8, { range: '8-10', rir: '1/0', rest: '3-5 min', note: ARM_CUE }),
        it('sa-rear-delt-fly', 2, 8, { range: '8-10', rir: '1/0', rest: '3-5 min' }),
      ],
    },
  ],
};

// Second sheet: one full body day of three supersets. Every set aims for
// 10-15 reps; the sets themselves grow by week (week 1 one set, weeks 2-3
// two, week 4 on three), which the athlete adds with "+ Set".
const CHRISTINA_FB_EXERCISES = [
  X('db-bench', 'Dumbbell bench press', 'push', 'upper', true, 'https://youtu.be/JN9DVjlafcg'),
  X('back-squat', 'Back squat', 'squat', 'lower', true, 'https://youtube.com/shorts/gjMYET5fT5k'),
  X('chin-up', 'Chin-up', 'pull', 'upper', false, 'https://youtube.com/shorts/Szy41PBWImo'),
  X('rdl', 'Romanian deadlift', 'hinge', 'lower', true, 'https://youtube.com/shorts/5swaQQ3pWh8'),
  X('arnold-press', 'Arnold shoulder press', 'push', 'upper', true, 'https://youtube.com/shorts/FeiPuPtqnBg'),
  X('copenhagen-knee', 'Copenhagen plank (from knee)', 'core', 'lower', false, 'https://youtube.com/shorts/imJBlGadATo'),
];

const SETS_10_15 = 'Week 1: 1 working set. Weeks 2-3: 2 sets. Week 4 on: 3 sets (tap + Set).';
const RULES_10_15 = 'Do 2-3 warm-up sets first. Fail before 10 reps: too heavy, count the set and drop the weight. 15 reps easily: call it a warm-up and go heavier. Hit 15 at a weight: add weight next week.';
// Demo videos live on the exercises (athletes tap "Watch demo").
const ss = (group, exerciseId, opts = {}) => ({ ...it(exerciseId, 1, 10, { range: '10-15', ...opts }), group });

const CHRISTINA_FB_BLOCK = {
  name: 'Christina FB',
  weeks: 8,
  deloadWeek: null,
  days: [
    {
      name: 'Full body',
      items: [
        ss('A', 'db-bench', { rir: 1, note: `${SETS_10_15}\n${RULES_10_15}` }),
        ss('A', 'back-squat', { rir: 1 }),
        ss('B', 'chin-up', { note: 'As many reps as possible' }),
        ss('B', 'rdl', { rir: 1 }),
        ss('C', 'arnold-press', { rir: 1 }),
        ss('C', 'copenhagen-knee', { note: 'As many reps as possible' }),
      ],
    },
  ],
};

export const TEMPLATES = [
  {
    id: 'fall-2026',
    name: 'Fall 2026',
    about: '10 weeks, 4 days: two full body days, legs, upper, with holds and RIR targets from the Fall 2026 sheet. Load the Fall 2026 warmup into its days.',
    block: FALL_2026_BLOCK,
    exercises: FALL_2026_EXERCISES,
  },
  {
    id: 'fall-2026-warmup',
    kind: 'warmup',
    name: 'Fall 2026 warmup',
    about: '12 exercises from the Warmup tab of the Fall 2026 sheet.',
    block: { name: 'Fall 2026 warmup', kind: 'warmup', weeks: 1, deloadWeek: null, days: [{ name: 'Warmup', items: warm() }] },
    exercises: FALL_2026_EXERCISES.filter((e) => warm().some((x) => x.exerciseId === e.id)),
  },
  {
    id: 'christina-fb',
    name: 'Christina FB',
    about: '1 day, 3 supersets (bench + squat, chin-up + RDL, Arnold press + Copenhagen), 10-15 reps at 1 RIR, adding a set in weeks 2 and 4.',
    block: CHRISTINA_FB_BLOCK,
    exercises: CHRISTINA_FB_EXERCISES,
  },
];
