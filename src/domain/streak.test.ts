import {
  calendarColumns,
  calendarHeatmap,
  dailyStreak,
  formatWeekSpan,
  groupByWeek,
  localDayKey,
  startOfLocalDay,
  startOfLocalMonth,
  startOfLocalWeek,
  sevenDayWindowStart,
  weekYear,
  weeksOfMonth,
  weeklyStreak,
  WEEK_MS,
} from './streak';

/**
 * Timestamps are built by walking real Date objects rather than adding
 * 86_400_000, so these tests stay correct across DST boundaries and in any
 * timezone the CI machine happens to be in.
 */
function daysFrom(anchorMs: number, days: number): number {
  const d = new Date(anchorMs);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0); // midday, safely inside the local day
  return d.getTime();
}

const NOW = new Date(2026, 7, 31, 15, 0, 0).getTime(); // 31 Aug 2026, local

describe('local-time bucketing', () => {
  it('startOfLocalDay lands on local midnight', () => {
    const d = new Date(startOfLocalDay(NOW));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(new Date(NOW).getDate());
  });

  it('startOfLocalWeek respects the week-start preference', () => {
    const mon = new Date(startOfLocalWeek(NOW, 1));
    expect(mon.getDay()).toBe(1);
    const sun = new Date(startOfLocalWeek(NOW, 0));
    expect(sun.getDay()).toBe(0);
    expect(sun.getTime()).toBeLessThanOrEqual(mon.getTime());
  });

  it('is idempotent', () => {
    const w = startOfLocalWeek(NOW, 1);
    expect(startOfLocalWeek(w, 1)).toBe(w);
  });

  it('localDayKey formats as YYYY-MM-DD in local time', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 30).getTime())).toBe('2026-01-05');
    // 00:30 local is still that local day, even though it may be the previous
    // day in UTC.
    expect(localDayKey(new Date(2026, 0, 5, 0, 30).getTime())).toBe('2026-01-05');
  });

  it('sevenDayWindowStart is the midnight six calendar days before `ms`', () => {
    // 31 Aug 2026 is a Monday; the 7-day window ending that day ran from the
    // previous Tuesday. A Monday lookback therefore still includes Sunday.
    const s = new Date(sevenDayWindowStart(NOW));
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getDate()).toBe(25);
    expect(s.getMonth()).toBe(7); // August
    // The window [start, start + 7d) always contains `ms`.
    expect(sevenDayWindowStart(NOW)).toBeLessThanOrEqual(NOW);
    expect(sevenDayWindowStart(NOW) + WEEK_MS).toBeGreaterThan(NOW);
  });
});

describe('week-span helpers', () => {
  it('formatWeekSpan renders the range for a Monday-start week', () => {
    const week = startOfLocalWeek(NOW, 1);
    expect(formatWeekSpan(week)).toBe('AUG 31 - SEP 6');
  });

  it('formatWeekSpan repeats the month and renders no year', () => {
    expect(formatWeekSpan(new Date(2026, 7, 24).getTime())).toBe('AUG 24 - AUG 30');
    // Week spanning New Year: Mon 29 Dec 2025 -> Sun 4 Jan 2026.
    expect(formatWeekSpan(new Date(2025, 11, 29).getTime())).toBe('DEC 29 - JAN 4');
  });

  it('weekYear reports the year of the week-end day', () => {
    expect(weekYear(new Date(2026, 7, 24).getTime())).toBe('2026');
    expect(weekYear(new Date(2025, 11, 29).getTime())).toBe('2026');
  });

  it('startOfLocalMonth returns local midnight on the first', () => {
    const d = new Date(startOfLocalMonth(new Date(2026, 7, 17, 14, 30).getTime()));
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(7);
    expect(d.getHours()).toBe(0);
  });

  it('weeksOfMonth covers every week row the month needs', () => {
    // Aug 2026 starts on a Saturday, so the grid opens with Mon 27 Jul.
    const aug = weeksOfMonth(new Date(2026, 7, 1).getTime(), 1);
    expect(aug[0]).toBe(new Date(2026, 6, 27).getTime());
    expect(aug[aug.length - 1]).toBe(new Date(2026, 7, 31).getTime());

    // Sep 2026 starts on a Tuesday and ends on a Wednesday -> five rows.
    const sep = weeksOfMonth(new Date(2026, 8, 1).getTime(), 1);
    expect(sep).toHaveLength(5);
    expect(sep[0]).toBe(new Date(2026, 7, 31).getTime());
  });
});

