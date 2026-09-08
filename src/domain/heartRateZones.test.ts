import {
  estimateMaxHr,
  hrZone,
  HR_ZONES,
  zoneIndexForHr,
} from './heartRateZones';

describe('HR_ZONES', () => {
  it('defines the five-band WHOOP-style model in order', () => {
    expect(HR_ZONES.map((z) => z.label)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
    expect(HR_ZONES.map((z) => z.min)).toEqual([0.5, 0.6, 0.7, 0.8, 0.9]);
  });
});

describe('zoneIndexForHr', () => {
  it.each([
    [0.5, 1],
    [0.59, 1],
    [0.6, 2],
    [0.699, 2],
    [0.7, 3],
    [0.8, 4],
    [0.9, 5],
    [1.04, 5],
  ])('maps %f of max HR to zone %i', (ratio, expected) => {
    expect(zoneIndexForHr(100 * ratio, 100)).toBe(expected);
  });

  it('returns null outside the band ceiling', () => {
    expect(zoneIndexForHr(49, 100)).toBeNull();
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
    expect(hrZone(211, 200)).toBeNull();
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