/**
 * Builds the bundled exercise catalogue from the 1069 directories under
 * `exercises_db/`.
 *
 * Each source directory holds `details.txt` (prose, source URL and muscle
 * labels), `target_muscles.svg` (the muscle-worked art) and `video.mp4`. This
 * script consumes the first two; the video is shipped outside Metro (see
 * plugins/withExerciseMedia.js).
 *
 * WHY THE ARTWORK, NOT THE PROSE, DEFINES THE MUSCLE LISTS
 * The `#F2305A` (primary) shading in the SVG matches the `Primary Muscles:`
 * prose exactly, but the `#41BD98` (secondary) shading is a strict superset of
 * `Secondary Muscles:` — the art marks assisting muscles the prose omits, and
 * 557 of the 1069 pages carry no secondary line at all. Reading the colours
 * therefore yields strictly more information AND guarantees the muscle chips
 * agree with the picture next to them.
 *
 * The one place the artwork is POORER than the prose is `Back` vs `Lower Back`:
 * both labels cover the `lower_back` region, so when the whole back complex is
 * one colour the two are indistinguishable. See `labelLevels()`.
 *
 * Output is chunked so no single module is enormous, which keeps Babel and
 * Metro comfortable, and is formatted with the repo's Prettier config so that
 * regeneration is idempotent and `prettier --check` stays clean.
 *
 * Run with `npx tsx scripts/build-exercise-db.ts`.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Equipment, Muscle, TrackingType } from '../src/domain/types';
import type { DbExercise, Mistake, RegionLevel } from '../src/data/exercises/types';
import {
  INACTIVE_PATHS,
  MUSCLE_TO_REGIONS,
  PATH_COUNT,
  PATH_GROUPS,
  SOURCE_LABEL_TO_MUSCLE,
  SOURCE_LABEL_TO_REGIONS,
  STATIC_PATHS,
  type MuscleRegion,
} from '../src/data/muscleArt/regions';
import { MUSCLE_ART_TEMPLATE } from '../src/data/muscleArt/template';

const ROOT = join(__dirname, '..');
const DB_DIR = join(ROOT, 'exercises_db');
const OUT_DIR = join(ROOT, 'src', 'data', 'exercises');

/** Roughly how many exercises per generated chunk. */
const CHUNK_SIZE = 100;

/** Exactly what `details.txt` prints where a source page listed nothing. */
const NOT_LISTED = 'Not listed on source page';

const SECTION_HEADERS = [
  'Exercise:',
  'URL:',
  'Target Muscles Worked:',
  'Instructions for Proper Form:',
  'Common Form Mistakes:',
] as const;

const FILL = /fill="#[0-9a-fA-F]{6}"/g;

/** The five fill colours the source art uses. */
const COLOURS = {
  primary: '#F2305A',
  secondary: '#41BD98',
  inactive: '#7F8097',
  silhouette: '#343542',
  shorts: '#b2b4e0',
} as const;

const REGION_NAMES = Object.keys(PATH_GROUPS) as MuscleRegion[];

// ---------------------------------------------------------------------------
// details.txt
// ---------------------------------------------------------------------------

export interface ParsedDetails {
  readonly name: string;
  readonly url: string;
  /** Source labels, verbatim. Empty when the page listed no muscles. */
  readonly primaryLabels: readonly string[];
  readonly secondaryLabels: readonly string[];
  readonly instructions: readonly string[];
  readonly mistakes: readonly Mistake[];
}

const STEP = /^ {2}(\d+)\. (.*)$/;
/** Mistake bodies are indented deeper than the `  1. ` that introduces them. */
const BODY = /^ {3,}(.*)$/;