describe('groupByWeek', () => {
  it('emits zero-count buckets for weeks with no training', () => {
    const thisWeek = startOfLocalWeek(NOW, 1);
    const ts = [daysFrom(thisWeek, -21), daysFrom(thisWeek, 1)];
    const buckets = groupByWeek(ts, 1, NOW);
    expect(buckets).toHaveLength(4); // 3 weeks ago .. this week
    expect(buckets[0]!.workoutCount).toBe(1);
    expect(buckets[1]!.workoutCount).toBe(0);
    expect(buckets[2]!.workoutCount).toBe(0);
    expect(buckets[3]!.workoutCount).toBe(1);
  });

  it('counts several workouts in the same week', () => {
    const thisWeek = startOfLocalWeek(NOW, 1);
    const buckets = groupByWeek(
      [daysFrom(thisWeek, 0), daysFrom(thisWeek, 2), daysFrom(thisWeek, 4)],
      1,
      NOW,
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.workoutCount).toBe(3);
  });

  it('is empty for no history', () => {
    expect(groupByWeek([], 1, NOW)).toEqual([]);
  });
});

describe('weeklyStreak', () => {
  const thisWeek = startOfLocalWeek(NOW, 1);

  function history(weeksAgoCounts: number[]): number[] {
    // index 0 = oldest week
    const ts: number[] = [];
    const weeks = weeksAgoCounts.length;
    weeksAgoCounts.forEach((count, i) => {
      const weekOffset = -(weeks - 1 - i);
      for (let n = 0; n < count; n += 1) {
        ts.push(daysFrom(thisWeek, weekOffset * 7 + n));
      }
    });
    return ts;
  }

  it('counts consecutive weeks that hit the goal', () => {
    const buckets = groupByWeek(history([3, 3, 3]), 1, NOW);
    const r = weeklyStreak(buckets, 3, 1, NOW);
    expect(r.currentWeeks).toBe(3);
    expect(r.longestWeeks).toBe(3);
  });

  it('does NOT break the streak just because the current week is unfinished', () => {
    // Two good weeks, then Monday morning of this week with nothing logged.
    const buckets = groupByWeek(history([3, 3, 0]), 1, NOW);
    const r = weeklyStreak(buckets, 3, 1, NOW);
    expect(r.currentWeeks).toBe(2);
    expect(r.currentWeekPending).toBe(true);
  });

  it('breaks on a missed week that is over', () => {
    const buckets = groupByWeek(history([3, 3, 1, 3]), 1, NOW);
    const r = weeklyStreak(buckets, 3, 1, NOW);
    expect(r.currentWeeks).toBe(1); // only this week
    expect(r.longestWeeks).toBe(2); // the earlier pair
  });

  it('counts the current week once it meets the goal', () => {
    const buckets = groupByWeek(history([3, 3, 3]), 1, NOW);
    const r = weeklyStreak(buckets, 3, 1, NOW);
    expect(r.currentWeekPending).toBe(false);
    expect(r.currentWeeks).toBe(3);
  });

  it('treats exceeding the goal the same as meeting it', () => {
    const buckets = groupByWeek(history([5, 4]), 1, NOW);
    expect(weeklyStreak(buckets, 3, 1, NOW).currentWeeks).toBe(2);
  });

  it('is zero for no history', () => {
    const r = weeklyStreak([], 3, 1, NOW);
    expect(r).toEqual({ currentWeeks: 0, longestWeeks: 0, currentWeekPending: false });
  });

  it('treats a goal below 1 as 1 rather than dividing by nothing', () => {
    const buckets = groupByWeek(history([1, 1]), 1, NOW);
    expect(weeklyStreak(buckets, 0, 1, NOW).currentWeeks).toBe(2);
  });
});

describe('calendarHeatmap', () => {
  it('counts workouts per local day', () => {
    const a = new Date(2026, 7, 30, 9, 0).getTime();
    const b = new Date(2026, 7, 30, 18, 0).getTime();
    const c = new Date(2026, 7, 31, 9, 0).getTime();
    const map = calendarHeatmap([a, b, c]);
    expect(map.get('2026-08-30')).toBe(2);
    expect(map.get('2026-08-31')).toBe(1);
    expect(map.size).toBe(2);
  });
});

