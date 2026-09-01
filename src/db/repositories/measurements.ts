import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { newId } from '../ids';
import { bodyMeasurements } from '../schema';
import { recordChange } from './outbox';

/**
 * Body measurement kinds. Canonical units: kg for mass, cm for lengths,
 * percent for body fat — converted for display like every other measure.
 */
export type MeasurementKind =
  | 'weight'
  | 'body_fat'
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'arm_left'
  | 'arm_right'
  | 'forearm_left'
  | 'forearm_right'
  | 'thigh_left'
  | 'thigh_right'
  | 'calf_left'
  | 'calf_right';

export const MEASUREMENT_KINDS: readonly MeasurementKind[] = [
  'weight', 'body_fat', 'neck', 'shoulders', 'chest', 'waist', 'hips',
  'arm_left', 'arm_right', 'forearm_left', 'forearm_right',
  'thigh_left', 'thigh_right', 'calf_left', 'calf_right',
];

export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  weight: 'Bodyweight',
  body_fat: 'Body fat',
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  arm_left: 'Left arm',
  arm_right: 'Right arm',
  forearm_left: 'Left forearm',
  forearm_right: 'Right forearm',
  thigh_left: 'Left thigh',
  thigh_right: 'Right thigh',
  calf_left: 'Left calf',
  calf_right: 'Right calf',
};

/** What a kind is measured in, so the UI never mislabels a value. */
export function measurementUnit(kind: MeasurementKind): 'mass' | 'length' | 'percent' {
  if (kind === 'weight') return 'mass';
  if (kind === 'body_fat') return 'percent';
  return 'length';
}

export interface Measurement {
  readonly id: string;
  readonly kind: MeasurementKind;
  readonly value: number;
  readonly measuredAt: number;
  readonly notes: string | null;
}

export async function addMeasurement(
  kind: MeasurementKind,
  value: number,
  measuredAt: number = Date.now(),
  notes: string | null = null,
): Promise<string> {
  const id = newId();
  await db.insert(bodyMeasurements).values({
    id,
    kind,
    value,
    measuredAt,
    notes,
    createdAt: measuredAt,
    updatedAt: measuredAt,
  });
  await recordChange('body_measurements', id, 'insert');
  return id;
}

export async function listMeasurements(kind: MeasurementKind): Promise<Measurement[]> {
  const rows = await db
    .select()
    .from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.kind, kind), eq(bodyMeasurements.deleted, false)))
    .orderBy(asc(bodyMeasurements.measuredAt));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as MeasurementKind,
    value: r.value,
    measuredAt: r.measuredAt,
    notes: r.notes,
  }));
}

/** Most recent value per kind, for the summary list. */
export async function latestMeasurements(): Promise<Map<MeasurementKind, Measurement>> {
  const rows = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.deleted, false))
    .orderBy(desc(bodyMeasurements.measuredAt));

  const out = new Map<MeasurementKind, Measurement>();
  for (const r of rows) {
    const kind = r.kind as MeasurementKind;
    if (out.has(kind)) continue; // rows are newest-first
    out.set(kind, {
      id: r.id,
      kind,
      value: r.value,
      measuredAt: r.measuredAt,
      notes: r.notes,
    });
  }
  return out;
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db
    .update(bodyMeasurements)
    .set({ deleted: true, updatedAt: Date.now(), dirty: true })
    .where(eq(bodyMeasurements.id, id));
  await recordChange('body_measurements', id, 'delete');
}