function labelList(line: string, prefix: string): string[] {
  return line
    .slice(line.indexOf(prefix) + prefix.length)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parses one `details.txt`.
 *
 * Two shapes need care. Instruction steps may WRAP: a step's text continues on
 * following lines that carry neither a number nor the two-space indent (see
 * exercises_db/trx-push-up-plus), and those continuations belong to the step
 * above, joined by a single space. Mistakes are the inverse — a numbered title
 * followed by a deeper-indented body line.
 */
export function parseDetails(text: string, slug: string): ParsedDetails {
  // The scrape left two other line terminators in the prose: CRLF (see
  // exercises_db/1-2-kneeling-shotgun-row) and U+2028 LINE SEPARATOR (295 of
  // them, e.g. exercises_db/balance-trainer-bar-assisted-dome-squat). JS counts
  // both as line terminators, so `.` and `$` refuse to match past them and a
  // numbered step would be misread as stray prose. Fold them into \n first.
  const lines = text.replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
  const at = new Map<string, number>();
  lines.forEach((line, i) => {
    for (const header of SECTION_HEADERS) {
      if (line.startsWith(header) && !at.has(header)) at.set(header, i);
    }
  });
  for (const header of SECTION_HEADERS) {
    if (!at.has(header))
      throw new Error(`${slug}/details.txt has no "${header}" section`);
  }

  const exerciseLine = lines[at.get('Exercise:')!]!;
  const urlLine = lines[at.get('URL:')!]!;
  // Every page but one titles itself "How to do <Name>"; the prefix is chrome.
  const name = exerciseLine
    .slice('Exercise:'.length)
    .trim()
    .replace(/^How to do /, '');
  const url = urlLine.slice('URL:'.length).trim();
  if (name.length === 0) throw new Error(`${slug}/details.txt has an empty name`);
  if (!url.startsWith('https://'))
    throw new Error(`${slug}/details.txt has no source URL`);

  const musclesFrom = at.get('Target Muscles Worked:')! + 1;
  const musclesTo = at.get('Instructions for Proper Form:')!;
  let primaryLabels: string[] = [];
  let secondaryLabels: string[] = [];
  for (const line of lines.slice(musclesFrom, musclesTo)) {
    if (line.includes('Primary Muscles:'))
      primaryLabels = labelList(line, 'Primary Muscles:');
    else if (line.includes('Secondary Muscles:')) {
      secondaryLabels = labelList(line, 'Secondary Muscles:');
    }
  }

  const instructions: string[] = [];
  let expected = 1;
  for (const line of lines.slice(musclesTo + 1, at.get('Common Form Mistakes:')!)) {
    if (line.trim().length === 0 || line.trim() === NOT_LISTED) continue;
    const step = STEP.exec(line);
    if (step !== null) {
      if (Number(step[1]) !== expected) {
        throw new Error(
          `${slug}/details.txt jumps to step ${step[1]}, expected ${expected}`,
        );
      }
      expected += 1;
      instructions.push(step[2]!.trim());
      continue;
    }
    const previous = instructions.length - 1;
    if (previous < 0) throw new Error(`${slug}/details.txt: stray text "${line}"`);
    instructions[previous] = `${instructions[previous]!} ${line.trim()}`.trim();
  }

  const mistakes: Mistake[] = [];
  expected = 1;
  for (const line of lines.slice(at.get('Common Form Mistakes:')! + 1)) {
    if (line.trim().length === 0 || line.trim() === NOT_LISTED) continue;
    const step = STEP.exec(line);
    if (step !== null) {
      if (Number(step[1]) !== expected) {
        throw new Error(
          `${slug}/details.txt jumps to mistake ${step[1]}, expected ${expected}`,
        );
      }
      expected += 1;
      mistakes.push({ title: step[2]!.trim(), body: '' });
      continue;
    }
    const body = BODY.exec(line);
    const previous = mistakes[mistakes.length - 1];
    if (body === null || previous === undefined) {
      throw new Error(`${slug}/details.txt: stray mistake text "${line}"`);
    }
    mistakes[mistakes.length - 1] = {
      title: previous.title,
      body: `${previous.body} ${body[1]!.trim()}`.trim(),
    };
  }

  return { name, url, primaryLabels, secondaryLabels, instructions, mistakes };
}

// ---------------------------------------------------------------------------
// target_muscles.svg
// ---------------------------------------------------------------------------

/** 0 means inactive, so the region is omitted from the emitted `RegionMap`. */
type Level = RegionLevel | 0;

/** Asserts `PATH_GROUPS` + `INACTIVE_PATHS` + `STATIC_PATHS` tile 0..80 exactly. */
function assertPartition(): void {
  const owner = new Map<number, string>();
  const claim = (index: number, by: string): void => {
    const previous = owner.get(index);
    if (previous !== undefined)
      throw new Error(`path ${index} claimed by ${previous} and ${by}`);
    owner.set(index, by);
  };
  for (const region of REGION_NAMES)
    for (const i of PATH_GROUPS[region]) claim(i, region);
  for (const i of INACTIVE_PATHS) claim(i, 'inactive');
  for (const i of STATIC_PATHS.silhouette) claim(i, 'silhouette');
  for (const i of STATIC_PATHS.shorts) claim(i, 'shorts');
  if (owner.size !== PATH_COUNT) {
    throw new Error(`the path groups cover ${owner.size} paths, expected ${PATH_COUNT}`);
  }
  for (let i = 0; i < PATH_COUNT; i += 1) {
    if (!owner.has(i)) throw new Error(`path ${i} belongs to no group`);
  }
}

/**
 * Reads the 81 fills out of one `target_muscles.svg` and reduces them to a
 * level per region.
 *
 * Throws if a region is not single-coloured, if a fixed body colour moved, or
 * if a muscle colour appears that regions.ts does not know about — any of which
 * would mean the shared template no longer represents the source faithfully.
 */
function readRegions(svg: string, slug: string): Record<MuscleRegion, Level> {
  const fills = svg.match(FILL) ?? [];
  if (fills.length !== PATH_COUNT) {
    throw new Error(`${slug}: ${fills.length} fills, expected ${PATH_COUNT}`);
  }
  const colour = fills.map((f) => f.slice('fill="'.length, -1));

  const expectFixed = (indices: readonly number[], want: string, what: string): void => {
    for (const i of indices) {
      if (colour[i] !== want)
        throw new Error(`${slug}: ${what} path ${i} is ${colour[i]}`);
    }
  };
  expectFixed(STATIC_PATHS.silhouette, COLOURS.silhouette, 'silhouette');
  expectFixed(STATIC_PATHS.shorts, COLOURS.shorts, 'shorts');
  expectFixed(INACTIVE_PATHS, COLOURS.inactive, 'never-shaded');

  const levels = {} as Record<MuscleRegion, Level>;
  for (const region of REGION_NAMES) {
    const distinct = new Set(PATH_GROUPS[region].map((i) => colour[i]));
    if (distinct.size !== 1) {
      throw new Error(
        `${slug}: region ${region} is not single-coloured (${[...distinct]})`,
      );
    }
    const [only] = [...distinct];
    if (only === COLOURS.primary) levels[region] = 1;
    else if (only === COLOURS.secondary) levels[region] = 2;
    else if (only === COLOURS.inactive) levels[region] = 0;
    else throw new Error(`${slug}: region ${region} has unknown colour ${only}`);
  }
  return levels;
}

/**
 * Re-paints the shared template from a region map and returns the markup.
 *
 * Comparing this against the source file is what lets `RegionMap` be described
 * as lossless: if a single region were mis-grouped or a level dropped, the
 * round-trip would not be byte-identical.
 */
function render(levels: Record<MuscleRegion, Level>): string {
  const palette = new Array<string>(PATH_COUNT).fill(COLOURS.inactive);
  for (const i of STATIC_PATHS.silhouette) palette[i] = COLOURS.silhouette;
  for (const i of STATIC_PATHS.shorts) palette[i] = COLOURS.shorts;
  for (const region of REGION_NAMES) {
    const level = levels[region];
    if (level === 0) continue;
    const fill = level === 1 ? COLOURS.primary : COLOURS.secondary;
    for (const i of PATH_GROUPS[region]) palette[i] = fill;
  }
  return MUSCLE_ART_TEMPLATE.replace(/@(\d+)@/g, (_, n: string) => palette[Number(n)]!);
}

// ---------------------------------------------------------------------------
// source labels
// ---------------------------------------------------------------------------

const MUSCLE_NAMES = new Set(Object.keys(MUSCLE_TO_REGIONS));

function toMuscle(label: string): Muscle {
  const muscle = SOURCE_LABEL_TO_MUSCLE[label];
  if (muscle === undefined) throw new Error(`unmapped source label "${label}"`);
  if (!MUSCLE_NAMES.has(muscle))
    throw new Error(`"${label}" maps to unknown muscle ${muscle}`);
  // Safe by the check above: MUSCLE_TO_REGIONS is keyed by the Muscle union.
  return muscle as Muscle;
}

/**
 * Recovers the source muscle labels, and their level, from the shading.
 *
 * A label is at level L when EVERY region it covers is at level L. That is
 * unambiguous for 13 of the 15 labels, but `Back` covers `lats_front`,
 * `lats_back` AND `lower_back`, which `Lower Back` also covers on its own. In
 * all 1069 files the three move together, so whenever `Back` is shaded the
 * artwork cannot say whether `Lower Back` was named too:
 *
 *   - 87 pages shade the complex red and name only `Back`;
 *   - 32 shade it green and name `Back` plus `Lower Back`;
 *   - 10 shade it green yet name `Lower Back` as the PRIMARY target
 *     (the superman/bridge/child's-pose family).
 *
 * So the broader label wins the shared region, and the narrower one is taken
 * from the prose in exactly that collision — the only place the distinction
 * survives. `prosePrimary`/`proseSecondary` are consulted nowhere else, which
 * keeps the primary cross-check in `main()` an independent test of everything
 * else.
 */
export function labelLevels(
  levels: Record<MuscleRegion, Level>,
  prosePrimary: readonly string[],
  proseSecondary: readonly string[],
): Map<string, RegionLevel> {
  const out = new Map<string, RegionLevel>();
  for (const [label, regions] of Object.entries(SOURCE_LABEL_TO_REGIONS)) {
    const first = levels[regions[0]!];
    if (first === 0) continue;
    if (regions.every((r) => levels[r] === first)) out.set(label, first);
  }

  if (out.get('Back') === out.get('Lower Back')) {
    out.delete('Lower Back');
    if (prosePrimary.includes('Lower Back')) out.set('Lower Back', 1);
    else if (proseSecondary.includes('Lower Back')) out.set('Lower Back', 2);
  }
  return out;
}

// ---------------------------------------------------------------------------
// equipment
// ---------------------------------------------------------------------------

/** Does the hyphenated slug contain `phrase` as a whole token run? */
function hasToken(slug: string, phrase: string): boolean {
  return `-${slug}-`.includes(`-${phrase}-`);
}

/**
 * Slug keywords mapped to equipment, MOST SPECIFIC FIRST — `smith-machine` has
 * to be tested before `machine`, and `mini-loop-band` before `band`.
 *
 * Medicine balls, weighted balls and loose plates all collapse to `plate`:
 * it is the only union member meaning "a loose external load you hold", and
 * calling them `other` would also cost them the `weight_reps` inference below.
 */
const EQUIPMENT_RULES: readonly (readonly [readonly string[], Equipment])[] = [
  [['smith-machine'], 'smith_machine'],
  [['trap-bar'], 'trap_bar'],
  [['ez-bar'], 'ez_bar'],
  [['barbell', 'landmine'], 'barbell'],
  [['dumbbell'], 'dumbbell'],
  [['kettlebell'], 'kettlebell'],
  [['cable'], 'cable'],
  [
    [
      'machine',
      'hammerstrength',
      'freemotion',
      'lat-pulldown',
      'leg-press',
      'leg-extension',
      'pec-deck',
    ],
    'machine',
  ],
  [['mini-loop-band', 'loop-band', 'handle-band', 'banded', 'band'], 'band'],
  [['medicine-ball', 'weighted-ball', 'plate'], 'plate'],
  [['sled', 'tire'], 'sled'],
  [
    [
      'trx',
      'balance-trainer',
      'stability-ball',
      'exercise-ball',
      'foam-roll',
      'pvc',
      'partner',
      'ring',
      'box',
      'battle-ropes',
    ],
    'other',
  ],
];

/**
 * Barbell lifts whose slug names the movement but not the bar: `deadlift`,
 * `front-squat`, `power-clean`. Applied only after every rule above has missed,
 * so `dumbbell-romanian-deadlift` and `loop-band-squat` keep their implement.
 */
const BARBELL_MOVEMENTS = ['clean', 'snatch', 'jerk', 'deadlift', 'squat', 'squats'];

/**
 * ...but the same words also name unloaded variants. These markers veto the
 * fallback, which is what keeps `air-squats` and `pistol-squat` bodyweight.
 */
const UNLOADED_MARKERS = [
  'bodyweight',
  'air',
  'jump',
  'jumps',
  'pistol',
  'wall',
  'kick',
  'kicks',
  'rotation',
];

/**
 * Implement names as they appear in the INSTRUCTION PROSE, for the exercises
 * whose slug names neither an implement nor an Olympic lift — `pendlay-row`,
 * `skullcrusher`, `pallof-press`, `21-s`. Their first step almost always says
 * what to pick up ("Grasp a dumbbell in each hand"), so this reads the answer
 * off the source rather than guessing a conventional implement, and it settles
 * cases a keyword list gets wrong: `supine-pallof-press` is banded while
 * `pallof-press` is cabled.
 *
 * `barbell plate` has to precede `barbell` — the Svend press is two plates
 * pressed together, not a bar.
 */
const PROSE_EQUIPMENT_RULES: readonly (readonly [readonly string[], Equipment])[] = [
  [['smith machine'], 'smith_machine'],
  [['trap bar'], 'trap_bar'],
  [['ez bar', 'ez-bar', 'ez curl'], 'ez_bar'],
  [['barbell plate', 'weight plate', 'medicine ball', 'weighted ball'], 'plate'],
  [['barbell', 'landmine'], 'barbell'],
  [['dumbbell'], 'dumbbell'],
  [['kettlebell'], 'kettlebell'],
  [['cable', 'pulley'], 'cable'],
  [['weight machine', 'leg press', 'leg curl machine', 'machine'], 'machine'],
  [['resistance band', 'loop band', 'mini band', 'exercise band'], 'band'],
  [['sled'], 'sled'],
  [
    [
      'trx',
      'stability ball',
      'exercise ball',
      'swiss ball',
      'balance trainer',
      'foam roll',
    ],
    'other',
  ],
  // Vaguest last: a bare "the bar" on a preacher bench is an EZ bar in
  // practice, and the two farmer's-carry pages say only "resistance
  // apparatus" — deliberately implement-agnostic, so pick the common case.
  [['preacher curl bench'], 'ez_bar'],
  [['resistance apparatus'], 'dumbbell'],
];

/**
 * Bodyweight movements whose instructions mention a bar you hang from or brace
 * against. Without this veto `australian-pull-up` and `inverted-row` would read
 * as barbell work and grow a weight column.
 */
const BODYWEIGHT_MOVEMENTS = [
  'pull-up',
  'chin-up',
  'muscle-up',
  'push-up',
  'dip',
  'inverted-row',
];

/**
 * Slugs no rule can classify from its name or its prose.
 *
 * Kept as an explicit table rather than by bending a keyword rule, because each
 * entry is a fact about one exercise and widening a rule to catch it would
 * silently reclassify others. `standing-leg-curl` is the leg-curl machine, but
 * its page only ever says "pad" and "support handles" — it never names the
 * machine, so both the slug rules and the prose fallback miss it.
 */
const EQUIPMENT_OVERRIDES: Readonly<Record<string, Equipment>> = {
  'standing-leg-curl': 'machine',
};

export function inferEquipment(slug: string, instructions: readonly string[]): Equipment {
  const override = EQUIPMENT_OVERRIDES[slug];
  if (override !== undefined) return override;

  for (const [keywords, equipment] of EQUIPMENT_RULES) {
    if (keywords.some((k) => hasToken(slug, k))) return equipment;
  }
  if (
    BARBELL_MOVEMENTS.some((k) => hasToken(slug, k)) &&
    !UNLOADED_MARKERS.some((k) => hasToken(slug, k))
  ) {
    return 'barbell';
  }
  if (!BODYWEIGHT_MOVEMENTS.some((k) => hasToken(slug, k))) {
    const prose = instructions.join(' ').toLowerCase();
    for (const [keywords, equipment] of PROSE_EQUIPMENT_RULES) {
      if (keywords.some((k) => prose.includes(k))) return equipment;
    }
  }
  return 'bodyweight';
}

/** Equipment that puts an external load on the bar, so reps need a weight. */
const LOADED: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'cable',
  'machine',
  'smith_machine',
  'ez_bar',
  'trap_bar',
  'plate',
];

