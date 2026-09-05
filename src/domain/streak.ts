/**
 * Workout consistency: weekly streaks and the calendar heatmap.
 *
 * All bucketing is done in LOCAL time, because "did I train on Tuesday" is a
 * question about the user's calendar, not UTC. Using UTC here would shift
 * workouts into the wrong day for anyone west of Greenwich.
 */

/** 0 = Sunday … 1 = Monday. */
export type WeekStart = 0 | 1;

/** Local midnight at the start of the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight at the start of the week containing `ms`. */
export function startOfLocalWeek(ms: number, weekStart: WeekStart = 1): number {
  const d = new Date(startOfLocalDay(ms));
  const dow = d.getDay();
  const diff = (dow - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  // Re-normalise: DST transitions can move the clock off midnight.
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Milliseconds in a day and a week, for bucketing windows. */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Local midnight at the start of the month containing `ms`. */
export function startOfLocalMonth(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  return startOfLocalDay(d.getTime());
}

/**
 * The week-start dates (in `weekStart` terms) of every week-grid row a month
 * needs — the weeks that intersect the month. Months always render in 4–6 rows
 * whatever weekday they start on.
 */
export function weeksOfMonth(monthStartMs: number, weekStart: WeekStart = 1): number[] {
  const firstOfMonth = new Date(startOfLocalMonth(monthStartMs));
  const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);
  const gridStart = startOfLocalWeek(firstOfMonth.getTime(), weekStart);
  const gridEnd = startOfLocalWeek(lastOfMonth.getTime(), weekStart);
  const out: number[] = [];
  const cursor = new Date(gridStart);
  while (cursor.getTime() <= gridEnd) {
    out.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

const MONTH_ABBREV = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/**
 * "AUG 30 - SEP 5" — the readable label for a selected week (spanning from
 * its Monday/Sunday to the following weekend day). The year is rendered
 * separately via {@link weekYear}.
 */
export function formatWeekSpan(weekStartMs: number): string {
  const start = new Date(weekStartMs);
  const end = new Date(weekStartMs + 6 * DAY_MS);
  return `${MONTH_ABBREV[start.getMonth()]} ${start.getDate()} - ${MONTH_ABBREV[end.getMonth()]} ${end.getDate()}`;
}

/** Full year of the week's last day (e.g. "2026" for a Dec 29 – Jan 4 week). */
export function weekYear(weekStartMs: number): string {
  const end = new Date(weekStartMs + 6 * DAY_MS);
  return String(end.getFullYear());
}

/** "2026-08-31" in local time — the key used by the calendar heatmap. */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface WeekBucket {
  readonly weekStartMs: number;
  readonly workoutCount: number;
}

/**
 * Group workout timestamps into consecutive weekly buckets.
 * Weeks with no workouts are included as zero-count buckets, so streak logic
 * can simply walk the array without checking for gaps.
 */
export function groupByWeek(
  workoutTimestampsMs: readonly number[],
  weekStart: WeekStart = 1,
  nowMs: number = Date.now(),
): WeekBucket[] {
  if (workoutTimestampsMs.length === 0) return [];

  const counts = new Map<number, number>();
  for (const ts of workoutTimestampsMs) {
    const wk = startOfLocalWeek(ts, weekStart);
    counts.set(wk, (counts.get(wk) ?? 0) + 1);
  }

  const first = Math.min(...counts.keys());
  const last = startOfLocalWeek(nowMs, weekStart);
  const out: WeekBucket[] = [];

  const cursor = new Date(first);
  while (cursor.getTime() <= last) {
    const wk = startOfLocalWeek(cursor.getTime(), weekStart);
    out.push({ weekStartMs: wk, workoutCount: counts.get(wk) ?? 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export interface StreakResult {
  readonly currentWeeks: number;
  readonly longestWeeks: number;
  /** True when the current week has not yet hit the goal but still could. */
  readonly currentWeekPending: boolean;
}

/**
 * Weekly streak against a target number of workouts per week.
 *
 * The current week is treated as pending rather than failed: it would be
 * perverse to zero a 12-week streak at 00:01 on Monday. It counts toward the
 * streak once it meets the goal, and only breaks it once the week is over.
 */
export function weeklyStreak(
  buckets: readonly WeekBucket[],
  weeklyGoal: number,
  weekStart: WeekStart = 1,
  nowMs: number = Date.now(),
): StreakResult {
  const goal = Math.max(1, Math.floor(weeklyGoal));
  if (buckets.length === 0) {
    return { currentWeeks: 0, longestWeeks: 0, currentWeekPending: false };
  }

  const thisWeek = startOfLocalWeek(nowMs, weekStart);

  let longest = 0;
  let run = 0;
  for (const b of buckets) {
    if (b.workoutCount >= goal) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (b.weekStartMs !== thisWeek) {
      run = 0;
    }
  }

  // Walk backwards for the current streak.
  let current = 0;
  let pending = false;
  for (let i = buckets.length - 1; i >= 0; i -= 1) {
    const b = buckets[i];
    if (b === undefined) break;
    const met = b.workoutCount >= goal;
    if (met) {
      current += 1;
      continue;
    }
    if (b.weekStartMs === thisWeek) {
      // Unfinished week: skip without breaking.
      pending = true;
      continue;
    }
    break;
  }

  return { currentWeeks: current, longestWeeks: longest, currentWeekPending: pending };
}

export interface HeatmapCell {
  readonly dayKey: string;
  readonly count: number;
}

/** Per-day workout counts for the calendar heatmap. */
export function calendarHeatmap(
  workoutTimestampsMs: readonly number[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const ts of workoutTimestampsMs) {
    const key = localDayKey(ts);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export interface HeatmapDay {
  readonly dayKey: string;
  readonly count: number;
  /** A day that has not happened yet, rendered as an empty slot. */
  readonly inFuture: boolean;
}

/**
 * Build the calendar-heatmap grid: one column per week, seven days per column,
 * oldest week first.
 *
 * `inFuture` is compared at DAY granularity, not as an instant. An earlier
 * version anchored each cell to 12:00 local (to sit safely inside the day) and
 * then compared that against `Date.now()` — which marked TODAY as "in the
 * future" any time before midday, so the current day never lit up before noon.
 */
export function calendarColumns(
  workoutTimestampsMs: readonly number[],
  weeksShown: number,
  weekStart: WeekStart = 1,
  nowMs: number = Date.now(),
): HeatmapDay[][] {
  const counts = calendarHeatmap(workoutTimestampsMs);
  const today = startOfLocalDay(nowMs);
  const thisWeekStart = startOfLocalWeek(nowMs, weekStart);
  const columns: HeatmapDay[][] = [];

  for (let w = weeksShown - 1; w >= 0; w -= 1) {
    const anchor = new Date(thisWeekStart);
    anchor.setDate(anchor.getDate() - w * 7);

    const days: HeatmapDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(anchor);
      day.setDate(day.getDate() + d);
      // Midday keeps the date stable across DST shifts.
      day.setHours(12, 0, 0, 0);
      const key = localDayKey(day.getTime());
      days.push({
        dayKey: key,
        count: counts.get(key) ?? 0,
        inFuture: startOfLocalDay(day.getTime()) > today,
      });
    }
    columns.push(days);
  }

  return columns;
}

/** Consecutive-DAY streak, for the "days in a row" stat. */
export function dailyStreak(
  workoutTimestampsMs: readonly number[],
  nowMs: number = Date.now(),
): number {
  if (workoutTimestampsMs.length === 0) return 0;
  const days = new Set(workoutTimestampsMs.map((ts) => startOfLocalDay(ts)));

  const today = startOfLocalDay(nowMs);
  const cursor = new Date(today);
  // A rest day today should not zero the streak until tomorrow.
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(startOfLocalDay(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
