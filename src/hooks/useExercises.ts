import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, asc, eq } from 'drizzle-orm';
import { useMemo } from 'react';
import { db } from '@/db/client';
import { exercises } from '@/db/schema';
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
