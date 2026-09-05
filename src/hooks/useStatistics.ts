import { useCallback, useEffect, useMemo, useState } from 'react';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { db } from '@/db/client';
import { exercises, workoutExercises, workoutSets, workouts } from '@/db/schema';
import {
  accumulateMuscleSets,
  muscleDistribution,
} from '@/domain/volume';
import { startOfLocalWeek, type WeekStart } from '@/domain/streak';
import { setTypeCountsForStats, type Muscle, type SetType } from '@/domain/types';
import { useSettings } from '@/stores/RootStore';
import { useWorkoutHistory } from './useHistory';

export interface WeeklyVolume {
  readonly weekStartMs: number;
  readonly volumeKg: number;
  readonly workoutCount: number;
}

export interface MuscleStats {
  /** Total work sets per muscle in the window (secondary muscles count half). */
  readonly setsPerMuscle: Map<Muscle, number>;
  /**
   * Average weekly work sets per muscle: the window total divided by its length
   * in weeks. This is the science-backed dose the heatmap zones are defined
   * against, so a muscle trained 13 sets in the last month averages ~3.3/week
   * and a single week with 13 sets averages 13/week.
   */
  readonly weeklySetsPerMuscle: Map<Muscle, number>;
  readonly distribution: Map<Muscle, number>;
}

/**
 * Aggregate statistics across all completed workouts.
 *
 * The per-week volume series comes from the denormalised `workouts.totalVolumeKg`
 * rather than re-summing every set — that column is written once at finish
 * precisely so this screen does not have to walk the whole set table.
 *
 * Muscle-group set counts DO need the join, since credit depends on each
 * exercise's muscle lists, but the query is bounded by a lookback window.
 */
export function useStatistics(
  weekStart: WeekStart,
  lookbackWeeks = 12,
): {
  weeklyVolume: WeeklyVolume[];
  muscle: MuscleStats;
  totalVolumeKg: number;
  totalWorkouts: number;
  loading: boolean;
  /** Force the muscle heatmap to re-read the database. Screens call this on focus. */
  reloadMuscle: () => void;
} {
  const { workouts: history, loading } = useWorkoutHistory(1000);

  const sinceMs = useMemo(() => {
    const anchor = new Date(startOfLocalWeek(Date.now(), weekStart));
    anchor.setDate(anchor.getDate() - (lookbackWeeks - 1) * 7);
    return anchor.getTime();
  }, [weekStart, lookbackWeeks]);

  const weeklyVolume = useMemo<WeeklyVolume[]>(() => {
    const byWeek = new Map<number, { volumeKg: number; workoutCount: number }>();

    // Seed every week in the window so gaps render as zero bars, not as
    // missing columns that make the axis lie about the time span.
    const cursor = new Date(sinceMs);
    const thisWeek = startOfLocalWeek(Date.now(), weekStart);
    while (cursor.getTime() <= thisWeek) {
      byWeek.set(startOfLocalWeek(cursor.getTime(), weekStart), {
        volumeKg: 0,
        workoutCount: 0,
      });
      cursor.setDate(cursor.getDate() + 7);
    }

    for (const w of history) {
      if (w.startedAt < sinceMs) continue;
      const key = startOfLocalWeek(w.startedAt, weekStart);
      const cell = byWeek.get(key);
      if (cell === undefined) continue;
      byWeek.set(key, {
        volumeKg: cell.volumeKg + w.totalVolumeKg,
        workoutCount: cell.workoutCount + 1,
      });
    }

    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([weekStartMs, v]) => ({ weekStartMs, ...v }));
  }, [history, sinceMs, weekStart]);

  // Muscle-group work-set counts over the same window.
  //
  // A bare `useLiveQuery` cannot be used here: Drizzle's implementation only
  // re-runs the query when the FROM table (`workout_sets`) changes, and edits
  // to a completed workout's exercise can touch only `workout_exercises`
  // (replacing or removing an exercise) or `exercises` (muscle mapping). The
  // hook below therefore reloads on ANY database write, plus on screen focus.
  const { rows, reload } = useMuscleRows(sinceMs);
  const settings = useSettings();

  // Belt-and-suspenders: when a workout is added or removed, `history` changes
  // (it is a live query on `workouts`), so force the muscle join to re-read.
  // This guarantees new workouts redraw the heatmap even if the native change
  // listener is dropped while this screen stays mounted.
  useEffect(() => {
    reload();
  }, [history.length, reload]);

  const countingRows = useMemo(
    () =>
      rows.filter((r) =>
        setTypeCountsForStats(r.setType as SetType, settings.values.countWarmupsInStats),
      ),
    [rows, settings.values.countWarmupsInStats],
  );

  const setsPerMuscle = useMemo<Map<Muscle, number>>(() => {
    if (countingRows.length === 0) return new Map();
    // Each row is one work set; credit it once to its muscle groups. Every set
    // of a workout exercise shares the same muscles.
    return accumulateMuscleSets(
      countingRows.map((r) => ({
        primary: r.primaryMuscles as Muscle[],
        secondary: r.secondaryMuscles as Muscle[],
        completedSets: 1,
      })),
    );
  }, [countingRows]);

  const weeklySetsPerMuscle = useMemo<Map<Muscle, number>>(() => {
    if (setsPerMuscle.size === 0) return new Map();
    const out = new Map<Muscle, number>();
    for (const [m, sets] of setsPerMuscle) {
      out.set(m, sets / lookbackWeeks);
    }
    return out;
  }, [setsPerMuscle, lookbackWeeks]);

  const muscle = useMemo<MuscleStats>(
    () => ({
      setsPerMuscle,
      weeklySetsPerMuscle,
      distribution: muscleDistribution(setsPerMuscle),
    }),
    [setsPerMuscle, weeklySetsPerMuscle],
  );

  const totalVolumeKg = useMemo(
    () => history.reduce((n, w) => n + w.totalVolumeKg, 0),
    [history],
  );

  return {
    weeklyVolume,
    muscle,
    totalVolumeKg,
    totalWorkouts: history.length,
    loading,
    /** Force the muscle heatmap to re-read the database. Screens call this on focus. */
    reloadMuscle: reload,
  };
}

