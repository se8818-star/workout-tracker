import test from 'node:test';
import assert from 'node:assert/strict';
import { countdown, clockText } from '../js/countdown.js';

test('clock reads minutes and seconds, rounding up', () => {
  assert.equal(clockText(30000), '0:30');
  assert.equal(clockText(65000), '1:05');
  assert.equal(clockText(29001), '0:30');
  assert.equal(clockText(1), '0:01');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(-50), '0:00');
});

test('countdown starts, pauses, resumes and resets', () => {
  let t = 1000;
  const c = countdown(30, () => t);
  assert.equal(c.remaining(), 30000);
  assert.equal(c.running, false);
  c.start(); t += 10000;
  assert.equal(c.remaining(), 20000);
  assert.equal(c.running, true);
  c.pause(); t += 60000;
  assert.equal(c.remaining(), 20000, 'paused time does not count');
  c.start(); t += 5000;
  assert.equal(c.remaining(), 15000);
  c.reset();
  assert.equal(c.remaining(), 30000);
  assert.equal(c.running, false);
});

test('countdown finishes at zero and never goes negative', () => {
  let t = 0;
  const c = countdown(45, () => t);
  c.start(); t += 44999;
  assert.equal(c.done, false);
  t += 1;
  assert.equal(c.done, true);
  assert.equal(c.running, false);
  t += 10000;
  assert.equal(c.remaining(), 0);
});

test('a missing time gives a finished timer, not an error', () => {
  const c = countdown(null);
  assert.equal(c.total, 0);
  assert.equal(c.done, true);
});
