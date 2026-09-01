/**
 * Backup file format: shape, validation and CSV escaping.
 *
 * Deliberately free of any database import so it can be unit-tested on plain
 * node — `client.ts` opens SQLite at module load, which would make these rules
 * untestable outside a device.
 */

export const BACKUP_VERSION = 1;

export interface BackupFile {
  readonly format: 'ironlog-backup';
  readonly version: number;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly counts: Record<string, number>;
  readonly tables: {
    readonly exercises: unknown[];
    readonly routineFolders: unknown[];
    readonly routines: unknown[];
    readonly routineExercises: unknown[];
    readonly routineSets: unknown[];
    readonly workouts: unknown[];
    readonly workoutExercises: unknown[];
    readonly workoutSets: unknown[];
    readonly personalRecords: unknown[];
    readonly bodyMeasurements: unknown[];
    readonly settings: unknown[];
  };
}

/** Thrown for a file we refuse to touch. Messages are safe to show the user. */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

/**
 * Validate a parsed backup.
 *
 * A NEWER format version is refused outright rather than partially applied:
 * importing a file we do not fully understand risks dropping data the user
 * believes is safely backed up.
 */
export function assertBackup(parsed: unknown): BackupFile {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BackupFormatError('That file is not an IronLog backup.');
  }
  const candidate = parsed as Partial<BackupFile>;

  if (candidate.format !== 'ironlog-backup') {
    throw new BackupFormatError('That file is not an IronLog backup.');
  }
  if (typeof candidate.version !== 'number' || !Number.isFinite(candidate.version)) {
    throw new BackupFormatError('This backup is missing a version number.');
  }
  if (candidate.version > BACKUP_VERSION) {
    throw new BackupFormatError(
      `This backup was made by a newer version of IronLog (format ${candidate.version}). ` +
        'Update the app first — importing it here could lose data.',
    );
  }
  if (
    typeof candidate.tables !== 'object' ||
    candidate.tables === null ||
    Array.isArray(candidate.tables)
  ) {
    throw new BackupFormatError('This backup contains no data.');
  }
  return candidate as BackupFile;
}

/** Parse and validate in one step. */
export function parseBackup(json: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BackupFormatError('That file is not valid JSON.');
  }
  return assertBackup(parsed);
}

/** Quote a CSV cell, doubling embedded quotes per RFC 4180. */
export function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells
    .map((c) => (c === null || c === undefined ? '' : csvCell(String(c))))
    .join(',');
}
