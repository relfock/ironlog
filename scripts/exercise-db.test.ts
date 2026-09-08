/**
 * Guards the generated exercise catalogue against the source data.
 *
 * The interesting failures here are silent ones: a slug renamed in
 * `exercises_db/` without regenerating leaves history pointing at nothing, and
 * a widened `Equipment`/`TrackingType` union leaves the generator emitting
 * values the logger has no column for. The union tables below are declared as
 * `Record<Union, true>`, so adding a member fails to COMPILE until this file
 * acknowledges it — which is the point at which the generator's rules need
 * revisiting too.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALL_EXERCISES,
  exerciseBySlug,
  exerciseSlugs,
  type DbExercise,
} from '../src/data/exercises';
import { MUSCLE_TO_REGIONS, type MuscleRegion } from '../src/data/muscleArt/regions';
import type { Equipment, Muscle, TrackingType } from '../src/domain/types';
import {
  inferEquipment,
  inferTrackingType,
  labelLevels,
  parseDetails,
} from './build-exercise-db';

const DB_DIR = path.join(__dirname, '..', 'exercises_db');

const SOURCE_SLUGS = readdirSync(DB_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const EQUIPMENT: Record<Equipment, true> = {
  barbell: true,
  dumbbell: true,
  kettlebell: true,
  machine: true,
  cable: true,
  smith_machine: true,
  bodyweight: true,
  band: true,
  plate: true,
  ez_bar: true,
  trap_bar: true,
  sled: true,
  cardio_machine: true,
  other: true,
};

const TRACKING: Record<TrackingType, true> = {
  weight_reps: true,
  bodyweight_reps: true,
  weighted_bodyweight: true,
  assisted_bodyweight: true,
  duration: true,
  distance_duration: true,
  // hr_cardio is a code-defined built-in (see src/data/exercises/extras.ts);
  // the generator never emits it, so nothing below exercises that path.
  hr_cardio: true,
};

const REGIONS: Record<MuscleRegion, true> = {
  abs: true,
  obliques: true,
  biceps: true,
  delts_front: true,
  lats_front: true,
  traps_front: true,
  chest: true,
  forearms_front: true,
  abductors_front: true,
  adductors_front: true,
  quads: true,
  calves_front: true,
  neck: true,
  delts_back: true,
  traps_back: true,
  lats_back: true,
  triceps: true,
  forearms_back: true,
  glutes: true,
  hamstrings: true,
  abductors_back: true,
  calves_back: true,
  lower_back: true,
};

/**
 * The single source page that lists no muscles, no instructions and no
 * mistakes. Named rather than tolerated generally, so a second one cannot slip
 * in unnoticed and so a fixed source page shows up as a failing test.
 */
const NO_PROSE = 'balance-trainer-rear-lunge-kicks';

