import { useCallback, useEffect, useMemo, useState } from 'react';
import { and, eq, gte } from 'drizzle-orm';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { db } from '@/db/client';
import { exercises, workoutExercises, workoutSets, workouts } from '@/db/schema';
import { WEEK_MS } from '@/domain/streak';
import {
  buildRecoveryMap,
  remainingFatigue,
  setFatigueUnit,
  type RecoveryEvent,
} from '@/domain/muscleRecovery';
import type { HighlightedPart } from '@/domain/muscleMap';
import type { Muscle, SetType } from '@/domain/types';
import { useSettings } from '@/stores/RootStore';
import { useWorkoutHistory } from './useHistory';

/**
 * Current recovery state of every muscle, straight from the workout history.
 *
 * Only the LAST 7 DAYS of activity matter: a muscle with no sets in that
 * window has effectively no residual fatigue (its decay curve is long over),
 * so it falls back to the "no data" grey on the map.
 *
 * Reactivity matches the other muscle hooks: any DB write re-reads, plus a
 * workout-list change as a belt-and-suspenders, plus a focus reload, so a
 * newly finished workout always redraws the map.
 */
export function useMuscleRecovery(): {
  parts: HighlightedPart[];
  /** True when at least one counted work set exists in the last 7 days. */
  hasHistory: boolean;
  loading: boolean;
  reload: () => void;
} {
  const [rows, setRows] = useState<RecoveryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const settings = useSettings();
  const { workouts: history, loading: historyLoading } = useWorkoutHistory(1000);

  const { countWarmupsInStats, birthYear, sex } = settings.values;

  // Any database write can affect recovery (a set edit, a re-mapped exercise,
  // a workout finished elsewhere). Reload on every change like the heatmap,
  // bounded to a rolling 7-day window.
  useEffect(() => {
    let cancelled = false;
    const sinceMs = Date.now() - WEEK_MS;
    const load = () => {
      void db
        .select({
          startedAt: workouts.startedAt,
          setType: workoutSets.setType,
          rpe: workoutSets.rpe,
          primaryMuscles: exercises.primaryMuscles,
          secondaryMuscles: exercises.secondaryMuscles,
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
          ),
        )
        .then((d) => {
          if (cancelled) return;
          setRows(
            d.map((r) => ({
              t: r.startedAt,
              primary: r.primaryMuscles as Muscle[],
              secondary: r.secondaryMuscles as Muscle[],
              unit: setFatigueUnit(r.setType as SetType, r.rpe, countWarmupsInStats),
            })),
          );
          setLoading(false);
        });
    };
    load();
    const listener = addDatabaseChangeListener(() => load());
    return () => {
      cancelled = true;
      listener.remove();
    };
  }, [version, countWarmupsInStats]);

  // Belt-and-suspenders: a finished/deleted workout changes `history`, so force
  // a re-read even if the native change listener is somehow dropped.
  useEffect(() => {
    setVersion((v) => v + 1);
  }, [history.length]);

  const parts = useMemo<HighlightedPart[]>(() => {
    const fatigue = remainingFatigue(rows, Date.now(), birthYear, sex);
    return buildRecoveryMap(fatigue);
  }, [rows, birthYear, sex]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const hasHistory = useMemo(() => rows.some((r) => r.unit > 0), [rows]);

  return { parts, hasHistory, loading: loading || historyLoading, reload };
}