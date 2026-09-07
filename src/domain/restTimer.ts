/**
 * Rest timer.
 *
 * Anchored to wall-clock timestamps, never to accumulated ticks. A gym app
 * spends most of its life backgrounded or with the screen off, where JS timers
 * are throttled or frozen outright — a `setInterval` that decrements a counter
 * will drift by minutes over a session. Here the UI ticks purely to re-render;
 * the *truth* is always `now - startedAt`, so backgrounding costs nothing.
 */

export interface RestTimerState {
  readonly durationMs: number;
  readonly startedAtMs: number;
  /** When paused, the instant it was paused. Null while running. */
  readonly pausedAtMs: number | null;
  /** Total time spent paused before the current run segment. */
  readonly pausedAccumMs: number;
}

export function startRestTimer(durationSec: number, nowMs: number): RestTimerState {
  return {
    durationMs: Math.max(0, Math.round(durationSec * 1000)),
    startedAtMs: nowMs,
    pausedAtMs: null,
    pausedAccumMs: 0,
  };
}

/** Milliseconds of running time elapsed, excluding paused spans. */
export function elapsedMs(state: RestTimerState, nowMs: number): number {
  const upTo = state.pausedAtMs ?? nowMs;
  return Math.max(0, upTo - state.startedAtMs - state.pausedAccumMs);
}

export function remainingMs(state: RestTimerState, nowMs: number): number {
  return Math.max(0, state.durationMs - elapsedMs(state, nowMs));
}

export function remainingSec(state: RestTimerState, nowMs: number): number {
  return Math.ceil(remainingMs(state, nowMs) / 1000);
}

export function isExpired(state: RestTimerState, nowMs: number): boolean {
  return remainingMs(state, nowMs) <= 0;
}

export function isPaused(state: RestTimerState): boolean {
  return state.pausedAtMs !== null;
}

export function progress(state: RestTimerState, nowMs: number): number {
  if (state.durationMs <= 0) return 1;
  return Math.min(1, elapsedMs(state, nowMs) / state.durationMs);
}

export function pause(state: RestTimerState, nowMs: number): RestTimerState {
  if (state.pausedAtMs !== null) return state;
  return { ...state, pausedAtMs: nowMs };
}

export function resume(state: RestTimerState, nowMs: number): RestTimerState {
  if (state.pausedAtMs === null) return state;
  return {
    ...state,
    pausedAtMs: null,
    pausedAccumMs: state.pausedAccumMs + Math.max(0, nowMs - state.pausedAtMs),
  };
}

/**
 * Nudge the timer by ±seconds (Hevy's +15s / −15s buttons).
 * Adjusts duration rather than the start anchor so elapsed time stays honest.
 * Duration never goes below the time already elapsed, so a big subtraction
 * expires the timer instead of going negative.
 */
export function adjust(
  state: RestTimerState,
  deltaSec: number,
  nowMs: number,
): RestTimerState {
  const elapsed = elapsedMs(state, nowMs);
  const next = state.durationMs + Math.round(deltaSec * 1000);
  return { ...state, durationMs: Math.max(elapsed, Math.max(0, next)) };
}

/**
 * The instant this timer will fire, for scheduling a notification while the app
 * is backgrounded. Null when paused (no determinate fire time) or expired.
 */
export function scheduledFireAtMs(
  state: RestTimerState,
  nowMs: number,
): number | null {
  if (isPaused(state)) return null;
  const remaining = remainingMs(state, nowMs);
  return remaining <= 0 ? null : nowMs + remaining;
}

/** Common rest presets in seconds, for the duration picker. */
export const REST_PRESETS_SEC: readonly number[] = [
  0, 30, 45, 60, 90, 120, 150, 180, 240, 300,
];

/** Wheel picker values: 5 s to 5:00 in 5-second increments. */
export const REST_WHEEL_SEC: readonly number[] = Array.from({ length: 60 }, (_, i) => (i + 1) * 5);