describe('catalogue covers exercises_db exactly', () => {
  it('has one exercise per source directory', () => {
    expect(SOURCE_SLUGS.length).toBe(1069);
    expect(ALL_EXERCISES.length).toBe(SOURCE_SLUGS.length);
  });

  it('uses the directory name as the slug, for every directory', () => {
    expect([...exerciseSlugs()].sort()).toEqual(SOURCE_SLUGS);
  });

  it('never assigns one slug twice', () => {
    const slugs = exerciseSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every exercise a distinct name, so search can tell them apart', () => {
    const names = ALL_EXERCISES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is sorted by name', () => {
    const names = ALL_EXERCISES.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('every field is within its union', () => {
  it('emits only known equipment', () => {
    for (const e of ALL_EXERCISES) expect(EQUIPMENT[e.equipment]).toBe(true);
  });

  it('emits only known tracking types', () => {
    for (const e of ALL_EXERCISES) expect(TRACKING[e.trackingType]).toBe(true);
  });

  it('emits only known muscles', () => {
    for (const e of ALL_EXERCISES) {
      for (const m of [...e.primary, ...e.secondary]) {
        expect(MUSCLE_TO_REGIONS[m as Muscle]).toBeDefined();
      }
    }
  });

  it('keys every region map by a real region, at level 1 or 2', () => {
    for (const e of ALL_EXERCISES) {
      for (const [region, level] of Object.entries(e.regions)) {
        expect(REGIONS[region as MuscleRegion]).toBe(true);
        expect([1, 2]).toContain(level);
      }
    }
  });
});

describe('every exercise is usable in the app', () => {
  it('names at least one primary muscle', () => {
    // Nothing to filter, sort or draw without one.
    for (const e of ALL_EXERCISES) expect(e.primary.length).toBeGreaterThan(0);
  });

  it('never repeats a muscle between primary and secondary', () => {
    for (const e of ALL_EXERCISES) {
      expect(e.secondary.filter((m) => e.primary.includes(m))).toEqual([]);
    }
  });

  it('shades a region for every muscle it names', () => {
    // The chips and the artwork have to agree; a muscle with nothing lit means
    // the label came from somewhere the drawing does not corroborate.
    for (const e of ALL_EXERCISES) {
      for (const m of [...e.primary, ...e.secondary]) {
        const regions = MUSCLE_TO_REGIONS[m as Muscle] ?? [];
        if (regions.length === 0) continue;
        expect(regions.some((r) => e.regions[r] !== undefined)).toBe(true);
      }
    }
  });

  it('carries instruction steps for every exercise but the one blank page', () => {
    const blank = ALL_EXERCISES.filter((e) => e.instructions.length === 0);
    expect(blank.map((e) => e.slug)).toEqual([NO_PROSE]);
    for (const e of ALL_EXERCISES) {
      if (e.slug === NO_PROSE) continue;
      expect(e.instructions.length).toBeGreaterThan(0);
      for (const step of e.instructions) expect(step.trim()).toBe(step);
      expect(e.instructions.every((s) => s.length > 0)).toBe(true);
    }
  });

  it('gives every listed mistake both a title and a body', () => {
    for (const e of ALL_EXERCISES) {
      for (const m of e.mistakes) {
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.body.length).toBeGreaterThan(0);
      }
    }
  });

  it('attributes every exercise to its source page', () => {
    for (const e of ALL_EXERCISES) {
      expect(e.url).toMatch(/^https:\/\/fitbod\.me\/exercises\//);
    }
  });

  it('never leaves the "How to do" scrape prefix in a name', () => {
    for (const e of ALL_EXERCISES) expect(e.name).not.toMatch(/^How to do /);
  });
});

describe('lookup helpers', () => {
  it('finds an exercise by slug', () => {
    const found = exerciseBySlug('barbell-bench-press');
    expect(found?.name).toBe('Barbell Bench Press');
    expect(found?.equipment).toBe('barbell');
    expect(found?.trackingType).toBe('weight_reps');
    expect(found?.primary).toEqual(['chest']);
  });

  it('returns null rather than throwing on an unknown or absent slug', () => {
    expect(exerciseBySlug('not-an-exercise')).toBeNull();
    expect(exerciseBySlug(null)).toBeNull();
    expect(exerciseBySlug(undefined)).toBeNull();
  });

  it('lists every slug it can look up', () => {
    for (const slug of exerciseSlugs()) expect(exerciseBySlug(slug)).not.toBeNull();
  });
});

describe('details.txt parsing', () => {
  const read = (slug: string): ReturnType<typeof parseDetails> =>
    parseDetails(readFileSync(path.join(DB_DIR, slug, 'details.txt'), 'utf8'), slug);

  it('strips the title prefix and keeps the source URL', () => {
    const d = read('barbell-bench-press');
    expect(d.name).toBe('Barbell Bench Press');
    expect(d.url).toBe('https://fitbod.me/exercises/barbell-bench-press');
    expect(d.primaryLabels).toEqual(['Chest']);
    expect(d.secondaryLabels).toEqual(['Triceps', 'Shoulders']);
  });

  it('splits a numbered mistake into title and body', () => {
    const d = read('barbell-bench-press');
    expect(d.mistakes.length).toBe(3);
    expect(d.mistakes[0]?.title).toBe('Flared Elbows');
    expect(d.mistakes[0]?.body).toMatch(/^Flaring your elbows out/);
    expect(d.mistakes[0]?.body).toMatch(/small adjustments from there\.$/);
  });

  it('folds a wrapped step back into one step', () => {
    // The source wraps step 1 across four unnumbered lines.
    const d = read('trx-push-up-plus');
    expect(d.instructions.length).toBe(1);
    expect(d.instructions[0]).toMatch(/^Place your extended arms/);
    expect(d.instructions[0]).toMatch(/Repeat for the allotted repetitions\.$/);
    expect(d.instructions[0]).not.toMatch(/\s{2}/);
    expect(d.mistakes).toEqual([]);
  });

  it('reads past a U+2028 line separator', () => {
    const d = read('balance-trainer-bar-assisted-dome-squat');
    expect(d.instructions.length).toBe(1);
    expect(d.instructions[0]).toMatch(/Keep the chest lifted and core braced/);
  });

  it('reads past a stray CRLF mid-step', () => {
    const d = read('1-2-kneeling-shotgun-row');
    expect(d.instructions.length).toBe(8);
    expect(d.instructions[3]).toMatch(/Adjust yourself so that there is tension/);
    expect(d.instructions.join('')).not.toMatch(/\r/);
  });

  it('reports an empty muscle list rather than inventing one', () => {
    const d = read(NO_PROSE);
    expect(d.primaryLabels).toEqual([]);
    expect(d.instructions).toEqual([]);
    expect(d.mistakes).toEqual([]);
  });
});

describe('recovering source labels from the shading', () => {
  const inactive = Object.fromEntries(
    (Object.keys(REGIONS) as MuscleRegion[]).map((r) => [r, 0 as const]),
  ) as Record<MuscleRegion, 0 | 1 | 2>;

  it('reads a plain single-region label straight off the colour', () => {
    const levels = { ...inactive, chest: 1 as const, triceps: 2 as const };
    expect([...labelLevels(levels, [], [])]).toEqual([
      ['Chest', 1],
      ['Triceps', 2],
    ]);
  });

  it('requires every region of a multi-region label to agree', () => {
    // Half-shaded deltoids are not "Shoulders"; no source file does this, and
    // if one ever did, silently rounding it would corrupt the muscle list.
    const levels = { ...inactive, delts_front: 1 as const };
    expect(labelLevels(levels, [], []).has('Shoulders')).toBe(false);
  });

  it('lets Back claim the lower-back region it shares', () => {
    const levels = {
      ...inactive,
      lats_front: 1 as const,
      lats_back: 1 as const,
      lower_back: 1 as const,
    };
    const labels = labelLevels(levels, ['Back'], []);
    expect(labels.get('Back')).toBe(1);
    expect(labels.has('Lower Back')).toBe(false);
  });

  it('takes Lower Back from the prose when Back has claimed the region', () => {
    // The superman/bridge family: the art paints the whole back complex green,
    // yet the page names Lower Back as the target.
    const levels = {
      ...inactive,
      lats_front: 2 as const,
      lats_back: 2 as const,
      lower_back: 2 as const,
    };
    expect(labelLevels(levels, ['Lower Back'], ['Back']).get('Lower Back')).toBe(1);
    expect(labelLevels(levels, [], ['Back', 'Lower Back']).get('Lower Back')).toBe(2);
    expect(labelLevels(levels, [], ['Back']).has('Lower Back')).toBe(false);
  });

  it('needs no prose when only the lower back is shaded', () => {
    const levels = { ...inactive, lower_back: 1 as const };
    expect(labelLevels(levels, [], []).get('Lower Back')).toBe(1);
  });
});

describe('equipment inference', () => {
  it('prefers the most specific slug keyword', () => {
    expect(inferEquipment('smith-machine-bench-press', [])).toBe('smith_machine');
    expect(inferEquipment('trap-bar-deadlift', [])).toBe('trap_bar');
    expect(inferEquipment('ez-bar-curl', [])).toBe('ez_bar');
    expect(inferEquipment('mini-loop-band-lateral-walk', [])).toBe('band');
    expect(inferEquipment('lat-pulldown', [])).toBe('machine');
  });

  it('reads an Olympic lift as a barbell lift only when nothing else claims it', () => {
    expect(inferEquipment('power-clean', [])).toBe('barbell');
    expect(inferEquipment('romanian-deadlift', [])).toBe('barbell');
    expect(inferEquipment('dumbbell-romanian-deadlift', [])).toBe('dumbbell');
    expect(inferEquipment('loop-band-squat', [])).toBe('band');
  });

  it('keeps unloaded variants of those lifts bodyweight', () => {
    expect(inferEquipment('air-squats', [])).toBe('bodyweight');
    expect(inferEquipment('pistol-squat', [])).toBe('bodyweight');
    expect(inferEquipment('jump-squat', [])).toBe('bodyweight');
    expect(inferEquipment('wall-squat', [])).toBe('bodyweight');
  });

  it('falls back to what the instructions say you pick up', () => {
    expect(inferEquipment('pallof-press', ['Kneel in front of a cable pulley.'])).toBe(
      'cable',
    );
    expect(inferEquipment('supine-pallof-press', ['Anchor a resistance band low.'])).toBe(
      'band',
    );
    expect(
      inferEquipment('svend-press', ['Press two light barbell plates together.']),
    ).toBe('plate');
  });

  it('does not turn a bar you hang from into loaded equipment', () => {
    expect(
      inferEquipment('australian-pull-up', ['Set a barbell in a rack at hip height.']),
    ).toBe('bodyweight');
    expect(inferEquipment('inverted-row', ['Set a barbell at waist height.'])).toBe(
      'bodyweight',
    );
  });

  it('assigns something to every exercise in the catalogue', () => {
    for (const e of ALL_EXERCISES) {
      expect(inferEquipment(e.slug, e.instructions)).toBe(e.equipment);
    }
  });
});

describe('tracking type inference', () => {
  it('puts a clock on held positions', () => {
    expect(inferTrackingType('plank', 'bodyweight')).toBe('duration');
    expect(inferTrackingType('couch-stretch', 'bodyweight')).toBe('duration');
    expect(inferTrackingType('weighted-wall-sit', 'bodyweight')).toBe('duration');
    expect(inferTrackingType('child-s-pose', 'bodyweight')).toBe('duration');
  });

  it('measures ground covered only where that is the dose', () => {
    expect(inferTrackingType('sled-push', 'sled')).toBe('distance_duration');
    expect(inferTrackingType('farmer-s-carry', 'dumbbell')).toBe('distance_duration');
    expect(inferTrackingType('bear-crawl', 'bodyweight')).toBe('duration');
    expect(inferTrackingType('a-skips', 'bodyweight')).toBe('duration');
  });

  it('distinguishes assisted, weighted and plain bodyweight reps', () => {
    expect(inferTrackingType('assisted-pull-up', 'bodyweight')).toBe(
      'assisted_bodyweight',
    );
    expect(inferTrackingType('overhead-weighted-sit-up', 'bodyweight')).toBe(
      'weighted_bodyweight',
    );
    expect(inferTrackingType('pull-up', 'bodyweight')).toBe('bodyweight_reps');
    expect(inferTrackingType('push-up', 'bodyweight')).toBe('bodyweight_reps');
  });

  it('gives anything with a load a weight column', () => {
    expect(inferTrackingType('barbell-bench-press', 'barbell')).toBe('weight_reps');
    expect(inferTrackingType('cable-row', 'cable')).toBe('weight_reps');
    expect(inferTrackingType('leg-press', 'machine')).toBe('weight_reps');
    expect(inferTrackingType('band-pull-apart', 'band')).toBe('bodyweight_reps');
  });

  it('agrees with what was generated, for every exercise', () => {
    for (const e of ALL_EXERCISES) {
      expect(inferTrackingType(e.slug, e.equipment)).toBe(e.trackingType);
    }
  });
});

describe('the region map is the app-facing copy of the artwork', () => {
  it('omits inactive regions instead of storing zeroes', () => {
    // `RegionMap` is Partial on purpose; a stored 0 would double the size of
    // every entry and make `region in map` mean nothing.
    for (const e of ALL_EXERCISES) {
      expect(Object.values(e.regions)).not.toContain(0);
    }
  });

  it('shades something for every exercise', () => {
    for (const e of ALL_EXERCISES) {
      expect(Object.keys(e.regions).length).toBeGreaterThan(0);
    }
  });

  it('marks at least one region primary wherever a primary muscle is named', () => {
    const withoutPrimaryShading = ALL_EXERCISES.filter(
      (e: DbExercise) => !Object.values(e.regions).includes(1),
    );
    // The ten superman/bridge pages are the documented exception: their prose
    // names a primary muscle the artwork only paints as assisting.
    expect(withoutPrimaryShading.length).toBe(10);
  });
});
