import { useEffect, useMemo, useState } from 'react';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { exercises, workoutExercises, workoutSets, workouts } from '@/db/schema';
import { accumulateMuscleSets, muscleDistribution } from '@/domain/volume';
import { startOfLocalWeek, type WeekStart } from '@/domain/streak';
import type { Muscle } from '@/domain/types';
import { useWorkoutHistory } from './useHistory';

export interface WeeklyVolume {
  readonly weekStartMs: number;
  readonly volumeKg: number;
  readonly workoutCount: number;
}

export interface MuscleStats {
  readonly setsPerMuscle: Map<Muscle, number>;
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
} {
  const { workouts: history, loading } = useWorkoutHistory(1000);
  const [setsPerMuscle, setSetsPerMuscle] = useState<Map<Muscle, number>>(new Map());

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

  // Muscle-group set counts over the same window.
  const workoutIds = useMemo(
    () => history.filter((w) => w.startedAt >= sinceMs).map((w) => w.id),
    [history, sinceMs],
  );
  const idKey = workoutIds.join(',');

  useEffect(() => {
    if (workoutIds.length === 0) {
      setSetsPerMuscle(new Map());
      return;
    }
    let cancelled = false;

    void (async () => {
      const rows = await db
        .select({
          weId: workoutExercises.id,
          primaryMuscles: exercises.primaryMuscles,
          secondaryMuscles: exercises.secondaryMuscles,
        })
        .from(workoutExercises)
        .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
        .where(
          and(
            inArray(workoutExercises.workoutId, workoutIds),
            eq(workoutExercises.deleted, false),
          ),
        );

      if (rows.length === 0) {
        if (!cancelled) setSetsPerMuscle(new Map());
        return;
      }

      const setRows = await db
        .select({ weId: workoutSets.workoutExerciseId, completed: workoutSets.completed })
        .from(workoutSets)
        .where(
          and(
            inArray(
              workoutSets.workoutExerciseId,
              rows.map((r) => r.weId),
            ),
            eq(workoutSets.completed, true),
            eq(workoutSets.deleted, false),
          ),
        );

      const countByWe = new Map<string, number>();
      for (const s of setRows) {
        countByWe.set(s.weId, (countByWe.get(s.weId) ?? 0) + 1);
      }

      const credits = rows.map((r) => ({
        primary: r.primaryMuscles as Muscle[],
        secondary: r.secondaryMuscles as Muscle[],
        completedSets: countByWe.get(r.weId) ?? 0,
      }));

      if (!cancelled) setSetsPerMuscle(accumulateMuscleSets(credits));
    })();

    return () => {
      cancelled = true;
    };
  }, [idKey, workoutIds]);

  const muscle = useMemo<MuscleStats>(
    () => ({ setsPerMuscle, distribution: muscleDistribution(setsPerMuscle) }),
    [setsPerMuscle],
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
  };
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
