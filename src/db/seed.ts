/**
 * First-run seeding of the built-in exercise catalogue.
 *
 * Idempotent and re-runnable: keyed on `seedSlug`, it inserts what is missing
 * and updates the taxonomy of what exists, while leaving user-owned fields
 * (notes, per-exercise unit, archived) untouched. That means shipping new
 * exercises in an app update is just a matter of adding them to the catalogue.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from './client';
import { newId } from './ids';
import { exercises } from './schema';
import { SEED_EXERCISES } from '@/data/seed';
import { hasArt } from '@/data/art';

export interface SeedResult {
  readonly inserted: number;
  readonly updated: number;
}

export async function seedExercises(): Promise<SeedResult> {
  const existing = await db
    .select({ id: exercises.id, seedSlug: exercises.seedSlug })
    .from(exercises);

  const bySlug = new Map(
    existing
      .filter((r): r is { id: string; seedSlug: string } => r.seedSlug !== null)
      .map((r) => [r.seedSlug, r.id]),
  );

  let inserted = 0;
  let updated = 0;
  const now = Date.now();

  for (const ex of SEED_EXERCISES) {
    const artKey = hasArt(ex.slug) ? ex.slug : null;
    const id = bySlug.get(ex.slug);

    if (id === undefined) {
      await db.insert(exercises).values({
        id: newId(),
        seedSlug: ex.slug,
        name: ex.name,
        trackingType: ex.trackingType,
        equipment: ex.equipment,
        primaryMuscles: [...ex.primary],
        secondaryMuscles: [...ex.secondary],
        isCustom: false,
        artKey,
        defaultRestSec: ex.defaultRestSec ?? null,
        createdAt: now,
        updatedAt: now,
        dirty: false,
      });
      inserted += 1;
    } else {
      // Refresh only catalogue-owned fields; never clobber user edits.
      await db
        .update(exercises)
        .set({
          name: ex.name,
          trackingType: ex.trackingType,
          equipment: ex.equipment,
          primaryMuscles: [...ex.primary],
          secondaryMuscles: [...ex.secondary],
          artKey,
          updatedAt: now,
        })
        .where(eq(exercises.id, id));
      updated += 1;
    }
  }

  return { inserted, updated };
}

/** Has the catalogue ever been seeded? */
export async function isSeeded(): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(exercises);
  return (row?.n ?? 0) > 0;
}
