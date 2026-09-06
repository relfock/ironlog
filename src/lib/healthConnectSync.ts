import {
  addMeasurement,
  type MeasurementKind,
} from '@/db/repositories/measurements';
import { db } from '@/db/client';
import { bodyMeasurements } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import {
  BODY_COMPOSITION_RECORD_TYPES,
  initHealthConnect,
  isHealthConnectAvailable,
  readBodyComposition,
  requestBodyCompositionPermission,
  type BodyCompositionRecordType,
} from './healthConnect';

const SOURCE_NOTE = 'Health Connect';

export type SyncResult =
  | { status: 'unavailable' }
  | { status: 'not-authorized' }
  | { status: 'no-data'; imported: 0; skipped: 0; denied: readonly BodyCompositionRecordType[] }
  | { status: 'ok'; imported: number; skipped: number; denied: readonly BodyCompositionRecordType[] };

const SYNCED_KINDS: readonly MeasurementKind[] = [
  'weight',
  'body_fat',
  'lean_body_mass',
  'bone_mass',
];

/**
 * Pull body-composition data from Health Connect into the local
 * body_measurements table. Read-only: nothing is ever written back.
 * Records are deduplicated on (kind, measuredAt) so re-syncing is idempotent.
 */
export async function syncBodyCompositionFromHealthConnect(
  startTimeMs: number = Date.parse('2000-01-01T00:00:00Z'),
  endTimeMs: number = Date.now(),
): Promise<SyncResult> {
  if (!isHealthConnectAvailable()) return { status: 'unavailable' };

  const initialized = await initHealthConnect();
  if (!initialized) return { status: 'unavailable' };

  const granted = await requestBodyCompositionPermission();
  if (granted.length === 0) return { status: 'not-authorized' };

  const denied = BODY_COMPOSITION_RECORD_TYPES.filter((rt) => !granted.includes(rt));

  const entries = await readBodyComposition(startTimeMs, endTimeMs, granted);
  if (entries.length === 0) {
    return { status: 'no-data', imported: 0, skipped: 0, denied };
  }

  const existing = await existingMeasurementKeys();
  let imported = 0;
  let skipped = 0;

  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.measuredAt}`;
    if (existing.has(key) || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    await addMeasurement(entry.kind, entry.value, entry.measuredAt, SOURCE_NOTE);
    imported++;
  }

  return { status: 'ok', imported, skipped, denied };
}

/** Set of `kind:measuredAt` keys already present in the DB for synced kinds. */
async function existingMeasurementKeys(): Promise<Set<string>> {
  const rows = await db
    .select({ kind: bodyMeasurements.kind, measuredAt: bodyMeasurements.measuredAt })
    .from(bodyMeasurements)
    .where(inArray(bodyMeasurements.kind, [...SYNCED_KINDS]));
  return new Set(rows.map((r) => `${r.kind}:${r.measuredAt}`));
}