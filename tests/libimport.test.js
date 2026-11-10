import test from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, planLibraryImport } from '../js/libimport.js';
import { VIDEO_LIBRARY } from '../js/library.js';
import { SEED_EXERCISES } from '../js/seed.js';
import { embedFor } from '../js/video.js';

test('names match loosely', () => {
  assert.equal(nameKey('DB Bench Press'), nameKey('Dumbbell bench press'));
  assert.equal(nameKey('1-arm DB Rows'), nameKey('Single arm dumbbell row'));
  assert.equal(nameKey('Push-ups'), nameKey('Push-up'));
  assert.equal(nameKey('Bowler Squat w/ Reach'), nameKey('Bowler squat with reach'));
  assert.notEqual(nameKey('Front squat'), nameKey('Back squat'));
});

test('the library has a name and a working link for every exercise', () => {
  assert.ok(VIDEO_LIBRARY.length > 1200);
  const keys = new Set();
  for (const e of VIDEO_LIBRARY) {
    assert.ok(e.n && /^https:\/\//.test(e.v), e.n);
    keys.add(e.n.toLowerCase());
  }
  assert.equal(keys.size, VIDEO_LIBRARY.length);
  // Almost all play inside the app (the rest are Dropbox/Facebook: new tab).
  assert.ok(VIDEO_LIBRARY.filter((e) => embedFor(e.v)).length >= VIDEO_LIBRARY.length - 5);
});

test('import adds new exercises and fills in missing videos without duplicates', () => {
  const mine = [
    { id: 'back-squat', name: 'Back squat', pattern: 'squat', body: 'lower', loaded: true, alts: [] },
    { id: 'bench', name: 'Bench press', pattern: 'push', body: 'upper', loaded: true, alts: [], video: 'https://youtu.be/mine123' },
    { id: 'x1', name: 'Front Squat', pattern: 'squat', body: 'lower', loaded: true, alts: [], hidden: true },
  ];
  const lib = [
    { n: 'Back Squat', v: 'https://vimeo.com/1', pw: 'cressey', p: 'squat', b: 'lower', w: 1 },
    { n: 'Bench Press', v: 'https://vimeo.com/2', p: 'push', b: 'upper', w: 1 },
    { n: 'Front squat', v: 'https://vimeo.com/3', p: 'squat' },
    { n: 'Side Plank', v: 'https://youtu.be/abcdefg', p: 'core', m: 'time' },
  ];
  const { add, update } = planLibraryImport(mine, lib);
  assert.deepEqual(update.map((x) => [x.id, x.video, x.videoPassword]), [['back-squat', 'https://vimeo.com/1', 'cressey']]);
  assert.equal(add.length, 1);
  assert.deepEqual(add[0], { id: 'vid-side-plank', name: 'Side Plank', pattern: 'core', body: 'full', loaded: false, alts: [], video: 'https://youtu.be/abcdefg', measure: 'time' });
  // Running again after the import changes nothing.
  const again = planLibraryImport([...mine.map((x) => update.find((u) => u.id === x.id) || x), ...add], lib);
  assert.deepEqual(again, { add: [], update: [] });
});

test('the full library against the starter exercises', () => {
  const { add, update } = planLibraryImport(SEED_EXERCISES, VIDEO_LIBRARY);
  assert.ok(update.some((x) => x.id === 'back-squat' && x.video));
  assert.equal(new Set(add.map((x) => x.id)).size, add.length);
  assert.ok(add.every((x) => !SEED_EXERCISES.some((s) => s.id === x.id)));
});
