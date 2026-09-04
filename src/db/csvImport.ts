/**
 * CSV import for workout data.
 *
 * Parses a CSV export (Strong-app format or similar) and inserts the workouts
 * into the local database. Exercises are matched against the existing catalogue
 * using the fuzzy matcher from exerciseSearch; unknown names are created as
 * custom exercises with weight_reps tracking.
 *
 * The CSV is expected to have these columns (header row required):
 *   title, start_time, end_time, description, exercise_title, superset_id,
 *   exercise_notes, set_index, set_type, weight_kg, reps, distance_km,
 *   duration_seconds, rpe
 */
import { db } from './client';
import { newId } from './ids';
import { recordChange } from './repositories/outbox';
import {
  workoutExercises as weTable,
  workoutSets as wsTable,
  workouts as wTable,
} from './schema';
import { listExercises, createCustomExercise } from './repositories/exercises';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
} from './repositories/routines';
import { recomputeWorkoutTotals } from './repositories/workouts';
import { bestMatch } from '@/domain/exerciseSearch';
import type { SetType } from '@/domain/types';

// ── CSV row parser ───────────────────────────────────────────────────────────

/**
 * Split a single CSV line into cells, respecting RFC 4180 double-quote escaping.
 *
 * Handles:
 *   - Quoted fields containing commas, newlines, or escaped quotes ("")
 *   - Unquoted fields
 *   - Empty fields (consecutive commas or trailing commas)
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      cells.push('');
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      let j = i + 1;
      let value = '';
      while (j < line.length) {
        if (line[j] === '"') {
          if (j + 1 < line.length && line[j + 1] === '"') {
            value += '"';
            j += 2;
          } else {
            j++; // closing quote
            break;
          }
        } else {
          value += line[j];
          j++;
        }
      }
      cells.push(value);
      i = j + 1; // skip comma after field
    } else {
      // Unquoted field
      const comma = line.indexOf(',', i);
      if (comma === -1) {
        cells.push(line.slice(i));
        break;
      }
      cells.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
  return cells;
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

export interface CsvSetRow {
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly description: string;
  readonly exerciseTitle: string;
  readonly supersetId: string;
  readonly exerciseNotes: string;
  readonly setIndex: number;
  readonly setType: SetType;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly distanceKm: number | null;
  readonly durationSec: number | null;
  readonly rpe: number | null;
}

/**
 * Parse a CSV string into structured set rows.
 *
 * Expects a header row whose columns match the Strong-app export format.
 * Returns only rows that have a non-empty exercise_title.
 */
export function parseCsv(csv: string): CsvSetRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const colIndex = (name: string): number => header.indexOf(name);

  const iTitle = colIndex('title');
  const iStart = colIndex('start_time');
  const iEnd = colIndex('end_time');
  const iDesc = colIndex('description');
  const iEx = colIndex('exercise_title');
  const iSup = colIndex('superset_id');
  const iNotes = colIndex('exercise_notes');
  const iSetIdx = colIndex('set_index');
  const iSetType = colIndex('set_type');
  const iWeight = colIndex('weight_kg');
  const iReps = colIndex('reps');
  const iDist = colIndex('distance_km');
  const iDur = colIndex('duration_seconds');
  const iRpe = colIndex('rpe');

  const rows: CsvSetRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]!);
    const ex = cells[iEx]?.trim() ?? '';
    if (ex.length === 0) continue;

    const num = (idx: number): number | null => {
      const raw = cells[idx]?.trim() ?? '';
      if (raw.length === 0) return NaN;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const rawType = (cells[iSetType]?.trim() ?? 'normal').toLowerCase();
    const validTypes: readonly SetType[] = ['normal', 'warmup', 'drop', 'failure'];
    const setType: SetType = validTypes.includes(rawType as SetType)
      ? (rawType as SetType)
      : 'normal';

    rows.push({
      title: cells[iTitle]?.trim() ?? '',
      startTime: cells[iStart]?.trim() ?? '',
      endTime: cells[iEnd]?.trim() ?? '',
      description: cells[iDesc]?.trim() ?? '',
      exerciseTitle: ex,
      supersetId: cells[iSup]?.trim() ?? '',
      exerciseNotes: cells[iNotes]?.trim() ?? '',
      setIndex: num(iSetIdx) ?? 0,
      setType,
      weightKg: num(iWeight),
      reps: num(iReps),
      distanceKm: num(iDist),
      durationSec: num(iDur),
      rpe: num(iRpe),
    });
  }
  return rows;
}

// ── Date parsing ─────────────────────────────────────────────────────────────

const MONTH_INDEX = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * Parse a CSV timestamp like "25 Aug 2026, 13:38" into a Unix ms timestamp.
 * Returns NaN on failure.
 *
 * The JS `Date(str)` parser cannot be trusted for this format: Hermes does not
 * accept "25 Aug 2026, 13:38" (it returns Invalid Date), which silently fell
 * back to the import time. So the common Strong/Hevy layouts are parsed by hand
 * before falling through to the native parser.
 */
