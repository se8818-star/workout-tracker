// The clock behind the set timer. It keeps the time it should end at, not a
// running total, so it stays right when the phone throttles the page or the
// screen dims.

// ms left -> "0:30", "1:05". Rounds up so it shows 0:01 until the very end.
export function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A pausable countdown. now() is injectable for tests.
export function countdown(secs, now = () => Date.now()) {
  const total = Math.max(0, Number(secs) || 0) * 1000;
  let left = total, endsAt = null;
  const remaining = () => (endsAt == null ? left : Math.max(0, endsAt - now()));
  return {
    total,
    remaining,
    get running() { return endsAt != null && remaining() > 0; },
    get done() { return remaining() <= 0; },
    start() { if (endsAt == null && left > 0) endsAt = now() + left; },
    pause() { if (endsAt != null) { left = remaining(); endsAt = null; } },
    reset() { left = total; endsAt = null; },
  };
}
