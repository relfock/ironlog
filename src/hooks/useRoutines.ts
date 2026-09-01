import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { routines as routinesTable } from '@/db/schema';
import {
  listFolders,
  listRoutines,
  loadRoutine,
  type FolderData,
  type RoutineData,
  type RoutineSummary,
} from '@/db/repositories/routines';

/**
 * Routine list.
 *
 * `useLiveQuery` on the routines table is used purely as a CHANGE SIGNAL: the
 * real read is `listRoutines()`, which also joins in each routine's exercise
 * names. Drizzle's live query cannot express that shape, so the pattern is
 * "watch a table, re-run the richer query". The extra read is cheap and it
 * keeps every screen automatically fresh.
 */
export function useRoutines(): {
  routines: RoutineSummary[];
  folders: FolderData[];
  reload: () => void;
  loading: boolean;
} {
  const signal = useLiveQuery(
    db
      .select({ id: routinesTable.id, updatedAt: routinesTable.updatedAt })
      .from(routinesTable)
      .where(eq(routinesTable.deleted, false))
      .orderBy(asc(routinesTable.sortOrder)),
  );

  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    let cancelled = false;
    void Promise.all([listRoutines(), listFolders()]).then(([r, f]) => {
      if (cancelled) return;
      setRoutines(r);
      setFolders(f);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read whenever the routines table changes.
  const fingerprint = (signal.data ?? [])
    .map((r) => `${r.id}:${r.updatedAt}`)
    .join(',');

  useEffect(() => {
    const cancel = reload();
    return cancel;
  }, [reload, fingerprint]);

  return { routines, folders, reload, loading };
}

/** One routine with its exercises and set targets. */
export function useRoutine(routineId: string | undefined): {
  routine: RoutineData | null;
  reload: () => void;
} {
  const [routine, setRoutine] = useState<RoutineData | null>(null);

  const reload = useCallback(() => {
    if (routineId === undefined) {
      setRoutine(null);
      return;
    }
    void loadRoutine(routineId).then(setRoutine);
  }, [routineId]);

  useEffect(reload, [reload]);

  return { routine, reload };
}
