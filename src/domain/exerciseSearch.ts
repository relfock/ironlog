/**
 * Exercise-name normalisation, matching and search.
 *
 * Catalogues and the people typing into the search box do not agree on
 * spelling: compound movements appear both joined and spaced ("deadlift" vs
 * "dead lift", "pulldown" vs "pull down", "chinup" vs "chin up"), so a naive
 * match reports false misses in both directions. The retired Commons art
 * harvest hit exactly this, which ART_LICENSING_RESEARCH.md records tripping up
 * its own first coverage audit.
 *
 * The fix is to canonicalise both spellings onto one token before comparing.
 */

/**
 * Compound words that appear both joined and spaced in the wild. Both forms
 * canonicalise to the joined token on the left.
 *
 * Order matters: longer phrases first, so "bent over row" is consumed before
 * "over" can be touched by anything else.
 */
const COMPOUND_ALIASES: readonly (readonly [string, readonly string[]])[] = [
  ['deadlift', ['dead lift', 'dead lifts']],
  ['pulldown', ['pull down', 'pull downs', 'pulldowns']],
  ['pushdown', ['push down', 'push downs', 'pushdowns']],
  ['pullup', ['pull up', 'pull ups', 'pullups', 'pull-up']],
  ['chinup', ['chin up', 'chin ups', 'chinups']],
  ['pushup', ['push up', 'push ups', 'pushups', 'press up', 'press ups']],
  ['situp', ['sit up', 'sit ups', 'situps']],
  ['stepup', ['step up', 'step ups', 'stepups']],
  ['pullover', ['pull over', 'pull overs', 'pullovers']],
  ['crossover', ['cross over', 'cross overs', 'crossovers']],
  ['bentover', ['bent over', 'bent-over']],
  ['legpress', ['leg press', 'leg presses']],
  ['upright', ['up right']],
  ['kickback', ['kick back', 'kick backs', 'kickbacks']],
  ['rearlateral', ['rear lateral', 'rear delt', 'rear deltoid']],
  ['ezbar', ['ez bar', 'ez-bar', 'e z bar']],
  ['tbar', ['t bar', 't-bar']],
  ['vbar', ['v bar', 'v-bar']],
  ['smithmachine', ['smith machine', 'smith']],
  ['bodyweight', ['body weight']],
  ['closegrip', ['close grip', 'narrow grip']],
  ['widegrip', ['wide grip']],
  ['reversegrip', ['reverse grip', 'underhand', 'supinated']],
  ['overhandgrip', ['overhand', 'pronated']],
  ['hammercurl', ['hammer curl', 'hammer curls']],
  ['goodmorning', ['good morning', 'good mornings']],
  ['facepull', ['face pull', 'face pulls']],
  ['hipthrust', ['hip thrust', 'hip thrusts']],
  ['gobletsquat', ['goblet squat', 'goblet squats']],
  ['calfraise', ['calf raise', 'calf raises', 'calves raise', 'calves raises']],
];

/** Words that carry no discriminating meaning in an exercise name. */
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'with',
  'on',
  'in',
  'of',
  'and',
  'or',
  'to',
  'for',
  'using',
  'your',
  'variation',
  'exercise',
]);

/** Equipment and phrasing synonyms, applied token-by-token. */
const TOKEN_SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  dumbells: 'dumbbell',
  dumbbells: 'dumbbell',
  bb: 'barbell',
  barbells: 'barbell',
  kb: 'kettlebell',
  kettlebells: 'kettlebell',
  bicep: 'biceps',
  tricep: 'triceps',
  abdominal: 'abs',
  abdominals: 'abs',
  ab: 'abs',
  glute: 'glutes',
  hamstring: 'hamstrings',
  quad: 'quads',
  quadricep: 'quads',
  quadriceps: 'quads',
  lat: 'lats',
  delt: 'delts',
  deltoid: 'delts',
  deltoids: 'delts',
  machines: 'machine',
  cables: 'cable',
  seated: 'seated',
  standing: 'standing',
};

