import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../ids';
import {
  exercises,
  routineExercises,
  routineFolders,
  routineSets,
  routines,
} from '../schema';
import { recordChange } from './outbox';
import type { SetType, TrackingType } from '@/domain/types';

export interface RoutineSetData {
  readonly id: string;
  readonly sortOrder: number;
  readonly setType: SetType;
  readonly targetWeightKg: number | null;
  readonly targetReps: number | null;
  /** Upper bound of a rep RANGE. Null means a single rep target. */
  readonly targetRepsMax: number | null;
  readonly targetDurationSec: number | null;
  readonly targetDistanceM: number | null;
  readonly targetRpe: number | null;
}

export interface RoutineExerciseData {
  readonly id: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly trackingType: TrackingType;
  readonly artKey: string | null;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly sortOrder: number;
  readonly supersetGroup: number | null;
  readonly restSec: number | null;
  readonly notes: string | null;
  readonly sets: readonly RoutineSetData[];
}

export interface RoutineData {
  readonly id: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly notes: string | null;
  readonly sortOrder: number;
  readonly lastPerformedAt: number | null;
  readonly exercises: readonly RoutineExerciseData[];
}

export interface RoutineSummary {
  readonly id: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly sortOrder: number;
  readonly lastPerformedAt: number | null;
  readonly exerciseCount: number;
  readonly exerciseNames: readonly string[];
}

export interface FolderData {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listFolders(): Promise<FolderData[]> {
  const rows = await db
    .select()
    .from(routineFolders)
    .where(eq(routineFolders.deleted, false))
    .orderBy(asc(routineFolders.sortOrder), asc(routineFolders.name));
  return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }));
}

/**
 * Routine list with a preview of the exercises in each.
 *
 * Two queries, not one per routine: the list screen shows every routine the
 * user owns, so an N+1 here would be the slowest screen in the app.
 */