// ---------------------------------------------------------------------------
// tracking type
// ---------------------------------------------------------------------------

/** Held positions: nothing to count, so the logger shows a clock. */
const DURATION_MARKERS = [
  'stretch',
  'hold',
  'plank',
  'dead-hang',
  'wall-sit',
  'foam-roll',
  'pose',
  'l-sit',
  'v-sit',
  'stomach-vacuum',
  'bird-dog',
  'cat-cow',
  'dead-bug',
  'hollow',
  'side-bridge',
  // Battle ropes are worked to a clock like every other conditioning tool.
  'battle-ropes',
];

/** Travelling work where the ground covered IS the dose, not a side effect. */
const DISTANCE_MARKERS = ['sled', 'farmer', 'sprint'];

/** Travelling work logged by time; distance is incidental (`grape-vine`, skips). */
const TRAVEL_MARKERS = [
  'carry',
  'walk',
  'crawl',
  'skips',
  'grape-vine',
  'rope-climb',
  'butt-scoot',
];

export function inferTrackingType(slug: string, equipment: Equipment): TrackingType {
  if (DURATION_MARKERS.some((k) => hasToken(slug, k))) return 'duration';
  if (DISTANCE_MARKERS.some((k) => hasToken(slug, k))) return 'distance_duration';
  if (TRAVEL_MARKERS.some((k) => hasToken(slug, k))) return 'duration';
  if (slug.startsWith('assisted-')) return 'assisted_bodyweight';
  // "weighted ball" is an implement name, not a loaded bodyweight variant.
  if (hasToken(slug, 'weighted') && !slug.includes('weighted-ball')) {
    return 'weighted_bodyweight';
  }
  if (LOADED.includes(equipment)) return 'weight_reps';
  return 'bodyweight_reps';
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

const HEADER = `/**
 * AUTO-GENERATED by scripts/build-exercise-db.ts — do not edit.
 *
 * The bundled exercise catalogue, built from the source directories under
 * exercises_db/. Muscle lists and region maps are read off each exercise's
 * target_muscles.svg; prose comes from its details.txt. Regenerate with
 * \`npx tsx scripts/build-exercise-db.ts\`.
 */`;

function literal(exercise: DbExercise): string {
  const list = (items: readonly string[]): string =>
    `[${items.map((s) => JSON.stringify(s)).join(', ')}]`;
  const regions = Object.entries(exercise.regions)
    .map(([region, level]) => `${JSON.stringify(region)}: ${level}`)
    .join(', ');
  const mistakes = exercise.mistakes
    .map((m) => `{ title: ${JSON.stringify(m.title)}, body: ${JSON.stringify(m.body)} }`)
    .join(', ');
  return [
    '{',
    `slug: ${JSON.stringify(exercise.slug)},`,
    `name: ${JSON.stringify(exercise.name)},`,
    `url: ${JSON.stringify(exercise.url)},`,
    `trackingType: ${JSON.stringify(exercise.trackingType)},`,
    `equipment: ${JSON.stringify(exercise.equipment)},`,
    `primary: ${list(exercise.primary)},`,
    `secondary: ${list(exercise.secondary)},`,
    `regions: { ${regions} },`,
    `instructions: ${list(exercise.instructions)},`,
    `mistakes: [${mistakes}],`,
    '}',
  ].join('\n');
}

function chunkName(index: number): string {
  return `chunk${String(index).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------

function build(): DbExercise[] {
  assertPartition();

  const slugs = readdirSync(DB_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (slugs.length === 0) throw new Error(`no exercise directories under ${DB_DIR}`);

  const out: DbExercise[] = [];
  const mismatched: string[] = [];
  let unlabelled = 0;

  for (const slug of slugs) {
    const dir = join(DB_DIR, slug);
    const details = parseDetails(readFileSync(join(dir, 'details.txt'), 'utf8'), slug);
    const svg = readFileSync(join(dir, 'target_muscles.svg'), 'utf8');
    const levels = readRegions(svg, slug);

    if (render(levels) !== svg) {
      throw new Error(`${slug}: region map does not round-trip to the source SVG`);
    }

    const labels = labelLevels(levels, details.primaryLabels, details.secondaryLabels);
    const muscles = (level: RegionLevel): Muscle[] =>
      [
        ...new Set(
          [...labels].filter(([, l]) => l === level).map(([name]) => toMuscle(name)),
        ),
      ].sort();
    const primary = muscles(1);
    const secondary = muscles(2).filter((m) => !primary.includes(m));

    // The strongest check available: the red shading must reproduce the
    // `Primary Muscles:` list, for every page that has one.
    if (details.primaryLabels.length === 0) unlabelled += 1;
    else {
      const recovered = [...labels]
        .filter(([, l]) => l === 1)
        .map(([name]) => name)
        .sort();
      if (recovered.join('|') !== [...details.primaryLabels].sort().join('|')) {
        mismatched.push(
          `${slug}: art ${recovered} vs prose ${[...details.primaryLabels].sort()}`,
        );
      }
    }

    const regions: Partial<Record<MuscleRegion, RegionLevel>> = {};
    for (const region of REGION_NAMES) {
      const level = levels[region];
      if (level !== 0) regions[region] = level;
    }

    const equipment = inferEquipment(slug, details.instructions);
    out.push({
      slug,
      name: details.name,
      url: details.url,
      trackingType: inferTrackingType(slug, equipment),
      equipment,
      primary,
      secondary,
      regions,
      instructions: details.instructions,
      mistakes: details.mistakes,
    });
  }

  if (mismatched.length > 0) {
    throw new Error(
      `primary muscles recovered from the artwork disagree with details.txt for ` +
        `${mismatched.length} exercise(s):\n  ${mismatched.join('\n  ')}`,
    );
  }
  const checked = slugs.length - unlabelled;
  console.log(
    `primary-label cross-check: ${checked}/${checked} exercises match details.txt ` +
      `(100%); ${unlabelled} source page(s) list no muscles at all`,
  );

  return out.sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.slug.localeCompare(b.slug),
  );
}

function tally<T extends string>(values: readonly T[]): [T, number][] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printTable(title: string, rows: readonly [string, number][]): void {
  const width = Math.max(...rows.map((r) => r[0].length));
  console.log(`\n${title}`);
  for (const [label, count] of rows) {
    console.log(`  ${label.padEnd(width)}  ${String(count).padStart(4)}`);
  }
}

async function main(): Promise<void> {
  const exercises = build();

  mkdirSync(OUT_DIR, { recursive: true });
  // Only the generated modules are cleared. `types.ts` is hand-written and
  // shares this directory, so the directory itself is never wiped; dropping
  // stale chunks matters because a shrinking catalogue would otherwise leave
  // an orphan chunk that index.ts no longer imports but Metro still bundles.
  for (const file of readdirSync(OUT_DIR)) {
    if (/^chunk\d+\.ts$/.test(file)) rmSync(join(OUT_DIR, file));
  }

  // Imported here, not at the top: Prettier's entry point uses a dynamic
  // import, which Jest's CJS runtime refuses, and exercise-db.test.ts imports
  // this module for its parsers.
  const { format, resolveConfig } = await import('prettier');

  const config = await resolveConfig(join(OUT_DIR, 'index.ts'));
  const write = async (file: string, source: string): Promise<void> => {
    writeFileSync(
      join(OUT_DIR, file),
      await format(source, { ...config, filepath: join(OUT_DIR, file) }),
    );
  };

  const names: string[] = [];
  for (let i = 0; i < exercises.length; i += CHUNK_SIZE) {
    const name = chunkName(Math.floor(i / CHUNK_SIZE));
    names.push(name);
    await write(
      `${name}.ts`,
      [
        HEADER,
        "import type { DbExercise } from './types';",
        '',
        `export const EXERCISES: readonly DbExercise[] = [`,
        exercises
          .slice(i, i + CHUNK_SIZE)
          .map(literal)
          .join(',\n'),
        '];',
      ].join('\n'),
    );
  }

  await write(
    'index.ts',
    [
      HEADER,
      ...names.map((n, i) => `import { EXERCISES as CHUNK_${i} } from './${n}';`),
      "import type { DbExercise } from './types';",
      '',
      "export type { DbExercise, Mistake, RegionLevel, RegionMap } from './types';",
      '',
      '/**',
      ' * Every bundled exercise, sorted by name. The chunk files exist only to keep',
      ' * individual modules small enough for Babel and Metro; they are already in',
      ' * name order, so concatenating them needs no re-sort.',
      ' */',
      'export const ALL_EXERCISES: readonly DbExercise[] = [',
      ...names.map((_, i) => `  ...CHUNK_${i},`),
      '];',
      '',
      '/**',
      ' * A Map, not an object literal: a plain object inherits Object.prototype, so',
      ' * a lookup for "constructor" or "toString" would return an inherited function',
      ' * typed as a DbExercise, and `?? null` does not catch it. No caller passes',
      ' * anything but a real slug today, which is exactly why an unsound lookup here',
      ' * would go unnoticed.',
      ' */',
      'const BY_SLUG = new Map<string, DbExercise>(',
      '  ALL_EXERCISES.map((e) => [e.slug, e]),',
      ');',
      '',
      '/** Lookup by the directory name the exercise was generated from. */',
      'export function exerciseBySlug(slug: string | null | undefined): DbExercise | null {',
      '  if (slug == null) return null;',
      '  return BY_SLUG.get(slug) ?? null;',
      '}',
      '',
      '/** Every catalogue slug, in name order. */',
      'export function exerciseSlugs(): string[] {',
      '  return ALL_EXERCISES.map((e) => e.slug);',
      '}',
    ].join('\n'),
  );

  console.log(
    `\nwrote ${exercises.length} exercises to src/data/exercises/ in ${names.length} chunks`,
  );
  printTable('equipment', tally(exercises.map((e) => e.equipment)));
  printTable('trackingType', tally(exercises.map((e) => e.trackingType)));

  // Everything below is for a human to eyeball; none of it is load-bearing.
  const suspicious = exercises.filter(
    (e) =>
      e.equipment === 'bodyweight' &&
      /(^|-)(press|curl|row|raise|shrug|extension|fly|flye|pullover|carry|walk|swing|ball|thruster|clean|snatch|jerk)($|-)/.test(
        e.slug,
      ),
  );
  console.log(
    `\n${suspicious.length} bodyweight exercises name a movement that usually carries a load:`,
  );
  console.log(`  ${suspicious.map((e) => e.slug).join(', ')}`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
