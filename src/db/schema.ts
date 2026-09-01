/**
 * Drizzle schema for the on-device SQLite database.
 *
 * SYNC-READY BY DESIGN. There is no server today, but every domain table
 * carries the columns a delta-sync protocol needs — a UUID primary key (never
 * an autoincrement integer, which cannot be merged across devices), an
 * `updatedAt` clock, a `deleted` tombstone instead of a hard DELETE, and a
 * `dirty` flag — plus a `syncOutbox` table that is written but never read.
 * Adding a backend later is then a feature, not a migration of years of
 * user history.
 *
 * Units: weights are kg, distances metres, durations seconds, timestamps
 * epoch-milliseconds. See src/domain/units.ts — conversion happens only at the
 * UI boundary.
 */
import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Columns every syncable row carries. Spread into each table. */
const syncColumns = {
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  /** Tombstone. Never hard-delete a synced row. */
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  /** Has local changes not yet pushed to a server. */
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
};

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    /** Stable seed slug, or null for a user-created exercise. */
    seedSlug: text('seed_slug'),
    name: text('name').notNull(),
    trackingType: text('tracking_type').notNull(),
    equipment: text('equipment').notNull(),
    /** JSON array of Muscle. */
    primaryMuscles: text('primary_muscles', { mode: 'json' })
      .notNull()
      .$type<string[]>(),
    secondaryMuscles: text('secondary_muscles', { mode: 'json' })
      .notNull()
      .$type<string[]>(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    /** Manifest key for the Everkinetic art, null when none exists. */
    artKey: text('art_key'),
    /** User-authored notes shown every time this exercise is logged. */
    notes: text('notes'),
    defaultRestSec: integer('default_rest_sec'),
    /** Per-exercise weight unit override; null follows the global setting. */
    weightUnit: text('weight_unit'),
    /** Soft-hide from the library without losing history. */
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    ...syncColumns,
  },
  (t) => [
    index('exercises_name_idx').on(t.name),
    uniqueIndex('exercises_seed_slug_idx').on(t.seedSlug),
  ],
);

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export const routineFolders = sqliteTable('routine_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...syncColumns,
});

export const routines = sqliteTable(
  'routines',
  {
    id: text('id').primaryKey(),
    folderId: text('folder_id').references(() => routineFolders.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    lastPerformedAt: integer('last_performed_at'),
    ...syncColumns,
  },
  (t) => [index('routines_folder_idx').on(t.folderId)],
);

export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Exercises sharing a superset group are performed back-to-back.
     * Null means not in a superset. Supersets may hold more than two.
     */
    supersetGroup: integer('superset_group'),
    restSec: integer('rest_sec'),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    index('routine_exercises_routine_idx').on(t.routineId, t.sortOrder),
    index('routine_exercises_exercise_idx').on(t.exerciseId),
  ],
);

export const routineSets = sqliteTable(
  'routine_sets',
  {
    id: text('id').primaryKey(),
    routineExerciseId: text('routine_exercise_id')
      .notNull()
      .references(() => routineExercises.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    setType: text('set_type').notNull().default('normal'),
    targetWeightKg: real('target_weight_kg'),
    targetReps: integer('target_reps'),
    /** Upper bound of a rep RANGE; null means a single rep target. */
    targetRepsMax: integer('target_reps_max'),
    targetDurationSec: integer('target_duration_sec'),
    targetDistanceM: real('target_distance_m'),
    targetRpe: real('target_rpe'),
    ...syncColumns,
  },
  (t) => [index('routine_sets_parent_idx').on(t.routineExerciseId, t.sortOrder)],
);

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    /** Routine this came from, kept for "last performed" even if edited. */
    routineId: text('routine_id').references(() => routines.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    /** 'in_progress' | 'completed'. Exactly one row may be in_progress. */
    status: text('status').notNull().default('in_progress'),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    /** Excludes paused time, so it is not simply endedAt − startedAt. */
    durationSec: integer('duration_sec'),
    notes: text('notes'),
    /** Denormalised for fast list rendering; recomputed on save. */
    totalVolumeKg: real('total_volume_kg').notNull().default(0),
    totalSets: integer('total_sets').notNull().default(0),
    totalReps: integer('total_reps').notNull().default(0),
    prCount: integer('pr_count').notNull().default(0),
    /** Bodyweight at the time, so historic bodyweight volume stays correct. */
    bodyweightKg: real('bodyweight_kg'),
    ...syncColumns,
  },
  (t) => [
    index('workouts_started_idx').on(t.startedAt),
    index('workouts_status_idx').on(t.status),
    index('workouts_routine_idx').on(t.routineId),
  ],
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    supersetGroup: integer('superset_group'),
    restSec: integer('rest_sec'),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    index('workout_exercises_workout_idx').on(t.workoutId, t.sortOrder),
    index('workout_exercises_exercise_idx').on(t.exerciseId),
  ],
);

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: text('id').primaryKey(),
    workoutExerciseId: text('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    setType: text('set_type').notNull().default('normal'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationSec: integer('duration_sec'),
    distanceM: real('distance_m'),
    rpe: real('rpe'),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at'),
    /** JSON array of PrKind achieved by this set. */
    prKinds: text('pr_kinds', { mode: 'json' }).$type<string[]>(),
    ...syncColumns,
  },
  (t) => [index('workout_sets_parent_idx').on(t.workoutExerciseId, t.sortOrder)],
);

