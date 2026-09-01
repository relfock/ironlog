import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, asc, desc, eq } from 'drizzle-orm';
import { useMemo } from 'react';
import { db } from '@/db/client';
import { exercises, workoutExercises, workouts } from '@/db/schema';
import { toExercise, type Exercise } from '@/db/repositories/exercises';

/**
 * Live list of non-archived exercises.
 *
 * `useLiveQuery` re-runs whenever the underlying tables change (which is why
 * the SQLite connection is opened with `enableChangeListener`), so adding a
 * custom exercise updates every list without any manual invalidation.
 */
export function useExercises(includeArchived = false): {
  exercises: Exercise[];
  loading: boolean;
} {
  const { data, error } = useLiveQuery(
    db
      .select()
      .from(exercises)
      .where(
        includeArchived
          ? eq(exercises.deleted, false)
          : and(eq(exercises.deleted, false), eq(exercises.archived, false)),
      )
      .orderBy(asc(exercises.name)),
  );

  const mapped = useMemo(() => (data ?? []).map(toExercise), [data]);

  if (error !== undefined) {
    // Surfacing an empty list beats crashing the library screen.
    console.warn('useExercises failed', error);
  }

  return { exercises: mapped, loading: data === undefined };
}

export function useExercise(id: string | undefined): Exercise | null {
  const { exercises: all } = useExercises(true);
  return useMemo(
    () => (id === undefined ? null : (all.find((e) => e.id === id) ?? null)),
    [all, id],
  );
}

/**
 * Exercise ids most recently logged in completed workouts, most recent first
 * and deduplicated — the source of the "Recent Exercises" section header.
 * Reacts to new workouts the same way `useExercises` does.
 */
export function useRecentExerciseIds(limit = 20): string[] {
  const { data } = useLiveQuery(
    db
      .select({ exerciseId: workoutExercises.exerciseId })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
      .where(
        and(
          eq(workouts.status, 'completed'),
          eq(workouts.deleted, false),
          eq(workoutExercises.deleted, false),
          eq(exercises.deleted, false),
          eq(exercises.archived, false),
        ),
      )
      .orderBy(desc(workouts.startedAt))
      .limit(limit),
  );

  return useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of data ?? []) {
      if (!seen.has(r.exerciseId)) {
        seen.add(r.exerciseId);
        out.push(r.exerciseId);
      }
    }
    return out;
  }, [data]);
}
