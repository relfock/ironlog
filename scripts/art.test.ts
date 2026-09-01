/**
 * Guards the licensing invariants for the bundled artwork.
 *
 * These are not style checks. Each one corresponds to a rule in
 * docs/ART_LICENSING.md that, if broken, changes our legal position:
 * modifying a file makes it Adapted Material under CC BY-SA, and a baked-in
 * fill would force us to modify files in order to theme them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { assertTintable } from './harvest-art';
import { normaliseArtist, parseFrame, stripHtml } from './commons';

const ART_DIR = path.join(__dirname, '..', 'assets', 'art');
const MANIFEST_PATH = path.join(ART_DIR, 'manifest.json');

interface Manifest {
  harvestedAt: string;
  category: string;
  entries: {
    exerciseSlug: string;
    commonsStem: string;
    frames: { frame: number; file: string; sha256: string; bytes: number; width: number; height: number }[];
    license: string;
    licenseUrl: string | null;
    artist: string;
    sourcePages: string[];
  }[];
  artists: string[];
  licenses: string[];
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

describe('art manifest', () => {
  it('covers a meaningful share of the catalogue', () => {
    expect(manifest.entries.length).toBeGreaterThanOrEqual(150);
  });

  it('records only licences we are allowed to ship', () => {
    const allowed = ['CC BY-SA 3.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY 4.0', 'CC0', 'Public domain'];
    for (const l of manifest.licenses) expect(allowed).toContain(l);
  });

  it('gives every entry an artist and a licence URL for attribution', () => {
    for (const e of manifest.entries) {
      expect(e.artist.length).toBeGreaterThan(0);
      expect(e.artist).not.toBe('Unknown');
      expect(e.licenseUrl).toMatch(/^https:\/\//);
    }
  });

  it('links every frame to its Commons file page', () => {
    // The file page is the attribution target and the record of what we took.
    for (const e of manifest.entries) {
      expect(e.sourcePages.length).toBe(e.frames.length);
      for (const url of e.sourcePages) {
        expect(url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      }
    }
  });

  it('has normalised the artist name to a single spelling', () => {
    // The category genuinely contains "Everkinetic", "everkinetic" and the
    // typo "Everkineteic"; unfolded they would appear as three artists.
    expect(manifest.artists).toEqual(['Everkinetic']);
  });

  it('never assigns one exercise two entries', () => {
    const slugs = manifest.entries.map((e) => e.exerciseSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('orders frames 1 then 2', () => {
    for (const e of manifest.entries) {
      const nums = e.frames.map((f) => f.frame);
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
      expect(nums.length).toBeGreaterThanOrEqual(1);
      expect(nums.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('bundled files match the manifest byte-for-byte', () => {
  it('has every file the manifest names', () => {
    for (const e of manifest.entries) {
      for (const f of e.frames) {
        expect(existsSync(path.join(ART_DIR, f.file))).toBe(true);
      }
    }
  });

  it('matches the recorded sha256 for every file', () => {
    // A mismatch means something modified the artwork after ingest, which
    // would make it Adapted Material under CC BY-SA.
    for (const e of manifest.entries) {
      for (const f of e.frames) {
        const bytes = readFileSync(path.join(ART_DIR, f.file));
        const sha = createHash('sha256').update(bytes).digest('hex');
        expect(sha).toBe(f.sha256);
        expect(bytes.length).toBe(f.bytes);
      }
    }
  });

  it('has no orphan SVGs on disk', () => {
    const named = new Set(manifest.entries.flatMap((e) => e.frames.map((f) => f.file)));
    const onDisk = readdirSync(ART_DIR).filter((f) => f.endsWith('.svg'));
    expect(onDisk.filter((f) => !named.has(f))).toEqual([]);
    expect(onDisk.length).toBe(named.size);
  });
});

describe('every bundled SVG stays runtime-tintable', () => {
  it('contains no fill, style, <style>, base64 or <image>', () => {
    // This is what lets the app theme the artwork WITHOUT editing it, which is
    // the whole basis of the "unmodified collection" position.
    for (const e of manifest.entries) {
      for (const f of e.frames) {
        const svg = readFileSync(path.join(ART_DIR, f.file), 'utf8');
        expect(() => assertTintable(svg, f.file)).not.toThrow();
      }
    }
  });

  it('is true vector: paths, not embedded rasters', () => {
    for (const e of manifest.entries) {
      const first = e.frames[0]!;
      const svg = readFileSync(path.join(ART_DIR, first.file), 'utf8');
      expect(svg).toMatch(/<path/);
      expect(svg).not.toMatch(/<image/);
    }
  });
});

describe('assertTintable', () => {
  it('rejects a baked-in fill', () => {
    expect(() => assertTintable('<svg><path fill="#000" d="M0 0"/></svg>', 'x')).toThrow(
      /fill attribute/,
    );
  });

  it('rejects an inline style and a style block', () => {
    expect(() => assertTintable('<svg><path style="fill:red"/></svg>', 'x')).toThrow(/style/);
    expect(() => assertTintable('<svg><style>path{fill:red}</style></svg>', 'x')).toThrow(/style/);
  });

  it('rejects an embedded raster', () => {
    expect(() =>
      assertTintable('<svg><image href="data:image/png;base64,AAAA"/></svg>', 'x'),
    ).toThrow();
  });

  it('accepts a path-only document', () => {
    expect(() => assertTintable('<svg><g><path d="M0 0h10"/></g></svg>', 'x')).not.toThrow();
  });
});

describe('Commons metadata helpers', () => {
  it('folds every artist spelling seen in the category', () => {
    expect(normaliseArtist('Everkinetic')).toBe('Everkinetic');
    expect(normaliseArtist('everkinetic')).toBe('Everkinetic');
    expect(normaliseArtist('Everkineteic')).toBe('Everkinetic');
    expect(normaliseArtist('<a href="/wiki/User:X">everkinetic</a>')).toBe('Everkinetic');
  });

  it('leaves other artists alone', () => {
    expect(normaliseArtist('Vidralta')).toBe('Vidralta');
    expect(normaliseArtist(null)).toBeNull();
  });

  it('strips the HTML Commons embeds in extmetadata', () => {
    expect(stripHtml('<a href="x">Ever</a>&amp;co')).toBe('Ever&co');
    expect(stripHtml('  a   b  ')).toBe('a b');
  });

  it('splits the frame suffix off a file name', () => {
    expect(parseFrame('Bench press 1')).toEqual({ stem: 'Bench press', frame: 1 });
    expect(parseFrame('Bench press 2')).toEqual({ stem: 'Bench press', frame: 2 });
    // A trailing "3" is a variant, not a frame — those files are not pairs.
    expect(parseFrame('Walking lunges 3')).toEqual({ stem: 'Walking lunges 3', frame: null });
    expect(parseFrame('Crunches')).toEqual({ stem: 'Crunches', frame: null });
  });
});

describe('generated art modules embed the files VERBATIM', () => {
  /**
   * The licensing position rests on the artwork being distributed unmodified.
   * The markup is embedded as JS string literals rather than bundled asset
   * files (see scripts/build-art-registry.ts), so this asserts each embedded
   * string is byte-for-byte identical to its source file — the same guarantee,
   * checked at the new location.
   */
   
  const { artFrames, artMeta, artSlugs, hasArt } = require('../src/data/art') as {
    artFrames: (slug: string) => string[] | null;
    artMeta: (slug: string) => { width: number; height: number; frames: number } | null;
    artSlugs: () => string[];
    hasArt: (slug: string) => boolean;
  };

  it('covers exactly the manifest entries', () => {
    expect(artSlugs().sort()).toEqual(manifest.entries.map((e) => e.exerciseSlug).sort());
  });

  it('embeds every frame byte-for-byte', () => {
    for (const e of manifest.entries) {
      const frames = artFrames(e.exerciseSlug);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(e.frames.length);

      const ordered = [...e.frames].sort((a, b) => a.frame - b.frame);
      ordered.forEach((f, i) => {
        const onDisk = readFileSync(path.join(ART_DIR, f.file), 'utf8');
        expect(frames![i]).toBe(onDisk);
        // And the bytes still hash to what the manifest recorded at ingest.
        expect(createHash('sha256').update(Buffer.from(frames![i]!, 'utf8')).digest('hex')).toBe(
          f.sha256,
        );
      });
    }
  });

  it('keeps the embedded markup tintable', () => {
    for (const slug of artSlugs()) {
      for (const svg of artFrames(slug) ?? []) {
        expect(() => assertTintable(svg, slug)).not.toThrow();
      }
    }
  });

  it('records the real aspect ratio, which is not uniform', () => {
    const ratios = new Set(
      artSlugs().map((s) => {
        const m = artMeta(s)!;
        return Math.round((m.width / m.height) * 100);
      }),
    );
    // If every ratio were identical, the layout code would be untested.
    expect(ratios.size).toBeGreaterThan(1);
  });

  it('reports hasArt correctly', () => {
    expect(hasArt(manifest.entries[0]!.exerciseSlug)).toBe(true);
    expect(hasArt('squat-barbell')).toBe(false); // declared no-art
    expect(hasArt('nope')).toBe(false);
  });
});
