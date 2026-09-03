/**
 * Render-time compatibility fix for SVG transforms react-native-svg cannot
 * parse.
 *
 * THE BUG THIS EXISTS FOR
 * The retired Everkinetic illustrations wrapped their paths in:
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
 * NOTHING SHIPPED APPLIES THIS ANY MORE. The muscle-worked template that
 * replaced those illustrations only uses `translate(0,0)` and `translate(182,0)`,
 * so `MuscleMap` skips the call rather than scanning 53 KB for nothing. What
 * keeps this module here is `muscleArt.test.ts`, which asserts
 * `needsSvgNormalisation(MUSCLE_ART_TEMPLATE) === false`: a regenerated template
 * that reintroduces the compact form then fails a test instead of rendering
 * blank, and the fix is already written.
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
