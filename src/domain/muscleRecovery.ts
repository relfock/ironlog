/**
 * Science-backed per-muscle recovery model for the Home recovery map.
 *
 * The recovery map answers "how recovered is each muscle RIGHT NOW", built
 * from the training history through a volume-weighted fatigue model:
 *
 *  1. Every completed work set adds fatigue to the muscles it trains —
 *     primary muscles get full weight, secondary muscles half
 *     (`SECONDARY_SET_CREDIT`, the same convention the heatmap already uses).
 *  2. Harder sets add more fatigue. Set type scales the load (drop sets and
 *     sets to failure cause more muscle damage than ordinary working sets —
 *     Morán-Navarro et al. 2017 showed training to failure delays
 *     neuromuscular recovery), and a logged RPE ≥ 7 adds a little more.
 *  3. Fatigue then decays exponentially along each muscle's own recovery
 *     curve. Small, slow-twitch-loaded muscles clear quickly (calves ~36h,
 *     biceps ~36h); large multi-joint muscles take far longer (back, quads,
 *     hamstrings, glutes ~72h). The decay constant is half the muscle's
 *     recovery window, so the bulk of the damage is gone within one window
 *     and negligible within two.
 *  4. Recovery is therefore "how much of the recent damage is still present",
 *     in units of effective work-set equivalents. It is never a fixed 48-hour
 *     rule clamped to every muscle — it is a continuous curve per muscle.
 *
 * Individual modifiers, both evidence-based:
 *   - Age: the anabolic response window lengthens with age (Damas et al.
 *     2015), slowing recovery. Modifiers ×1.0/<30y, ×1.1/30s, ×1.2/40s,
 *     ×1.35/50s, ×1.5/60+.
 *   - Sex: controlled studies on sex differences in acute recovery rate are
 *     mixed and the effect, if any, is modest — kept here as a small ×0.95
 *     for women rather than a strong claim.
 *
 * All of the above is surfaced in the "More info" sheet on the card.
 */

import { muscleToSlug, type HighlightedPart } from './muscleMap';
import type { Muscle, SetType, Sex } from './types';
import { SECONDARY_SET_CREDIT } from './volume';

/** Recovery windows in hours for each muscle we track. */
export const MUSCLE_RECOVERY_HOURS: Record<Muscle, number> = {
  // Small / slow-twitch-loaded muscles clear fastest.
  calves: 36,
  shins: 36,
  biceps: 36,
  abs: 30,
  obliques: 30,
  // Mid-size upper-body muscles.
  triceps: 48,
  forearms: 48,
  chest: 48,
  front_delts: 48,
  side_delts: 48,
  rear_delts: 48,
  traps: 48,
  neck: 48,
  adductors: 48,
  // Large multi-joint muscles need the longest.
  lats: 72,
  upper_back: 72,
  lower_back: 72,
  quads: 72,
  hamstrings: 72,
  glutes: 72,
  abductors: 72,
  // Not muscle tissue we can recover or render.
  full_body: 0,
  cardio: 0,
};

/** Number of zones/colours on the recovery scale (index = level − 1). */
export const RECOVERY_MAX_LEVEL = 5;

export interface RecoveryZone {
  /** 1 is the coolest (no data), 5 the best (recovered). */
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly label: string;
  /** Compact legend text: just the recovery percentage. */
  readonly legendLabel: string;
  /** Fuller sentence for the "More info" sheet. */
  readonly note: string;
}

/**
 * The five zones. Percentages are a recovery-progress scale anchored at a
 * reference load of `RECOVERY_REFERENCE_FATIGUE` effective work-set
 * equivalents, so the compact legend stays consistent with the map: a muscle
 * at the tail of the decay curve reads as 100% recovered.
 */
