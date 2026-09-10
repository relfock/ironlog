/** A point along the HR curve, in canvas space. `xValue` is the raw (un-scaled)
 * x data value (epoch ms) and `yValue` is the raw HR — both survive the
 * densification so victory's `Line` and zone colouring work correctly. */
export interface CurvePoint {
  x: number;
  y: number;
  xValue: number;
  yValue: number;
}

/**
 * Fritsch–Carlson monotone-cubic interpolation. The HR curves are drawn with
 * victory's `monotoneX` smoothing, but victory only smooths *within* each
 * painted segment: splitting the curve into per-zone runs (separate `<Line>`s)
 * leaves angular joins where the zone colour changes, and a fill polygon whose
 * top edge connects the raw control points with straight chords sags below the
 * true curve at valleys — leaving gaps between the smooth trace and the fill.
 *
 * Resampling the curve on the same monotone-cubic frames (~2 px/piece) and
 * drawing the result with straight segments reproduces the smooth curve with
 * no corner artefacts and lets the fill hug it exactly.
 */
export function densifyMonotone(points: readonly CurvePoint[]): CurvePoint[] {
  const n = points.length;
  if (n === 0) return [];
  if (n < 2) {
    const p = points[0]!;
    return [{ x: p.x, y: p.y, xValue: p.xValue, yValue: p.yValue }];
  }

  // Strictly increasing x is required; HR traces only ever append in time, so
  // a violation means something pathological — fall back to the raw points.
  for (let i = 1; i < n; i++) {
    if (points[i]!.x <= points[i - 1]!.x) {
      return (points as CurvePoint[]).slice();
    }
  }

  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1]!.x - points[i]!.x;
    const dy = points[i + 1]!.y - points[i]!.y;
    h.push(dx > 0 ? dx : 1e-6);
    s.push(dy / h[i]!);
  }

  // Knot tangents in dy/dx units, flattened at local extrema and clamped (3x
  // rule) so each interval stays monotone and the curve never overshoots.
  const m = new Array<number>(n).fill(0);
  m[0] = s[0]!;
  m[n - 1] = s[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const sp = s[i - 1]!;
    const sn = s[i]!;
    if (sp * sn <= 0) {
      m[i] = 0;
      continue;
    }
    let tg = (sp * h[i]! + sn * h[i - 1]!) / (h[i - 1]! + h[i]!);
    const lim = 3 * Math.min(Math.abs(sp), Math.abs(sn));
    if (Math.abs(tg) > lim) tg = lim * Math.sign(tg);
    m[i] = tg;
  }

  const out: CurvePoint[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const steps = Math.max(2, Math.min(8, Math.round(dx / 2)));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push(hermite(a, b, m[i]!, m[i + 1]!, t, dx));
    }
  }
  const last = points[n - 1]!;
  out.push({ x: last.x, y: last.y, xValue: last.xValue, yValue: last.yValue });
  return out;
}

function hermite(
  a: CurvePoint,
  b: CurvePoint,
  m0: number,
  m1: number,
  t: number,
  dx: number,
): CurvePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h01 = -2 * t3 + 3 * t2;
  const h10 = t3 - 2 * t2 + t;
  const h11 = t3 - t2;
  return {
    x: a.x + t * dx,
    y: h00 * a.y + h01 * b.y + dx * (m0 * h10 + m1 * h11),
    xValue: a.xValue + t * (b.xValue - a.xValue),
    yValue: a.yValue + t * (b.yValue - a.yValue),
  };
}