import {
  DEFAULT_HR_ZONES,
  estimateMaxHr,
  hrZone,
  HR_ZONES,
  zoneIndexForHr,
  zoneSetFromBoundaries,
  zoneSplitSeconds,
} from './heartRateZones';

describe('HR_ZONES', () => {
  it('defines the six zones Z0–Z5 in order', () => {
    expect(HR_ZONES.map((z) => z.label)).toEqual(['Z0', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
    expect(HR_ZONES.map((z) => z.min)).toEqual([0.3, 0.5, 0.6, 0.7, 0.8, 0.9]);
  });
});

describe('zoneIndexForHr', () => {
  // maxHr = 100 turns every fraction into a percentage directly.
  it.each([
    [35, 0],
    [49, 0],
    [50, 1],
    [59, 1],
    [60, 2],
    [69, 2],
    [70, 3],
    [80, 4],
    [90, 5],
    [100, 5],
  ])('maps %d%% of max HR to Z%d', (pct, expected) => {
    expect(zoneIndexForHr(pct, 100)).toBe(expected);
  });

  it('uses a custom boundary set when provided', () => {
    const custom = zoneSetFromBoundaries([
      { min: 0.1, max: 0.4 },
      { min: 0.4, max: 0.5 },
      { min: 0.5, max: 0.6 },
      { min: 0.6, max: 0.7 },
      { min: 0.7, max: 0.85 },
      { min: 0.85, max: 1.05 },
    ]);
    expect(zoneIndexForHr(20, 100, custom)).toBe(0);
    expect(zoneIndexForHr(45, 100, custom)).toBe(1);
    expect(zoneIndexForHr(80, 100, custom)).toBe(4);
  });

  it('returns null outside the band ceiling or below the floor', () => {
    expect(zoneIndexForHr(29, 100)).toBeNull();
    expect(zoneIndexForHr(110, 100)).toBeNull();
  });

  it('returns null for non-positive or non-finite inputs', () => {
    expect(zoneIndexForHr(0, 180)).toBeNull();
    expect(zoneIndexForHr(120, 0)).toBeNull();
    expect(zoneIndexForHr(Number.NaN, 180)).toBeNull();
  });
});

describe('hrZone', () => {
  it('resolves a bpm to its zone', () => {
    expect(hrZone(150, 200)).toEqual(
      expect.objectContaining({ label: 'Z3', name: 'Tempo', color: '#F0C800' }),
    );
    expect(hrZone(70, 200)).toEqual(expect.objectContaining({ label: 'Z0' }));
    expect(hrZone(500, 200)).toBeNull();
  });
});

describe('estimateMaxHr', () => {
  it('uses the Tanaka regression by default', () => {
    expect(estimateMaxHr(30, null)).toBe(187);
    expect(estimateMaxHr(30, 'male')).toBe(187);
  });

  it('uses the Gulati regression for women', () => {
    expect(estimateMaxHr(30, 'female')).toBe(180);
  });

  it('returns null when age is unknown or implausible', () => {
    expect(estimateMaxHr(NaN, 'male')).toBeNull();
    expect(estimateMaxHr(0, 'male')).toBeNull();
    expect(estimateMaxHr(200, 'male')).toBeNull();
  });
});

describe('zoneSetFromBoundaries', () => {
  it('keeps labels, names and colours while applying custom boundaries', () => {
    const custom = zoneSetFromBoundaries(
      [
        { min: 0.1, max: 0.4 },
        { min: 0.4, max: 0.5 },
        { min: 0.5, max: 0.6 },
        { min: 0.6, max: 0.7 },
        { min: 0.7, max: 0.85 },
        { min: 0.85, max: 1.05 },
      ],
      DEFAULT_HR_ZONES,
    );
    expect(custom.map((z) => z.label)).toEqual(['Z0', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
    expect(custom[0]).toMatchObject({ min: 0.1, max: 0.4, color: '#8AA2B0' });
    expect(custom[4]).toMatchObject({ min: 0.7, max: 0.85 });
  });

  it('falls back to defaults for missing or wrong-length input', () => {
    expect(zoneSetFromBoundaries(undefined)).toBe(DEFAULT_HR_ZONES);
    expect(zoneSetFromBoundaries([])).toBe(DEFAULT_HR_ZONES);
    expect(zoneSetFromBoundaries([{ min: 0, max: 1 }])).toBe(DEFAULT_HR_ZONES);
  });

  it('clamps out-of-range boundaries and repairs inverted maxima', () => {
    const custom = zoneSetFromBoundaries([
      { min: 2, max: 3 },
      { min: 0, max: -1 },
      { min: 0.5, max: 0.5 },
      { min: 0.7, max: 0.8 },
      { min: 0.8, max: 0.9 },
      { min: 0.9, max: 1.05 },
    ]);
    expect(custom[0]!.max).toBeLessThanOrEqual(1.05);
    expect(custom[1]!.max).toBeGreaterThan(custom[1]!.min);
    expect(custom[2]!.max).toBeGreaterThan(custom[2]!.min);
  });
});

describe('zoneSplitSeconds', () => {
  // maxHr 200 → Z2 is 120–139 bpm, Z3 is 140–159 bpm.
  const z2 = 120;
  const z3 = 150;

  it('attributes a single-zone trace to that zone, totalling the span', () => {
    const samples = [
      { recordedAt: 0, bpm: z3 },
      { recordedAt: 5000, bpm: z3 },
      { recordedAt: 10000, bpm: z3 },
    ];
    const split = zoneSplitSeconds(samples, 200);
    expect(split).toEqual([0, 0, 0, 10, 0, 0]);
  });

  it('splits time across zones by each sample residency', () => {
    const samples = [
      { recordedAt: 0, bpm: z3 }, // Z3 (index 3)
      { recordedAt: 5000, bpm: z2 }, // Z2 (index 2)
      { recordedAt: 10000, bpm: z2 }, // Z2
    ];
    const split = zoneSplitSeconds(samples, 200);
    // t0→t5 in Z3 (5s), t5→t10 in Z2 (5s).
    expect(split).toEqual([0, 0, 5, 5, 0, 0]);
  });

  it('returns a six-entry split honoring custom boundaries', () => {
    const custom = zoneSetFromBoundaries([
      { min: 0.3, max: 0.6 },
      { min: 0.6, max: 0.7 },
      { min: 0.7, max: 0.8 },
      { min: 0.8, max: 0.9 },
      { min: 0.9, max: 1.0 },
      { min: 1.0, max: 1.05 },
    ]);
    // 130/200 = 0.65 → now falls in Z1 (0.6–0.7 under the custom set).
    const samples = [
      { recordedAt: 0, bpm: 130 },
      { recordedAt: 5000, bpm: 130 },
      { recordedAt: 10000, bpm: 130 },
    ];
    expect(zoneSplitSeconds(samples, 200, custom)).toEqual([0, 10, 0, 0, 0, 0]);
  });

  it('returns null with no samples or a bad ceiling', () => {
    expect(zoneSplitSeconds([], 200)).toBeNull();
    expect(zoneSplitSeconds([{ recordedAt: 0, bpm: 150 }], 0)).toBeNull();
    expect(zoneSplitSeconds([{ recordedAt: 0, bpm: 150 }], Number.NaN)).toBeNull();
  });
});