export async function listRoutines(): Promise<RoutineSummary[]> {
  const rRows = await db
    .select()
    .from(routines)
    .where(eq(routines.deleted, false))
    .orderBy(asc(routines.sortOrder), asc(routines.name));

  if (rRows.length === 0) return [];

  const exRows = await db
    .select({
      routineId: routineExercises.routineId,
      name: exercises.name,
      sortOrder: routineExercises.sortOrder,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(
      and(
        inArray(
          routineExercises.routineId,
          rRows.map((r) => r.id),
        ),
        eq(routineExercises.deleted, false),
      ),
    )
    .orderBy(asc(routineExercises.sortOrder));

  const byRoutine = new Map<string, string[]>();
  for (const r of exRows) {
    const list = byRoutine.get(r.routineId) ?? [];
    list.push(r.name);
    byRoutine.set(r.routineId, list);
  }

  return rRows.map((r) => {
    const names = byRoutine.get(r.id) ?? [];
    return {
      id: r.id,
      folderId: r.folderId,
      name: r.name,
      sortOrder: r.sortOrder,
      lastPerformedAt: r.lastPerformedAt,
      exerciseCount: names.length,
      exerciseNames: names,
    };
  });
}

export async function loadRoutine(routineId: string): Promise<RoutineData | null> {
  const rRows = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
  const r = rRows[0];
  if (r === undefined) return null;

  const exRows = await db
    .select({
      re: routineExercises,
      name: exercises.name,
      trackingType: exercises.trackingType,
      artKey: exercises.artKey,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(
      and(eq(routineExercises.routineId, routineId), eq(routineExercises.deleted, false)),
    )
    .orderBy(asc(routineExercises.sortOrder));

  const reIds = exRows.map((x) => x.re.id);
  const setRows =
    reIds.length === 0
      ? []
      : await db
          .select()
          .from(routineSets)
          .where(
            and(
              inArray(routineSets.routineExerciseId, reIds),
              eq(routineSets.deleted, false),
            ),
          )
          .orderBy(asc(routineSets.sortOrder));

  const setsByExercise = new Map<string, RoutineSetData[]>();
  for (const s of setRows) {
    const list = setsByExercise.get(s.routineExerciseId) ?? [];
    list.push({
      id: s.id,
      sortOrder: s.sortOrder,
      setType: s.setType as SetType,
      targetWeightKg: s.targetWeightKg,
      targetReps: s.targetReps,
      targetRepsMax: s.targetRepsMax,
      targetDurationSec: s.targetDurationSec,
      targetDistanceM: s.targetDistanceM,
      targetRpe: s.targetRpe,
    });
    setsByExercise.set(s.routineExerciseId, list);
  }

  return {
    id: r.id,
    folderId: r.folderId,
    name: r.name,
    notes: r.notes,
    sortOrder: r.sortOrder,
    lastPerformedAt: r.lastPerformedAt,
    exercises: exRows.map((x) => ({
      id: x.re.id,
      exerciseId: x.re.exerciseId,
      exerciseName: x.name,
      trackingType: x.trackingType as TrackingType,
      artKey: x.artKey,
      primaryMuscles: x.primaryMuscles,
      secondaryMuscles: x.secondaryMuscles,
      sortOrder: x.re.sortOrder,
      supersetGroup: x.re.supersetGroup,
      restSec: x.re.restSec,
      notes: x.re.notes,
      sets: setsByExercise.get(x.re.id) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createFolder(name: string): Promise<string> {
  const id = newId();
  const now = Date.now();
  const existing = await listFolders();
  await db.insert(routineFolders).values({
    id,
    name: name.trim(),
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('routine_folders', id, 'insert');
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db
    .update(routineFolders)
    .set({ name: name.trim(), updatedAt: Date.now(), dirty: true })
    .where(eq(routineFolders.id, id));
  await recordChange('routine_folders', id, 'update');
}

/** Deleting a folder keeps its routines — they fall back to unfiled. */
export async function deleteFolder(id: string): Promise<void> {
  const now = Date.now();
  await db
    .update(routines)
    .set({ folderId: null, updatedAt: now, dirty: true })
    .where(eq(routines.folderId, id));
  await db
    .update(routineFolders)
    .set({ deleted: true, updatedAt: now, dirty: true })
    .where(eq(routineFolders.id, id));
  await recordChange('routine_folders', id, 'delete');
}

export async function createRoutine(
  name: string,
  folderId: string | null = null,
): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(routines).values({
    id,
    folderId,
    name: name.trim(),
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('routines', id, 'insert');
  return id;
}

export async function updateRoutineMeta(
  id: string,
  patch: { name?: string; notes?: string | null; folderId?: string | null },
): Promise<void> {
  await db
    .update(routines)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      updatedAt: Date.now(),
      dirty: true,
    })
    .where(eq(routines.id, id));
  await recordChange('routines', id, 'update');
}

export async function deleteRoutine(id: string): Promise<void> {
  await db
    .update(routines)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(routines.id, id));
  await recordChange('routines', id, 'delete');
}

export async function addExerciseToRoutine(
  routineId: string,
  exerciseId: string,
  sortOrder: number,
  opts: { restSec?: number | null; setCount?: number } = {},
): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(routineExercises).values({
    id,
    routineId,
    exerciseId,
    sortOrder,
    restSec: opts.restSec ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Three working sets is the conventional starting point.
  const setCount = opts.setCount ?? 3;
  for (let i = 0; i < setCount; i += 1) {
    await db.insert(routineSets).values({
      id: newId(),
      routineExerciseId: id,
      sortOrder: i,
      setType: 'normal',
      createdAt: now,
      updatedAt: now,
    });
  }

  await recordChange('routine_exercises', id, 'insert');
  return id;
}

export async function removeRoutineExercise(id: string): Promise<void> {
  await db
    .update(routineExercises)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(routineExercises.id, id));
  await recordChange('routine_exercises', id, 'delete');
}

export async function updateRoutineExercise(
  id: string,
  patch: { restSec?: number | null; notes?: string | null; supersetGroup?: number | null },
): Promise<void> {
  await db
    .update(routineExercises)
    .set({ ...patch, updatedAt: Date.now(), dirty: true })
    .where(eq(routineExercises.id, id));
  await recordChange('routine_exercises', id, 'update');
}

export async function reorderRoutineExercises(
  ordered: readonly { id: string; sortOrder: number; supersetGroup: number | null }[],
): Promise<void> {
  const now = Date.now();
  for (const item of ordered) {
    await db
      .update(routineExercises)
      .set({
        sortOrder: item.sortOrder,
        supersetGroup: item.supersetGroup,
        updatedAt: now,
        dirty: true,
      })
      .where(eq(routineExercises.id, item.id));
  }
}

/** Swap which exercise a routine slot points at, keeping its sets. */
export async function replaceRoutineExercise(
  routineExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  await db
    .update(routineExercises)
    .set({ exerciseId: newExerciseId, updatedAt: Date.now(), dirty: true })
    .where(eq(routineExercises.id, routineExerciseId));
  await recordChange('routine_exercises', routineExerciseId, 'update');
}

export async function addRoutineSet(
  routineExerciseId: string,
  sortOrder: number,
  seed: Partial<RoutineSetData> = {},
): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(routineSets).values({
    id,
    routineExerciseId,
    sortOrder,
    setType: seed.setType ?? 'normal',
    targetWeightKg: seed.targetWeightKg ?? null,
    targetReps: seed.targetReps ?? null,
    targetRepsMax: seed.targetRepsMax ?? null,
    targetDurationSec: seed.targetDurationSec ?? null,
    targetDistanceM: seed.targetDistanceM ?? null,
    targetRpe: seed.targetRpe ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('routine_sets', id, 'insert');
  return id;
}

export async function updateRoutineSet(
  id: string,
  patch: Partial<Omit<RoutineSetData, 'id' | 'sortOrder'>>,
): Promise<void> {
  await db
    .update(routineSets)
    .set({ ...patch, updatedAt: Date.now(), dirty: true })
    .where(eq(routineSets.id, id));
  await recordChange('routine_sets', id, 'update');
}

export async function deleteRoutineSet(id: string): Promise<void> {
  await db
    .update(routineSets)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(routineSets.id, id));
  await recordChange('routine_sets', id, 'delete');
}

/** Turn a finished workout into a reusable routine. */
export async function createRoutineFromWorkout(
  workoutId: string,
  name: string,
): Promise<string> {
  const { loadWorkout } = await import('./workouts');
  const workout = await loadWorkout(workoutId);
  if (workout === null) throw new Error('Workout not found');

  const routineId = await createRoutine(name);
  for (const we of workout.exercises) {
    const reId = await addExerciseToRoutine(routineId, we.exerciseId, we.sortOrder, {
      restSec: we.restSec,
      setCount: 0,
    });
    await updateRoutineExercise(reId, { supersetGroup: we.supersetGroup });

    let order = 0;
    for (const s of we.sets) {
      if (!s.completed) continue;
      await addRoutineSet(reId, order, {
        setType: s.setType,
        targetWeightKg: s.weightKg,
        targetReps: s.reps,
        targetDurationSec: s.durationSec,
        targetDistanceM: s.distanceM,
      });
      order += 1;
    }
  }
  return routineId;
}