// ---------------------------------------------------------------------------
// Records, measurements, settings
// ---------------------------------------------------------------------------

export const personalRecords = sqliteTable(
  'personal_records',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    /** PrKind from src/domain/prDetection.ts */
    kind: text('kind').notNull(),
    value: real('value').notNull(),
    achievedAt: integer('achieved_at').notNull(),
    /** The set that set it, for "view this workout". */
    workoutSetId: text('workout_set_id').references(() => workoutSets.id, {
      onDelete: 'set null',
    }),
    ...syncColumns,
  },
  (t) => [uniqueIndex('personal_records_exercise_kind_idx').on(t.exerciseId, t.kind)],
);

export const bodyMeasurements = sqliteTable(
  'body_measurements',
  {
    id: text('id').primaryKey(),
    /** 'weight' | 'body_fat' | 'chest' | 'waist' | 'arm_left' | ... */
    kind: text('kind').notNull(),
    /** Canonical: kg for mass, cm for lengths, percent for body fat. */
    value: real('value').notNull(),
    measuredAt: integer('measured_at').notNull(),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [index('body_measurements_kind_idx').on(t.kind, t.measuredAt)],
);

/** Key/value app settings. Values are JSON-encoded. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Change log for a future sync engine. Written on every mutation, read by
 * nothing yet. Costs one INSERT per change and means sync can be added without
 * a backfill.
 */
export const syncOutbox = sqliteTable(
  'sync_outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    /** 'insert' | 'update' | 'delete' */
    op: text('op').notNull(),
    changedAt: integer('changed_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** Null once pushed. */
    pushedAt: integer('pushed_at'),
  },
  (t) => [index('sync_outbox_pending_idx').on(t.pushedAt, t.changedAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const routinesRelations = relations(routines, ({ one, many }) => ({
  folder: one(routineFolders, {
    fields: [routines.folderId],
    references: [routineFolders.id],
  }),
  exercises: many(routineExercises),
}));

export const routineExercisesRelations = relations(
  routineExercises,
  ({ one, many }) => ({
    routine: one(routines, {
      fields: [routineExercises.routineId],
      references: [routines.id],
    }),
    exercise: one(exercises, {
      fields: [routineExercises.exerciseId],
      references: [exercises.id],
    }),
    sets: many(routineSets),
  }),
);

export const routineSetsRelations = relations(routineSets, ({ one }) => ({
  routineExercise: one(routineExercises, {
    fields: [routineSets.routineExerciseId],
    references: [routineExercises.id],
  }),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  routine: one(routines, {
    fields: [workouts.routineId],
    references: [routines.id],
  }),
  exercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(
  workoutExercises,
  ({ one, many }) => ({
    workout: one(workouts, {
      fields: [workoutExercises.workoutId],
      references: [workouts.id],
    }),
    exercise: one(exercises, {
      fields: [workoutExercises.exerciseId],
      references: [exercises.id],
    }),
    sets: many(workoutSets),
  }),
);

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [workoutSets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));

export const exercisesRelations = relations(exercises, ({ many }) => ({
  personalRecords: many(personalRecords),
}));

export const personalRecordsRelations = relations(personalRecords, ({ one }) => ({
  exercise: one(exercises, {
    fields: [personalRecords.exerciseId],
    references: [exercises.id],
  }),
}));

export type ExerciseRow = typeof exercises.$inferSelect;
export type RoutineRow = typeof routines.$inferSelect;
export type RoutineFolderRow = typeof routineFolders.$inferSelect;
export type RoutineExerciseRow = typeof routineExercises.$inferSelect;
export type RoutineSetRow = typeof routineSets.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type WorkoutSetRow = typeof workoutSets.$inferSelect;
export type PersonalRecordRow = typeof personalRecords.$inferSelect;
export type BodyMeasurementRow = typeof bodyMeasurements.$inferSelect;
