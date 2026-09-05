import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../ids';
import {
  exercises,
  routineExercises,
  routineSets,
  routines,
  workoutExercises,
  workoutSets,
  workouts,
  type WorkoutRow,
} from '../schema';
import { recordChange } from './outbox';
import type { LoggedSet, SetType, TrackingType } from '@/domain/types';
import { totalReps, totalVolumeKg } from '@/domain/volume';
import type { PrKind } from '@/domain/prDetection';

export interface WorkoutSetData {
  readonly id: string;
  readonly sortOrder: number;
  readonly setType: SetType;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly durationSec: number | null;
  readonly distanceM: number | null;
  readonly rpe: number | null;
  readonly completed: boolean;
  readonly completedAt: number | null;
  readonly prKinds: readonly PrKind[];
}

export interface WorkoutExerciseData {
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
  readonly sets: readonly WorkoutSetData[];
}

export interface WorkoutData {
  readonly id: string;
  readonly routineId: string | null;
  readonly name: string;
  readonly status: 'in_progress' | 'completed';
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly durationSec: number | null;
  readonly notes: string | null;
  readonly bodyweightKg: number | null;
  readonly totalVolumeKg: number;
  readonly totalSets: number;
  readonly totalReps: number;
  readonly prCount: number;
  readonly exercises: readonly WorkoutExerciseData[];
}

function toLoggedSet(s: WorkoutSetData): LoggedSet {
  return {
    setType: s.setType,
    weightKg: s.weightKg,
    reps: s.reps,
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    rpe: s.rpe,
    completed: s.completed,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Loads a whole workout in three queries rather than N+1: one for the workout,
 * one for its exercises joined to the catalogue, one for every set. The logger
 * re-reads this on resume, so it has to be cheap even for a 40-set session.
 */
export async function loadWorkout(workoutId: string): Promise<WorkoutData | null> {
  const wRows = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  const w = wRows[0];
  if (w === undefined) return null;

  const exRows = await db
    .select({
      we: workoutExercises,
      name: exercises.name,
      trackingType: exercises.trackingType,
      artKey: exercises.artKey,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(
      and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.deleted, false)),
    )
    .orderBy(asc(workoutExercises.sortOrder));

  const weIds = exRows.map((r) => r.we.id);
  const setRows =
    weIds.length === 0
      ? []
      : await db
          .select()
          .from(workoutSets)
          .where(
            and(
              inArray(workoutSets.workoutExerciseId, weIds),
              eq(workoutSets.deleted, false),
            ),
          )
          .orderBy(asc(workoutSets.sortOrder));

  const setsByExercise = new Map<string, WorkoutSetData[]>();
  for (const s of setRows) {
    const list = setsByExercise.get(s.workoutExerciseId) ?? [];
    list.push({
      id: s.id,
      sortOrder: s.sortOrder,
      setType: s.setType as SetType,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec: s.durationSec,
      distanceM: s.distanceM,
      rpe: s.rpe,
      completed: s.completed,
      completedAt: s.completedAt,
      prKinds: (s.prKinds ?? []) as PrKind[],
    });
    setsByExercise.set(s.workoutExerciseId, list);
  }

  return {
    id: w.id,
    routineId: w.routineId,
    name: w.name,
    status: w.status as 'in_progress' | 'completed',
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    durationSec: w.durationSec,
    notes: w.notes,
    bodyweightKg: w.bodyweightKg,
    totalVolumeKg: w.totalVolumeKg,
    totalSets: w.totalSets,
    totalReps: w.totalReps,
    prCount: w.prCount,
    exercises: exRows.map((r) => ({
      id: r.we.id,
      exerciseId: r.we.exerciseId,
      exerciseName: r.name,
      trackingType: r.trackingType as TrackingType,
      artKey: r.artKey,
      primaryMuscles: r.primaryMuscles,
      secondaryMuscles: r.secondaryMuscles,
      sortOrder: r.we.sortOrder,
      supersetGroup: r.we.supersetGroup,
      restSec: r.we.restSec,
      notes: r.we.notes,
      sets: setsByExercise.get(r.we.id) ?? [],
    })),
  };
}

/**
 * The single in-progress workout, if any.
 *
 * This is what makes the logger crash-safe: the app writes through to SQLite as
 * sets are logged, so a force-stop mid-session is recovered by reading this on
 * next launch rather than losing the work.
 */
export async function findInProgressWorkout(): Promise<WorkoutData | null> {
  const rows = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.status, 'in_progress'), eq(workouts.deleted, false)))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  const id = rows[0]?.id;
  return id === undefined ? null : loadWorkout(id);
}