function parseDate(s: string): number {
  const str = s.trim();
  if (str.length === 0) return NaN;

  // "25 Aug 2026, 13:38" or "25 Aug 2026, 13:38:47"
  const dmy = /^(\d{1,2})\s+([a-z]{3,})\s+(\d{4})\s*,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/i.exec(str);
  if (dmy) {
    const month = MONTH_INDEX.indexOf(dmy[2]!.toLowerCase().slice(0, 3));
    if (month >= 0) {
      const ms = new Date(
        Number(dmy[3]),
        month,
        Number(dmy[1]),
        Number(dmy[4]),
        Number(dmy[5]),
        dmy[6] ? Number(dmy[6]) : 0,
        0,
      ).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    }
  }

  // ISO-ish: "2026-08-25 13:38:00" or "2026-08-25T13:38:00"
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
  if (iso) {
    const ms = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      iso[4] ? Number(iso[4]) : 0,
      iso[5] ? Number(iso[5]) : 0,
      iso[6] ? Number(iso[6]) : 0,
      0,
    ).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  // Date-only "25 Aug 2026"
  const dOnly = /^(\d{1,2})\s+([a-z]{3,})\s+(\d{4})$/i.exec(str);
  if (dOnly) {
    const month = MONTH_INDEX.indexOf(dOnly[2]!.toLowerCase().slice(0, 3));
    if (month >= 0) {
      const ms = new Date(Number(dOnly[3]), month, Number(dOnly[1]), 0, 0, 0, 0).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    }
  }

  const d = new Date(str);
  return Number.isFinite(d.getTime()) ? d.getTime() : NaN;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

interface WorkoutGroup {
  readonly title: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly description: string;
  rows: CsvSetRow[];
}

function groupWorkouts(rows: readonly CsvSetRow[]): WorkoutGroup[] {
  const map = new Map<string, WorkoutGroup>();
  const order: string[] = [];

  for (const r of rows) {
    const key = `${r.title}||${r.startTime}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, {
        title: r.title,
        startMs: parseDate(r.startTime),
        endMs: parseDate(r.endTime),
        description: r.description,
        rows: [],
      });
    }
    map.get(key)!.rows.push(r);
  }

  return order.map((k) => map.get(k)!);
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface CsvImportResult {
  readonly workoutsImported: number;
  readonly exercisesMatched: number;
  readonly exercisesCreated: number;
  readonly routinesCreated: number;
  readonly skipped: readonly string[];
}

/**
 * Import a CSV string into the workout database.
 *
 * Exercises are matched by name against the existing catalogue. Unknown
 * exercises are created as custom weight_reps exercises. The imported
 * workouts are marked as completed.
 */
export async function importCsv(csv: string): Promise<CsvImportResult> {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return {
      workoutsImported: 0,
      exercisesMatched: 0,
      exercisesCreated: 0,
      routinesCreated: 0,
      skipped: [],
    };
  }

  const groups = groupWorkouts(rows);
  const allExercises = await listExercises(true);

  let exercisesMatched = 0;
  let exercisesCreated = 0;
  const skipped: string[] = [];
  const exerciseNameCache = new Map<string, string>(); // csv name -> db id

  const resolveExercise = async (name: string): Promise<string | null> => {
    const cached = exerciseNameCache.get(name);
    if (cached !== undefined) return cached;

    const match = bestMatch(name, allExercises, (e) => e.name);
    if (match !== null) {
      exerciseNameCache.set(name, match.item.id);
      exercisesMatched++;
      return match.item.id;
    }

    // Create as custom exercise
    try {
      const id = await createCustomExercise({
        name,
        trackingType: 'weight_reps',
        equipment: 'other',
        primary: ['full_body'],
      });
      exerciseNameCache.set(name, id);
      exercisesCreated++;
      return id;
    } catch {
      skipped.push(name);
      return null;
    }
  };

  let workoutsImported = 0;
  const titleAggs = new Map<string, TitleAgg>();

  for (const group of groups) {
    const startValid = Number.isFinite(group.startMs) && group.startMs > 0;
    const endValid = Number.isFinite(group.endMs) && group.endMs > 0;
    if (!startValid) {
      skipped.push(`Workout "${group.title}" — invalid start date`);
      continue;
    }

    // Deduplicate exercises within this workout (same exercise_title → same WE row)
    const exerciseOrder = new Map<string, number>(); // exerciseTitle -> sortOrder
    const exerciseIds = new Map<string, string>(); // exerciseTitle -> db exerciseId
    let sortOrder = 0;

    for (const r of group.rows) {
      if (!exerciseOrder.has(r.exerciseTitle)) {
        exerciseOrder.set(r.exerciseTitle, sortOrder++);
        const exId = await resolveExercise(r.exerciseTitle);
        if (exId !== null) {
          exerciseIds.set(r.exerciseTitle, exId);
        }
      }
    }

    if (exerciseIds.size === 0) {
      skipped.push(`Workout "${group.title}" — no matching exercises`);
      continue;
    }

    const workoutId = newId();
    const durationMs = endValid ? group.endMs - group.startMs : 0;
    const durationSec = durationMs > 0 ? Math.round(durationMs / 1000) : null;

    // Insert workout
    await db.insert(wTable).values({
      id: workoutId,
      routineId: null,
      name: group.title || 'Imported Workout',
      status: 'completed',
      startedAt: group.startMs,
      endedAt: endValid ? group.endMs : undefined,
      durationSec,
      notes: group.description || null,
      totalVolumeKg: 0,
      totalSets: 0,
      totalReps: 0,
      prCount: 0,
      bodyweightKg: null,
    });
    await recordChange('workouts', workoutId, 'insert');

    // Insert exercises + sets, and fold this occurrence into the per-title
    // aggregate used for routine extraction below.
    for (const [exTitle, exSort] of exerciseOrder) {
      const exId = exerciseIds.get(exTitle);
      if (exId === undefined) continue;

      const weId = newId();
      await db.insert(weTable).values({
        id: weId,
        workoutId,
        exerciseId: exId,
        sortOrder: exSort,
        notes: null,
      });
      await recordChange('workout_exercises', weId, 'insert');

      const exRows = group.rows.filter((r) => r.exerciseTitle === exTitle);
      for (const r of exRows) {
        const wsId = newId();
        await db.insert(wsTable).values({
          id: wsId,
          workoutExerciseId: weId,
          sortOrder: r.setIndex,
          setType: r.setType,
          weightKg: r.weightKg,
          reps: r.reps !== null ? Math.round(r.reps) : null,
          durationSec: r.durationSec !== null ? Math.round(r.durationSec) : null,
          distanceM: r.distanceKm !== null ? Math.round(r.distanceKm * 1000) : null,
          rpe: r.rpe,
          completed: true,
          completedAt: group.startMs,
        });
        await recordChange('workout_sets', wsId, 'insert');
      }

      accumulateTitleAgg(titleAggs, {
        title: group.title,
        exerciseTitle: exTitle,
        exerciseId: exId,
        sets: exRows.map((r) => ({
          setType: r.setType,
          weightKg: r.weightKg,
          reps: r.reps,
          durationSec: r.durationSec,
          distanceM: r.distanceKm !== null ? r.distanceKm * 1000 : null,
          rpe: r.rpe,
        })),
      });
    }

    // Compute denormalised totals
    await recomputeWorkoutTotals(workoutId, true);
    workoutsImported++;
  }

  // Derive routines: one per distinct workout title, holding the UNION of the
  // exercises seen across every performance of that title. A titied split like
  // "Day 1" (3 exercises on 1 July) combined with "Day 1" (9 on 8 July) yields
  // one routine with 3 + 9 − (overlap). For each exercise the fullest set
  // template seen is used, so a partial day never truncates the routine.
  let routinesCreated = 0;
  for (const [title, agg] of titleAggs) {
    if (title.trim().length === 0) continue;
    const routineId = await createRoutine(title);
    let routineOrder = 0;
    for (const exTitle of agg.exerciseOrder) {
      const exId = agg.exerciseIds.get(exTitle);
      if (exId === undefined) continue;
      const reId = await addExerciseToRoutine(routineId, exId, routineOrder++, {
        setCount: 0,
      });
      const sets = agg.bestSets.get(exTitle) ?? [];
      let setOrder = 0;
      for (const s of sets) {
        await addRoutineSet(reId, setOrder++, {
          setType: s.setType,
          targetWeightKg: s.weightKg,
          targetReps: s.reps,
          targetDurationSec: s.durationSec,
          targetDistanceM: s.distanceM,
        });
      }
    }
    routinesCreated++;
  }

  return {
    workoutsImported,
    exercisesMatched,
    exercisesCreated,
    routinesCreated,
    skipped,
  };
}

/** A single performed set, ready to become a routine target. */
interface PerformedSet {
  readonly setType: SetType;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly durationSec: number | null;
  readonly distanceM: number | null;
  readonly rpe: number | null;
}

/**
 * Per-title accumulation for routine extraction: distinct exercises in
 * first-seen order plus, per exercise, the fullest set list observed across
 * every performance of that title.
 */
interface TitleAgg {
  readonly exerciseOrder: string[];
  readonly exerciseIds: Map<string, string>;
  readonly bestSets: Map<string, PerformedSet[]>;
}

function accumulateTitleAgg(
  aggs: Map<string, TitleAgg>,
  entry: {
    readonly title: string;
    readonly exerciseTitle: string;
    readonly exerciseId: string;
    readonly sets: readonly PerformedSet[];
  },
): void {
  let agg = aggs.get(entry.title);
  if (agg === undefined) {
    agg = {
      exerciseOrder: [],
      exerciseIds: new Map(),
      bestSets: new Map(),
    };
    aggs.set(entry.title, agg);
  }
  if (!agg.exerciseOrder.includes(entry.exerciseTitle)) {
    agg.exerciseOrder.push(entry.exerciseTitle);
  }
  agg.exerciseIds.set(entry.exerciseTitle, entry.exerciseId);
  const current = agg.bestSets.get(entry.exerciseTitle);
  if (current === undefined || entry.sets.length > current.length) {
    agg.bestSets.set(entry.exerciseTitle, [...entry.sets]);
  }
}
