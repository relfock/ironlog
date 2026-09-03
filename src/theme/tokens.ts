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
   * The muscle-worked artwork draws a silhouette behind the muscles and a pair
   * of shorts over it. Both are fixed in the source files (#343542 and
   * #b2b4e0) and carry no meaning, so they are themed as neutrals — but the
   * silhouette MUST stay distinguishable from `bodyBase` or the figure reads as
   * a flat blob. See src/components/MuscleMap.tsx.
   */
  readonly bodySilhouette: string;
  readonly bodyShorts: string;
  /** Heatmap ramp, hottest first — indexes match `intensity` 1..n. */
  readonly heatRamp: readonly string[];
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
  bodySilhouette: '#B2BAC5',
  bodyShorts: '#98A0B8',
  heatRamp: ['#123F8F', '#2C6BED', '#7BA4F5', '#C3D6FB'],
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
  bodySilhouette: '#20262E',
  bodyShorts: '#3A4250',
  heatRamp: ['#9FC0FF', '#5C90FF', '#3A5DA8', '#26364F'],
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
