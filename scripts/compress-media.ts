/**
 * OPT-IN re-encode of the staged exercise clips. Not part of any build.
 *
 * The source corpus is 1080p60 H.264 at ~1.3 Mbps — 3.44 GiB for 1069 silent
 * 15-second form demos, which is far more than a phone screen can show. A 720p30
 * CRF-28 re-encode with the audio track dropped cuts that by roughly an order of
 * magnitude. Use it if the full-size APK proves impractical; see
 * docs/EXERCISE_MEDIA.md for the 4 GiB APK ceiling that makes this the escape
 * hatch rather than a nicety.
 *
 * NEVER EDIT IN PLACE. The staged files are hard links, so they share an inode
 * with `exercises_db/<slug>/video.mp4`. Writing through the staged path would
 * rewrite the pristine source. Every encode therefore goes to a temp file and is
 * `rename(2)`d over the staged name, which replaces the directory entry and
 * leaves the source inode untouched.
 *
 * Run with `npm run media:compress` (add `-- --force` to re-encode everything).
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const STAGE_DIR = join(ROOT, 'media', 'exercises');
const TMP_DIR = join(ROOT, 'media', '.tmp');
/**
 * Records what each output is, so a re-run is cheap. Inode identity cannot serve
 * as the marker: a `--relink` in stage-media.ts, or the copy fallback, would both
 * confuse it.
 */
const STATE_FILE = join(ROOT, 'media', '.compress-state.json');

const HEIGHT = 720;
const FPS = 30;
const CRF = 28;

const force = process.argv.includes('--force');

// One ffmpeg process per worker, each capped at a single thread (`-threads 1`),
// so wall-clock speed tracks the number of workers. Default to every core;
// `--jobs=N` overrides when the box is otherwise busy (this project's build
// machine is frequently saturated).
function parseJobs(): number {
  const args = process.argv;
  const inline = args
    .map((a) => /^--jobs=(\d+)$/.exec(a))
    .filter((m): m is RegExpExecArray => m !== null);
  if (inline.length > 0) return Math.max(1, Number(inline[inline.length - 1]![1]));
  const sep = args.indexOf('--jobs');
  const next = sep >= 0 ? Number(args[sep + 1]) : NaN;
  return Number.isFinite(next) && next >= 1 ? Math.floor(next) : Math.max(1, availableParallelism());
}
const JOBS = parseJobs();

interface Encoded {
  readonly inputBytes: number;
  readonly outputBytes: number;
}

type State = Record<string, Encoded>;

function readState(): State {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
  } catch {
    console.warn(`compress-media: ${STATE_FILE} is unreadable, re-encoding everything.`);
    return {};
  }
}

/**
 * `-an` because the clips are silent; `+faststart` so the moov atom precedes the
 * media data and ExoPlayer can start without a seek to the tail; `-g` pins a
 * two-second keyframe interval, which is what makes loop restart and scrubbing
 * snap rather than crawl. `scale=-2:` keeps the width even, which yuv420p
 * requires.
 */
function ffmpegArgs(input: string, output: string): string[] {
  return [
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-i',
    input,
    '-vf',
    `scale=-2:${HEIGHT}:flags=lanczos,fps=${FPS}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(CRF),
    '-pix_fmt',
    'yuv420p',
    '-g',
    String(FPS * 2),
    // One thread per process: the pool below already saturates every core, and
    // x264's own threading would only make them contend.
    '-threads',
    '1',
    '-an',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}

function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ffmpegArgs(input, output), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
  });
}

async function encode(name: string, state: State): Promise<void> {
  const staged = join(STAGE_DIR, name);
  const temp = join(TMP_DIR, name);
  try {
    await runFfmpeg(staged, temp);
    const inputBytes = statSync(staged).size;
    const outputBytes = statSync(temp).size;
    // rename(2) swaps the directory entry. The exercises_db inode this name was
    // linked to keeps its own name and its original bytes.
    renameSync(temp, staged);
    state[name] = { inputBytes, outputBytes };
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Fixed-size worker pool over a shared cursor. */
async function runPool(names: readonly string[], state: State): Promise<number> {
  const jobs = JOBS;
  let cursor = 0;
  let done = 0;
  let failed = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const name = names[index];
      if (name === undefined) return;
      try {
        await encode(name, state);
      } catch (error) {
        failed += 1;
        console.warn(`compress-media: ${name} failed — ${(error as Error).message}`);
      }
      done += 1;
      if (done % 25 === 0 || done === names.length) {
        process.stdout.write(`\r  encoded ${done}/${names.length}`);
      }
    }
  };

  console.log(`compress-media: ${names.length} clip(s) across ${jobs} worker(s)`);
  await Promise.all(Array.from({ length: jobs }, worker));
  process.stdout.write('\n');
  return failed;
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

async function main(): Promise<void> {
  if (!existsSync(STAGE_DIR)) {
    throw new Error(
      `compress-media: ${STAGE_DIR} not found — run \`npm run media:stage\` first.`,
    );
  }
  mkdirSync(TMP_DIR, { recursive: true });

  const state = readState();
  const all = readdirSync(STAGE_DIR)
    .filter((name) => name.endsWith('.mp4'))
    .sort();
  const pending = all.filter((name) => {
    if (force) return true;
    const recorded = state[name];
    return (
      recorded === undefined ||
      statSync(join(STAGE_DIR, name)).size !== recorded.outputBytes
    );
  });

  const beforeBytes = all.reduce(
    (sum, name) => sum + statSync(join(STAGE_DIR, name)).size,
    0,
  );

  if (pending.length === 0) {
    console.log(`compress-media: nothing to do, ${all.length} clip(s) already encoded.`);
    return;
  }

  const failed = await runPool(pending, state);
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  rmSync(TMP_DIR, { recursive: true, force: true });

  const afterBytes = all.reduce(
    (sum, name) => sum + statSync(join(STAGE_DIR, name)).size,
    0,
  );
  const ratio = beforeBytes === 0 ? 0 : (afterBytes / beforeBytes) * 100;

  console.log(`  target        ${HEIGHT}p${FPS}, H.264 CRF ${CRF}, no audio`);
  console.log(`  before        ${gib(beforeBytes)}`);
  console.log(`  after         ${gib(afterBytes)} (${ratio.toFixed(1)}% of before)`);
  if (failed > 0) console.warn(`  failed        ${failed} clip(s) left at full size`);
}

void main();