/**
 * Reactive fetch of the completed-set → muscle join. Unlike Drizzle's
 * `useLiveQuery`, this re-runs on ANY database write (not just the FROM table)
 * and can be forced via `reload`, so replacing/removing an exercise or editing
 * a set's values always reaches the heatmap. `untilMs`, when given, bounds the
 * fetch to a single window (used by the week heatmap); without it the window
 * is "since `sinceMs` and forever".
 */
export function useMuscleRows(sinceMs: number, untilMs?: number): {
  rows: readonly {
    primaryMuscles: unknown;
    secondaryMuscles: unknown;
    setType: string;
  }[];
  reload: () => void;
} {
  const [rows, setRows] = useState<
    readonly {
      primaryMuscles: unknown;
      secondaryMuscles: unknown;
      setType: string;
    }[]
  >([]);
  const [version, setVersion] = useState(0);

  const query = useMemo(
    () =>
      db
        .select({
          primaryMuscles: exercises.primaryMuscles,
          secondaryMuscles: exercises.secondaryMuscles,
          setType: workoutSets.setType,
        })
        .from(workoutSets)
        .innerJoin(
          workoutExercises,
          eq(workoutSets.workoutExerciseId, workoutExercises.id),
        )
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
        .where(
          and(
            eq(workouts.status, 'completed'),
            eq(workouts.deleted, false),
            eq(workoutExercises.deleted, false),
            eq(workoutSets.completed, true),
            eq(workoutSets.deleted, false),
            gte(workouts.startedAt, sinceMs),
            ...(untilMs === undefined ? [] : [lt(workouts.startedAt, untilMs)]),
          ),
        ),
    [sinceMs, untilMs],
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void query.then((d) => {
        if (cancelled) return;
        setRows(
          d.map((r) => ({
            primaryMuscles: r.primaryMuscles,
            secondaryMuscles: r.secondaryMuscles,
            setType: r.setType,
          })),
        );
      });
    };
    load();
    // Any write can affect the heatmap. Filtering by table name risks missing
    // one (e.g. an exercise replacement may only touch `workout_exercises`), so
    // re-read on every change — this query is cheap and bounded by the window.
    const listener = addDatabaseChangeListener(() => load());
    return () => {
      cancelled = true;
      listener.remove();
    };
  }, [query, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { rows, reload };
}

/** Per-session best values for one exercise, for the progression charts. */
export interface ExerciseProgressPoint {
  readonly at: number;
  readonly maxWeightKg: number | null;
  readonly bestSetVolumeKg: number | null;
  readonly totalVolumeKg: number;
  readonly totalReps: number;
  readonly bestReps: number | null;
}

export function useExerciseProgress(exerciseId: string | undefined): {
  points: ExerciseProgressPoint[];
  loading: boolean;
} {
  const [points, setPoints] = useState<ExerciseProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (exerciseId === undefined) {
      setPoints([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      const rows = await db
        .select({
          startedAt: workouts.startedAt,
          weightKg: workoutSets.weightKg,
          reps: workoutSets.reps,
        })
        .from(workoutSets)
        .innerJoin(
          workoutExercises,
          eq(workoutSets.workoutExerciseId, workoutExercises.id),
        )
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(
          and(
            eq(workoutExercises.exerciseId, exerciseId),
            eq(workouts.status, 'completed'),
            eq(workouts.deleted, false),
            eq(workoutSets.completed, true),
            eq(workoutSets.deleted, false),
          ),
        )
        .orderBy(asc(workouts.startedAt));

      const bySession = new Map<number, ExerciseProgressPoint>();
      for (const r of rows) {
        const existing = bySession.get(r.startedAt) ?? {
          at: r.startedAt,
          maxWeightKg: null,
          bestSetVolumeKg: null,
          totalVolumeKg: 0,
          totalReps: 0,
          bestReps: null,
        };
        const setVolume =
          r.weightKg !== null && r.reps !== null ? r.weightKg * r.reps : 0;

        bySession.set(r.startedAt, {
          at: r.startedAt,
          maxWeightKg:
            r.weightKg === null
              ? existing.maxWeightKg
              : Math.max(existing.maxWeightKg ?? 0, r.weightKg),
          bestSetVolumeKg:
            setVolume === 0
              ? existing.bestSetVolumeKg
              : Math.max(existing.bestSetVolumeKg ?? 0, setVolume),
          totalVolumeKg: existing.totalVolumeKg + setVolume,
          totalReps: existing.totalReps + (r.reps ?? 0),
          bestReps:
            r.reps === null ? existing.bestReps : Math.max(existing.bestReps ?? 0, r.reps),
        });
      }

      if (!cancelled) {
        setPoints([...bySession.values()].sort((a, b) => a.at - b.at));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  return { points, loading };
}
