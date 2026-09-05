/**
 * Design tokens. Two complete palettes rather than one palette with runtime
 * lightening, so dark mode is designed rather than derived.
 *
 * `exerciseArt` matters more than it looks: the Everkinetic SVGs ship with no
 * fill attributes at all, so whatever colour lands here is what the artwork
 * renders as. That is also why the app can theme them without editing the
 * files — see docs/ART_LICENSING.md.
 */
export interface Palette {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textFaint: string;
  readonly accent: string;
  readonly accentText: string;
  readonly success: string;
  readonly danger: string;
  readonly warning: string;
  /** Tint applied to the exercise illustrations. */
  readonly exerciseArt: string;
  /** Body-map fill for unhighlighted muscle, then primary and secondary. */
  readonly bodyBase: string;
  readonly bodyPrimary: string;
  readonly bodySecondary: string;
  /**
   * Heatmap colour for the "Very high" (21+ sets/week) zone. Deliberately a
   * distinct dark blue: past the optimal zone it signals diminishing returns
   * rather than more intensity of the "good" gradient.
   */
  readonly bodyVeryHigh: string;
  /** Heatmap red: the "Optimal" (10–20 sets/week) zone. */
  readonly bodyHeatOptimal: string;
  /** Heatmap pink: the "Moderate" (5–9 sets/week) zone. */
  readonly bodyHeatModerate: string;
  /** Heatmap orange: the "Low" (1–4 sets/week) zone. */
  readonly bodyHeatLow: string;
  /**
   * Recovery-map colours, level by level (1 = no data, 5 = recovered). The
   * traffic-light ramp is deliberately distinct from the heatmap palette.
   */
  readonly bodyRecoveryData: string;
  readonly bodyRecoveryFatigued: string;
  readonly bodyRecoveryRecovering: string;
  readonly bodyRecoveryNearly: string;
  readonly bodyRecoveryRecovered: string;
  /**
   * The muscle-worked artwork draws a silhouette behind the muscles and a pair
   * of shorts over it. Both are fixed in the source files (#343542 and
   * #b2b4e0) and carry no meaning, so they are themed as neutrals — but the
   * silhouette MUST stay distinguishable from `bodyBase` or the figure reads as
   * a flat blob. See src/components/MuscleMap.tsx.
   */
  readonly bodySilhouette: string;
  readonly bodyShorts: string;
  readonly setTypeWarmup: string;
  readonly setTypeDrop: string;
  readonly setTypeFailure: string;
}

export const lightPalette: Palette = {
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E4E7EB',
  text: '#000A1E',
  textMuted: '#83898F',
  textFaint: '#AEB4BA',
  accent: '#008CFF',
  accentText: '#FFFFFF',
  success: '#1E9E5A',
  danger: '#D93A3A',
  warning: '#C8820A',
  exerciseArt: '#000A1E',
  bodyBase: '#D6DAE0',
  bodyPrimary: '#008CFF',
  bodySecondary: '#93B4F7',
  bodyVeryHigh: '#123F8F',
  bodyHeatOptimal: '#D93A3A',
  bodyHeatModerate: '#E64980',
  bodyHeatLow: '#F08C00',
  bodyRecoveryData: '#B0B6BE',
  bodyRecoveryFatigued: '#D93A3A',
  bodyRecoveryRecovering: '#F08C00',
  bodyRecoveryNearly: '#C9A400',
  bodyRecoveryRecovered: '#1E9E5A',
  bodySilhouette: '#B2BAC5',
  bodyShorts: '#98A0B8',
  setTypeWarmup: '#C8820A',
  setTypeDrop: '#7A4BD0',
  setTypeFailure: '#D93A3A',
};

export const darkPalette: Palette = {
  bg: '#0D1117',
  surface: '#151A21',
  surfaceRaised: '#1B222C',
  border: '#232B36',
  text: '#F5F7FA',
  textMuted: '#9AA4B0',
  textFaint: '#6B7684',
  accent: '#FF7A50',
  accentText: '#FFFFFF',
  success: '#3FCB7F',
  danger: '#FF6B6B',
  warning: '#F0B429',
  exerciseArt: '#F5F7FA',
  bodyBase: '#2E353D',
  bodyPrimary: '#FF7A50',
  bodySecondary: '#A66A4F',
  bodyVeryHigh: '#3A5DA8',
  bodyHeatOptimal: '#FF6B6B',
  bodyHeatModerate: '#F783AC',
  bodyHeatLow: '#FFB020',
  bodyRecoveryData: '#4A5560',
  bodyRecoveryFatigued: '#FF6B6B',
  bodyRecoveryRecovering: '#FFB020',
  bodyRecoveryNearly: '#F5C518',
  bodyRecoveryRecovered: '#3FCB7F',
  bodySilhouette: '#20262E',
  bodyShorts: '#3A4250',
  setTypeWarmup: '#F0B429',
  setTypeDrop: '#A57BEA',
  setTypeFailure: '#FF6B6B',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;
