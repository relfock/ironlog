/**
 * JSON export and import.
 *
 * With no sync server, this is the ONLY way a user can protect or move their
 * training history, so it is deliberately complete and conservative:
 *
 *  - Every domain table is exported, including tombstones, so an import
 *    reproduces the database rather than an approximation of it.
 *  - The format is versioned. An unknown or newer version is refused rather
 *    than partially applied.
 *  - Import is REPLACE-ALL inside a transaction. A merge across two divergent
 *    devices needs the sync engine that does not exist yet; silently
 *    interleaving rows would produce duplicate workouts and corrupt PRs.
 */
import { sql } from 'drizzle-orm';
import { db } from './client';
import {
  BACKUP_VERSION,
  BackupFormatError,
  csvRow,
  parseBackup,
  type BackupFile,
} from './backupFormat';
import {
  bodyMeasurements,
  exercises,
  personalRecords,
  routineExercises,
  routineFolders,
  routineSets,
  routines,
  settings,
  workoutExercises,
  workoutSets,
  workouts,
} from './schema';


export async function exportBackup(appVersion: string): Promise<BackupFile> {
  const [
    exerciseRows,
    folderRows,
    routineRows,
    routineExerciseRows,
    routineSetRows,
    workoutRows,
    workoutExerciseRows,
    workoutSetRows,
    prRows,
    measurementRows,
    settingRows,
  ] = await Promise.all([
    db.select().from(exercises),
    db.select().from(routineFolders),
    db.select().from(routines),
    db.select().from(routineExercises),
    db.select().from(routineSets),
    db.select().from(workouts),
    db.select().from(workoutExercises),
    db.select().from(workoutSets),
    db.select().from(personalRecords),
    db.select().from(bodyMeasurements),
    db.select().from(settings),
  ]);

  const tables = {
    exercises: exerciseRows,
    routineFolders: folderRows,
    routines: routineRows,
    routineExercises: routineExerciseRows,
    routineSets: routineSetRows,
    workouts: workoutRows,
    workoutExercises: workoutExerciseRows,
    workoutSets: workoutSetRows,
    personalRecords: prRows,
    bodyMeasurements: measurementRows,
    settings: settingRows,
  };

  const counts = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, v.length]),
  );

  return {
    format: 'ironlog-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    counts,
    tables,
  };
}

export interface ImportResult {
  readonly imported: Record<string, number>;
}

/**
 * Replace all local data with the backup's contents.
 *
 * SYNCHRONOUS ON PURPOSE. `expo-sqlite` is a *sync* Drizzle driver, and
 * Drizzle's sync `transaction()` does NOT await its callback — it calls the
 * function, then immediately issues `commit`. An `async` callback would
 * therefore run only up to its first `await`, the transaction would commit
 * empty, and every remaining statement would execute unprotected outside it.
 * A failure part-way would then leave the database wrecked, which is the exact
 * opposite of what a transaction is for.
 *
 * So every statement below uses `.run()`, which executes synchronously, and the
 * callback is a plain function. Insert order follows the foreign keys; delete
 * order reverses it.
 */
export async function importBackup(json: string): Promise<ImportResult> {
  const backup = parseBackup(json);
  const t = backup.tables;
  const imported: Record<string, number> = {};

  db.transaction((tx) => {
    // Children first — foreign keys are ON, so a parent cannot be deleted
    // before its children.
    tx.delete(workoutSets).run();
    tx.delete(workoutExercises).run();
    tx.delete(personalRecords).run();
    tx.delete(workouts).run();
    tx.delete(routineSets).run();
    tx.delete(routineExercises).run();
    tx.delete(routines).run();
    tx.delete(routineFolders).run();
    tx.delete(bodyMeasurements).run();
    tx.delete(exercises).run();
    tx.delete(settings).run();

    const insertAll = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: any,
      rows: unknown[] | undefined,
      name: string,
    ): void => {
      const list = rows ?? [];
      imported[name] = list.length;
      // Chunked: SQLite caps host parameters per statement, and a long history
      // easily exceeds it in a single multi-row insert.
      const CHUNK = 100;
      for (let i = 0; i < list.length; i += CHUNK) {
        const slice = list.slice(i, i + CHUNK);
        if (slice.length === 0) continue;
        tx.insert(table).values(slice as never).run();
      }
    };

    insertAll(exercises, t.exercises, 'exercises');
    insertAll(routineFolders, t.routineFolders, 'routineFolders');
    insertAll(routines, t.routines, 'routines');
    insertAll(routineExercises, t.routineExercises, 'routineExercises');
    insertAll(routineSets, t.routineSets, 'routineSets');
    insertAll(workouts, t.workouts, 'workouts');
    insertAll(workoutExercises, t.workoutExercises, 'workoutExercises');
    insertAll(workoutSets, t.workoutSets, 'workoutSets');
    insertAll(personalRecords, t.personalRecords, 'personalRecords');
    insertAll(bodyMeasurements, t.bodyMeasurements, 'bodyMeasurements');
    insertAll(settings, t.settings, 'settings');
  });

  return { imported };
}

/**
 * Workout history as CSV — one row per logged set.
 *
 * Provided alongside JSON because a spreadsheet is what people actually reach
 * for when they want to analyse their own training, and unlike the JSON backup
 * it is not intended to be re-importable.
 */
export async function exportSetsCsv(): Promise<string> {
  const rows = await db.all<{
    workout_name: string;
    started_at: number;
    exercise_name: string;
    set_order: number;
    set_type: string;
    weight_kg: number | null;
    reps: number | null;
    duration_sec: number | null;
    distance_m: number | null;
    rpe: number | null;
    completed: number;
  }>(sql`
    SELECT w.name       AS workout_name,
           w.started_at AS started_at,
           e.name       AS exercise_name,
           ws.sort_order AS set_order,
           ws.set_type  AS set_type,
           ws.weight_kg AS weight_kg,
           ws.reps      AS reps,
           ws.duration_sec AS duration_sec,
           ws.distance_m AS distance_m,
           ws.rpe       AS rpe,
           ws.completed AS completed
    FROM workout_sets ws
    JOIN workout_exercises we ON we.id = ws.workout_exercise_id
    JOIN workouts w ON w.id = we.workout_id
    JOIN exercises e ON e.id = we.exercise_id
    WHERE w.status = 'completed'
      AND w.deleted = 0 AND we.deleted = 0 AND ws.deleted = 0
    ORDER BY w.started_at ASC, we.sort_order ASC, ws.sort_order ASC
  `);

  const header = [
    'date',
    'workout',
    'exercise',
    'set',
    'set_type',
    'weight_kg',
    'reps',
    'duration_sec',
    'distance_m',
    'rpe',
    'completed',
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      csvRow([
        new Date(r.started_at).toISOString(),
        r.workout_name,
        r.exercise_name,
        r.set_order + 1,
        r.set_type,
        r.weight_kg,
        r.reps,
        r.duration_sec,
        r.distance_m,
        r.rpe,
        r.completed === 1 ? 'yes' : 'no',
      ]),
    );
  }
  return lines.join('\n');
}

export { BACKUP_VERSION, BackupFormatError };
export type { BackupFile };
