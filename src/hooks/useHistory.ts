import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq } from 'drizzle-orm';
import { useMemo } from 'react';
import { db } from '@/db/client';
import { workouts } from '@/db/schema';
import type { WorkoutRow } from '@/db/schema';

/** Completed workouts, newest first. */
export function useWorkoutHistory(limit = 200): {
  workouts: WorkoutRow[];
  loading: boolean;
} {
  const { data } = useLiveQuery(
    db
      .select()
      .from(workouts)
      .where(and(eq(workouts.status, 'completed'), eq(workouts.deleted, false)))
      .orderBy(desc(workouts.startedAt))
      .limit(limit),
  );

  return { workouts: data ?? [], loading: data === undefined };
}

/** Just the timestamps — feeds streaks and the calendar heatmap. */
export function useWorkoutDates(): number[] {
  const { workouts: rows } = useWorkoutHistory(1000);
  return useMemo(() => rows.map((w) => w.startedAt).sort((a, b) => a - b), [rows]);
}
