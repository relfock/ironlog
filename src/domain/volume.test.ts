import {
  accumulateMuscleSets,
  countedSets,
  effectiveLoadKg,
  muscleDistribution,
  setVolumeKg,
  totalVolumeKg,
  type VolumeContext,
} from './volume';
import type { LoggedSet, Muscle, SetType } from './types';

function set(over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    setType: 'normal' as SetType,
    weightKg: 100,
    reps: 5,
    durationSec: null,
    distanceM: null,
    rpe: null,
    completed: true,
    ...over,
  };
}

const ctx = (over: Partial<VolumeContext> = {}): VolumeContext => ({
  trackingType: 'weight_reps',
  bodyweightKg: 80,
  countWarmups: false,
  ...over,
});

describe('effectiveLoadKg', () => {
  it('uses the bar weight for weight_reps', () => {
    expect(effectiveLoadKg(set(), 'weight_reps', 80)).toBe(100);
  });

  it('uses bodyweight for bodyweight_reps', () => {
    expect(effectiveLoadKg(set({ weightKg: null }), 'bodyweight_reps', 80)).toBe(80);
  });

  it('adds the load for weighted bodyweight', () => {
    expect(effectiveLoadKg(set({ weightKg: 20 }), 'weighted_bodyweight', 80)).toBe(100);
  });

  it('SUBTRACTS the load for assisted bodyweight', () => {
    // The 30 kg is assistance, so the lifter moves 50 kg, not 110.
    expect(effectiveLoadKg(set({ weightKg: 30 }), 'assisted_bodyweight', 80)).toBe(50);
  });

  it('never goes negative when assistance exceeds bodyweight', () => {
    expect(effectiveLoadKg(set({ weightKg: 200 }), 'assisted_bodyweight', 80)).toBe(0);
  });

  it('returns null rather than inventing a bodyweight', () => {
    expect(effectiveLoadKg(set({ weightKg: null }), 'bodyweight_reps', null)).toBeNull();
    expect(effectiveLoadKg(set(), 'weighted_bodyweight', null)).toBeNull();
  });

  it('carries no tonnage for time and distance work', () => {
    expect(effectiveLoadKg(set(), 'duration', 80)).toBeNull();
    expect(effectiveLoadKg(set(), 'distance_duration', 80)).toBeNull();
  });
});

describe('setVolumeKg', () => {
  it('is load x reps', () => {
    expect(setVolumeKg(set(), ctx())).toBe(500);
  });

  it('ignores sets that were never completed', () => {
    expect(setVolumeKg(set({ completed: false }), ctx())).toBe(0);
  });

  it('excludes warm-ups by default but includes them when asked', () => {
    const warm = set({ setType: 'warmup' });
    expect(setVolumeKg(warm, ctx({ countWarmups: false }))).toBe(0);
    expect(setVolumeKg(warm, ctx({ countWarmups: true }))).toBe(500);
  });

  it('still counts drop and failure sets', () => {
    expect(setVolumeKg(set({ setType: 'drop' }), ctx())).toBe(500);
    expect(setVolumeKg(set({ setType: 'failure' }), ctx())).toBe(500);
  });

  it('is zero for a plank rather than NaN', () => {
    const plank = set({ weightKg: null, reps: null, durationSec: 60 });
    expect(setVolumeKg(plank, ctx({ trackingType: 'duration' }))).toBe(0);
  });

  it('is zero when bodyweight is unknown', () => {
    const pushup = set({ weightKg: null, reps: 20 });
    expect(
      setVolumeKg(pushup, ctx({ trackingType: 'bodyweight_reps', bodyweightKg: null })),
    ).toBe(0);
  });
});

describe('totalVolumeKg', () => {
  it('sums a mixed session without float noise', () => {
    const sets = [
      set({ weightKg: 102.5, reps: 3 }),
      set({ weightKg: 102.5, reps: 3 }),
      set({ setType: 'warmup', weightKg: 40, reps: 8 }),
      set({ completed: false, weightKg: 102.5, reps: 3 }),
    ];
    // 2 x 307.5, warm-up and incomplete excluded.
    expect(totalVolumeKg(sets, ctx())).toBe(615);
  });

  it('is zero for an empty session', () => {
    expect(totalVolumeKg([], ctx())).toBe(0);
  });
});

describe('countedSets', () => {
  it('keeps only completed, counting sets', () => {
    const sets = [
      set(),
      set({ completed: false }),
      set({ setType: 'warmup' }),
      set({ setType: 'failure' }),
    ];
    expect(countedSets(sets, false)).toHaveLength(2);
    expect(countedSets(sets, true)).toHaveLength(3);
  });
});

describe('accumulateMuscleSets', () => {
  it('credits primary in full and secondary at half', () => {
    const out = accumulateMuscleSets([
      { primary: ['chest'], secondary: ['triceps', 'front_delts'], completedSets: 4 },
    ]);
    expect(out.get('chest')).toBe(4);
    expect(out.get('triceps')).toBe(2);
    expect(out.get('front_delts')).toBe(2);
  });

  it('adds across exercises', () => {
    const out = accumulateMuscleSets([
      { primary: ['chest'], secondary: ['triceps'], completedSets: 4 },
      { primary: ['triceps'], secondary: [], completedSets: 3 },
    ]);
    // 2 secondary + 3 primary
    expect(out.get('triceps')).toBe(5);
  });
});

describe('muscleDistribution', () => {
  it('returns fractions summing to 1', () => {
    const dist = muscleDistribution(
      new Map<Muscle, number>([
        ['chest', 6],
        ['biceps', 2],
        ['quads', 2],
      ]),
    );
    expect(dist.get('chest')).toBeCloseTo(0.6, 6);
    let sum = 0;
    for (const v of dist.values()) sum += v;
    expect(sum).toBeCloseTo(1, 6);
  });

  it('is empty rather than dividing by zero', () => {
    expect(muscleDistribution(new Map()).size).toBe(0);
    expect(muscleDistribution(new Map<Muscle, number>([['chest', 0]])).size).toBe(0);
  });
});
