// Countdown pop-up for sets measured in time, in the app's in-app sheet.
// The clock itself lives in countdown.js (no DOM, so it's tested).

import { sheet, closeSheet, esc } from './ui.js';
import { countdown, clockText } from './countdown.js';

// Short beeps for the last three seconds, a long one at zero. Sound needs a
// tap to unlock on phones, so the AudioContext is made on the first Start.
let ctx = null;
function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}
function beep(ms = 120, freq = 880) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + ms / 1000 + 0.02);
  } catch { /* no sound on this device */ }
}
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };

// Opens the timer pop-up. onDone() ticks the set; it's offered when time is up
// (and anytime with "Done early").
export function timerSheet({ secs, title = 'Timer', sub = '', onDone }) {
  const c = countdown(secs);
  const wrap = sheet(title, `
    ${sub ? `<p class="timer-sub">${esc(sub)}</p>` : ''}
    <div class="timer-face" role="timer" aria-live="off"><span class="timer-clock">${clockText(c.total)}</span>
      <span class="timer-bar"><i></i></span></div>
    <p class="timer-msg" aria-live="polite"></p>
    <div class="timer-btns">
      <button class="btn ghost" data-t="reset">Reset</button>
      <button class="btn timer-go" data-t="go">Start</button>
    </div>
    ${onDone ? '<button class="btn wide timer-tick" data-t="tick">✓ Tick set done</button><button class="link timer-early" data-t="tick">Done early? Tick the set</button>' : ''}`);
  wrap.classList.add('ask', 'timer');
  const $ = (s) => wrap.querySelector(s);
  const clock = $('.timer-clock'), bar = $('.timer-bar i'), go = $('[data-t=go]'), msg = $('.timer-msg');
  let raf = 0, lastSec = null, lock = null, finished = false;

  const keepAwake = async (on) => {
    try {
      if (on && !lock) lock = await navigator.wakeLock?.request('screen');
      else if (!on && lock) { await lock.release(); lock = null; }
    } catch { lock = null; }
  };
  const paint = () => {
    const ms = c.remaining();
    clock.textContent = clockText(ms);
    bar.style.width = `${c.total ? (ms / c.total) * 100 : 0}%`;
    wrap.classList.toggle('running', c.running);
    wrap.classList.toggle('up', finished);
    go.textContent = c.running ? 'Pause' : finished ? 'Again' : ms < c.total ? 'Resume' : 'Start';
  };
  const tick = () => {
    const sec = Math.ceil(c.remaining() / 1000);
    if (sec !== lastSec && c.running && sec <= 3 && sec > 0) beep();
    lastSec = sec;
    if (c.done && !finished) {
      finished = true;
      beep(700, 660); buzz([300, 120, 300, 120, 500]);
      msg.textContent = "Time's up!";
      keepAwake(false);
      paint();
      $('.timer-tick')?.focus();
      return;
    }
    paint();
    if (c.running) raf = requestAnimationFrame(tick);
  };
  const stop = () => { cancelAnimationFrame(raf); c.pause(); keepAwake(false); };

  go.addEventListener('click', () => {
    unlockAudio();
    if (c.running) { stop(); paint(); return; }
    if (finished) { c.reset(); finished = false; msg.textContent = ''; }
    c.start(); lastSec = null; keepAwake(true);
    raf = requestAnimationFrame(tick);
    paint();
  });
  $('[data-t=reset]').addEventListener('click', () => { stop(); c.reset(); finished = false; msg.textContent = ''; paint(); });
  wrap.querySelectorAll('[data-t=tick]').forEach((b) => b.addEventListener('click', () => { stop(); closeSheet(); onDone?.(); }));
  // Coming back to the app after the screen locked: catch up straight away.
  const onVis = () => { if (!document.hidden && c.running) { cancelAnimationFrame(raf); tick(); } };
  document.addEventListener('visibilitychange', onVis);
  // Closing the pop-up (✕, backdrop, or ticking) stops the clock.
  wrap._onClose = () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  paint();
  go.focus();
  return wrap;
}