describe('dailyStreak', () => {
  it('counts consecutive days ending today', () => {
    const ts = [daysFrom(NOW, 0), daysFrom(NOW, -1), daysFrom(NOW, -2)];
    expect(dailyStreak(ts, NOW)).toBe(3);
  });

  it('does not zero the streak on a rest day today', () => {
    // Trained yesterday and the day before, nothing yet today.
    const ts = [daysFrom(NOW, -1), daysFrom(NOW, -2)];
    expect(dailyStreak(ts, NOW)).toBe(2);
  });

  it('breaks on a two-day gap', () => {
    const ts = [daysFrom(NOW, 0), daysFrom(NOW, -3)];
    expect(dailyStreak(ts, NOW)).toBe(1);
  });

  it('ignores duplicate workouts on one day', () => {
    const d = new Date(NOW);
    d.setHours(8, 0, 0, 0);
    const e = new Date(NOW);
    e.setHours(19, 0, 0, 0);
    expect(dailyStreak([d.getTime(), e.getTime()], NOW)).toBe(1);
  });

  it('is zero for no history', () => {
    expect(dailyStreak([], NOW)).toBe(0);
  });
});

describe('calendarColumns', () => {
  const weeksShown = 4;

  it('lights up TODAY even in the early morning', () => {
    // The regression this guards: anchoring cells to 12:00 and comparing against
    // Date.now() marked today as "in the future" all morning, so a workout
    // logged at 03:18 never appeared on the calendar.
    const earlyMorning = new Date(2026, 8, 1, 3, 18).getTime(); // 01 Sep, 03:18
    const workout = new Date(2026, 8, 1, 3, 10).getTime();

    const cols = calendarColumns([workout], weeksShown, 1, earlyMorning);
    const flat = cols.flat();
    const todayCell = flat.find((c) => c.dayKey === '2026-09-01');

    expect(todayCell).toBeDefined();
    expect(todayCell!.count).toBe(1);
    expect(todayCell!.inFuture).toBe(false);
  });

  it('still lights up today in the evening', () => {
    const evening = new Date(2026, 8, 1, 22, 0).getTime();
    const workout = new Date(2026, 8, 1, 19, 0).getTime();
    const cell = calendarColumns([workout], weeksShown, 1, evening)
      .flat()
      .find((c) => c.dayKey === '2026-09-01');
    expect(cell!.count).toBe(1);
    expect(cell!.inFuture).toBe(false);
  });

  it('marks later days in the current week as future', () => {
    // 01 Sep 2026 is a Tuesday, so Wed-Sun are still to come.
    const now = new Date(2026, 8, 1, 3, 18).getTime();
    const cols = calendarColumns([], weeksShown, 1, now);
    const thisWeek = cols[cols.length - 1]!;
    expect(thisWeek[0]!.inFuture).toBe(false); // Monday
    expect(thisWeek[1]!.inFuture).toBe(false); // Tuesday = today
    expect(thisWeek[2]!.inFuture).toBe(true); // Wednesday
    expect(thisWeek[6]!.inFuture).toBe(true); // Sunday
  });

  it('marks no past day as future', () => {
    const now = new Date(2026, 8, 1, 3, 18).getTime();
    const cols = calendarColumns([], weeksShown, 1, now);
    for (const col of cols.slice(0, cols.length - 1)) {
      for (const day of col) expect(day.inFuture).toBe(false);
    }
  });

  it('produces the requested grid shape', () => {
    const cols = calendarColumns([], 18, 1, Date.now());
    expect(cols).toHaveLength(18);
    for (const c of cols) expect(c).toHaveLength(7);
  });

  it('counts two workouts on the same day as 2', () => {
    const a = new Date(2026, 7, 31, 8, 0).getTime();
    const b = new Date(2026, 7, 31, 18, 0).getTime();
    const now = new Date(2026, 8, 1, 3, 18).getTime();
    const cell = calendarColumns([a, b], weeksShown, 1, now)
      .flat()
      .find((c) => c.dayKey === '2026-08-31');
    expect(cell!.count).toBe(2);
  });

  it('respects a Sunday week start', () => {
    const now = new Date(2026, 8, 1, 3, 18).getTime();
    const cols = calendarColumns([], weeksShown, 0, now);
    const first = cols[cols.length - 1]![0]!;
    expect(new Date(`${first.dayKey}T12:00:00`).getDay()).toBe(0);
  });
});
