import { generateWarmupSets, DEFAULT_WARMUP_SCHEME } from './warmupCalculator';
import { defaultPlateSetup } from './plateCalculator';

describe('generateWarmupSets', () => {
  it('ramps to the working weight on a 20 kg bar', () => {
    const sets = generateWarmupSets(100, 'kg');
    expect(sets.map((s) => s.weightKg)).toEqual([40, 55, 70, 85]);
    expect(sets.every((s) => s.setType === 'warmup')).toBe(true);
    expect(sets.map((s) => s.reps)).toEqual([8, 5, 3, 1]);
  });

  it('rounds to what the bar can actually hold', () => {
    // 0.4 x 97 = 38.8 -> loaded portion 18.8 -> rounds to 20 -> 40 kg
    const sets = generateWarmupSets(97, 'kg');
    for (const s of sets) {
      const loaded = s.weightKg! - 20;
      expect(loaded % 2.5).toBeCloseTo(0, 6);
    }
  });

  it('drops warm-ups that land at or below the empty bar', () => {
    // A 25 kg working set: only the 85% step clears the 20 kg bar.
    const sets = generateWarmupSets(25, 'kg');
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weightKg).toBe(22.5);
  });

  it('de-duplicates steps that round to the same weight', () => {
    const sets = generateWarmupSets(30, 'kg');
    const weights = sets.map((s) => s.weightKg);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it('supports a fixed dumbbell increment', () => {
    const sets = generateWarmupSets(30, 'kg', {
      rounding: { kind: 'increment', step: 2.5, unit: 'kg' },
    });
    // No bar to clear, so every step survives, snapped to 2.5.
    expect(sets.map((s) => s.weightKg)).toEqual([12.5, 17.5, 20, 25]);
  });

  it('leaves weights untouched with rounding off', () => {
    const sets = generateWarmupSets(100, 'kg', {
      rounding: { kind: 'none' },
      skipAtOrBelowBar: false,
    });
    expect(sets.map((s) => s.weightKg)).toEqual([40, 55, 70, 85]);
  });

  it('works in pounds off a 45 lb bar', () => {
    const setup = defaultPlateSetup('lb');
    const sets = generateWarmupSets(100, 'lb', {
      rounding: { kind: 'barbell', setup },
    });
    expect(sets.length).toBeGreaterThan(0);
    // Every generated weight must be loadable in 5 lb steps above the bar.
    // Measure distance to the NEAREST multiple of 5, not `% 5`: the kg
    // round-trip lands a hair under (89.9999993), and modulo of a value just
    // below a multiple wraps to just under the divisor rather than to zero.
    for (const s of sets) {
      const loadedLb = s.weightKg! * 2.20462262185 - 45;
      const offBy = Math.abs(loadedLb - Math.round(loadedLb / 5) * 5);
      expect(offBy).toBeLessThan(1e-4);
    }
    // Sanity: the intended ramp really is 90/120/155/185 lb.
    const lbs = sets.map((s) => Math.round(s.weightKg! * 2.20462262185));
    expect(lbs).toEqual([90, 120, 155, 185]);
  });

  it('returns nothing for a nonsense working weight', () => {
    expect(generateWarmupSets(0, 'kg')).toEqual([]);
    expect(generateWarmupSets(-50, 'kg')).toEqual([]);
    expect(generateWarmupSets(NaN, 'kg')).toEqual([]);
  });

  it('honours a custom scheme', () => {
    const sets = generateWarmupSets(200, 'kg', {
      scheme: [{ percent: 0.5, reps: 5 }],
    });
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weightKg).toBe(100);
    expect(sets[0]!.reps).toBe(5);
  });

  it('default scheme is ascending and never reaches the working weight', () => {
    const percents = DEFAULT_WARMUP_SCHEME.map((s) => s.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(Math.max(...percents)).toBeLessThan(1);
  });
});
