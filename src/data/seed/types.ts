import type { Equipment, Muscle, TrackingType } from '@/domain/types';

export interface SeedExercise {
  /** Stable identifier. Never change one — history references it. */
  readonly slug: string;
  readonly name: string;
  readonly trackingType: TrackingType;
  readonly equipment: Equipment;
  readonly primary: readonly Muscle[];
  readonly secondary: readonly Muscle[];
  /**
   * Force a specific Commons stem instead of trusting the fuzzy matcher.
   * Use `null` to state explicitly that no Everkinetic art exists, which stops
   * the harvester from attaching a plausible-but-wrong illustration.
   */
  readonly commonsStem?: string | null;
  /** Default rest in seconds; null means "use the global default". */
  readonly defaultRestSec?: number | null;
}
