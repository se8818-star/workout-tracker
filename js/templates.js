// Ready-made programs a coach can copy into their own list from the Programs
// page. Each template brings the exercises it needs; any the team's library
// already has (same id) are left as they are, apart from picking up a demo
// video they don't have yet.

const X = (id, name, pattern, body, loaded = true, video) => ({ id, name, pattern, body, loaded, alts: [], ...(video ? { video } : {}) });

// RIR (reps in reserve) maps onto the app's RPE field: RIR 0 = RPE 10.
// A rep range like '10-15' becomes the target itself (reps 10, repsTo 15).
const it = (exerciseId, sets, reps, { rir, rest, range, note, tempo, measure, secs } = {}) => {
  const lines = [note, [rir != null && `RIR ${rir}`, rest && `Rest ${rest}`].filter(Boolean).join(' · ')].filter(Boolean);
  const item = { exerciseId, sets, reps };
  if (range) { const [lo, hi] = range.split('-').map(Number); item.reps = lo; item.repsTo = hi; }
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
// 10-15 reps (a real range target); the sets themselves grow by week (week 1 one set, weeks 2-3
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

// Fourth sheet (Landon): three days (Monday full body, Friday upper, Saturday
// lower) for 4 weeks, each starting with plyos/sprints and ending with a
// breathing cool-down. Lifts with "+5-10 lbs" add 5 lb a week from what the
// athlete actually lifted; starting weights are the sheet's (its "start with"
// note, else what Landon wrote in week 1). Distances (yards) have no box in the
// app, so those drills are check-offs with the distance in the note.
// Vimeo demos that need a password carry it on the exercise.
const L = (id, name, pattern, body, loaded, video, videoPassword) => ({ ...X(id, name, pattern, body, loaded, video), ...(videoPassword ? { videoPassword } : {}) });
const GT = 'goodtechnique';

const LANDON_EXERCISES = [
  L('a-march', 'A march', 'plyo', 'lower', false),
  L('a-skip', 'A skip', 'plyo', 'lower', false),
  L('sl-hops-fwd-back', 'Single leg hops forwards/backwards', 'plyo', 'lower', false),
  L('line-hops', 'Side-to-side line hops', 'plyo', 'lower', false),
  L('skip-height', 'Skip for height', 'plyo', 'lower', false),
  L('skip-distance', 'Skip for distance', 'plyo', 'lower', false),
  L('triple-broad-jump', 'Triple broad jump', 'plyo', 'lower', false),
  L('sl-bounds', 'Single leg bounds', 'plyo', 'lower', false, 'https://www.instagram.com/reel/DNoRBHqhOVG/'),
  L('accel-10', '10 yd acceleration', 'sprint', 'lower', false),
  L('accel-20', '20 yd acceleration', 'sprint', 'lower', false),
  L('accel-30-85', '30 yd acceleration at 85%', 'sprint', 'lower', false),
  L('approach-jump', 'Approach jump', 'plyo', 'lower', false),
  L('broad-jump', 'Broad jump', 'plyo', 'lower', false),
  // Monday
  L('sa-landmine-press', 'SA landmine press', 'push', 'upper', true),
  L('hk-1arm-lat-pulldown', 'Half-kneeling 1-arm lat pulldown', 'pull', 'upper', true, 'https://www.youtube.com/watch?v=qULbU0honZI'),
  L('mb-overhead-slam', 'MB overhead slam', 'plyo', 'full', true),
  L('3pt-y-raise', '3-point Y raise', 'other', 'upper', false, 'https://www.youtube.com/watch?v=B_iAqsxMEo8'),
  L('db-bulgarian-split-squat', 'DB Bulgarian split squat', 'squat', 'lower', true, 'https://www.youtube.com/watch?v=VPhhE6bBzZE'),
  L('spring-ankle-iso', 'Spring ankle isometric', 'other', 'lower', false, 'https://www.youtube.com/watch?v=ahg-vpGxl9k'),
  L('trx-face-pull', 'TRX face pull', 'pull', 'upper', false, 'https://youtu.be/rntSjJPz3Z4?si=NiAGZfjoX8W9257B&t=30'),
  L('anti-rotation-chop', 'Wide stance anti-rotation chop w/ rope', 'core', 'full', true, 'https://vimeo.com/65780273', GT),
  L('goblet-lateral-lunge', 'Goblet lateral lunge', 'squat', 'lower', true, 'https://www.youtube.com/watch?v=QaA6CEVw7nk'),
  L('dead-hang', 'Dead hang', 'other', 'upper', false, 'https://vimeo.com/113985864', 'cressey'),
  L('leg-elevated-breathing', 'Leg elevated relaxed breathing', 'other', 'full', false),
  // Friday
  L('split-stance-low-row', 'Split stance low cable row', 'pull', 'upper', true, 'https://www.youtube.com/watch?v=zTJL5Yt_cLc'),
  L('yoga-pushup', 'Yoga push-up', 'push', 'upper', false, 'https://vimeo.com/65780321', GT),
  L('mb-scoop-toss', 'MB scoop toss', 'plyo', 'full', true, 'https://vimeo.com/54055144', 'cressey'),
  L('alt-db-incline-press', 'Alternating DB incline press', 'push', 'upper', true, 'https://www.youtube.com/watch?v=JOJ3r25vqL8'),
  L('chin-up', 'Chin-up', 'pull', 'upper', false, 'https://vimeo.com/67898936', GT),
  L('prone-swimmer-hover', 'Prone swimmer hover', 'other', 'upper', false, 'https://vimeo.com/402760406'),
  L('db-pullover', 'DB pullover', 'pull', 'upper', true, 'https://youtu.be/FK4rHfWKEac?si=mUSkxjh4U_k9Pnct&t=15'),
  L('bottoms-up-kb-carry', 'Bottoms up KB carry', 'carry', 'upper', true, 'https://vimeo.com/65829531', GT),
  L('side-plank-reach-rotate', 'Side plank w/ reach & rotation', 'core', 'full', false, 'https://youtu.be/u4-qAAWDck8?si=z2xrxt9Czl19tbLa&t=19'),
  L('alt-db-curl-rotation', 'Alternating DB curl w/ rotation', 'other', 'upper', true, 'https://www.youtube.com/watch?v=YRjr7sYGEyA'),
  L('cable-oh-tricep-ext', 'Cable overhead tricep extension', 'other', 'upper', true),
  L('incline-db-hammer-curl', 'Incline DB hammer curl', 'other', 'upper', true, 'https://www.youtube.com/watch?v=cbRSu8Ws_hs'),
  // Saturday
  L('ssb-box-squat', 'SSB box squat', 'squat', 'lower', true),
  L('contra-b-stance-rdl', 'Contralateral DB B-stance RDL', 'hinge', 'lower', true, 'https://www.instagram.com/reel/DPcFEqFj5TK/?hl=en'),
  L('quad-extension', 'Quad extension', 'other', 'lower', true),
  L('seated-leg-curl', 'Seated leg curl', 'hinge', 'lower', true),
  L('overhead-pallof-press', 'Overhead Pallof press', 'core', 'full', true, 'https://www.youtube.com/watch?v=nN900zEvlCs'),
  L('goblet-lateral-lunge-iso', 'Goblet lateral lunge iso', 'squat', 'lower', true, 'https://www.youtube.com/watch?v=QaA6CEVw7nk'),
  L('leg-press-calf-raise', 'Calf raise on leg press', 'other', 'lower', true, 'https://youtu.be/IrxfRHGiGE0?si=FU1YCxjQe0KK4yqu&t=41'),
  L('plate-pinch-walk', 'Plate pinch walk', 'carry', 'full', true),
  L('assault-bike', 'Assault bike', 'other', 'full', false),
  L('assault-bike-intervals', 'Assault bike 15s on / 45s off', 'other', 'full', false),
];

// it() plus a starting weight and, with step, a weekly weight rule.
const li = (exerciseId, sets, reps, { weight, step, group, ...opts } = {}) => {
  const item = it(exerciseId, sets, reps, opts);
  if (weight != null) item.weight = weight;
  if (step) item.progression = { type: 'add_weight', step };
  if (group) item.group = group;
  return item;
};
const ADD_5_10 = 'Add 5-10 lb from last time.';
const EACH = 'Each side.';
const yards = (exerciseId, sets, note) => li(exerciseId, 1, null, { measure: 'none', note });
const BREATHE = () => li('leg-elevated-breathing', 1, null, { measure: 'time', secs: 300, note: 'Lie on the ground with your feet up a wall so you form an L. Focus on your breathing and try to relax. 4 s inhale, 8 s exhale.' });
const PLYOS = () => [
  yards('a-march', 2, '2 × 10 yards'),
  yards('a-skip', 2, '2 × 15 yards'),
  li('sl-hops-fwd-back', 1, 30, { note: 'Hop forwards on one leg and land on your whole foot. 1 set is 10 jumps forwards AND backwards for each leg.' }),
  li('line-hops', 1, 4, { note: '4 each. Make an imaginary (or real) line on the ground, set up to one side and jump over it AS FAST AS POSSIBLE. Limit your time on the ground. 1 set side-to-side, 1 set front and back, 1 set however you want.' }),
].map((x) => ({ ...x, group: 'P' }));

const LANDON_BLOCK = {
  name: 'Landon Program',
  weeks: 4,
  deloadWeek: null,
  days: [
    {
      name: 'Monday: Full body',
      items: [
        ...PLYOS(),
        li('skip-height', 3, 6, { group: 'S', note: 'Get as HIGH as possible every skip.' }),
        li('skip-distance', 3, 6, { group: 'S', note: 'Cover as much ground as possible. Mark your distance and try to beat it next rep.' }),
        li('sa-landmine-press', 3, 8, { group: 'A', weight: 35, step: 5, note: `${EACH} ${ADD_5_10}\nSplit stance: opposite hand, opposite leg. 3 s lowering. Inhale as you lower, exhale as you press up.` }),
        li('hk-1arm-lat-pulldown', 3, 8, { group: 'A', weight: 45, step: 5, note: `${EACH} ${ADD_5_10}\nWatch the video, but stand further from the machine than they do. The cable should make a 45-60 degree angle.` }),
        li('mb-overhead-slam', 3, 5, { group: 'A', weight: 4, note: 'Stand all the way up on your toes, then slam the ball into the ground as hard as you can.' }),
        li('3pt-y-raise', 3, null, { group: 'A', measure: 'time', secs: 30, note: `${EACH} At the top: "shoulder down (no shrug), palm up". Imagine you're a waiter holding food and trying not to spill.` }),
        li('db-bulgarian-split-squat', 2, 4, { group: 'B', weight: 120, step: 5, note: `${EACH} ${ADD_5_10}\nKeep your chest tall and maintain good form.` }),
        li('spring-ankle-iso', 2, null, { group: 'B', measure: 'time', secs: 30, note: `${EACH} Watch the video. Match the angle of your shin with your torso.` }),
        li('trx-face-pull', 2, 10, { group: 'B', note: 'Watch the video.' }),
        li('anti-rotation-chop', 2, 8, { group: 'C', weight: 25, step: 5, note: `${EACH} ${ADD_5_10}` }),
        li('goblet-lateral-lunge', 2, 8, { group: 'C', weight: 60, step: 5, note: `${EACH} ${ADD_5_10}\nKeep one leg straight and both feet forward. You should feel it in your adductor/groin.` }),
        li('dead-hang', 2, null, { group: 'C', measure: 'time', note: 'Max time. Keep your hips tucked under you. Try to PR every single time.' }),
        BREATHE(),
      ],
    },
    {
      name: 'Friday: Upper',
      items: [
        ...PLYOS(),
        li('triple-broad-jump', 3, 1, { note: 'Mark your distance and try to beat it each set.' }),
        yards('sl-bounds', 3, '3 × 20 yards. Almost like repeated single leg jumps.'),
        yards('accel-10', 2, '2 × 10 yards. 3-point stance and explode out.'),
        yards('accel-20', 2, '2 × 20 yards. 3-point stance and explode out.'),
        yards('accel-30-85', 2, '2 × 30 yards at 85% effort. Fast but not all out.'),
        li('split-stance-low-row', 3, 8, { group: 'A', weight: 45, step: 5, note: `${EACH} ${ADD_5_10}\nSplit stance: opposite hand, opposite leg. 3 s lowering. Inhale on the way back, exhale as you pull.` }),
        li('yoga-pushup', 3, 12, { group: 'A', note: '3 seconds lowering.' }),
        li('mb-scoop-toss', 3, 5, { group: 'A', weight: 4, note: EACH }),
        li('alt-db-incline-press', 2, 6, { group: 'B', weight: 40, step: 5, note: `${EACH} ${ADD_5_10}\nPut two 45 lb plates where your feet go. Back flat on the bench, core braced so your hips stay tucked. Video it or FaceTime Sean and he'll help.` }),
        li('chin-up', 2, null, { group: 'B', note: 'Max reps. 2 seconds lowering.' }),
        li('prone-swimmer-hover', 2, null, { group: 'B', note: 'Watch the video.' }),
        li('db-pullover', 2, 8, { group: 'C', weight: 20, note: 'Start with 20 lb.' }),
        li('bottoms-up-kb-carry', 2, null, { group: 'C', weight: 20, note: 'Walk 15 yards with a 15-20 lb KB. Keep the elbow up, especially as you get tired.' }),
        li('side-plank-reach-rotate', 2, null, { group: 'C', measure: 'time', note: 'Max time.' }),
        li('dead-hang', 2, null, { group: 'C', measure: 'time', note: 'Max time. Keep your hips tucked under you. Try to PR every single time.' }),
        li('alt-db-curl-rotation', 2, 8, { group: 'D', weight: 25, note: `${EACH} Get big and nasty.` }),
        li('cable-oh-tricep-ext', 2, 8, { group: 'D', weight: 30, note: '2 seconds lowering.' }),
        li('incline-db-hammer-curl', 2, 8, { group: 'D', weight: 20, note: `${EACH} 20 lb each hand.` }),
        BREATHE(),
      ],
    },
    {
      name: 'Saturday: Lower',
      items: [
        li('ssb-box-squat', 4, 5, { range: '5-8', group: 'A', weight: 215, step: 5, note: `${ADD_5_10} Only sets above 210 count, so don't start too heavy.\nIf your gym has wedges, use those. Otherwise a 3-second lowering, then explode up.` }),
        li('approach-jump', 4, 4, { group: 'A', note: 'As high as possible.' }),
        li('contra-b-stance-rdl', 3, 6, { range: '6-8', group: 'B', weight: 55, step: 5, note: `${EACH} ${ADD_5_10}\nStart with 55 lb. Back straight, weight centered over your foot. When you run out of range at your hip, come up. Do NOT round your back.` }),
        li('broad-jump', 3, 5, { group: 'B', note: 'Mark your distance with a cone or band and try to beat it every time.' }),
        li('quad-extension', 3, 8, { range: '8-12', group: 'C', weight: 140, step: 5, note: "Add 5 lb from last time. Lock out every rep. If you can't do another rep, you didn't do it correctly." }),
        li('seated-leg-curl', 3, 8, { range: '8-12', group: 'C', weight: 80, step: 5, note: 'Add 5 lb from last time. Full range of motion.' }),
        li('overhead-pallof-press', 3, 8, { group: 'D', weight: 25, step: 5, note: `${EACH} Add 5 lb from last time. Use a cable, start with 25 lb.` }),
        li('goblet-lateral-lunge-iso', 3, null, { group: 'D', measure: 'time', weight: 45, step: 5, note: 'Max time. Add 5 lb from last time; start with 45 lb. Hold at the bottom with your back straight, both feet pointed forward and the out-leg knee straight.' }),
        li('leg-press-calf-raise', 2, 8, { range: '8-12', group: 'E', weight: 180, note: 'Hold the stretch for 1 second.' }),
        li('plate-pinch-walk', 2, null, { group: 'E', measure: 'time', weight: 25, note: 'Max time. Pinch a 25 lb plate in each hand and walk.' }),
        li('assault-bike', 1, null, { measure: 'time', secs: 300, note: '5-10 minutes, easy. You should be able to hold a conversation.' }),
        li('assault-bike-intervals', 1, null, { measure: 'time', secs: 600, note: '15 s AS HARD AS POSSIBLE, then 45 s easy, repeated. (Sheet says 10 min in one place and 15 min in another.)' }),
        BREATHE(),
      ],
    },
  ],
};

const LANDON_WARMUP_EXERCISES = [
  L('foam-roll', 'Foam roll', 'other', 'full', false),
  L('rpr', 'RPR', 'other', 'full', false),
  L('upper-back-expansion', 'Upper back expansion w/ wall sit', 'other', 'upper', false, 'https://youtu.be/z8G4O4OhV18'),
  L('turtle-rocking', 'Turtle rocking', 'other', 'full', false, 'https://youtu.be/z8G4O4OhV18'),
  L('couch-stretch-reach', 'Couch stretch w/ reach & rotation', 'other', 'lower', false, 'https://www.youtube.com/watch?v=Crpg-RkwW2Y'),
  L('bretzel', 'Bretzel', 'other', 'full', false, 'https://www.youtube.com/watch?v=Crpg-RkwW2Y'),
  L('supine-cross-connect', 'Supine cross-connect', 'other', 'full', false, 'https://www.youtube.com/watch?v=lb1bVUNx-OM'),
  L('fr-sidelying-step-over', 'Foam roller sidelying step-over', 'other', 'full', false, 'https://www.youtube.com/shorts/_B3sGAF8J-0'),
  L('ipsi-ffe-kb-split-squat', 'Ipsilateral FFE KB split squat', 'squat', 'lower', true, 'https://www.youtube.com/watch?v=Kb-Qsoutgdc'),
  L('seated-90-90-kb-switch', 'Seated 90/90 ER/IR hip switch (KB goblet hold)', 'other', 'lower', true, 'https://www.youtube.com/watch?v=xR2-nHfMm8w'),
  L('hk-tibial-ir-mobs', 'Half-kneeling tibial internal rotation mobs', 'other', 'lower', false, 'https://www.youtube.com/watch?v=PVHMwnJ4N_Q'),
  L('side-shuffle-jog', 'Side shuffle to jog', 'other', 'lower', false),
  L('carioca', 'Carioca', 'other', 'lower', false),
  L('skipping', 'Skipping', 'other', 'lower', false),
  L('backpedal-jog', 'Backpedal to jog', 'other', 'lower', false),
];

const lw = (exerciseId, sets, reps, opts = {}) => ({ ...li(exerciseId, sets, reps, opts), warmup: true });
const LANDON_WARMUP = [
  lw('foam-roll', 1, null, { measure: 'none', note: 'Must do before sprinting (with RPR and the dynamic drills).\nExtra time on quads, adductors and calves. Then IT band/TFL, hip flexors, hamstrings, lats, T-spine, arches of feet (lax ball).' }),
  lw('rpr', 1, null, { measure: 'none', note: "10 s each (Jack's video): jaw, base of skull, down the sternum, edge of ribs, either side of belly button, hip flexors, chop out glutes, chop out legs (VMO), scratch up lats, between pecs and shoulders, inch below collarbone across." }),
  lw('upper-back-expansion', 1, null, { measure: 'none' }),
  lw('turtle-rocking', 1, 8),
  lw('couch-stretch-reach', 1, 8, { note: EACH }),
  lw('bretzel', 1, 8, { measure: 'breaths', note: EACH }),
  lw('supine-cross-connect', 1, 3, { measure: 'breaths', note: EACH }),
  lw('fr-sidelying-step-over', 1, 6, { note: EACH }),
  lw('ipsi-ffe-kb-split-squat', 1, 8, { note: `${EACH} Front foot up on a 6 inch box.` }),
  lw('seated-90-90-kb-switch', 1, 5, { weight: 15, note: `${EACH} 15 lb KB.` }),
  lw('hk-tibial-ir-mobs', 1, 8, { note: EACH }),
  lw('side-shuffle-jog', 1, null, { measure: 'none', note: '10 yd shuffle + 10 yd jog' }),
  lw('carioca', 1, null, { measure: 'none', note: '20 yards' }),
  lw('skipping', 1, null, { measure: 'none', note: '20 yards' }),
  lw('backpedal-jog', 1, null, { measure: 'none', note: '2 × (10 yd backpedal + 10 yd jog)' }),
];

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
  {
    id: 'landon',
    name: 'Landon Program',
    about: '4 weeks, 3 days (Monday full body, Friday upper, Saturday lower): plyos and sprints first, supersets A-E, lifts adding 5 lb a week, breathing cool-down. Load the Landon warmup into its days.',
    block: LANDON_BLOCK,
    exercises: LANDON_EXERCISES,
  },
  {
    id: 'landon-warmup',
    kind: 'warmup',
    name: 'Landon Warmup',
    about: 'Foam roll, RPR, 9 mobility drills and 4 dynamic drills from the Warmup tab of Landon\'s sheet. Do it before sprinting.',
    block: { name: 'Landon Warmup', kind: 'warmup', weeks: 1, deloadWeek: null, days: [{ name: 'Warmup', items: LANDON_WARMUP }] },
    exercises: LANDON_WARMUP_EXERCISES,
  },
];
