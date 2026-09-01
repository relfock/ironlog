/**
 * Harvest the Everkinetic exercise illustrations from Wikimedia Commons.
 *
 * Run once; the output is committed. `npm run art:harvest`
 *
 * LICENSING — the rules this script exists to enforce:
 *
 *  1. Files are written BYTE-IDENTICAL. No svgo, no minification, no
 *     recolouring, no viewBox normalisation. An unmodified file bundled beside
 *     application code is a "collection" under CC's own terms, so the app stays
 *     proprietary and share-alike is never triggered. The moment we optimise a
 *     file it becomes Adapted Material that must itself be released CC BY-SA.
 *     The ~4 MB saved is not worth surrendering that position.
 *
 *  2. Colour is applied at RENDER time. These files carry no `fill` attribute
 *     at all, so the app can tint them for light/dark mode without editing
 *     them. `assertTintable` below fails the harvest if that ever stops being
 *     true, because it is the whole basis of rule 1.
 *
 *  3. Per-file licence, artist and file-page URL are snapshotted into
 *     manifest.json at ingest, and the credits screen is generated from it.
 *
 * See docs/ART_LICENSING.md for the obligations that follow from this.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  COMMONS_CATEGORY,
  DOWNLOAD_DELAY_MS,
  downloadFile,
  fetchCategoryFiles,
  sleep,
  type CommonsFile,
} from './commons';
import { SEED_EXERCISES } from '../src/data/seed';
import { bestMatch, matchKey } from '../src/domain/exerciseSearch';

const ART_DIR = path.join(__dirname, '..', 'assets', 'art');
const MANIFEST = path.join(ART_DIR, 'manifest.json');
const REPORT = path.join(__dirname, '..', 'docs', 'art-coverage.md');

/** Licences we are prepared to ship. Anything else aborts the harvest. */
const ALLOWED_LICENCES = [
  'CC BY-SA 3.0',
  'CC BY-SA 4.0',
  'CC BY 3.0',
  'CC BY 4.0',
  'CC0',
  'Public domain',
];

