import { Platform } from 'react-native';
import {
  getGrantedPermissions,
  initialize,
  readRecords,
  requestPermission,
  type Permission,
  type ReadHealthDataHistoryPermission,
} from 'react-native-health-connect';

/** Body-composition records this app can read from Health Connect. */
export type BodyCompositionRecordType = 'Weight' | 'BodyFat' | 'LeanBodyMass' | 'BoneMass';

export interface BodyCompositionEntry {
  /** The `body_measurements.kind` this maps to. */
  kind: 'weight' | 'body_fat' | 'lean_body_mass' | 'bone_mass';
  /** Stored value in the app's canonical unit (kg for mass, % for body fat). */
  value: number;
  /** Epoch milliseconds the measurement was taken. */
  measuredAt: number;
}

export const BODY_COMPOSITION_RECORD_TYPES: readonly BodyCompositionRecordType[] = [
  'Weight',
  'BodyFat',
  'LeanBodyMass',
  'BoneMass',
];

/** Safety valve: never follow more than this many pages per record type. */
const MAX_PAGES = 200;
/** A single Health Connect page read should never take this long. */
const PAGE_TIMEOUT_MS = 20_000;

/**
 * Health Connect is Android-only. Everything in this module must no-op safely
 * on other platforms so callers never need to branch on platform themselves.
 */
export function isHealthConnectAvailable(): boolean {
  return Platform.OS === 'android';
}

/** Initialise the Health Connect client. Returns false if unavailable. */
export async function initHealthConnect(): Promise<boolean> {
  if (!isHealthConnectAvailable()) return false;
  try {
    return await initialize();
  } catch {
    return false;
  }
}

/**
 * Request read access for the body-composition record types (plus history
 * access so data older than 30 days can be imported). Returns the record
 * types the user actually granted — the caller should only read those.
 */
export async function requestBodyCompositionPermission(): Promise<BodyCompositionRecordType[]> {
  const perms: (Permission | ReadHealthDataHistoryPermission)[] = [
    ...BODY_COMPOSITION_RECORD_TYPES.map(
      (recordType): Permission => ({ accessType: 'read', recordType }),
    ),
    { accessType: 'read', recordType: 'ReadHealthDataHistory' },
  ];
  try {
    const granted = await requestPermission(perms);
    return grantedBodyComposition(granted);
  } catch {
    return [];
  }
}

/** The body-composition record types the app already has read access to. */
export async function getGrantedBodyCompositionTypes(): Promise<BodyCompositionRecordType[]> {
  try {
    const granted = await getGrantedPermissions();
    return grantedBodyComposition(granted);
  } catch {
    return [];
  }
}

function grantedBodyComposition(
  granted: readonly { accessType: string; recordType: string }[],
): BodyCompositionRecordType[] {
  const grantedRecords = new Set(
    granted.filter((p) => p.accessType === 'read').map((p) => p.recordType),
  );
  return BODY_COMPOSITION_RECORD_TYPES.filter((rt) => grantedRecords.has(rt));
}

/**
 * Read body-composition records of the given types in [startTimeMs,
 * endTimeMs] (inclusive), following pagination until every page is consumed.
 * Values are returned in the app's canonical units.
 */
export async function readBodyComposition(
  startTimeMs: number,
  endTimeMs: number,
  recordTypes: readonly BodyCompositionRecordType[] = BODY_COMPOSITION_RECORD_TYPES,
): Promise<BodyCompositionEntry[]> {
  if (!isHealthConnectAvailable()) return [];

  const startTime = new Date(startTimeMs).toISOString();
  const endTime = new Date(endTimeMs).toISOString();

  const entries: BodyCompositionEntry[] = [];
  const want = new Set<BodyCompositionRecordType>(recordTypes);

  if (want.has('Weight')) {
    for (const r of await readAllRecords('Weight', startTime, endTime)) {
      pushEntry(entries, 'weight', r.weight.inKilograms, r.time);
    }
  }

  if (want.has('BodyFat')) {
    for (const r of await readAllRecords('BodyFat', startTime, endTime)) {
      pushEntry(entries, 'body_fat', r.percentage, r.time);
    }
  }

  if (want.has('LeanBodyMass')) {
    for (const r of await readAllRecords('LeanBodyMass', startTime, endTime)) {
      pushEntry(entries, 'lean_body_mass', r.mass.inKilograms, r.time);
    }
  }

  if (want.has('BoneMass')) {
    for (const r of await readAllRecords('BoneMass', startTime, endTime)) {
      pushEntry(entries, 'bone_mass', r.mass.inKilograms, r.time);
    }
  }

  return entries;
}

function pushEntry(
  entries: BodyCompositionEntry[],
  kind: BodyCompositionEntry['kind'],
  value: number,
  time: string,
): void {
  const measuredAt = Date.parse(time);
  if (Number.isNaN(measuredAt) || !Number.isFinite(value)) return;
  entries.push({ kind, value, measuredAt });
}

async function readAllRecords<T extends BodyCompositionRecordType>(
  recordType: T,
  startTime: string,
  endTime: string,
): Promise<import('react-native-health-connect').RecordResult<T>[]> {
  const out: import('react-native-health-connect').RecordResult<T>[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;
  do {
    if (pageCount >= MAX_PAGES) break;
    pageCount++;
    const page = await withTimeout(
      readRecords(recordType, {
        timeRangeFilter: {
          operator: 'between',
          startTime,
          endTime,
        },
        ascendingOrder: true,
        pageToken,
      }),
      PAGE_TIMEOUT_MS,
      recordType,
    );
    out.push(...page.records);
    pageToken = page.pageToken;
    // Health Connect can report the end of pagination as null OR an empty
    // string depending on platform/APK version. Only a non-empty token means
    // there are more pages to fetch; anything else terminates the loop.
  } while (isNonEmpty(pageToken));
  return out;
}

function isNonEmpty(token: string | undefined): boolean {
  return token !== undefined && token !== null && token.trim() !== '';
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Health Connect timed out reading ${what}.`)),
        ms,
      );
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}