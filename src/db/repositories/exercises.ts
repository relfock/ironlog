import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../ids';
import { exercises, personalRecords, type ExerciseRow } from '../schema';
import { recordChange } from './outbox';
import type { Equipment, Muscle, TrackingType } from '@/domain/types';
import type { PrKind } from '@/domain/prDetection';
import { searchExercises } from '@/domain/exerciseSearch';

export interface Exercise {
  readonly id: string;
  readonly seedSlug: string | null;
  readonly name: string;
  readonly trackingType: TrackingType;
  readonly equipment: Equipment;
  readonly primary: readonly Muscle[];
  readonly secondary: readonly Muscle[];
  readonly isCustom: boolean;
  readonly artKey: string | null;
  readonly notes: string | null;
  readonly defaultRestSec: number | null;
  readonly archived: boolean;
}

export function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    seedSlug: row.seedSlug,
    name: row.name,
    trackingType: row.trackingType as TrackingType,
    equipment: row.equipment as Equipment,
    primary: row.primaryMuscles as Muscle[],
    secondary: row.secondaryMuscles as Muscle[],
    isCustom: row.isCustom,
    artKey: row.artKey,
    notes: row.notes,
    defaultRestSec: row.defaultRestSec,
    archived: row.archived,
  };
}

export async function listExercises(includeArchived = false): Promise<Exercise[]> {
  const rows = await db
    .select()
    .from(exercises)
    .where(
      includeArchived
        ? eq(exercises.deleted, false)
        : and(eq(exercises.deleted, false), eq(exercises.archived, false)),
    )
    .orderBy(asc(exercises.name));
  return rows.map(toExercise);
}

export async function getExercise(id: string): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toExercise(row);
}

export interface ExerciseFilter {
  readonly query?: string;
  readonly muscles?: readonly Muscle[];
  readonly equipment?: readonly Equipment[];
}

/**
 * Filtering happens in JS rather than SQL because the muscle lists are JSON
 * columns and the search needs the alias-aware matcher from
 * `domain/exerciseSearch` (so "deadlift" finds "dead lift"). At ~250 rows this
 * is far below the threshold where it would be worth denormalising.
 */
export function filterExercises(
  all: readonly Exercise[],
  filter: ExerciseFilter,
): Exercise[] {
  let out = [...all];

  if (filter.muscles && filter.muscles.length > 0) {
    const wanted = new Set(filter.muscles);
    out = out.filter(
      (e) =>
        e.primary.some((m) => wanted.has(m)) || e.secondary.some((m) => wanted.has(m)),
    );
  }

  if (filter.equipment && filter.equipment.length > 0) {
    const wanted = new Set(filter.equipment);
    out = out.filter((e) => wanted.has(e.equipment));
  }

  if (filter.query && filter.query.trim().length > 0) {
    out = searchExercises(filter.query, out, (e) => e.name);
  }

  return out;
}

export interface CreateExerciseInput {
  readonly name: string;
  readonly trackingType: TrackingType;
  readonly equipment: Equipment;
  readonly primary: readonly Muscle[];
  readonly secondary?: readonly Muscle[];
  readonly notes?: string | null;
  readonly defaultRestSec?: number | null;
}

export async function createCustomExercise(
  input: CreateExerciseInput,
): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(exercises).values({
    id,
    seedSlug: null,
    name: input.name.trim(),
    trackingType: input.trackingType,
    equipment: input.equipment,
    primaryMuscles: [...input.primary],
    secondaryMuscles: [...(input.secondary ?? [])],
    isCustom: true,
    artKey: null,
    notes: input.notes ?? null,
    defaultRestSec: input.defaultRestSec ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await recordChange('exercises', id, 'insert');
  return id;
}

export async function updateExercise(
  id: string,
  patch: Partial<CreateExerciseInput> & { archived?: boolean },
): Promise<void> {
  await db
    .update(exercises)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.trackingType !== undefined ? { trackingType: patch.trackingType } : {}),
      ...(patch.equipment !== undefined ? { equipment: patch.equipment } : {}),
      ...(patch.primary !== undefined ? { primaryMuscles: [...patch.primary] } : {}),
      ...(patch.secondary !== undefined
        ? { secondaryMuscles: [...patch.secondary] }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.defaultRestSec !== undefined
        ? { defaultRestSec: patch.defaultRestSec }
        : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
      updatedAt: Date.now(),
      dirty: true,
    })
    .where(eq(exercises.id, id));
  await recordChange('exercises', id, 'update');
}

/**
 * Soft-delete. Built-in exercises are archived instead, because history rows
 * reference them and a hard delete would orphan years of logged sets.
 */
export async function deleteExercise(id: string): Promise<void> {
  const ex = await getExercise(id);
  if (ex === null) return;

  if (!ex.isCustom) {
    await updateExercise(id, { archived: true });
    return;
  }
  await db
    .update(exercises)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(exercises.id, id));
  await recordChange('exercises', id, 'delete');
}

/** Current records for one exercise, as the map `detectPrs` expects. */
export async function getRecordBook(exerciseId: string): Promise<Map<PrKind, number>> {
  const rows = await db
    .select()
    .from(personalRecords)
    .where(
      and(eq(personalRecords.exerciseId, exerciseId), eq(personalRecords.deleted, false)),
    );
  return new Map(rows.map((r) => [r.kind as PrKind, r.value]));
}

export async function getRecordBooks(
  exerciseIds: readonly string[],
): Promise<Map<string, Map<PrKind, number>>> {
  const out = new Map<string, Map<PrKind, number>>();
  if (exerciseIds.length === 0) return out;

  const rows = await db
    .select()
    .from(personalRecords)
    .where(
      and(
        inArray(personalRecords.exerciseId, [...exerciseIds]),
        eq(personalRecords.deleted, false),
      ),
    );

  for (const r of rows) {
    const book = out.get(r.exerciseId) ?? new Map<PrKind, number>();
    book.set(r.kind as PrKind, r.value);
    out.set(r.exerciseId, book);
  }
  return out;
}

/** Upsert a beaten record. Keyed on (exercise, kind) by a unique index. */
export async function upsertRecord(
  exerciseId: string,
  kind: PrKind,
  value: number,
  achievedAt: number,
  workoutSetId: string | null,
): Promise<void> {
  const id = newId();
  await db
    .insert(personalRecords)
    .values({ id, exerciseId, kind, value, achievedAt, workoutSetId, updatedAt: achievedAt })
    .onConflictDoUpdate({
      target: [personalRecords.exerciseId, personalRecords.kind],
      set: { value, achievedAt, workoutSetId, updatedAt: achievedAt, dirty: true },
    });
  await recordChange('personal_records', id, 'update');
}
