/**
 * Render-time compatibility fixes for the bundled SVGs.
 *
 * THE BUG THIS EXISTS FOR
 * Every Everkinetic file wraps its paths in:
 *     <g transform="matrix(.1 0 0-.1 0 960)">
 * Note `0-.1` — no whitespace before the minus. That is perfectly valid SVG:
 * the grammar allows a sign to act as a number separator, and browsers render it
 * correctly. But react-native-svg parses transforms with a generated PEG parser
 * that requires a comma or whitespace, and it throws:
 *     Expected ",", [ \t\r\n], [0-9], or [eE] but "-" found.
 * react-native-svg swallows that, so the matrix is simply dropped. Losing it
 * costs the 0.1 scale and the Y-flip, and the artwork renders ten times too
 * large and upside down — i.e. off-canvas and apparently blank. It looked like
 * a missing-asset problem and was not.
 *
 * WHY NORMALISE AT RENDER TIME RATHER THAN AT BUILD TIME
 * The embedded markup stays byte-identical to what Commons published, which is
 * the whole basis of the licensing position (docs/ART_LICENSING.md) and is
 * asserted by tests. Fixing it in memory, on the way to the renderer, is the
 * same move as applying the colour at render time: the artwork we *distribute*
 * is untouched.
 *
 * The path `d` attributes use the same compact syntax and are NOT touched —
 * react-native-svg's path parser handles them correctly. Only `transform`
 * values are rewritten.
 */

/**
 * Insert a space before any `-` that directly follows a digit or a decimal
 * point inside a transform value, so the PEG parser can tokenise it.
 *
 * Exponent notation is safe by construction: in `1e-5` the minus follows `e`,
 * which is not in the character class.
 */
function spaceOutNegatives(value: string): string {
  return value.replace(/([0-9.])-/g, '$1 -');
}

/**
 * Make one SVG document safe for react-native-svg.
 * Returns the input unchanged when there is nothing to fix.
 */
export function normaliseSvgForRenderer(svg: string): string {
  let changed = false;

  const out = svg.replace(
    /\btransform\s*=\s*"([^"]*)"/g,
    (match, value: string) => {
      const fixed = spaceOutNegatives(value);
      if (fixed === value) return match;
      changed = true;
      return `transform="${fixed}"`;
    },
  );

  return changed ? out : svg;
}

/** True when a document contains a transform this renderer cannot parse. */
export function needsSvgNormalisation(svg: string): boolean {
  const matches = svg.match(/\btransform\s*=\s*"([^"]*)"/g);
  if (matches === null) return false;
  return matches.some((m) => /[0-9.]-/.test(m));
}
