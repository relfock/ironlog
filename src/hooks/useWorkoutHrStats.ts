import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, eq } from 'drizzle-orm';
import { useMemo } from 'react';
import { db } from '@/db/client';
import { exercises, workoutSets, workoutExercises, workouts } from '@/db/schema';

export interface CardioWorkoutStats {
  avgBpm: number;
  /** Per-zone seconds, indexed Z0..Z5. */
  zoneSec: number[];
  caloriesKcal: number;
}

/**
 * For every completed workout that contains an `hr_cardio` exercise, returns
 * a Map from workoutId → aggregated HR stats (avg BPM, zone time, kcal).
 * Cardio workouts store one workout_sets segment per hr_cardio exercise with
 * `zone0Sec…zone5Sec` and `avgBpm` columns; a workout that has no hr_cardio
 * exercises simply won't appear in the map.
 */
export function useWorkoutHrStatsMap(): Map<string, CardioWorkoutStats> {
  const { data } = useLiveQuery(
    db
      .select({
        workoutId: workouts.id,
        avgBpm: workoutSets.avgBpm,
        caloriesKcal: workoutSets.caloriesKcal,
        zone0Sec: workoutSets.zone0Sec,
        zone1Sec: workoutSets.zone1Sec,
        zone2Sec: workoutSets.zone2Sec,
        zone3Sec: workoutSets.zone3Sec,
        zone4Sec: workoutSets.zone4Sec,
        zone5Sec: workoutSets.zone5Sec,
      })
      .from(workouts)
      .innerJoin(workoutExercises, eq(workouts.id, workoutExercises.workoutId))
      .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
      .innerJoin(workoutSets, eq(workoutExercises.id, workoutSets.workoutExerciseId))
      .where(
        and(
          eq(workouts.status, 'completed'),
          eq(workouts.deleted, false),
          eq(exercises.trackingType, 'hr_cardio'),
        ),
      ),
  );

  return useMemo(() => {
    const map = new Map<string, CardioWorkoutStats>();
    if (!data) return map;
    for (const row of data) {
      if (row.workoutId === null || row.avgBpm === null) continue;
      map.set(row.workoutId, {
        avgBpm: Math.round(row.avgBpm),
        caloriesKcal: row.caloriesKcal ?? 0,
        zoneSec: [
          row.zone0Sec ?? 0,
          row.zone1Sec ?? 0,
          row.zone2Sec ?? 0,
          row.zone3Sec ?? 0,
          row.zone4Sec ?? 0,
          row.zone5Sec ?? 0,
        ],
      });
    }
    return map;
  }, [data]);
}
