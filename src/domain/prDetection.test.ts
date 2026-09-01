import {
  applyPrs,
  detectPrs,
  headlinePr,
  type PrDetectionOptions,
  type PrKind,
  type RecordBook,
} from './prDetection';
import type { LoggedSet } from './types';

function set(over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    durationSec: null,
    distanceM: null,
    rpe: null,
    completed: true,
    ...over,
  };
}

const opts = (over: Partial<PrDetectionOptions> = {}): PrDetectionOptions => ({
  trackingType: 'weight_reps',
  bodyweightKg: 80,
  countWarmups: false,
  ...over,
});

const book = (entries: [PrKind, number][] = []): RecordBook => new Map(entries);

describe('detectPrs', () => {
  it('records everything on a brand-new exercise', () => {
    const prs = detectPrs(set(), book(), opts());
    const kinds = prs.map((p) => p.kind).sort();
    expect(kinds).toEqual(['best_1rm', 'best_set_volume', 'max_reps', 'max_weight']);
    expect(prs.find((p) => p.kind === 'max_weight')!.value).toBe(100);
    expect(prs.find((p) => p.kind === 'best_set_volume')!.value).toBe(500);
    expect(prs.find((p) => p.kind === 'previous' as PrKind)).toBeUndefined();
  });

  it('does NOT re-set a record that is merely matched', () => {
    // Repeating last week's exact top set should not fire a PR banner.
    const records = book([
      ['max_weight', 100],
      ['best_1rm', 116.666667],
      ['max_reps', 5],
      ['best_set_volume', 500],
    ]);
    expect(detectPrs(set(), records, opts())).toEqual([]);
  });

  it('fires only for the metric actually beaten', () => {
    const records = book([
      ['max_weight', 100],
      ['best_1rm', 200],
      ['max_reps', 20],
      ['best_set_volume', 5000],
    ]);
    // Heavier single but worse everything else.
    const prs = detectPrs(set({ weightKg: 110, reps: 1 }), records, opts());
    expect(prs.map((p) => p.kind)).toEqual(['max_weight']);
    expect(prs[0]!.previous).toBe(100);
  });

  it('reports the previous value so the UI can show the delta', () => {
    const prs = detectPrs(set({ weightKg: 110 }), book([['max_weight', 100]]), opts());
    const pr = prs.find((p) => p.kind === 'max_weight')!;
    expect(pr.previous).toBe(100);
    expect(pr.value).toBe(110);
  });

  it('ignores incomplete sets', () => {
    expect(detectPrs(set({ completed: false }), book(), opts())).toEqual([]);
  });

  it('ignores warm-ups unless they are set to count', () => {
    const warm = set({ setType: 'warmup' });
    expect(detectPrs(warm, book(), opts({ countWarmups: false }))).toEqual([]);
    expect(detectPrs(warm, book(), opts({ countWarmups: true })).length).toBeGreaterThan(0);
  });

  it('handles duration PRs for a plank', () => {
    const plank = set({ weightKg: null, reps: null, durationSec: 90 });
    const prs = detectPrs(plank, book([['max_duration', 60]]), opts({ trackingType: 'duration' }));
    expect(prs.map((p) => p.kind)).toEqual(['max_duration']);
    expect(prs[0]!.value).toBe(90);
  });

  it('handles distance PRs', () => {
    const row = set({ weightKg: null, reps: null, durationSec: 600, distanceM: 2000 });
    const prs = detectPrs(
      row,
      book([['max_distance', 1500]]),
      opts({ trackingType: 'distance_duration' }),
    );
    expect(prs.map((p) => p.kind).sort()).toEqual(['max_distance', 'max_duration']);
  });

  it('uses assistance-adjusted load for assisted movements', () => {
    // 80 kg lifter with 30 kg assistance moves 50 kg, so 60 is still the record.
    const prs = detectPrs(
      set({ weightKg: 30 }),
      book([['max_weight', 60]]),
      opts({ trackingType: 'assisted_bodyweight' }),
    );
    expect(prs.map((p) => p.kind)).not.toContain('max_weight');
  });
});

describe('headlinePr', () => {
  it('prefers a heavier top set over a volume record', () => {
    const prs = detectPrs(set({ weightKg: 110 }), book(), opts());
    expect(headlinePr(prs)!.kind).toBe('max_weight');
  });

  it('falls back to reps when there is no weight record', () => {
    const bw = set({ weightKg: null, reps: 30 });
    const prs = detectPrs(
      bw,
      book([['max_weight', 999]]),
      opts({ trackingType: 'bodyweight_reps', bodyweightKg: null }),
    );
    expect(headlinePr(prs)!.kind).toBe('max_reps');
  });

  it('returns null for no PRs', () => {
    expect(headlinePr([])).toBeNull();
  });
});

describe('applyPrs', () => {
  it('folds new records in without mutating the original', () => {
    const original = book([['max_weight', 100]]);
    const prs = detectPrs(set({ weightKg: 110 }), original, opts());
    const next = applyPrs(original, prs);
    expect(next.get('max_weight')).toBe(110);
    expect(original.get('max_weight')).toBe(100); // untouched
  });

  it('is idempotent', () => {
    const records = book();
    const prs = detectPrs(set(), records, opts());
    const once = applyPrs(records, prs);
    const twice = applyPrs(once, prs);
    expect([...twice.entries()].sort()).toEqual([...once.entries()].sort());
  });
});
