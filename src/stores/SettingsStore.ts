/**
 * App settings.
 *
 * MobX rather than a live query because these are read on nearly every render
 * (the logger consults five of them per set row) and must be synchronously
 * available. They are persisted to the `settings` table write-through.
 *
 * The workout preferences below mirror the twelve Hevy exposes under
 * Settings → Workout.
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { settings as settingsTable } from '@/db/schema';
import type { OneRepMaxFormula } from '@/domain/oneRepMax';
import type { WeekStart } from '@/domain/streak';
import type { DistanceUnit, Sex, WeightUnit } from '@/domain/types';
import { DEFAULT_KG_PLATES, DEFAULT_LB_PLATES } from '@/domain/plateCalculator';

export type SoundLevel = 'off' | 'low' | 'normal' | 'high';
export type PreviousValuesMode = 'any' | 'same_routine';

export interface AppSettings {
  // --- Units ---
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** Canonical kg. Needed for bodyweight-exercise volume. */
  bodyweightKg: number | null;

  // --- Body profile (used by the recovery map age/sex modifiers) ---
  /** Year of birth; null = not set. */
  birthYear: number | null;
  /** Biological sex; null = not set. */
  sex: Sex | null;

  // --- Hevy's twelve workout preferences ---
  /** 1. Sounds */
  soundLevel: SoundLevel;
  prSoundLevel: SoundLevel;
  /** 2. Default rest timer, seconds. 0 disables it. */
  defaultRestSec: number;
  /** 3. Show all previous values, or only from the same routine. */
  previousValuesMode: PreviousValuesMode;
  /** 4. Warm-up calculator */
  warmupCalculatorEnabled: boolean;
  /** 5. Do warm-up sets count toward stats and PRs? */
  countWarmupsInStats: boolean;
  /** 6. Keep the screen awake during a workout */
  keepAwake: boolean;
  /** 7. Plate calculator */
  plateCalculatorEnabled: boolean;
  /** Plate inventory, denominated in `weightUnit`. */
  barWeight: number;
  platePairs: { weight: number; pairs: number }[];
  /** 8. RPE column */
  rpeEnabled: boolean;
  /** 9. Auto-scroll to the next exercise in a superset */
  smartSupersetScrolling: boolean;
  /** 10. Inline stopwatch for time-based sets */
  inlineTimerEnabled: boolean;
  /** 11. Live PR notification */
  prNotificationsEnabled: boolean;
  /** 12. (units — see above) */

  // --- Heart rate ---
  /** Sample live BLE heart rate into finished workouts. */
  heartRateEnabled: boolean;

  // --- Analytics ---
  oneRepMaxFormula: OneRepMaxFormula;
  weekStart: WeekStart;
  weeklyWorkoutGoal: number;
  hapticsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  weightUnit: 'kg',
  distanceUnit: 'km',
  bodyweightKg: null,
  birthYear: null,
  sex: null,
  soundLevel: 'normal',
  prSoundLevel: 'normal',
  defaultRestSec: 90,
  previousValuesMode: 'any',
  warmupCalculatorEnabled: true,
  countWarmupsInStats: false,
  keepAwake: true,
  plateCalculatorEnabled: true,
  barWeight: 20,
  platePairs: DEFAULT_KG_PLATES.map((p) => ({
    weight: p.weight,
    // Infinity does not survive JSON, so persist a large finite count.
    pairs: Number.isFinite(p.pairs) ? p.pairs : 10,
  })),
  rpeEnabled: false,
  smartSupersetScrolling: true,
  inlineTimerEnabled: true,
  prNotificationsEnabled: true,
  heartRateEnabled: false,
  oneRepMaxFormula: 'epley',
  weekStart: 1,
  weeklyWorkoutGoal: 3,
  hapticsEnabled: true,
};

const STORAGE_KEY = 'app_settings';

export class SettingsStore {
  values: AppSettings = { ...DEFAULT_SETTINGS };
  loaded = false;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async load(): Promise<void> {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, STORAGE_KEY))
      .limit(1);

    const raw = rows[0]?.value;
    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        runInAction(() => {
          // Merge over defaults so a setting added in a later release gets its
          // default rather than becoming undefined on an existing install.
          this.values = { ...DEFAULT_SETTINGS, ...parsed };
        });
      } catch {
        // Corrupt JSON should not brick launch; fall back to defaults.
        runInAction(() => {
          this.values = { ...DEFAULT_SETTINGS };
        });
      }
    }
    runInAction(() => {
      this.loaded = true;
    });
  }

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    runInAction(() => {
      this.values = { ...this.values, [key]: value };
    });
    await this.persist();
  }

  /** Switching units also swaps the plate inventory to that unit's plates. */
  async setWeightUnit(unit: WeightUnit): Promise<void> {
    const plates = unit === 'kg' ? DEFAULT_KG_PLATES : DEFAULT_LB_PLATES;
    runInAction(() => {
      this.values = {
        ...this.values,
        weightUnit: unit,
        barWeight: unit === 'kg' ? 20 : 45,
        platePairs: plates.map((p) => ({
          weight: p.weight,
          pairs: Number.isFinite(p.pairs) ? p.pairs : 10,
        })),
      };
    });
    await this.persist();
  }

  private async persist(): Promise<void> {
    const value = JSON.stringify(this.values);
    const now = Date.now();
    await db
      .insert(settingsTable)
      .values({ key: STORAGE_KEY, value, updatedAt: now })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value, updatedAt: now },
      });
  }

  get plateSetup() {
    return {
      unit: this.values.weightUnit,
      barWeight: this.values.barWeight,
      plates: this.values.platePairs,
    };
  }
}
