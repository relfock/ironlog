import {
  caloriesFromMet,
  keytelKcalPerMin,
  metKcalPerMin,
  runningCaloriesKcal,
  sessionCaloriesFromHr,
  type CalorieProfile,
  type HrSample,
} from './calories';

const male = (age: number, bodyweightKg: number): CalorieProfile => ({
  sex: 'male',
  age,
  bodyweightKg,
});

describe('keytelKcalPerMin', () => {
  it('applies the male regression', () => {
    // (-55.0969 + 0.6309·150 + 0.1988·80 + 0.2017·30) / 4.184
    expect(keytelKcalPerMin(150, male(30, 80))).toBeCloseTo(14.697, 3);
  });

  it('applies the female regression', () => {
    // (-20.4022 + 0.4472·140 − 0.1263·55 + 0.074·30) / 4.184
    const p: CalorieProfile = { sex: 'female', age: 30, bodyweightKg: 55 };
    expect(keytelKcalPerMin(140, p)).toBeCloseTo(8.958, 3);
  });

  it('averages both regressions when sex is unknown', () => {
    const both = male(30, 80);
    const female: CalorieProfile = { sex: 'female', age: 30, bodyweightKg: 80 };
    const p: CalorieProfile = { sex: null, age: 30, bodyweightKg: 80 };
    const maleVal = keytelKcalPerMin(150, both);
    const femaleVal = keytelKcalPerMin(150, female);
    const avg = keytelKcalPerMin(150, p);
    expect(avg).not.toBeNull();
    expect(avg).toBeCloseTo((maleVal! + femaleVal!) / 2, 6);
  });

  it('clamps a negative regression to zero', () => {
    expect(keytelKcalPerMin(40, male(20, 60))).toBe(0);
  });

  it('returns null when a required input is missing', () => {
    expect(keytelKcalPerMin(150, { sex: 'male', age: null, bodyweightKg: 80 })).toBeNull();
    expect(keytelKcalPerMin(150, { sex: 'male', age: 30, bodyweightKg: null })).toBeNull();
    expect(keytelKcalPerMin(0, male(30, 80))).toBeNull();
  });
});

describe('metKcalPerMin and caloriesFromMet', () => {
  it('scales the MET formula by bodyweight', () => {
    // Moderate elliptical MET 5.0: 5 × 3.5 × 80 / 200 = 7.0 kcal/min.
    expect(metKcalPerMin(5.0, 80)).toBeCloseTo(7.0, 6);
  });

  it('estimates a whole session from duration', () => {
    expect(caloriesFromMet(5.0, 80, 30 * 60)).toBeCloseTo(210, 6);
  });

  it('returns null for unknown bodyweight', () => {
    expect(metKcalPerMin(5.0, 0)).toBeNull();
    expect(caloriesFromMet(5.0, 0, 600)).toBeNull();
  });
});

describe('runningCaloriesKcal', () => {
  it('scales the per-minute HR burn by elapsed time', () => {
    const kcal = runningCaloriesKcal(600, 150, male(30, 80));
    expect(kcal).toBeCloseTo((14.697 * 10), 1);
  });

  it('falls back to moderate MET when no HR data', () => {
    const kcal = runningCaloriesKcal(600, null, male(30, 80));
    expect(kcal).toBeCloseTo(7.0 * 10, 1);
  });

  it('returns null when nothing is computable', () => {
    expect(
      runningCaloriesKcal(600, null, { sex: null, age: null, bodyweightKg: null }),
    ).toBeNull();
  });
});

describe('sessionCaloriesFromHr', () => {
  const profile = male(30, 80);
  const now = 1_700_000_000_000;

  it('integrates per-minute HR samples', () => {
    const samples: HrSample[] = [1, 2, 3].map((m) => ({
      recordedAt: now + m * 60_000,
      bpm: 150,
    }));
    const kcal = sessionCaloriesFromHr(samples, profile);
    expect(kcal).toBeCloseTo((14.697 * 2), 1);
  });

  it('skips gaps longer than five minutes', () => {
    const samples: HrSample[] = [
      { recordedAt: now, bpm: 140 },
      { recordedAt: now + 10 * 60_000, bpm: 150 },
      { recordedAt: now + 11 * 60_000, bpm: 150 },
    ];
    const kcal = sessionCaloriesFromHr(samples, profile);
    // Only the final one-minute stride counts.
    expect(kcal).toBeCloseTo(14.697, 1);
  });

  it('returns null with fewer than two samples or a missing profile', () => {
    expect(sessionCaloriesFromHr([{ recordedAt: now, bpm: 140 }], profile)).toBeNull();
    expect(
      sessionCaloriesFromHr(
        [
          { recordedAt: now, bpm: 140 },
          { recordedAt: now + 60_000, bpm: 150 },
        ],
        { sex: 'male', age: null, bodyweightKg: 80 },
      ),
    ).toBeNull();
  });
});