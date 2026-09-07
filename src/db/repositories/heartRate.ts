/**
 * Persistence for workout heart-rate samples.
 *
 * Written once, in a batch, when the workout finishes — see
 * ActiveWorkoutStore.finish(). The live sampler only holds readings in memory.
 */
import { asc, eq } from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../ids';
import {
  workoutHeartRateSamples,
  type WorkoutHeartRateSampleRow,
} from '../schema';
import { recordChange } from './outbox';

export interface HeartRateSampleInput {
  /** Epoch-ms of the wall-clock reading. */
  recordedAt: number;
  bpm: number;
}

export interface HeartRateSample extends HeartRateSampleInput {
  readonly id: string;
  readonly workoutId: string;
}

export async function saveWorkoutHeartRateSamples(
  workoutId: string,
  samples: readonly HeartRateSampleInput[],
): Promise<void> {
  if (samples.length === 0) return;

  // Single transaction so a crash mid-write cannot orphan half a workout's
  // heart-rate row set. Bulk-inserted rows share a row id for the outbox (one
  // change entry, tagged with the workout).
  await db.transaction(async (tx) => {
    const now = Date.now();
    await tx
      .insert(workoutHeartRateSamples)
      .values(
        samples.map((s) => ({
          id: newId(),
          workoutId,
          recordedAt: s.recordedAt,
          bpm: s.bpm,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
  });

  await recordChange('workout_heart_rate_samples', workoutId, 'insert');
}

export async function loadWorkoutHeartRateSamples(
  workoutId: string,
): Promise<WorkoutHeartRateSampleRow[]> {
  return db
    .select()
    .from(workoutHeartRateSamples)
    .where(eq(workoutHeartRateSamples.workoutId, workoutId))
    .orderBy(asc(workoutHeartRateSamples.recordedAt))
    .all();
}