export async function listCompletedWorkouts(limit = 50, offset = 0): Promise<WorkoutRow[]> {
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.status, 'completed'), eq(workouts.deleted, false)))
    .orderBy(desc(workouts.startedAt))
    .limit(limit)
    .offset(offset);
}

/** Timestamps of every completed workout — feeds streaks and the heatmap. */
export async function listWorkoutDates(): Promise<number[]> {
  const rows = await db
    .select({ startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(eq(workouts.status, 'completed'), eq(workouts.deleted, false)))
    .orderBy(asc(workouts.startedAt));
  return rows.map((r) => r.startedAt);
}

/**
 * The exercise ids most recently logged in completed workouts, most recent
 * first and each id appearing once. Drives the "Recent Exercises" section the
 * way Hevy surfaces recently-used exercises above the full catalogue.
 * `limit` is a row cap on the scan, not on the distinct ids returned.
 */
export async function listRecentExerciseIds(limit = 20): Promise<string[]> {
  const rows = await db
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
    .limit(limit);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.exerciseId)) {
      seen.add(r.exerciseId);
      out.push(r.exerciseId);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function defaultWorkoutName(at: number): string {
  const hour = new Date(at).getHours();
  if (hour < 12) return 'Morning Workout';
  if (hour < 17) return 'Afternoon Workout';
  if (hour < 21) return 'Evening Workout';
  return 'Night Workout';
}

export async function startEmptyWorkout(bodyweightKg: number | null): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(workouts).values({
    id,
    routineId: null,
    name: defaultWorkoutName(now),
    status: 'in_progress',
    startedAt: now,
    bodyweightKg,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('workouts', id, 'insert');
  return id;
}

/** Start a workout pre-filled from a routine's exercises and set targets. */
export async function startWorkoutFromRoutine(
  routineId: string,
  bodyweightKg: number | null,
): Promise<string> {
  const rRows = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
  const routine = rRows[0];
  const now = Date.now();
  const workoutId = newId();

  await db.insert(workouts).values({
    id: workoutId,
    routineId,
    name: routine?.name ?? defaultWorkoutName(now),
    status: 'in_progress',
    startedAt: now,
    bodyweightKg,
    createdAt: now,
    updatedAt: now,
  });

  const rExercises = await db
    .select()
    .from(routineExercises)
    .where(
      and(eq(routineExercises.routineId, routineId), eq(routineExercises.deleted, false)),
    )
    .orderBy(asc(routineExercises.sortOrder));

  for (const re of rExercises) {
    const weId = newId();
    await db.insert(workoutExercises).values({
      id: weId,
      workoutId,
      exerciseId: re.exerciseId,
      sortOrder: re.sortOrder,
      supersetGroup: re.supersetGroup,
      restSec: re.restSec,
      notes: re.notes,
      createdAt: now,
      updatedAt: now,
    });

    const rSets = await db
      .select()
      .from(routineSets)
      .where(
        and(eq(routineSets.routineExerciseId, re.id), eq(routineSets.deleted, false)),
      )
      .orderBy(asc(routineSets.sortOrder));

    for (const rs of rSets) {
      // Targets become PLACEHOLDERS, not logged values: the set is created
      // uncompleted with the planned load pre-filled, so the user confirms
      // what they actually lifted.
      await db.insert(workoutSets).values({
        id: newId(),
        workoutExerciseId: weId,
        sortOrder: rs.sortOrder,
        setType: rs.setType,
        weightKg: rs.targetWeightKg,
        reps: rs.targetReps,
        durationSec: rs.targetDurationSec,
        distanceM: rs.targetDistanceM,
        rpe: null,
        completed: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await recordChange('workouts', workoutId, 'insert');
  return workoutId;
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  sortOrder: number,
  restSec: number | null,
): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(workoutExercises).values({
    id,
    workoutId,
    exerciseId,
    sortOrder,
    restSec,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('workout_exercises', id, 'insert');
  return id;
}

export async function addSet(
  workoutExerciseId: string,
  sortOrder: number,
  seed: Partial<WorkoutSetData> = {},
): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(workoutSets).values({
    id,
    workoutExerciseId,
    sortOrder,
    setType: seed.setType ?? 'normal',
    weightKg: seed.weightKg ?? null,
    reps: seed.reps ?? null,
    durationSec: seed.durationSec ?? null,
    distanceM: seed.distanceM ?? null,
    rpe: seed.rpe ?? null,
    completed: false,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('workout_sets', id, 'insert');
  return id;
}

export async function updateSet(
  setId: string,
  patch: Partial<
    Pick<
      WorkoutSetData,
      | 'setType'
      | 'weightKg'
      | 'reps'
      | 'durationSec'
      | 'distanceM'
      | 'rpe'
      | 'completed'
      | 'completedAt'
      | 'prKinds'
    >
  >,
): Promise<void> {
  await db
    .update(workoutSets)
    .set({
      ...(patch.setType !== undefined ? { setType: patch.setType } : {}),
      ...(patch.weightKg !== undefined ? { weightKg: patch.weightKg } : {}),
      ...(patch.reps !== undefined ? { reps: patch.reps } : {}),
      ...(patch.durationSec !== undefined ? { durationSec: patch.durationSec } : {}),
      ...(patch.distanceM !== undefined ? { distanceM: patch.distanceM } : {}),
      ...(patch.rpe !== undefined ? { rpe: patch.rpe } : {}),
      ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
      ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
      ...(patch.prKinds !== undefined ? { prKinds: [...patch.prKinds] } : {}),
      updatedAt: Date.now(),
      dirty: true,
    })
    .where(eq(workoutSets.id, setId));
  await recordChange('workout_sets', setId, 'update');
}

export async function deleteSet(setId: string): Promise<void> {
  await db
    .update(workoutSets)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(workoutSets.id, setId));
  await recordChange('workout_sets', setId, 'delete');
}

/**
 * Rewrite the sort order of an exercise's sets.
 *
 * Needed because generated warm-ups have to land BEFORE the working sets they
 * ramp up to — appending them and expecting the user to drag them into place
 * would be useless, since a warm-up after the top set is not a warm-up.
 */
export async function reorderWorkoutSets(
  ordered: readonly { id: string; sortOrder: number }[],
): Promise<void> {
  const now = Date.now();
  for (const item of ordered) {
    await db
      .update(workoutSets)
      .set({ sortOrder: item.sortOrder, updatedAt: now, dirty: true })
      .where(eq(workoutSets.id, item.id));
  }
}

export async function removeWorkoutExercise(weId: string): Promise<void> {
  await db
    .update(workoutExercises)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(workoutExercises.id, weId));
  await recordChange('workout_exercises', weId, 'delete');
}

export async function updateWorkoutExercise(
  weId: string,
  patch: { restSec?: number | null; notes?: string | null; supersetGroup?: number | null },
): Promise<void> {
  await db
    .update(workoutExercises)
    .set({ ...patch, updatedAt: Date.now(), dirty: true })
    .where(eq(workoutExercises.id, weId));
  await recordChange('workout_exercises', weId, 'update');
}

/**
 * Swap which catalogue exercise a logged workout exercise points at, keeping
 * its position, rest, superset group and every logged set — the live-logger
 * equivalent of `replaceRoutineExercise`.
 */
export async function replaceWorkoutExerciseExerciseId(
  weId: string,
  newExerciseId: string,
): Promise<void> {
  await db
    .update(workoutExercises)
    .set({ exerciseId: newExerciseId, updatedAt: Date.now(), dirty: true })
    .where(eq(workoutExercises.id, weId));
  await recordChange('workout_exercises', weId, 'update');
}

export async function updateWorkoutMeta(
  workoutId: string,
  patch: { name?: string; notes?: string | null },
): Promise<void> {
  await db
    .update(workouts)
    .set({ ...patch, updatedAt: Date.now(), dirty: true })
    .where(eq(workouts.id, workoutId));
  await recordChange('workouts', workoutId, 'update');
}

export async function reorderWorkoutExercises(
  ordered: readonly { id: string; sortOrder: number; supersetGroup: number | null }[],
): Promise<void> {
  const now = Date.now();
  for (const item of ordered) {
    await db
      .update(workoutExercises)
      .set({
        sortOrder: item.sortOrder,
        supersetGroup: item.supersetGroup,
        updatedAt: now,
        dirty: true,
      })
      .where(eq(workoutExercises.id, item.id));
  }
}

export interface WorkoutTotals {
  readonly totalVolumeKg: number;
  readonly totalSets: number;
  readonly totalReps: number;
  readonly prCount: number;
}

/**
 * Recompute and persist a workout's denormalised totals.
 *
 * Shared by finishing a workout and by editing one afterwards, so an edited
 * session's summary can never disagree with its sets. `countWarmups` must be
 * the same value used for PR detection during the session, or the summary and
 * the records would tell different stories.
 */
export async function recomputeWorkoutTotals(
  workoutId: string,
  countWarmups: boolean,
): Promise<WorkoutTotals> {
  const workout = await loadWorkout(workoutId);
  if (workout === null) {
    return { totalVolumeKg: 0, totalSets: 0, totalReps: 0, prCount: 0 };
  }

  let volume = 0;
  let sets = 0;
  let reps = 0;
  let prCount = 0;

  for (const we of workout.exercises) {
    const logged = we.sets.map(toLoggedSet);
    volume += totalVolumeKg(logged, {
      trackingType: we.trackingType,
      bodyweightKg: workout.bodyweightKg,
      countWarmups,
    });
    reps += totalReps(logged, countWarmups);
    sets += we.sets.filter((s) => s.completed).length;
    prCount += we.sets.reduce((n, s) => n + s.prKinds.length, 0);
  }

  await db
    .update(workouts)
    .set({
      totalVolumeKg: volume,
      totalSets: sets,
      totalReps: reps,
      prCount,
      updatedAt: Date.now(),
      dirty: true,
    })
    .where(eq(workouts.id, workoutId));
  await recordChange('workouts', workoutId, 'update');

  return { totalVolumeKg: volume, totalSets: sets, totalReps: reps, prCount };
}

export interface FinishResult {
  readonly totalVolumeKg: number;
  readonly totalSets: number;
  readonly totalReps: number;
  readonly prCount: number;
  readonly durationSec: number;
}

/**
 * Complete a workout: drop the sets the user never filled in, recompute the
 * denormalised totals, and stamp it done.
 *
 * `countWarmups` comes from settings, and it must be the same value used for
 * PR detection during the session — otherwise the summary and the records
 * disagree about whether warm-ups counted.
 */
export async function finishWorkout(
  workoutId: string,
  opts: { countWarmups: boolean; durationSec: number },
): Promise<FinishResult> {
  const workout = await loadWorkout(workoutId);
  if (workout === null) {
    return { totalVolumeKg: 0, totalSets: 0, totalReps: 0, prCount: 0, durationSec: 0 };
  }

  // Discard empty, uncompleted sets so an abandoned 5th set does not linger in
  // history as a blank row.
  for (const we of workout.exercises) {
    for (const s of we.sets) {
      const isBlank =
        !s.completed &&
        s.weightKg === null &&
        s.reps === null &&
        s.durationSec === null &&
        s.distanceM === null;
      if (isBlank) await deleteSet(s.id);
    }
  }

  const totals = await recomputeWorkoutTotals(workoutId, opts.countWarmups);

  const now = Date.now();
  await db
    .update(workouts)
    .set({
      status: 'completed',
      endedAt: now,
      durationSec: opts.durationSec,
      updatedAt: now,
      dirty: true,
    })
    .where(eq(workouts.id, workoutId));

  if (workout.routineId !== null) {
    await db
      .update(routines)
      .set({ lastPerformedAt: now, updatedAt: now, dirty: true })
      .where(eq(routines.id, workout.routineId));
  }

  await recordChange('workouts', workoutId, 'update');
  return { ...totals, durationSec: opts.durationSec };
}

/** Throw away an in-progress workout entirely. */
export async function discardWorkout(workoutId: string): Promise<void> {
  await db
    .update(workouts)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(workouts.id, workoutId));
  await recordChange('workouts', workoutId, 'delete');
}

/**
 * The most recent completed values for an exercise — the ghost text Hevy shows
 * under each set. `routineId` narrows it to the same routine when the user has
 * chosen "same routine only".
 */
export async function getPreviousSets(
  exerciseId: string,
  opts: { routineId?: string | null; excludeWorkoutId?: string } = {},
): Promise<WorkoutSetData[]> {
  const conditions = [
    eq(workoutExercises.exerciseId, exerciseId),
    eq(workouts.status, 'completed'),
    eq(workouts.deleted, false),
    eq(workoutSets.completed, true),
    eq(workoutSets.deleted, false),
  ];
  if (opts.routineId !== undefined && opts.routineId !== null) {
    conditions.push(eq(workouts.routineId, opts.routineId));
  }
  if (opts.excludeWorkoutId !== undefined) {
    conditions.push(ne(workouts.id, opts.excludeWorkoutId));
  }

  const rows = await db
    .select({ s: workoutSets, startedAt: workouts.startedAt, weId: workoutExercises.id })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(...conditions))
    .orderBy(desc(workouts.startedAt), asc(workoutSets.sortOrder));

  const firstWeId = rows[0]?.weId;
  if (firstWeId === undefined) return [];

  // Keep only the most recent session's sets.
  return rows
    .filter((r) => r.weId === firstWeId)
    .map((r) => ({
      id: r.s.id,
      sortOrder: r.s.sortOrder,
      setType: r.s.setType as SetType,
      weightKg: r.s.weightKg,
      reps: r.s.reps,
      durationSec: r.s.durationSec,
      distanceM: r.s.distanceM,
      rpe: r.s.rpe,
      completed: r.s.completed,
      completedAt: r.s.completedAt,
      prKinds: (r.s.prKinds ?? []) as PrKind[],
    }));
}
