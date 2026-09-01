import {
  defaultPlateSetup,
  formatPerSide,
  smallestIncrement,
  snapToLoadable,
  solvePlates,
  type PlateSetup,
} from './plateCalculator';
import { lbToKg } from './units';

const KG = defaultPlateSetup('kg'); // 20 kg bar
const LB = defaultPlateSetup('lb'); // 45 lb bar

describe('solvePlates (kg)', () => {
  it('solves a round 100 kg', () => {
    const s = solvePlates(100, KG);
    // (100 - 20) / 2 = 40 per side = 25 + 15
    expect(s.perSide).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
    ]);
    expect(s.achievedTotal).toBe(100);
    expect(s.exact).toBe(true);
  });

  it('solves an awkward 102.5 kg down to the 1.25 change plate', () => {
    const s = solvePlates(102.5, KG);
    // 41.25 per side = 25 + 15 + 1.25
    expect(s.perSide).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
      { weight: 1.25, count: 1 },
    ]);
    expect(s.achievedTotal).toBe(102.5);
    expect(s.exact).toBe(true);
  });

  it('stacks multiples of the biggest plate', () => {
    const s = solvePlates(220, KG);
    // 100 per side = 4 x 25
    expect(s.perSide).toEqual([{ weight: 25, count: 4 }]);
    expect(s.exact).toBe(true);
  });

  it('reports the bare bar with nothing loaded', () => {
    const s = solvePlates(20, KG);
    expect(s.perSide).toEqual([]);
    expect(s.exact).toBe(true);
    expect(s.belowBar).toBe(false);
    expect(formatPerSide(s)).toBe('bar only');
  });

  it('flags a target below the bar instead of returning negative plates', () => {
    const s = solvePlates(15, KG);
    expect(s.belowBar).toBe(true);
    expect(s.perSide).toEqual([]);
    expect(s.achievedTotal).toBe(20);
    expect(s.remainder).toBe(5);
  });

  it('reports the shortfall when the target is not loadable', () => {
    const s = solvePlates(101, KG); // 40.5/side; smallest plate is 1.25
    expect(s.exact).toBe(false);
    expect(s.achievedTotal).toBe(100);
    // 0.5 short per side = 1 kg short on the bar.
    expect(s.remainder).toBeCloseTo(1, 6);
  });

  it('respects a limited plate inventory', () => {
    const sparse: PlateSetup = {
      unit: 'kg',
      barWeight: 20,
      plates: [
        { weight: 20, pairs: 1 },
        { weight: 10, pairs: 1 },
      ],
    };
    // Wants 40/side but owns only one 20 pair and one 10 pair = 30/side.
    const s = solvePlates(100, sparse);
    expect(s.perSide).toEqual([
      { weight: 20, count: 1 },
      { weight: 10, count: 1 },
    ]);
    expect(s.achievedTotal).toBe(80);
    expect(s.exact).toBe(false);
  });

  it('never emits a zero-count group', () => {
    const s = solvePlates(200, KG);
    for (const g of s.perSide) expect(g.count).toBeGreaterThan(0);
  });
});

describe('solvePlates (lb)', () => {
  it('solves the classic 225 lb', () => {
    // Target arrives in canonical kg, so convert first.
    const s = solvePlates(lbToKg(225), LB);
    expect(s.perSide).toEqual([{ weight: 45, count: 2 }]);
    expect(s.achievedTotal).toBe(225);
    expect(s.exact).toBe(true);
    expect(s.unit).toBe('lb');
  });

  it('solves 315 lb as three 45s a side', () => {
    const s = solvePlates(lbToKg(315), LB);
    expect(s.perSide).toEqual([{ weight: 45, count: 3 }]);
    expect(s.exact).toBe(true);
  });

  it('formats a mixed load compactly', () => {
    const s = solvePlates(lbToKg(185), LB); // 70/side = 45 + 25
    expect(formatPerSide(s)).toBe('1×45 + 1×25');
  });
});

describe('increments and snapping', () => {
  it('smallest increment is twice the smallest plate', () => {
    expect(smallestIncrement(KG)).toBe(2.5); // 2 x 1.25
    expect(smallestIncrement(LB)).toBe(5); // 2 x 2.5
  });

  it('returns 0 for an empty rack', () => {
    expect(smallestIncrement({ unit: 'kg', barWeight: 20, plates: [] })).toBe(0);
  });

  it('snaps to a loadable weight', () => {
    expect(snapToLoadable(101, KG)).toBe(100);
    expect(snapToLoadable(101.5, KG)).toBe(102.5);
    expect(snapToLoadable(10, KG)).toBe(20); // clamps up to the bar
  });
});