/** Plural/inflection endings stripped after synonym mapping. */
function singularise(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2); // presses -> press
  if (token.endsWith('ches')) return token.slice(0, -2); // crunches -> crunch
  if (token.endsWith('xes')) return token.slice(0, -2);
  if (token.endsWith('es') && /(?:[^aeiou]s|z|sh|ch)es$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Memo for `normaliseName`.
 *
 * Incremental search normalises every catalogue name on every keystroke, and at
 * 1069 exercises that is 1069 x (three regexes + a pass over every compound
 * alias) per character typed — measured at ~4 ms on a desktop, so several
 * dropped frames on a phone. The inputs are a fixed set of names, so the work
 * is entirely repeated.
 *
 * Bounded and cleared wholesale rather than evicted one at a time: query
 * strings pass through here too, so an unbounded map would grow with every
 * partial query a user ever types. The limit sits well above the catalogue, so
 * in practice the names stay resident and only queries churn.
 */
const MAX_NORMALISED = 4096;
const normalisedCache = new Map<string, string>();

/**
 * Collapse a display name to a comparable string: lowercased, punctuation
 * stripped, compound words joined, synonyms folded, plurals removed.
 */
export function normaliseName(name: string): string {
  const memo = normalisedCache.get(name);
  if (memo !== undefined) return memo;

  const normalised = computeNormalisedName(name);
  if (normalisedCache.size >= MAX_NORMALISED) normalisedCache.clear();
  normalisedCache.set(name, normalised);
  return normalised;
}

function computeNormalisedName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Compound aliases operate on the whole string, longest phrase first.
  for (const [canonical, variants] of COMPOUND_ALIASES) {
    for (const variant of variants) {
      if (s.includes(variant)) s = s.split(variant).join(canonical);
    }
  }
  return s;
}

/** Normalised, de-stopworded, singularised tokens. */
export function tokenise(name: string): string[] {
  return normaliseName(name)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => TOKEN_SYNONYMS[t] ?? t)
    .map(singularise)
    .filter((t) => t.length > 0);
}

/** Stable comparison key: sorted unique tokens. Equal keys = same exercise. */
export function matchKey(name: string): string {
  return [...new Set(tokenise(name))].sort().join(' ');
}

/**
 * Similarity in 0..1 between two exercise names.
 *
 * Weighted Jaccard: the intersection is scored against the SMALLER token set,
 * so "Bench Press" scores highly against "Barbell Bench Press" (a qualifier
 * added) but "Bench Press" vs "Leg Press" stays low. A pure Jaccard would
 * punish the first case for the extra token.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokenise(a));
  const tb = new Set(tokenise(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  if (shared === 0) return 0;

  const containment = shared / Math.min(ta.size, tb.size);
  const jaccard = shared / (ta.size + tb.size - shared);
  // Containment finds supersets; Jaccard penalises size mismatch. Blend both.
  return 0.65 * containment + 0.35 * jaccard;
}

export interface RankedMatch<T> {
  readonly item: T;
  readonly score: number;
}

/** Best match above `threshold`, or null. */
export function bestMatch<T>(
  query: string,
  candidates: readonly T[],
  nameOf: (item: T) => string,
  threshold = 0.72,
): RankedMatch<T> | null {
  let best: RankedMatch<T> | null = null;
  for (const item of candidates) {
    const score = similarity(query, nameOf(item));
    if (score >= threshold && (best === null || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}

/**
 * Incremental search for the exercise library. Matches on token prefixes so
 * "bic cur" finds "Biceps Curl", and returns results ranked by how early the
 * match occurs in the name.
 */
export function searchExercises<T>(
  query: string,
  items: readonly T[],
  nameOf: (item: T) => string,
): T[] {
  const qTokens = tokenise(query);
  if (qTokens.length === 0) return [...items];

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const nameTokens = tokenise(nameOf(item));
    let total = 0;
    let matchedAll = true;

    for (const q of qTokens) {
      let bestForToken = 0;
      nameTokens.forEach((n, idx) => {
        if (n === q) {
          // Exact token hit, worth more the earlier it appears.
          bestForToken = Math.max(bestForToken, 2 - idx * 0.01);
        } else if (n.startsWith(q)) {
          bestForToken = Math.max(bestForToken, 1 - idx * 0.01);
        }
      });
      if (bestForToken === 0) {
        matchedAll = false;
        break;
      }
      total += bestForToken;
    }

    if (matchedAll) scored.push({ item, score: total });
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