export const RECOVERY_ZONES: readonly RecoveryZone[] = [
  {
    level: 1,
    label: 'No data',
    legendLabel: 'no sets this week',
    note: 'No sets were recorded for this muscle in the last 7 days.',
  },
  {
    level: 2,
    label: 'Fatigued',
    legendLabel: '< 50%',
    note: 'A recent heavy session is still in the repair shop.',
  },
  {
    level: 3,
    label: 'Recovering',
    legendLabel: '50–79%',
    note: 'Partly recovered; a hard session would still interrupt repair.',
  },
  {
    level: 4,
    label: 'Nearly recovered',
    legendLabel: '80–99%',
    note: 'Almost clear to train hard again.',
  },
  {
    level: 5,
    label: 'Recovered',
    legendLabel: '100%',
    note: 'Ready to train hard again.',
  },
];

/**
 * Residual-fatigue thresholds (in effective work-set equivalents) that slice
 * the exponential decay curve into the zones above. Anchored so that a typical
 * cadence reads sensibly: a heavy session (≈5 units) back to full green within
 * ≈2.5 days (24·ln(4/0.4·…) ≈ 60 h), a moderate one (≈2 units) in ~1.5 days,
 * while a session today still reads red.
 */
export const FATIGUE_THRESHOLD_FATIGUED = 1.2;
export const FATIGUE_THRESHOLD_RECOVERING = 0.5;
export const FATIGUE_THRESHOLD_NEARLY = 0.4;

/**
 * The load that counts as "fully fatigued" on the percentage scale above.
 * `100 × (1 − fatigue / REF)`: a fresh heavy session (~2.4 units) is ~0%
 * recovered, a muscle at the FATIGUED threshold is ~50%, and zero residual
 * fatigue is 100%.
 */
export const RECOVERY_REFERENCE_FATIGUE = 2 * FATIGUE_THRESHOLD_FATIGUED;

/** Base load, in effective work-set equivalents, of one ordinary work set. */
export const BASE_FATIGUE_UNIT = 0.5;

/** Extra fatigue factor from logged effort (failure/drop/high RPE). */
const MAX_INTENSITY_FACTOR = 1.6;

/**
 * Fatigue load of ONE set, before muscle credit is applied. Warm-ups do not
 * count unless "Count warm-ups in stats" is enabled (mirroring the heatmap).
 * `rpe` is the logged perceived exertion (1–10) when the app collects it.
 */
export function setFatigueUnit(
  setType: SetType,
  rpe: number | null,
  countWarmups: boolean,
): number {
  let base: number;
  switch (setType) {
    case 'warmup':
      if (!countWarmups) return 0;
      base = 0.6;
      break;
    case 'drop':
      base = 1.2;
      break;
    case 'failure':
      base = 1.35;
      break;
    default:
      base = 1;
  }
  const rpeBonus = rpe === null ? 0 : Math.max(0, rpe - 7) * 0.06;
  const intensity = Math.min(MAX_INTENSITY_FACTOR, base + rpeBonus);
  return stripSmall(BASE_FATIGUE_UNIT * intensity);
}

/** Age multiplier on the recovery window, from the Damas et al. anabolic data. */
export function ageFactor(birthYear: number | null): number {
  if (birthYear === null) return 1;
  const age = new Date().getFullYear() - birthYear;
  if (age < 30) return 1;
  if (age < 40) return 1.1;
  if (age < 50) return 1.2;
  if (age < 60) return 1.35;
  return 1.5;
}

/** Sex multiplier: any faster female recovery is modest and contested. */
export function sexFactor(sex: Sex | null): number {
  return sex === 'female' ? 0.95 : 1;
}

/**
 * Decay constant (hours) for a muscle's recovery curve: half its window, then
 * widened by age and shortened by the faster-female modifier.
 */
export function recoveryTauHours(
  hours: number,
  birthYear: number | null,
  sex: Sex | null,
): number {
  return 0.5 * hours * ageFactor(birthYear) * sexFactor(sex);
}

