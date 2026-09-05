import {
  distanceToMetres,
  formatAxisTick,
  formatDuration,
  formatDurationCompact,
  formatWeight,
  fromKg,
  kgToLb,
  lbToKg,
  metresToDistance,
  roundToStep,
  stripFloatNoise,
  toKg,
  trimNumber,
} from './units';

describe('weight conversion', () => {
  it('round-trips kg -> lb -> kg', () => {
    for (const kg of [1, 20, 47.5, 102.5, 250]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 9);
    }
  });

  it('matches the known 45 lb / 20.41 kg plate', () => {
    expect(lbToKg(45)).toBeCloseTo(20.4117, 4);
    expect(kgToLb(20)).toBeCloseTo(44.0925, 4);
  });

  it('fromKg/toKg are inverses in both units', () => {
    for (const unit of ['kg', 'lb'] as const) {
      expect(toKg(fromKg(102.5, unit), unit)).toBeCloseTo(102.5, 9);
    }
  });

  it('is a no-op in kg', () => {
    expect(fromKg(100, 'kg')).toBe(100);
    expect(toKg(100, 'kg')).toBe(100);
  });
});

describe('distance conversion', () => {
  it('converts metres to km and miles', () => {
    expect(metresToDistance(5000, 'km')).toBe(5);
    expect(metresToDistance(1609.344, 'mi')).toBeCloseTo(1, 9);
  });

  it('round-trips', () => {
    for (const unit of ['km', 'mi'] as const) {
      expect(metresToDistance(distanceToMetres(5, unit), unit)).toBeCloseTo(5, 9);
    }
  });
});

describe('roundToStep', () => {
  it('rounds to plate increments', () => {
    expect(roundToStep(41.3, 2.5)).toBe(42.5);
    expect(roundToStep(41.2, 2.5)).toBe(40);
    expect(roundToStep(100, 2.5)).toBe(100);
  });

  it('handles exact-half cases that binary float would round down', () => {
    // 2.675 / 0.05 is 53.499999999999996 in IEEE754, not 53.5.
    expect(roundToStep(2.675, 0.05)).toBe(2.7);
    expect(roundToStep(1.005, 0.01)).toBe(1.01);
  });

  it('leaves the value alone for a non-positive step', () => {
    expect(roundToStep(41.3, 0)).toBe(41.3);
    expect(roundToStep(41.3, -1)).toBe(41.3);
  });

  it('does not emit float noise', () => {
    expect(roundToStep(47.49, 2.5)).toBe(47.5);
    expect(String(roundToStep(17.4, 2.5))).toBe('17.5');
  });
});

describe('stripFloatNoise', () => {
  it('cleans accumulated error', () => {
    // These are COMPUTED rather than written as literals: the noisy values are
    // not exactly representable, so writing them out would itself lose
    // precision and prove nothing.
    expect(stripFloatNoise(0.1 + 0.2)).toBe(0.3);
    expect(0.1 + 0.2).not.toBe(0.3); // sanity: the noise is real
    expect(stripFloatNoise(100 * 0.55)).toBe(55);
    expect(stripFloatNoise(19 * 2.5)).toBe(47.5);
  });

  it('preserves genuine precision to 6 decimals', () => {
    expect(stripFloatNoise(20.411657)).toBe(20.411657);
  });
});

describe('formatting', () => {
  it('drops trailing zeros from weights', () => {
    expect(formatWeight(100, 'kg')).toBe('100');
    expect(formatWeight(102.5, 'kg')).toBe('102.5');
    expect(formatWeight(102.25, 'kg')).toBe('102.25');
  });

  it('trims numbers without leaving a bare dot', () => {
    expect(trimNumber(100.0, 2)).toBe('100');
    expect(trimNumber(0.5, 2)).toBe('0.5');
    expect(trimNumber(0, 2)).toBe('0');
  });

  it('preserves whole-number trailing zeros', () => {
    expect(trimNumber(10, 0)).toBe('10');
    expect(trimNumber(210, 0)).toBe('210');
    expect(trimNumber(100, 0)).toBe('100');
    expect(trimNumber(0, 0)).toBe('0');
    expect(trimNumber(2.5, 2)).toBe('2.5');
  });

  it('formats durations as m:ss and h:mm:ss', () => {
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(303)).toBe('5:03');
    expect(formatDuration(3903)).toBe('1:05:03');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('formats compact durations for summaries', () => {
    expect(formatDurationCompact(30)).toBe('30s');
    expect(formatDurationCompact(2700)).toBe('45m');
    expect(formatDurationCompact(3600)).toBe('1h');
    expect(formatDurationCompact(3900)).toBe('1h 5m');
  });
});

describe('formatAxisTick', () => {
  it('keeps small values distinguishable', () => {
    // The bug this fixes: a fixed 1 decimal printed "0.1" for every tick on an
    // axis whose values were all around 0.08.
    expect(formatAxisTick(0.083)).toBe('0.08');
    expect(formatAxisTick(0.042)).toBe('0.04');
    expect(formatAxisTick(0.062)).toBe('0.06');
    expect(new Set([0.083, 0.062, 0.042].map(formatAxisTick)).size).toBe(3);
  });

  it('drops decimals as values grow', () => {
    expect(formatAxisTick(0)).toBe('0');
    expect(formatAxisTick(2.5)).toBe('2.5');
    expect(formatAxisTick(12.4)).toBe('12');
    expect(formatAxisTick(500)).toBe('500');
  });

  it('abbreviates thousands', () => {
    expect(formatAxisTick(1000)).toBe('1k');
    expect(formatAxisTick(12500)).toBe('13k');
  });

  it('handles negatives', () => {
    expect(formatAxisTick(-2.5)).toBe('-2.5');
    expect(formatAxisTick(-0.04)).toBe('-0.04');
  });
});
