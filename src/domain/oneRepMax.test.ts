import { estimateOneRepMax, isExtrapolated, weightForReps } from './oneRepMax';

describe('estimateOneRepMax', () => {
  it('returns the load itself at 1 rep, not an inflated value', () => {
    // Epley's raw formula gives 103.3 here; a single rep IS the max.
    expect(estimateOneRepMax(100, 1, 'epley')).toBe(100);
    expect(estimateOneRepMax(100, 1, 'brzycki')).toBe(100);
  });

  it('matches published Epley values', () => {
    // 100 kg x 5 -> 100 * (1 + 5/30) = 116.667
    expect(estimateOneRepMax(100, 5, 'epley')).toBeCloseTo(116.6667, 3);
    // 100 kg x 10 -> 100 * (1 + 10/30) = 133.333
    expect(estimateOneRepMax(100, 10, 'epley')).toBeCloseTo(133.3333, 3);
  });

  it('matches published Brzycki values', () => {
    // 100 kg x 5 -> 100 * 36/32 = 112.5
    expect(estimateOneRepMax(100, 5, 'brzycki')).toBeCloseTo(112.5, 4);
    // 100 kg x 10 -> 100 * 36/27 = 133.333
    expect(estimateOneRepMax(100, 10, 'brzycki')).toBeCloseTo(133.3333, 3);
  });

  it('clamps Brzycki instead of dividing by zero at 37 reps', () => {
    // 37 - 37 = 0 would be Infinity; 38 would go NEGATIVE.
    const at37 = estimateOneRepMax(100, 37, 'brzycki');
    const at50 = estimateOneRepMax(100, 50, 'brzycki');
    expect(at37).toBe(3600); // clamped to reps=36 -> 100 * 36/1
    expect(at50).toBe(3600);
    expect(Number.isFinite(at37!)).toBe(true);
    expect(at50!).toBeGreaterThan(0);
  });

  it('rejects nonsense input rather than returning NaN', () => {
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(-100, 5)).toBeNull();
    expect(estimateOneRepMax(NaN, 5)).toBeNull();
    expect(estimateOneRepMax(100, Infinity)).toBeNull();
  });

  it('flags high-rep estimates as extrapolation', () => {
    expect(isExtrapolated(8)).toBe(false);
    expect(isExtrapolated(12)).toBe(false);
    expect(isExtrapolated(20)).toBe(true);
  });
});

describe('weightForReps', () => {
  it('round-trips against estimateOneRepMax', () => {
    for (const formula of ['epley', 'brzycki'] as const) {
      for (const reps of [1, 3, 5, 8, 12]) {
        const orm = estimateOneRepMax(100, reps, formula)!;
        expect(weightForReps(orm, reps, formula)!).toBeCloseTo(100, 6);
      }
    }
  });

  it('rejects nonsense input', () => {
    expect(weightForReps(0, 5)).toBeNull();
    expect(weightForReps(100, 0)).toBeNull();
  });
});
