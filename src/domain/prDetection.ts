/**
 * Personal-record detection.
 *
 * Drives both the stored `personal_records` table and the live in-workout PR
 * notification, so it must be cheap and pure: given one completed set and the
 * current records for that exercise, say which records it beats.
 */
import { estimateOneRepMax, type OneRepMaxFormula } from './oneRepMax';
import type { LoggedSet, TrackingType } from './types';
import { setTypeCountsForStats } from './types';
import { effectiveLoadKg } from './volume';

export type PrKind =
  | 'max_weight'
  | 'best_1rm'
  | 'max_reps'
  | 'best_set_volume'
  | 'max_duration'
  | 'max_distance'
  | 'best_session_volume';

export const ALL_PR_KINDS: readonly PrKind[] = [
  'max_weight',
  'best_1rm',
  'max_reps',
  'best_set_volume',
  'max_duration',
  'max_distance',
  'best_session_volume',
];

/** Current best value per kind. Absent key = no record yet. */
export type RecordBook = ReadonlyMap<PrKind, number>;

export interface PrCandidate {
  readonly kind: PrKind;
  readonly value: number;
  readonly previous: number | null;
}

export interface PrDetectionOptions {
  readonly trackingType: TrackingType;
  readonly bodyweightKg: number | null;
  readonly countWarmups: boolean;
  readonly formula?: OneRepMaxFormula;
}

/**
 * Every metric this set could set a record in, with its value.
 * Records are strictly greater-than: matching a record does not re-set it, so
 * the user is not spammed with a PR banner for repeating last week's top set.
 */
export function candidateValues(
  set: LoggedSet,
  options: PrDetectionOptions,
): Map<PrKind, number> {
  const out = new Map<PrKind, number>();
  if (!set.completed) return out;
  if (!setTypeCountsForStats(set.setType, options.countWarmups)) return out;

  const { trackingType, bodyweightKg } = options;
  const load = effectiveLoadKg(set, trackingType, bodyweightKg);

  if (load !== null && load > 0) {
    out.set('max_weight', load);
    if (set.reps !== null && set.reps > 0) {
      out.set('best_set_volume', load * set.reps);
      const orm = estimateOneRepMax(load, set.reps, options.formula ?? 'epley');
      if (orm !== null) out.set('best_1rm', orm);
    }
  }

  if (set.reps !== null && set.reps > 0) {
    out.set('max_reps', set.reps);
  }
  if (set.durationSec !== null && set.durationSec > 0) {
    out.set('max_duration', set.durationSec);
  }
  if (set.distanceM !== null && set.distanceM > 0) {
    out.set('max_distance', set.distanceM);
  }

  return out;
}

/** Which records this set actually beats. */
export function detectPrs(
  set: LoggedSet,
  records: RecordBook,
  options: PrDetectionOptions,
): PrCandidate[] {
  const candidates = candidateValues(set, options);
  const beaten: PrCandidate[] = [];

  for (const [kind, value] of candidates) {
    const previous = records.get(kind) ?? null;
    if (previous === null || value > previous) {
      beaten.push({ kind, value, previous });
    }
  }
  return beaten;
}

/**
 * The one PR worth announcing when a set beats several at once.
 * Ordered by how meaningful it is to a lifter: a heavier top set is the
 * headline; rep and volume records are consolation.
 */
const ANNOUNCE_PRIORITY: readonly PrKind[] = [
  'max_weight',
  'best_1rm',
  'max_distance',
  'max_duration',
  'max_reps',
  'best_session_volume',
  'best_set_volume',
];

export function headlinePr(prs: readonly PrCandidate[]): PrCandidate | null {
  for (const kind of ANNOUNCE_PRIORITY) {
    const hit = prs.find((p) => p.kind === kind);
    if (hit) return hit;
  }
  return prs[0] ?? null;
}

/** Fold beaten records back into the book. Returns a new map. */
export function applyPrs(
  records: RecordBook,
  prs: readonly PrCandidate[],
): Map<PrKind, number> {
  const next = new Map(records);
  for (const pr of prs) {
    const existing = next.get(pr.kind);
    if (existing === undefined || pr.value > existing) next.set(pr.kind, pr.value);
  }
  return next;
}

export const PR_KIND_LABELS: Record<PrKind, string> = {
  max_weight: 'Heaviest weight',
  best_1rm: 'Best est. 1RM',
  max_reps: 'Most reps',
  best_set_volume: 'Best set volume',
  max_duration: 'Longest duration',
  max_distance: 'Furthest distance',
  best_session_volume: 'Best session volume',
};
