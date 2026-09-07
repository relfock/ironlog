export type PickerResult =
  | { action: 'add'; exerciseIds: string[] }
  | { action: 'replace'; draftExerciseKey: string; newExerciseId: string };

let pending: PickerResult | null = null;

export function pushPickerResult(r: PickerResult): void {
  pending = r;
}

export function consumePickerResult(): PickerResult | null {
  const r = pending;
  pending = null;
  return r;
}
