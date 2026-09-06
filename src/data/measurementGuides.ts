import type { MeasurementKind } from '@/db/repositories/measurements';

/**
 * Tape sites on the front figure demo, in fractions of the 182×379 front
 * canvas. `y` is the vertical centre of the band, `x0`..`x1` its span.
 */
export type TapeSite =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'arm'
  | 'forearm'
  | 'thigh'
  | 'calf';

export type GuideMethod = 'tape' | 'scale' | 'impedance';

export interface MeasurementGuide {
  /** Where the tape or device goes, in one line. */
  readonly site: string;
  /** The tool the measurement is taken with. */
  readonly method: GuideMethod;
  /** Numbered how-to steps. */
  readonly steps: readonly string[];
  /** Accuracy and consistency tips. */
  readonly tips: readonly string[];
  /** Demo-figure site; only tape measurements draw one. */
  readonly tape?: TapeSite;
}

export type GuideKey = keyof typeof MEASUREMENT_GUIDES;

export function guideKeyFor(kind: MeasurementKind): GuideKey {
  switch (kind) {
    case 'weight':
      return 'weight';
    case 'body_fat':
      return 'body_fat';
    case 'lean_body_mass':
      return 'lean_mass';
    case 'bone_mass':
      return 'bone_mass';
    case 'neck':
      return 'neck';
    case 'shoulders':
      return 'shoulders';
    case 'chest':
      return 'chest';
    case 'waist':
      return 'waist';
    case 'hips':
      return 'hips';
    case 'arm_left':
    case 'arm_right':
      return 'arm';
    case 'forearm_left':
    case 'forearm_right':
      return 'forearm';
    case 'thigh_left':
    case 'thigh_right':
      return 'thigh';
    case 'calf_left':
    case 'calf_right':
      return 'calf';
  }
}

const pad =
  'Keep the tape level and parallel to the floor, snug enough to touch the skin all the way round but not tight enough to compress it.';

const HABITS_TIPS = [
  'Measure at the same time of day and under the same conditions so trends are comparable.',
  'Keep using the same tape and the same routine — switching tools or postures resets your baseline.',
];

const SCALE_TIPS = [
  'Weigh on a hard, flat floor — carpet and uneven tiles throw digital scales off.',
  'Daily weight swings 1–2 kg with food and fluids; judge the trend over weeks, not single days.',
];

