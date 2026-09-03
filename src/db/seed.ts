/**
 * First-run seeding of the built-in exercise catalogue.
 *
 * Idempotent and re-runnable: keyed on `seedSlug`, it inserts what is missing
 * and refreshes the catalogue-owned fields of what exists, while leaving
 * user-owned fields (notes, default rest, per-exercise unit, archived)
 * untouched. That means shipping new exercises in an app update is just a
 * matter of adding them to the catalogue.
 *
 * Two properties matter at 1069 exercises that did not at 230:
 *
 *  1. First launch must not be 1069 round trips. Inserts are batched into
 *     multi-row statements inside one transaction, so the whole catalogue lands
 *     in ~16 statements and one commit.
 *  2. Every LATER launch must be nearly free. Rows are only updated when a
 *     catalogue-owned field actually differs, so the steady state is one SELECT
 *     and no writes at all — the previous unconditional UPDATE-per-row would
 *     now rewrite the whole table on every cold start.
 *
 * Superseded exercises are ARCHIVED, never deleted: `routine_exercises` and
 * `workout_exercises` reference `exercises.id` with `onDelete: 'restrict'`, so
 * dropping the rows of a retired catalogue would either fail or orphan logged
 * history. Archiving hides them from the library and keeps history readable.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './client';
import { newId } from './ids';
import { exercises } from './schema';
import { ALL_EXERCISES } from '@/data/exercises';

export interface SeedResult {
  readonly inserted: number;
  readonly updated: number;
  /** Non-custom rows hidden because they are no longer in the catalogue. */
  readonly archived: number;
}

type ExerciseInsert = typeof exercises.$inferInsert;

/** The fields the catalogue owns and may overwrite on every launch. */
type CatalogueFields = Pick<
  ExerciseInsert,
  'name' | 'trackingType' | 'equipment' | 'primaryMuscles' | 'secondaryMuscles' | 'artKey'
>;

/**
 * Rows per multi-row INSERT. Each row binds 13 parameters, and SQLite's default
 * `SQLITE_MAX_VARIABLE_NUMBER` on the oldest builds Expo may link is 999, so
 * stay well inside it rather than depending on the runtime's limit.
 */
const INSERT_CHUNK = 60;

/** Ids per `WHERE id IN (…)`. One parameter each, so far more fit. */
const ID_CHUNK = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sameCatalogueFields(row: CatalogueFields, wanted: CatalogueFields): boolean {
  return (
    row.name === wanted.name &&
    row.trackingType === wanted.trackingType &&
    row.equipment === wanted.equipment &&
    row.artKey === wanted.artKey &&
    JSON.stringify(row.primaryMuscles) === JSON.stringify(wanted.primaryMuscles) &&
    JSON.stringify(row.secondaryMuscles) === JSON.stringify(wanted.secondaryMuscles)
  );
}

export async function seedExercises(): Promise<SeedResult> {
  const existing = await db
    .select({
      id: exercises.id,
      seedSlug: exercises.seedSlug,
      isCustom: exercises.isCustom,
      archived: exercises.archived,
      name: exercises.name,
      trackingType: exercises.trackingType,
      equipment: exercises.equipment,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      artKey: exercises.artKey,
    })
    .from(exercises);

  const bySlug = new Map(
    existing.filter((r) => r.seedSlug !== null).map((r) => [r.seedSlug, r]),
  );

  const now = Date.now();
  const pending: ExerciseInsert[] = [];
  const refresh: { readonly id: string; readonly fields: CatalogueFields }[] = [];

  for (const ex of ALL_EXERCISES) {
    // `artKey` doubles as the media key: the video and the region map are both
    // looked up by catalogue slug, and the denormalised routine/workout queries
    // select artKey without joining `seedSlug`.
    const fields: CatalogueFields = {
      name: ex.name,
      trackingType: ex.trackingType,
      equipment: ex.equipment,
      primaryMuscles: [...ex.primary],
      secondaryMuscles: [...ex.secondary],
      artKey: ex.slug,
    };

    const row = bySlug.get(ex.slug);
    if (row === undefined) {
      pending.push({
        id: newId(),
        seedSlug: ex.slug,
        ...fields,
        isCustom: false,
        defaultRestSec: null,
        createdAt: now,
        updatedAt: now,
        dirty: false,
      });
    } else if (!sameCatalogueFields(row, fields)) {
      refresh.push({ id: row.id, fields });
    }
  }

  const catalogueSlugs = new Set(ALL_EXERCISES.map((ex) => ex.slug));
  // A non-custom row with a null seedSlug cannot be matched to any catalogue
  // entry either, so it is swept up too rather than left visible forever.
  const staleIds = existing
    .filter(
      (r) =>
        !r.isCustom &&
        !r.archived &&
        (r.seedSlug === null || !catalogueSlugs.has(r.seedSlug)),
    )
    .map((r) => r.id);

  db.transaction((tx) => {
    for (const rows of chunk(pending, INSERT_CHUNK)) {
      tx.insert(exercises).values(rows).run();
    }
    for (const { id, fields } of refresh) {
      tx.update(exercises)
        .set({ ...fields, updatedAt: now })
        .where(eq(exercises.id, id))
        .run();
    }
    for (const ids of chunk(staleIds, ID_CHUNK)) {
      tx.update(exercises)
        .set({ archived: true, updatedAt: now })
        .where(inArray(exercises.id, ids))
        .run();
    }
  });

  return {
    inserted: pending.length,
    updated: refresh.length,
    archived: staleIds.length,
  };
}

/** Has the catalogue ever been seeded? */
export async function isSeeded(): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(exercises);
  return (row?.n ?? 0) > 0;
}
