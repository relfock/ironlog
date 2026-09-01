import {
  adjust,
  elapsedMs,
  isExpired,
  isPaused,
  pause,
  progress,
  remainingSec,
  resume,
  scheduledFireAtMs,
  startRestTimer,
} from './restTimer';

const T0 = 1_700_000_000_000;

describe('rest timer', () => {
  it('counts down from the configured duration', () => {
    const t = startRestTimer(90, T0);
    expect(remainingSec(t, T0)).toBe(90);
    expect(remainingSec(t, T0 + 30_000)).toBe(60);
    expect(remainingSec(t, T0 + 89_000)).toBe(1);
  });

  it('is wall-clock anchored, so backgrounding cannot make it drift', () => {
    // The whole point: no ticks happen while backgrounded, yet the answer at
    // T+5min is still correct because it is derived from timestamps.
    const t = startRestTimer(90, T0);
    expect(isExpired(t, T0 + 5 * 60_000)).toBe(true);
    expect(remainingSec(t, T0 + 5 * 60_000)).toBe(0);
  });

  it('clamps remaining at zero instead of going negative', () => {
    const t = startRestTimer(60, T0);
    expect(remainingSec(t, T0 + 600_000)).toBe(0);
    expect(progress(t, T0 + 600_000)).toBe(1);
  });

  it('treats a zero-second timer as immediately done', () => {
    const t = startRestTimer(0, T0);
    expect(isExpired(t, T0)).toBe(true);
    expect(progress(t, T0)).toBe(1);
  });

  it('reports progress as a 0..1 fraction', () => {
    const t = startRestTimer(100, T0);
    expect(progress(t, T0)).toBe(0);
    expect(progress(t, T0 + 25_000)).toBeCloseTo(0.25, 6);
    expect(progress(t, T0 + 100_000)).toBe(1);
  });

  describe('pause / resume', () => {
    it('freezes elapsed time while paused', () => {
      let t = startRestTimer(90, T0);
      t = pause(t, T0 + 30_000);
      expect(isPaused(t)).toBe(true);
      // 60 seconds of real time pass, but the timer is frozen.
      expect(remainingSec(t, T0 + 90_000)).toBe(60);
    });

    it('excludes the paused span after resuming', () => {
      let t = startRestTimer(90, T0);
      t = pause(t, T0 + 30_000);
      t = resume(t, T0 + 90_000); // paused for 60s
      expect(isPaused(t)).toBe(false);
      // 30s of running time had elapsed; at T+100s only 40s has run.
      expect(remainingSec(t, T0 + 100_000)).toBe(50);
    });

    it('survives several pause cycles', () => {
      let t = startRestTimer(120, T0);
      t = pause(t, T0 + 10_000);
      t = resume(t, T0 + 20_000); // +10s paused
      t = pause(t, T0 + 30_000);
      t = resume(t, T0 + 50_000); // +20s paused, 30s total
      // At T+60s: 60 - 30 paused = 30s of running time.
      expect(elapsedMs(t, T0 + 60_000)).toBe(30_000);
      expect(remainingSec(t, T0 + 60_000)).toBe(90);
    });

    it('ignores a redundant pause or resume', () => {
      let t = startRestTimer(60, T0);
      const paused = pause(t, T0 + 5_000);
      expect(pause(paused, T0 + 10_000)).toBe(paused);
      t = startRestTimer(60, T0);
      expect(resume(t, T0 + 5_000)).toBe(t);
    });
  });

  describe('adjust', () => {
    it('adds time', () => {
      const t = adjust(startRestTimer(60, T0), 15, T0);
      expect(remainingSec(t, T0)).toBe(75);
    });

    it('subtracts time', () => {
      const t = adjust(startRestTimer(60, T0), -15, T0);
      expect(remainingSec(t, T0)).toBe(45);
    });

    it('expires rather than going negative on a big subtraction', () => {
      const t0 = startRestTimer(90, T0);
      const t = adjust(t0, -120, T0 + 30_000);
      // Duration cannot drop below the 30s already elapsed.
      expect(remainingSec(t, T0 + 30_000)).toBe(0);
      expect(isExpired(t, T0 + 30_000)).toBe(true);
    });
  });

  describe('scheduledFireAtMs', () => {
    it('gives the absolute instant to schedule a notification for', () => {
      const t = startRestTimer(90, T0);
      expect(scheduledFireAtMs(t, T0)).toBe(T0 + 90_000);
      expect(scheduledFireAtMs(t, T0 + 30_000)).toBe(T0 + 90_000);
    });

    it('is null while paused, because there is no determinate fire time', () => {
      const t = pause(startRestTimer(90, T0), T0 + 10_000);
      expect(scheduledFireAtMs(t, T0 + 10_000)).toBeNull();
    });

    it('is null once expired', () => {
      const t = startRestTimer(30, T0);
      expect(scheduledFireAtMs(t, T0 + 60_000)).toBeNull();
    });
  });
});
