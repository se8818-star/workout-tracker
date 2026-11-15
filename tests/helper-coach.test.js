import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';

store.load({ cloud: true });

const COLE = { role: 'athlete', athleteId: 'ath-cole', userId: 'u-cole', coaches: ['ath-landon'] };
function team() {
  store.clearAll();
  for (const id of ['ath-cole', 'ath-landon', 'ath-mia']) store.put('athletes', { id, name: id, maxes: {} });
  store.put('blocks', { id: 'b-sean', name: 'Sean', weeks: 1, days: [{ name: 'Day 1', items: [] }] });
  store.clearDirty(store.dirtyKeys());
}

test('a helper coach coaches only the athletes they were given, never themselves', () => {
  team();
  store.setSetting('me', COLE);
  assert.ok(store.isHelperCoach());
  assert.ok(!store.isHeadCoach());
  assert.ok(store.canCoach('ath-landon'));
  assert.ok(!store.canCoach('ath-mia'));
  assert.ok(!store.canCoach('ath-cole'));
  assert.deepEqual(store.coachedAthletes().map((a) => a.id), ['ath-landon']);
  store.setSetting('me', { role: 'coach' });
  assert.deepEqual(store.coachedAthletes().map((a) => a.id).sort(), ['ath-cole', 'ath-landon', 'ath-mia']);
  store.setSetting('me', { role: 'athlete', athleteId: 'ath-mia', userId: 'u-mia', coaches: [] });
  assert.ok(!store.isHelperCoach());
  assert.ok(!store.canCoach('ath-landon'));
});

test('programs a helper coach makes carry their id; the head coach\'s stay theirs', () => {
  team();
  store.setSetting('me', COLE);
  const mine = store.put('blocks', { id: 'b-cole', name: 'Mine', weeks: 1, days: [] });
  assert.equal(mine.createdBy, 'u-cole');
  assert.ok(store.canEditBlock(mine));
  assert.ok(!store.canEditBlock(store.get('blocks', 'b-sean')));
  // Editing the head coach's program can't claim it.
  const sean = store.put('blocks', { ...store.get('blocks', 'b-sean'), name: 'x', createdBy: 'u-cole' });
  assert.equal(sean.createdBy, undefined);
  // A copy of it is the helper's own.
  const copy = store.put('blocks', { ...structuredClone(store.get('blocks', 'b-sean')), id: 'b-copy' });
  assert.equal(copy.createdBy, 'u-cole');
  store.setSetting('me', { role: 'coach' });
  assert.ok(store.canEditBlock(store.get('blocks', 'b-sean')));
  assert.equal(store.put('blocks', { id: 'b-head', name: 'H', weeks: 1, days: [] }).createdBy, undefined);
});

test('a helper coach looking at a coached athlete\'s day saves nothing; their own day saves', () => {
  team();
  store.put('blocks', { id: 'b1', name: 'P', weeks: 4, days: [{ name: 'Day 1', items: [] }] });
  for (const a of ['ath-landon', 'ath-cole']) store.put('assignments', { id: `asg-${a}`, athleteId: a, blockId: 'b1', startDate: '2026-11-09', weekdays: [6] });
  store.clearDirty(store.dirtyKeys());
  store.setSetting('me', COLE);
  const [plan] = store.plannedOn('ath-landon', '2026-11-15');
  store.startLog('ath-landon', '2026-11-15', plan);
  assert.equal(store.logFor('ath-landon', '2026-11-15'), null);
  const [own] = store.plannedOn('ath-cole', '2026-11-15');
  store.startLog('ath-cole', '2026-11-15', own);
  assert.ok(store.logFor('ath-cole', '2026-11-15'));
});
