import {
  BACKUP_VERSION,
  BackupFormatError,
  assertBackup,
  csvCell,
  csvRow,
  parseBackup,
} from './backupFormat';

const EMPTY_TABLES = {
  exercises: [],
  routineFolders: [],
  routines: [],
  routineExercises: [],
  routineSets: [],
  workouts: [],
  workoutExercises: [],
  workoutSets: [],
  personalRecords: [],
  bodyMeasurements: [],
  settings: [],
};

function valid(over: Record<string, unknown> = {}) {
  return {
    format: 'ironlog-backup',
    version: BACKUP_VERSION,
    exportedAt: '2026-09-01T00:00:00.000Z',
    appVersion: '0.1.0',
    counts: {},
    tables: EMPTY_TABLES,
    ...over,
  };
}

describe('assertBackup', () => {
  it('accepts a well-formed backup', () => {
    expect(() => assertBackup(valid())).not.toThrow();
  });

  it('accepts an OLDER format version', () => {
    // Forward compatibility: we can still read what we used to write.
    expect(() => assertBackup(valid({ version: BACKUP_VERSION - 1 }))).not.toThrow();
  });

  it('REFUSES a newer format version rather than half-importing it', () => {
    expect(() => assertBackup(valid({ version: BACKUP_VERSION + 1 }))).toThrow(
      BackupFormatError,
    );
    expect(() => assertBackup(valid({ version: 99 }))).toThrow(/newer version/i);
  });

  it('rejects a file that is not ours', () => {
    expect(() => assertBackup({ format: 'strong-export', version: 1 })).toThrow(
      /not an IronLog backup/,
    );
    expect(() => assertBackup(valid({ format: undefined }))).toThrow(BackupFormatError);
  });

  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 42, 'text', true, []]) {
      expect(() => assertBackup(bad)).toThrow(BackupFormatError);
    }
  });

  it('rejects a missing or non-numeric version', () => {
    expect(() => assertBackup(valid({ version: undefined }))).toThrow(/version number/);
    expect(() => assertBackup(valid({ version: '1' }))).toThrow(/version number/);
    expect(() => assertBackup(valid({ version: NaN }))).toThrow(/version number/);
  });

  it('rejects a backup with no tables', () => {
    expect(() => assertBackup(valid({ tables: undefined }))).toThrow(/no data/);
    expect(() => assertBackup(valid({ tables: [] }))).toThrow(/no data/);
    expect(() => assertBackup(valid({ tables: null }))).toThrow(/no data/);
  });
});

describe('parseBackup', () => {
  it('round-trips valid JSON', () => {
    const backup = parseBackup(JSON.stringify(valid()));
    expect(backup.format).toBe('ironlog-backup');
    expect(backup.version).toBe(BACKUP_VERSION);
  });

  it('gives a readable message for malformed JSON', () => {
    expect(() => parseBackup('{ not json')).toThrow(/not valid JSON/);
    expect(() => parseBackup('')).toThrow(/not valid JSON/);
  });

  it('surfaces a message safe to show a user', () => {
    try {
      parseBackup(JSON.stringify(valid({ version: 5 })));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BackupFormatError);
      expect((err as Error).message).not.toContain('undefined');
      expect((err as Error).message.length).toBeGreaterThan(20);
    }
  });
});

describe('csvCell', () => {
  it('leaves ordinary values unquoted', () => {
    expect(csvCell('Bench Press')).toBe('Bench Press');
    expect(csvCell('100')).toBe('100');
  });

  it('quotes and escapes values containing a comma, quote or newline', () => {
    expect(csvCell('Squat, wide')).toBe('"Squat, wide"');
    expect(csvCell('5" deficit')).toBe('"5"" deficit"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('carriage\rreturn')).toBe('"carriage\rreturn"');
  });

  it('escapes a value that is only quotes', () => {
    expect(csvCell('""')).toBe('""""""');
  });
});

describe('csvRow', () => {
  it('joins cells and renders null/undefined as empty', () => {
    expect(csvRow(['a', 1, null, undefined, 'b'])).toBe('a,1,,,b');
  });

  it('escapes each cell independently', () => {
    expect(csvRow(['Squat, wide', 100])).toBe('"Squat, wide",100');
  });
});
