import { needsSvgNormalisation, normaliseSvgForRenderer } from './svgCompat';

describe('normaliseSvgForRenderer', () => {
  it('fixes the exact transform the Everkinetic set uses', () => {
    const input = '<svg><g transform="matrix(.1 0 0-.1 0 960)"><path d="m1 2"/></g></svg>';
    expect(normaliseSvgForRenderer(input)).toContain('transform="matrix(.1 0 0 -.1 0 960)"');
  });

  it('produces a transform react-native-svg can actually parse', () => {
    // The real regression test: run the library's own parser on the output.
     
    const mod = require('react-native-svg/lib/commonjs/lib/extract/transform.js');
    const parse: (s: string) => number[] = mod.parse ?? mod.default?.parse;

    expect(() => parse('matrix(.1 0 0-.1 0 960)')).toThrow(); // the bug
    const fixed = normaliseSvgForRenderer('<g transform="matrix(.1 0 0-.1 0 960)"/>');
    const value = /transform="([^"]*)"/.exec(fixed)![1]!;
    expect(() => parse(value)).not.toThrow();
    expect(parse(value)).toEqual([0.1, 0, 0, 0, -0.1, 960]);
  });

  it('handles several negatives in one transform', () => {
    const input = '<g transform="matrix(-1 0-2 0-3 0-4)"/>';
    const out = normaliseSvgForRenderer(input);
    expect(out).toContain('matrix(-1 0 -2 0 -3 0 -4)');
  });

  it('fixes every transform in the document', () => {
    const input =
      '<svg><g transform="translate(10-5)"><g transform="scale(2-1)"/></g></svg>';
    const out = normaliseSvgForRenderer(input);
    expect(out).toContain('translate(10 -5)');
    expect(out).toContain('scale(2 -1)');
  });

  it('does NOT touch path data', () => {
    // Path `d` uses the same compact syntax, and RNS parses it fine. Rewriting
    // it would risk corrupting geometry for no benefit.
    const d = 'm7197 8390c-46-12-91-34-136-68';
    const input = `<svg><path d="${d}"/></svg>`;
    expect(normaliseSvgForRenderer(input)).toContain(`d="${d}"`);
  });

  it('does not break exponent notation', () => {
    const input = '<g transform="matrix(1e-5 0 0 1e-5 0 0)"/>';
    expect(normaliseSvgForRenderer(input)).toBe(input);
  });

  it('leaves an already-valid transform untouched, identically', () => {
    const input = '<g transform="matrix(.1 0 0 -.1 0 960)"/>';
    expect(normaliseSvgForRenderer(input)).toBe(input);
  });

  it('returns the SAME string reference when nothing needs fixing', () => {
    // Cheap guarantee that clean documents cost nothing.
    const input = '<svg><path d="M0 0h10"/></svg>';
    expect(normaliseSvgForRenderer(input)).toBe(input);
  });

  it('is idempotent', () => {
    const input = '<g transform="matrix(.1 0 0-.1 0 960)"/>';
    const once = normaliseSvgForRenderer(input);
    expect(normaliseSvgForRenderer(once)).toBe(once);
  });
});

describe('needsSvgNormalisation', () => {
  it('detects the broken form', () => {
    expect(needsSvgNormalisation('<g transform="matrix(.1 0 0-.1 0 960)"/>')).toBe(true);
  });

  it('is false for clean documents', () => {
    expect(needsSvgNormalisation('<g transform="matrix(.1 0 0 -.1 0 960)"/>')).toBe(false);
    expect(needsSvgNormalisation('<svg><path d="m1-2"/></svg>')).toBe(false);
  });
});

describe('the real bundled artwork', () => {
   
  const { artFrames, artSlugs } = require('../data/art') as {
    artFrames: (s: string) => string[] | null;
    artSlugs: () => string[];
  };

  it('every bundled file needs the fix — so the fix must be applied everywhere', () => {
    const slugs = artSlugs();
    expect(slugs.length).toBeGreaterThan(100);
    for (const slug of slugs) {
      for (const svg of artFrames(slug) ?? []) {
        expect(needsSvgNormalisation(svg)).toBe(true);
      }
    }
  });

  it('normalises all of them into something parseable', () => {
     
    const mod = require('react-native-svg/lib/commonjs/lib/extract/transform.js');
    const parse: (s: string) => number[] = mod.parse ?? mod.default?.parse;

    for (const slug of artSlugs()) {
      for (const svg of artFrames(slug) ?? []) {
        const fixed = normaliseSvgForRenderer(svg);
        expect(needsSvgNormalisation(fixed)).toBe(false);
        for (const m of fixed.match(/\btransform="([^"]*)"/g) ?? []) {
          const value = /transform="([^"]*)"/.exec(m)![1]!;
          expect(() => parse(value)).not.toThrow();
        }
      }
    }
  });
});
