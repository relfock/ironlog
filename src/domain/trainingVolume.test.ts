import { weeklySetsToHeatLevel, WEEKLY_SETS_ZONES } from './trainingVolume';

describe('weeklySetsToHeatLevel', () => {
  it('returns 0 (not lit) for no sets', () => {
    expect(weeklySetsToHeatLevel(0)).toBe(0);
  });

  it('is Low (4) for 1–4 weekly sets', () => {
    expect(weeklySetsToHeatLevel(1)).toBe(4);
    expect(weeklySetsToHeatLevel(4)).toBe(4);
  });

  it('is Moderate (3) for 5–9 weekly sets', () => {
    expect(weeklySetsToHeatLevel(5)).toBe(3);
    expect(weeklySetsToHeatLevel(9)).toBe(3);
  });

  it('is Optimal (2) for 10–20 weekly sets', () => {
    expect(weeklySetsToHeatLevel(10)).toBe(2);
    expect(weeklySetsToHeatLevel(20)).toBe(2);
  });

  it('is Very high (1) for 21+ weekly sets', () => {
    expect(weeklySetsToHeatLevel(21)).toBe(1);
    expect(weeklySetsToHeatLevel(100)).toBe(1);
  });

  it('handles fractional weekly averages sanely', () => {
    expect(weeklySetsToHeatLevel(4.5)).toBe(4);
    expect(weeklySetsToHeatLevel(9.5)).toBe(3);
    expect(weeklySetsToHeatLevel(20.5)).toBe(2);
  });

  it('guards against non-finite inputs', () => {
    expect(weeklySetsToHeatLevel(NaN)).toBe(0);
    expect(weeklySetsToHeatLevel(Infinity)).toBe(1);
  });

  it('is absolute, not relative to other muscles', () => {
    // 10 sets always lands in the same zone no matter what else is trained.
    expect(weeklySetsToHeatLevel(10)).toBe(weeklySetsToHeatLevel(10));
    expect(WEEKLY_SETS_ZONES.find((z) => z.heatLevel === 2)?.minWeeklySets).toBe(10);
  });
});