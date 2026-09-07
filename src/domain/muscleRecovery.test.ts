import {
  ageFactor,
  BASE_FATIGUE_UNIT,
  buildRecoveryMap,
  FATIGUE_THRESHOLD_NEARLY,
  MUSCLE_RECOVERY_HOURS,
  recoveryLevel,
  recoveryTauHours,
  remainingFatigue,
  setFatigueUnit,
  sexFactor,
  type RecoveryEvent,
} from './muscleRecovery';
import type { Muscle } from './types';

const HOUR = 3600_000;
const M_SCHEMA: RecoveryEvent = {
  t: 0,
  primary: ['biceps'],
  secondary: [],
  unit: 1,
};

describe('setFatigueUnit', () => {
  it('is BASE_FATIGUE_UNIT for a normal set', () => {
    expect(setFatigueUnit('normal', null, false)).toBe(BASE_FATIGUE_UNIT);
  });

  it('costs nothing for an uncounted warm-up', () => {
    expect(setFatigueUnit('warmup', null, false)).toBe(0);
  });

  it('counts warm-ups at a discount when enabled', () => {
    const unit = setFatigueUnit('warmup', null, true);
    expect(unit).toBeGreaterThan(0);
    expect(unit).toBeLessThan(BASE_FATIGUE_UNIT);
  });

  it('scales drop and failure sets up', () => {
    const drop = setFatigueUnit('drop', null, false);
    const failure = setFatigueUnit('failure', null, false);
    expect(drop).toBeGreaterThan(BASE_FATIGUE_UNIT);
    expect(failure).toBeGreaterThan(drop);
  });

  it('adds RPE ≥ 7 but ignores sub-7 RPE', () => {
    const plain = setFatigueUnit('normal', null, false);
    expect(setFatigueUnit('normal', 6, false)).toBe(plain);
    expect(setFatigueUnit('normal', 10, false)).toBeGreaterThan(plain);
  });

  it('caps the intensity factor so no set is infinite fatigue', () => {
    const max = setFatigueUnit('failure', 10, false);
    expect(max).toBeLessThanOrEqual(0.5 * 1.6 + 1e-9);
  });
});

describe('ageFactor and sexFactor', () => {
  it('is neutral when unknown or young', () => {
    expect(ageFactor(null)).toBe(1);
    expect(ageFactor(new Date().getFullYear() - 25)).toBe(1);
  });

  it('lengthens recovery with age', () => {
    expect(ageFactor(new Date().getFullYear() - 35)).toBe(1.1);
    expect(ageFactor(new Date().getFullYear() - 45)).toBe(1.2);
    expect(ageFactor(new Date().getFullYear() - 55)).toBe(1.35);
    expect(ageFactor(new Date().getFullYear() - 70)).toBe(1.5);
  });

  it('shortens recovery slightly for female sex', () => {
    expect(sexFactor(null)).toBe(1);
    expect(sexFactor('male')).toBe(1);
    expect(sexFactor('female')).toBe(0.95);
  });
});

describe('recoveryTauHours', () => {
  it('is half the window, scaled by modifiers', () => {
    expect(recoveryTauHours(48, null, null)).toBe(24);
    expect(recoveryTauHours(48, null, 'female')).toBe(0.5 * 48 * 0.95);
    expect(recoveryTauHours(72, new Date().getFullYear() - 50, null)).toBe(0.5 * 72 * 1.35);
  });
});

describe('remainingFatigue', () => {
  it('is 0 for no events', () => {
    expect(remainingFatigue([], Date.now(), null, null).size).toBe(0);
  });

  it('carries full credit for primary, half for secondary', () => {
    const events: RecoveryEvent[] = [
      { t: 0, primary: ['chest'], secondary: ['triceps'], unit: 1 },
    ];
    const f = remainingFatigue(events, 0, null, null);
    expect(f.get('chest')).toBe(1);
    expect(f.get('triceps')).toBe(0.5);
  });

  it('decays exponentially on the muscle curve (e^-1 after one tau)', () => {
    const events: RecoveryEvent[] = [M_SCHEMA]; // biceps: 36h window, tau 18h
    const now = recoveryTauHours(MUSCLE_RECOVERY_HOURS.biceps, null, null) * HOUR;
    const f = remainingFatigue(events, now, null, null);
    expect(f.get('biceps')).toBeCloseTo(1 * Math.exp(-1), 6);
  });

  it('respects different muscles decaying at different rates', () => {
    const events: RecoveryEvent[] = [
      { t: 0, primary: ['biceps', 'quads'], secondary: [], unit: 1 },
    ];
    const now = 48 * HOUR;
    const f = remainingFatigue(events, now, null, null);
    // Biceps tau 18h decays far more than quads tau 36h.
    expect(f.get('biceps') ?? 0).toBeLessThan(f.get('quads') ?? 0);
  });

  it('applies the age modifier by widening the window', () => {
    const fYoung = remainingFatigue([M_SCHEMA], 60 * HOUR, new Date().getFullYear() - 25, null);
    const fOlder = remainingFatigue(
      [M_SCHEMA],
      60 * HOUR,
      new Date().getFullYear() - 55,
      null,
    );
    expect((fOlder.get('biceps') ?? 0)).toBeGreaterThan(fYoung.get('biceps') ?? 0);
  });

  it('ignores zero-unit events (e.g. warm-ups not counted)', () => {
    const events: RecoveryEvent[] = [{ t: 0, primary: ['chest'], secondary: [], unit: 0 }];
    expect(remainingFatigue(events, 0, null, null).size).toBe(0);
  });

  it('clamps future timestamps to no decay', () => {
    const f = remainingFatigue([M_SCHEMA], -1000, null, null);
    expect(f.get('biceps')).toBe(1);
  });
});

describe('recoveryLevel', () => {
  it('maps the thresholds to the five zones', () => {
    expect(recoveryLevel(0)).toBe(5);
    expect(recoveryLevel(FATIGUE_THRESHOLD_NEARLY)).toBe(5);
    expect(recoveryLevel(FATIGUE_THRESHOLD_NEARLY + 1e-6)).toBe(4);
    expect(recoveryLevel(0.5)).toBe(4);
    expect(recoveryLevel(0.6)).toBe(3);
    expect(recoveryLevel(1.2)).toBe(3);
    expect(recoveryLevel(1.3)).toBe(2);
    expect(recoveryLevel(10)).toBe(2);
  });
});

describe('buildRecoveryMap', () => {
  it('renders every taxonomy slug, untrained as level 1', () => {
    const parts = buildRecoveryMap(new Map());
    expect(parts.length).toBeGreaterThan(10);
    expect(parts.every((p) => p.intensity === 1)).toBe(true);
  });

  it('levels trained muscles and sums collapsed slugs', () => {
    const fatigue = new Map<Muscle, number>();
    fatigue.set('lats', 0.5);
    fatigue.set('upper_back', 0.5); // collapsed with lats -> 1.0
    const parts = buildRecoveryMap(fatigue);
    const upper = parts.find((p) => p.slug === 'upper-back');
    expect(upper).toBeDefined();
    expect(upper?.intensity).toBe(recoveryLevel(1));
    expect(parts.filter((p) => p.slug === 'upper-back').length).toBe(1);
  });

  it('ignores muscles without a drawable slug', () => {
    const fatigue = new Map<Muscle, number>();
    fatigue.set('full_body', 5);
    fatigue.set('cardio', 5);
    const parts = buildRecoveryMap(fatigue);
    expect(parts.some((p) => ['full_body', 'cardio'].includes(p.slug))).toBe(false);
  });
});