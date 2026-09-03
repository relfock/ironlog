/**
 * Builds the raw-asset staging tree for the exercise demonstration clips.
 *
 *   exercises_db/<slug>/video.mp4  ->  media/exercises/<slug>.mp4
 *
 * plugins/withExerciseMedia.js points AGP's main asset source set at `media/`,
 * so the tree lands in the APK as `assets/exercises/<slug>.mp4` and is readable
 * at `file:///android_asset/exercises/<slug>.mp4`. The rename is the whole point
 * of this step: the source layout is one directory per exercise, and Android
 * assets need a flat, slug-named tree.
 *
 * HARD LINKS, NOT COPIES. The corpus is 3.7 GB. `link(2)` is a directory entry
 * pointing at the existing inode, so staging is instantaneous and costs no extra
 * disk. Copying would burn 3.7 GB and minutes of IO on every clone. The fallback
 * to a copy exists only for a cross-device layout, where `link(2)` returns
 * EXDEV.
 *
 * A staged file that is NOT a link to its source is left alone — that is what
 * `npm run media:compress` produces, and silently re-linking would throw away a
 * re-encode that took an hour. Pass `--relink` to override.
 *
 * Run with `npm run media:stage`.
 */
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SOURCE_DIR = join(ROOT, 'exercises_db');
/** Keep in step with MEDIA_DIR in plugins/withExerciseMedia.js. */
const STAGE_DIR = join(ROOT, 'media', 'exercises');
const SOURCE_FILE = 'video.mp4';

const relink = process.argv.includes('--relink');

interface Summary {
  linked: number;
  copied: number;
  skipped: number;
  diverged: number;
  pruned: number;
  missing: string[];
  sourceBytes: number;
  stagedBytes: number;
}

/** Same file, in the `link(2)` sense: one inode on one device. */
function isSameInode(a: string, b: string): boolean {
  const left = lstatSync(a);
  const right = lstatSync(b);
  return left.dev === right.dev && left.ino === right.ino;
}

function slugsWithVideo(summary: Summary): string[] {
  const slugs: string[] = [];
  for (const entry of readdirSync(SOURCE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(SOURCE_DIR, entry.name, SOURCE_FILE))) {
      slugs.push(entry.name);
    } else {
      summary.missing.push(entry.name);
    }
  }
  return slugs.sort();
}

function stage(slug: string, summary: Summary): void {
  const source = join(SOURCE_DIR, slug, SOURCE_FILE);
  const target = join(STAGE_DIR, `${slug}.mp4`);
  summary.sourceBytes += statSync(source).size;

  if (existsSync(target)) {
    if (isSameInode(source, target)) {
      summary.skipped += 1;
      summary.stagedBytes += lstatSync(target).size;
      return;
    }
    if (!relink) {
      summary.diverged += 1;
      summary.stagedBytes += lstatSync(target).size;
      return;
    }
    unlinkSync(target);
  }

  try {
    linkSync(source, target);
    summary.linked += 1;
  } catch (error) {
    // EXDEV means media/ and exercises_db/ are on different filesystems, which
    // is the one case a hard link genuinely cannot express.
    console.warn(
      `stage-media: hard link failed for ${slug} (${(error as Error).message}); ` +
        'copying instead — this consumes real disk.',
    );
    copyFileSync(source, target);
    summary.copied += 1;
  }
  summary.stagedBytes += lstatSync(target).size;
}

/** Drop staged clips whose slug is no longer in the catalogue. */
function prune(expected: ReadonlySet<string>, summary: Summary): void {
  for (const entry of readdirSync(STAGE_DIR, { withFileTypes: true })) {
    const slug = entry.name.endsWith('.mp4') ? entry.name.slice(0, -4) : null;
    if (slug !== null && expected.has(slug)) continue;
    rmSync(join(STAGE_DIR, entry.name), { recursive: true, force: true });
    summary.pruned += 1;
  }
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function main(): void {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(`stage-media: ${SOURCE_DIR} not found.`);
  }
  mkdirSync(STAGE_DIR, { recursive: true });

  const summary: Summary = {
    linked: 0,
    copied: 0,
    skipped: 0,
    diverged: 0,
    pruned: 0,
    missing: [],
    sourceBytes: 0,
    stagedBytes: 0,
  };

  const slugs = slugsWithVideo(summary);
  prune(new Set(slugs), summary);
  for (const slug of slugs) stage(slug, summary);

  console.log(`stage-media: ${STAGE_DIR}`);
  console.log(`  catalogue     ${slugs.length} slugs with ${SOURCE_FILE}`);
  console.log(`  linked        ${summary.linked}`);
  if (summary.copied > 0) console.log(`  copied        ${summary.copied}`);
  console.log(`  skipped       ${summary.skipped} (already linked to source)`);
  if (summary.diverged > 0) {
    console.log(
      `  kept          ${summary.diverged} (not links to source — compressed? ` +
        'use --relink to replace)',
    );
  }
  console.log(`  pruned        ${summary.pruned}`);
  console.log(`  source total  ${gib(summary.sourceBytes)}`);
  console.log(`  staged total  ${gib(summary.stagedBytes)}`);
  if (summary.missing.length > 0) {
    console.warn(
      `stage-media: ${summary.missing.length} slug(s) have no ${SOURCE_FILE}: ` +
        `${summary.missing.slice(0, 5).join(', ')}${summary.missing.length > 5 ? ', …' : ''}`,
    );
  }
}

main();
