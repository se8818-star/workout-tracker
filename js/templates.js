// Ready-made programs a coach can copy into their own list from the Programs
// page. Each template brings the exercises it needs; any the team's library
// already has (same id) are left as they are.

const X = (id, name, pattern, body, loaded = true) => ({ id, name, pattern, body, loaded, alts: [] });

// RIR (reps in reserve) maps onto the app's RPE field: RIR 0 = RPE 10.
const it = (exerciseId, sets, reps, { rir, rest, range, note, tempo, measure } = {}) => {
  const lines = [note, [range && `Reps ${range}`, rir != null && `RIR ${rir}`, rest && `Rest ${rest}`].filter(Boolean).join(' · ')].filter(Boolean);
  const item = { exerciseId, sets, reps };
  if (rir != null) item.rpe = 10 - (rir === '1/0' ? 0.5 : Number(rir));
  if (tempo) item.tempo = tempo;
  if (measure) item.measure = measure;
  if (lines.length) item.note = lines.join('\n');
  return item;
};

const WARMUP_NOTE = 'Foam roll: IT band/TFL, quads, hip flexors, hamstrings, adductors, lats, pecs, T-spine, feet (baseball). '
  + 'Activation: 8 kg KB 90-90 hip switches 5/side, two-arm hangs, Jefferson curls with 6 deep breaths. '
  + 'Then: push-up to down dog with toe touch 5/side, band-assisted calf hops x100, scap pull-ups x10, split stance pulses 50/side, '
  + 'prone shoulder ER 3 x 3 s hold (right arm), bowler squats with overhead reach 6/side, half-kneeling T-spine rotation 8/side, 12 kg KB Cossack squats 5/side.';

const ARM_CUE = 'Drive your elbow down to your hip, not shrugging up & letting your upper back takeover. Keep your arm close & adducted to your torso';
const HOLD_3 = '3 second hold at the fully stretched and extended position on every rep.';

const FALL_2026_EXERCISES = [
  X('warmup', 'Warmup (foam roll + activation)', 'other', 'full', false),
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

const warm = () => it('warmup', 1, null, { note: WARMUP_NOTE, measure: 'none' });

const FALL_2026_BLOCK = {
  name: 'Fall 2026',
  weeks: 10,
  deloadWeek: null,
  days: [
    {
      name: 'Day 1: Full body',
      items: [
        warm(),
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
        warm(),
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
        warm(),
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
        warm(),
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

export const TEMPLATES = [
  {
    id: 'fall-2026',
    name: 'Fall 2026',
    about: '10 weeks, 4 days: two full body days, legs, upper. Warmup, holds and RIR targets from the Fall 2026 sheet.',
    block: FALL_2026_BLOCK,
    exercises: FALL_2026_EXERCISES,
  },
];
