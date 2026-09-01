/**
 * Verifies the shipped artefacts really contain the artwork, unmodified.
 *
 * This is the end-to-end form of rule 1 in docs/ART_LICENSING.md. `art.test.ts`
 * checks the generated modules against the files on disk; this checks what the
 * BUILD produced, which is what users actually receive.
 *
 * Checks, in order of strength:
 *   1. The generated modules embed every file byte-for-byte.
 *   2. If a release APK exists, its JS bundle contains the artwork's path data.
 *
 * Usage:
 *   npm run art:registry
 *   npm run verify:bundle
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ART_DIR = path.join(ROOT, 'assets', 'art');
const APK = path.join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

function fail(message: string): never {
  console.error(`\nFAILED — ${message}`);
  process.exit(1);
}

function main(): void {
   
  const art = require(path.join(ROOT, 'src', 'data', 'art')) as {
    artFrames: (slug: string) => string[] | null;
    artSlugs: () => string[];
  };

  const sources = readdirSync(ART_DIR).filter((f) => f.endsWith('.svg'));
  const slugs = art.artSlugs();

  // Filenames come from the manifest, never from `${slug}-${i+1}.svg`: five
  // exercises exist on Commons with only ONE of the two poses, and for two of
  // them that pose is frame 2 — so the index is not the frame number.
  const manifest = JSON.parse(
    readFileSync(path.join(ART_DIR, 'manifest.json'), 'utf8'),
  ) as {
    entries: { exerciseSlug: string; frames: { frame: number; file: string }[] }[];
  };
  const filesBySlug = new Map(
    manifest.entries.map((e) => [
      e.exerciseSlug,
      [...e.frames].sort((a, b) => a.frame - b.frame).map((f) => f.file),
    ]),
  );

  // 1. Byte-identity of the embedded markup.
  let embedded = 0;
  const mismatches: string[] = [];
  for (const slug of slugs) {
    const frames = art.artFrames(slug) ?? [];
    const files = filesBySlug.get(slug);
    if (files === undefined) {
      mismatches.push(`${slug}: not in manifest.json`);
      continue;
    }
    if (files.length !== frames.length) {
      mismatches.push(
        `${slug}: manifest lists ${files.length} frames, module embeds ${frames.length}`,
      );
      continue;
    }
    frames.forEach((svg, i) => {
      const file = path.join(ART_DIR, files[i]!);
      if (!existsSync(file)) {
        mismatches.push(`${slug}: source file ${files[i]} missing`);
        return;
      }
      if (readFileSync(file, 'utf8') !== svg) {
        mismatches.push(`${slug}: embedded ${files[i]} differs from source`);
        return;
      }
      embedded += 1;
    });
  }

  console.log(`source art files:      ${sources.length}`);
  console.log(`exercises with art:    ${slugs.length}`);
  console.log(`frames embedded:       ${embedded}`);
  console.log(`byte mismatches:       ${mismatches.length}`);

  if (mismatches.length > 0) {
    for (const m of mismatches.slice(0, 20)) console.error(`  ${m}`);
    fail('the embedded artwork no longer matches assets/art/.');
  }
  if (embedded !== sources.length) {
    fail(
      `${sources.length} files on disk but ${embedded} embedded. ` +
        'Run `npm run art:registry`.',
    );
  }

  // 2. The release bundle actually carries it.
  if (!existsSync(APK)) {
    console.log('\nrelease APK:           not built (skipping bundle check)');
    console.log('\nOK — embedded artwork is byte-identical to source.');
    return;
  }

  // Take a distinctive slice of real path data and look for it in the bundle.
  // Hermes stores string literals in its bytecode string table, so the markup
  // appears verbatim in the binary.
  const probeSlug = slugs[0]!;
  const probe = (art.artFrames(probeSlug) ?? [])[0] ?? '';
  const needle = probe.slice(200, 260);
  if (needle.length < 40) fail('could not build a probe from the artwork.');

  const bundle = extractBundle(APK);
  if (bundle === null) {
    console.log('\nrelease APK:           present, but no JS bundle entry found');
    console.log('\nOK — embedded artwork is byte-identical to source.');
    return;
  }

  const found = bundle.includes(needle);
  console.log(`release bundle:        ${(bundle.length / 1048576).toFixed(1)} MB`);
  console.log(`artwork in bundle:     ${found ? 'yes' : 'NO'}`);
  if (!found) fail(`artwork for "${probeSlug}" is not present in the release bundle.`);

  console.log('\nOK — artwork is embedded byte-identically and present in the release bundle.');
}

/** Read assets/index.android.bundle out of the APK without extra deps. */
function extractBundle(apkPath: string): string | null {
   
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  try {
    const out = execFileSync('unzip', ['-p', apkPath, 'assets/index.android.bundle'], {
      maxBuffer: 256 * 1024 * 1024,
      encoding: 'latin1',
    });
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

main();