/** One logged work set that fatigued some muscles at a point in time. */
export interface RecoveryEvent {
  /** Workout start time, ms. */
  readonly t: number;
  readonly primary: readonly Muscle[];
  readonly secondary: readonly Muscle[];
  /** Pre-muscle fatigue units, from `setFatigueUnit` (0 = skip). */
  readonly unit: number;
}

/**
 * Remaining fatigue per muscle at `nowMs`, summing every event's still-active
 * load `unit × credit × e^(−(now−t)/τ(muscle))`. Returns only muscles that
 * have been trained (untrained muscles are handled by the map builder).
 */
export function remainingFatigue(
  events: readonly RecoveryEvent[],
  nowMs: number,
  birthYear: number | null,
  sex: Sex | null,
): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  const add = (m: Muscle, n: number) => {
    if (n <= 0) return;
    out.set(m, stripSmall((out.get(m) ?? 0) + n));
  };

  for (const e of events) {
    if (e.unit <= 0) continue;
    const dt = Math.max(0, nowMs - e.t);
    for (const m of e.primary) {
      const hours = MUSCLE_RECOVERY_HOURS[m];
      if (hours <= 0) continue;
      const decay = Math.exp(-(dt / 3600_000) / recoveryTauHours(hours, birthYear, sex));
      add(m, e.unit * decay);
    }
    for (const m of e.secondary) {
      const hours = MUSCLE_RECOVERY_HOURS[m];
      if (hours <= 0) continue;
      const decay = Math.exp(-(dt / 3600_000) / recoveryTauHours(hours, birthYear, sex));
      add(m, e.unit * SECONDARY_SET_CREDIT * decay);
    }
  }
  return out;
}

/**
 * Residual fatigue → recovery zone. Given the thresholds are in effective
 * work-set equivalents, a freshly completed heavy session (> ~2.4 units) is
 * fatigued, and anything under ~0.4 units is de facto fully recovered (a heavy
 * session gets there in ~2.5 days, a moderate one in ~1.5).
 */
export function recoveryLevel(fatigue: number): 1 | 2 | 3 | 4 | 5 {
  if (fatigue <= FATIGUE_THRESHOLD_NEARLY) return 5;
  if (fatigue <= FATIGUE_THRESHOLD_RECOVERING) return 4;
  if (fatigue <= FATIGUE_THRESHOLD_FATIGUED) return 3;
  return 2;
}

/**
 * Current recovery state of every renderable muscle, as BodyMap parts.
 * Muscles that share a slug (lats + upper back, the three delt heads, glutes +
 * abductors) are summed before levelling so each body part shows one state.
 *
 * Every slug a muscle can map to is included: trained muscles get their zone
 * colour, untrained muscles render as level 1 ("No data") so the map reads as
 * a full body rather than a sparse set of lit regions.
 */
export function buildRecoveryMap(
  fatigueByMuscle: ReadonlyMap<Muscle, number>,
): HighlightedPart[] {
  const slugLevels = new Map<string, number>();

  for (const [muscle, fatigue] of fatigueByMuscle) {
    if (fatigue < 0) continue;
    const slug = muscleToSlug(muscle);
    if (!slug) continue;
    const cur = slugLevels.get(slug) ?? 0;
    slugLevels.set(slug, cur + fatigue);
  }

  const parts: HighlightedPart[] = [];
  // Render every slug our taxonomy can colour, not just the trained ones.
  for (const muscle of Object.keys(MUSCLE_RECOVERY_HOURS) as Muscle[]) {
    const slug = muscleToSlug(muscle);
    if (!slug) continue;
    if (parts.some((p) => p.slug === slug)) continue;
    const fatigue = stripSmall(slugLevels.get(slug) ?? 0);
    parts.push({ slug, intensity: fatigue > 0 ? recoveryLevel(fatigue) : 1 });
  }
  return parts;
}

function stripSmall(n: number): number {
  if (Math.abs(n) < 1e-9) return 0;
  return Math.round(n * 1e6) / 1e6;
}