export const MEASUREMENT_GUIDES = {
  weight: {
    site: 'Whole body, on a single digital scale.',
    method: 'scale',
    steps: [
      'Weigh at the same time every day — ideally in the morning, after using the bathroom, before food or drink.',
      'Stand on the scale with bare feet, still, and let it settle for a couple of seconds.',
      'Weigh with the same minimal clothing (or none) each time.',
      'Record what the scale shows once it stabilises.',
    ],
    tips: SCALE_TIPS,
  },
  body_fat: {
    site: 'Body-fat percentage, from bioimpedance or skinfold calipers.',
    method: 'impedance',
    steps: [
      'Use the same device and protocol every time — smart-scale and caliper readings are not interchangeable.',
      'For a smart scale: same time of day, before meals and drinks, with dry feet and empty bladder.',
      'For calipers: pinch the marked sites exactly as the method specifies and average the readings.',
      'Stand still and barefoot on the metal pads until the reading appears.',
    ],
    tips: [
      'Hydration shifts the number by more than real fat loss in a good week — follow the monthly trend.',
      'Skip readings right after training or a big meal; both inflate the error.',
    ],
  },
  lean_mass: {
    site: 'Lean body mass: bodyweight minus fat mass, from bioimpedance or DEXA — a tape cannot measure it.',
    method: 'impedance',
    steps: [
      'Use the same bioimpedance scale (or DEXA scan) every time.',
      'Measure under the same conditions as body fat: same time of day, before meals, dry feet.',
      'Run the scale’s body-composition measurement and take the lean-mass figure it reports.',
    ],
    tips: [
      'Lean mass changes slowly; swings of a few hundred grams are measurement noise.',
      'Device, hydration and time-of-day consistency matter more than the absolute number.',
    ],
  },
  bone_mass: {
    site: 'Estimated bone mineral content, from a bioimpedance scale.',
    method: 'impedance',
    steps: [
      'Read it from the same bioimpedance session as your body-fat and lean-mass numbers.',
      'Use the same scale each time — estimates differ between manufacturers.',
      'Keep the measurement routine identical to last time (same hour, same conditions).',
    ],
    tips: [
      'This is an estimate, not a bone-health diagnosis — density is only measured precisely by DEXA.',
      'Only the long-term trend is meaningful; treat the device’s absolute value with a grain of salt.',
    ],
  },
  neck: {
    site: 'Around the neck, just below the Adam’s apple (larynx).',
    method: 'tape',
    tape: 'neck',
    steps: [
      'Stand tall with your head straight and shoulders relaxed — neither tucking your chin nor looking up.',
      'Wrap the tape around the thinnest part of the neck, just below the larynx.',
      `${pad} Read at a normal breath.`,
    ],
    tips: HABITS_TIPS,
  },
  shoulders: {
    site: 'Around the widest part of the shoulders (the deltoids).',
    method: 'tape',
    tape: 'shoulders',
    steps: [
      'Stand upright with your arms relaxed and hanging at your sides.',
      'Wrap the tape around the shoulders at their widest point, over the shoulder caps, keeping it horizontal.',
      'Keep the shoulders relaxed and down — do not raise or flex them.',
      'Read snugly without letting the tape slide down the arms.',
    ],
    tips: [...HABITS_TIPS, 'Flexing or shrugging the shoulders inflates the reading.'],
  },
  chest: {
    site: 'Across the fullest part of the chest — the nipple line for men.',
    method: 'tape',
    tape: 'chest',
    steps: [
      'Stand tall with arms relaxed at your sides and breathe out.',
      'Wrap the tape around the fullest part of your chest, level all the way around the torso (for women, the fullest part of the bust).',
      `${pad} Take the reading at the end of the exhale.`,
    ],
    tips: [...HABITS_TIPS, 'A tape that dips or tilts adds a couple of centimetres — check it stays level.'],
  },
  waist: {
    site: 'Around the narrowest part of the waist, just above the navel.',
    method: 'tape',
    tape: 'waist',
    steps: [
      'Stand upright and completely relax your stomach — do not suck it in or push it out.',
      'Find the narrowest point, normally just above the belly button and below the ribs.',
      'Wrap the tape around that point, level with the floor, and read after a normal exhale.',
    ],
    tips: [...HABITS_TIPS, 'Sucking in or rounding the belly changes the reading — stay relaxed.'],
  },
  hips: {
    site: 'Around the largest part of the hips and buttocks.',
    method: 'tape',
    tape: 'hips',
    steps: [
      'Stand with your feet together so the glutes are at their widest.',
      'Wrap the tape around the widest point of the buttocks, keeping it horizontal.',
      `${pad} Read at the end of a normal breath.`,
    ],
    tips: [...HABITS_TIPS, 'Standing with feet apart widens the hips — always measure with feet together.'],
  },
  arm: {
    site: 'Around the widest part of the upper arm (the biceps).',
    method: 'tape',
    tape: 'arm',
    steps: [
      'Stand or sit with the arm relaxed and hanging at your side, palm facing your thigh.',
      'Wrap the tape around the fullest part of the upper arm — about halfway between shoulder and elbow.',
      'Keep the arm and biceps completely relaxed; the tape should be snug and level.',
      'Mirror the measurement on the other arm and log each side separately.',
    ],
    tips: [
      'Flexing the biceps can add several centimetres — always measure relaxed.',
      'Measure the same arm, at the same height and time of day, for comparable trends.',
    ],
  },
  forearm: {
    site: 'Around the largest part of the forearm, just below the elbow.',
    method: 'tape',
    tape: 'forearm',
    steps: [
      'Let the arm hang relaxed with the palm down or neutral.',
      'Wrap the tape around the widest part of the forearm, a few centimetres below the elbow.',
      'Keep the forearm relaxed and the tape snug and level.',
      'Mirror the measurement on the other side and log each separately.',
    ],
    tips: ['Curling the wrist flexes the forearm and bumps the number up.'],
  },
  thigh: {
    site: 'Around the widest part of the upper thigh, just below the gluteal fold.',
    method: 'tape',
    tape: 'thigh',
    steps: [
      'Stand with feet hip-width apart, weight evenly on both feet, knees straight but not locked.',
      'Wrap the tape around the widest part of the thigh, just under the crease of the buttocks.',
      `${pad} Read snugly without letting the tape slip.`,
      'Mirror the measurement on the other leg and log each separately.',
    ],
    tips: ['Shifting your weight or stepping out changes the girth — keep your stance identical.'],
  },
  calf: {
    site: 'Around the largest part of the calf, between the knee and ankle.',
    method: 'tape',
    tape: 'calf',
    steps: [
      'Stand with feet hip-width apart, weight evenly on both feet.',
      'Wrap the tape around the widest point of the calf — usually about a third of the way down from the knee.',
      'Stand up straight without bending the knee and read snugly, tape level.',
      'Mirror the measurement on the other leg and log each separately.',
    ],
    tips: ['Pointing the toe or flexing the calf inflates the reading — stay relaxed.'],
  },
} as const satisfies Record<string, MeasurementGuide>;