export interface ManifestFrame {
  readonly frame: number;
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

export interface ManifestEntry {
  readonly exerciseSlug: string;
  readonly commonsStem: string;
  readonly frames: readonly ManifestFrame[];
  readonly license: string;
  readonly licenseUrl: string | null;
  readonly artist: string;
  readonly credit: string | null;
  /** Commons file-page URLs, one per frame — the attribution link. */
  readonly sourcePages: readonly string[];
}

export interface Manifest {
  readonly harvestedAt: string;
  readonly category: string;
  readonly entries: readonly ManifestEntry[];
  readonly artists: readonly string[];
  readonly licenses: readonly string[];
}

const LICENCE_URLS: Record<string, string> = {
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/**
 * The tinting guarantee. These files must contain no baked-in colour, or the
 * app would have to edit them to theme them — creating a derivative and
 * triggering share-alike.
 */
export function assertTintable(svg: string, label: string): void {
  const problems: string[] = [];
  if (/\sfill\s*=/.test(svg)) problems.push('has a fill attribute');
  if (/\sstyle\s*=/.test(svg)) problems.push('has a style attribute');
  if (/<style[\s>]/.test(svg)) problems.push('has a <style> block');
  if (/base64/.test(svg)) problems.push('embeds a raster image');
  if (/<image[\s>]/.test(svg)) problems.push('has an <image> element');
  if (problems.length > 0) {
    throw new Error(
      `${label} is not safely tintable (${problems.join(', ')}). ` +
        'Runtime tinting is what keeps these assets unmodified; investigate ' +
        'before shipping this file.',
    );
  }
}

function slugToFilename(slug: string, frame: number): string {
  return `${slug}-${frame}.svg`;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Harvesting ${COMMONS_CATEGORY}${dryRun ? ' (dry run)' : ''}`);

  const all = await fetchCategoryFiles(COMMONS_CATEGORY, (m) => console.log(m));
  console.log(`  total files: ${all.length}`);

  const svgs = all.filter((f) => f.mime === 'image/svg+xml');
  console.log(`  svg files:   ${svgs.length}`);

  // Group SVGs by exercise stem.
  const byStem = new Map<string, CommonsFile[]>();
  for (const f of svgs) {
    const list = byStem.get(f.stem) ?? [];
    list.push(f);
    byStem.set(f.stem, list);
  }
  console.log(`  svg stems:   ${byStem.size}`);

  // A normalised index so a slightly-off hand-typed stem still resolves.
  const stemByKey = new Map<string, string>();
  for (const stem of byStem.keys()) stemByKey.set(matchKey(stem), stem);

  const entries: ManifestEntry[] = [];
  const declaredNoArt: string[] = [];
  const unresolved: { slug: string; stem: string; suggestion: string | null }[] = [];
  const singleFrame: string[] = [];
  const keptFiles = new Set<string>();
  let downloaded = 0;
  let reused = 0;

  for (const ex of SEED_EXERCISES) {
    if (ex.commonsStem === null || ex.commonsStem === undefined) {
      declaredNoArt.push(ex.slug);
      continue;
    }

    // Exact, then normalised, then fuzzy — so "dead lift" vs "deadlift" and
    // other spelling drift resolve instead of silently dropping art.
    let stem = byStem.has(ex.commonsStem) ? ex.commonsStem : undefined;
    if (stem === undefined) stem = stemByKey.get(matchKey(ex.commonsStem));
    if (stem === undefined) {
      const guess = bestMatch(ex.commonsStem, [...byStem.keys()], (s) => s, 0.8);
      unresolved.push({
        slug: ex.slug,
        stem: ex.commonsStem,
        suggestion: guess?.item ?? null,
      });
      continue;
    }

    const files = (byStem.get(stem) ?? [])
      .filter((f) => f.frame !== null)
      .sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));

    if (files.length === 0) {
      unresolved.push({ slug: ex.slug, stem: ex.commonsStem, suggestion: null });
      continue;
    }
    if (files.length === 1) singleFrame.push(ex.slug);

    const licence = files[0]!.licenseShortName ?? 'unknown';
    if (!ALLOWED_LICENCES.includes(licence)) {
      throw new Error(
        `Refusing to ship "${stem}": licence "${licence}" is not on the allow list. ` +
          'Verify the Commons file page before adding it.',
      );
    }

    const frames: ManifestFrame[] = [];
    for (const f of files) {
      const filename = slugToFilename(ex.slug, f.frame!);
      keptFiles.add(filename);

      let bytes: Buffer;
      if (dryRun) {
        bytes = Buffer.from('');
      } else {
        const dest = path.join(ART_DIR, filename);
        // Resume: a file already on disk with the right byte count is kept, so
        // a rate-limited run can simply be re-run without re-fetching 350 files.
        const existing = await readFile(dest).catch(() => null);
        if (existing !== null && existing.length === f.size) {
          bytes = existing;
          reused += 1;
        } else {
          bytes = await downloadFile(f.url);
          await writeFile(dest, bytes);
          downloaded += 1;
          await sleep(DOWNLOAD_DELAY_MS);
        }
        assertTintable(bytes.toString('utf8'), f.title);
      }

      frames.push({
        frame: f.frame!,
        file: filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        width: f.width,
        height: f.height,
      });
    }

    entries.push({
      exerciseSlug: ex.slug,
      commonsStem: stem,
      frames,
      license: licence,
      licenseUrl: LICENCE_URLS[licence] ?? null,
      artist: files[0]!.artist ?? 'Unknown',
      credit: files[0]!.credit ?? null,
      sourcePages: files.map((f) => f.descriptionUrl),
    });

    if (entries.length % 20 === 0) {
      console.log(`  ${entries.length} exercises done (${downloaded} fetched, ${reused} reused)`);
    }
  }
  console.log(`  ${entries.length} exercises done (${downloaded} fetched, ${reused} reused)`);

  // Fail loudly on a stem that does not exist — a typo in the catalogue is a
  // bug, not something to silently skip.
  if (unresolved.length > 0) {
    console.error('\nUNRESOLVED commonsStem values:');
    for (const u of unresolved) {
      console.error(
        `  ${u.slug}: "${u.stem}"` +
          (u.suggestion ? ` — did you mean "${u.suggestion}"?` : ' — no close match'),
      );
    }
    throw new Error(
      `${unresolved.length} declared commonsStem value(s) do not exist on Commons. ` +
        'Fix the catalogue or set commonsStem: null.',
    );
  }

  const artists = [...new Set(entries.map((e) => e.artist))].sort();
  const licenses = [...new Set(entries.map((e) => e.license))].sort();

  const manifest: Manifest = {
    harvestedAt: new Date().toISOString(),
    category: COMMONS_CATEGORY,
    entries: entries.sort((a, b) => a.exerciseSlug.localeCompare(b.exerciseSlug)),
    artists,
    licenses,
  };

  if (!dryRun) {
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    // Remove art for exercises that no longer reference it.
    const onDisk = await readdir(ART_DIR);
    for (const f of onDisk) {
      if (f.endsWith('.svg') && !keptFiles.has(f)) {
        await unlink(path.join(ART_DIR, f));
        console.log(`  removed stale ${f}`);
      }
    }
  }

  const totalBytes = entries.reduce(
    (n, e) => n + e.frames.reduce((m, f) => m + f.bytes, 0),
    0,
  );

  const report = [
    '# Exercise art coverage',
    '',
    `Generated by \`npm run art:harvest\` on ${manifest.harvestedAt}.`,
    'Do not edit by hand.',
    '',
    '## Summary',
    '',
    `- Commons category: \`${COMMONS_CATEGORY}\``,
    `- Files in category: ${all.length} (${svgs.length} SVG, ${byStem.size} stems)`,
    `- Catalogue exercises: ${SEED_EXERCISES.length}`,
    `- **With Everkinetic art: ${entries.length}**`,
    `- Declared no art (muscle-map fallback): ${declaredNoArt.length}`,
    `- Single-frame only (no animation): ${singleFrame.length}`,
    `- Bundled art size: ${(totalBytes / 1048576).toFixed(2)} MB`,
    `- Artists: ${artists.join(', ')}`,
    `- Licences: ${licenses.join(', ')}`,
    '',
    '## Exercises falling back to the muscle map',
    '',
    'These have no Everkinetic illustration. The muscle map renders instead, so',
    'every exercise still has coherent visuals.',
    '',
    ...declaredNoArt.map((s) => `- ${s}`),
    '',
    '## Single-frame exercises',
    '',
    'Commons has only one of the two poses, so these render statically rather',
    'than animating between start and end.',
    '',
    ...(singleFrame.length > 0 ? singleFrame.map((s) => `- ${s}`) : ['_none_']),
    '',
  ].join('\n');

  if (!dryRun) await writeFile(REPORT, report);

  console.log('');
  console.log(`  with art:      ${entries.length}`);
  console.log(`  no art (map):  ${declaredNoArt.length}`);
  console.log(`  single frame:  ${singleFrame.length}`);
  console.log(`  bundled size:  ${(totalBytes / 1048576).toFixed(2)} MB`);
  console.log(`  artists:       ${artists.join(', ')}`);
  console.log(`  licences:      ${licenses.join(', ')}`);
  if (!dryRun) console.log(`\n  wrote ${MANIFEST}\n  wrote ${REPORT}`);
}

if (require.main === module) {
  mkdir(ART_DIR, { recursive: true })
    .then(main)
    .catch((err: unknown) => {
      console.error(`\n${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
