import {
  bestMatch,
  matchKey,
  normaliseName,
  searchExercises,
  similarity,
  tokenise,
} from './exerciseSearch';

describe('normaliseName — the two-word compound problem', () => {
  it('joins "dead lift" and "deadlift" onto one token', () => {
    // This is the exact trap ART_LICENSING_RESEARCH.md flagged.
    expect(normaliseName('Barbell dead lifts')).toContain('deadlift');
    expect(normaliseName('Barbell Deadlift')).toContain('deadlift');
    expect(matchKey('Barbell dead lifts')).toBe(matchKey('Barbell Deadlift'));
  });

  it('joins "pull down" and "pulldown"', () => {
    expect(matchKey('Wide grip lat pull down')).toBe(matchKey('Wide-Grip Lat Pulldown'));
  });

  it('joins pull up / chin up / push up variants', () => {
    expect(matchKey('Pull ups')).toBe(matchKey('Pull-Up'));
    expect(matchKey('Wide grip chin up')).toBe(matchKey('Wide-Grip Chinup'));
    expect(matchKey('Push ups')).toBe(matchKey('Pushup'));
  });

  it('strips punctuation and case', () => {
    // normaliseName only cleans the string; plurals are handled in tokenise.
    expect(normaliseName("Farmer's Walk")).toBe('farmers walk');
    expect(normaliseName('T-Bar Row')).toBe('tbar row');
    expect(tokenise("Farmer's Walk")).toEqual(['farmer', 'walk']);
  });
});

describe('tokenise', () => {
  it('folds equipment abbreviations', () => {
    expect(tokenise('DB Bench Press')).toEqual(tokenise('Dumbbell Bench Press'));
    expect(tokenise('BB Row')).toEqual(tokenise('Barbell Row'));
  });

  it('folds bicep/biceps and tricep/triceps', () => {
    expect(matchKey('Bicep Curl')).toBe(matchKey('Biceps Curls'));
    expect(matchKey('Tricep Extension')).toBe(matchKey('Triceps Extensions'));
  });

  it('singularises without mangling words ending in ss', () => {
    expect(tokenise('Presses')).toEqual(['press']);
    expect(tokenise('Press')).toEqual(['press']);
    expect(tokenise('Crunches')).toEqual(['crunch']);
    expect(tokenise('Flies')).toEqual(['fly']);
    expect(tokenise('Raises')).toEqual(['raise']);
  });

  it('drops stopwords', () => {
    expect(tokenise('Crunches on Stability Ball')).toEqual([
      'crunch',
      'stability',
      'ball',
    ]);
  });

  it('is order-insensitive as a key', () => {
    expect(matchKey('Barbell Bench Press')).toBe(matchKey('Bench Press Barbell'));
  });
});

describe('similarity', () => {
  it('scores an added qualifier highly', () => {
    expect(similarity('Bench Press', 'Barbell Bench Press')).toBeGreaterThan(0.72);
  });

  it('keeps genuinely different lifts apart', () => {
    expect(similarity('Bench Press', 'Leg Press')).toBeLessThan(0.72);
    expect(similarity('Barbell Row', 'Barbell Curl')).toBeLessThan(0.72);
  });

  it('rates an exact match 1', () => {
    expect(similarity('Barbell dead lift', 'Barbell Deadlift')).toBeCloseTo(1, 6);
  });

  it('is symmetric', () => {
    const a = similarity('Bench Press', 'Barbell Bench Press');
    const b = similarity('Barbell Bench Press', 'Bench Press');
    expect(a).toBeCloseTo(b, 9);
  });

  it('is 0 with nothing in common', () => {
    expect(similarity('Squat', 'Bicep Curl')).toBe(0);
    expect(similarity('', 'Squat')).toBe(0);
  });
});

describe('bestMatch', () => {
  const commons = [
    'Bench press',
    'Barbell dead lifts',
    'Wide grip lat pull down',
    'Biceps curl with dumbbell',
    'Leg press',
  ];

  it('finds the Commons spelling for our catalogue name', () => {
    expect(bestMatch('Barbell Deadlift', commons, (s) => s)!.item).toBe(
      'Barbell dead lifts',
    );
    expect(bestMatch('Wide-Grip Lat Pulldown', commons, (s) => s)!.item).toBe(
      'Wide grip lat pull down',
    );
    expect(bestMatch('Dumbbell Biceps Curl', commons, (s) => s)!.item).toBe(
      'Biceps curl with dumbbell',
    );
  });

  it('returns null rather than a bad match', () => {
    expect(bestMatch('Kettlebell Swing', commons, (s) => s)).toBeNull();
    expect(bestMatch('Battle Ropes', commons, (s) => s)).toBeNull();
  });

  it('does not confuse bench press with leg press', () => {
    expect(bestMatch('Leg Press', commons, (s) => s)!.item).toBe('Leg press');
    expect(bestMatch('Bench Press', commons, (s) => s)!.item).toBe('Bench press');
  });
});

describe('searchExercises', () => {
  const names = [
    'Barbell Bench Press',
    'Dumbbell Bench Press',
    'Incline Barbell Bench Press',
    'Barbell Squat',
    'Barbell Deadlift',
    'Biceps Curl',
  ];

  it('matches on token prefixes', () => {
    const r = searchExercises('bic cur', names, (s) => s);
    expect(r).toEqual(['Biceps Curl']);
  });

  it('finds the two-word compound by its joined spelling', () => {
    expect(searchExercises('deadlift', names, (s) => s)).toEqual(['Barbell Deadlift']);
    expect(searchExercises('dead lift', names, (s) => s)).toEqual(['Barbell Deadlift']);
  });

  it('requires every query token to match', () => {
    expect(searchExercises('bench squat', names, (s) => s)).toEqual([]);
  });

  it('ranks an earlier match first', () => {
    const r = searchExercises('bench', names, (s) => s);
    // "Barbell Bench Press" has bench at index 1; the incline variant at 2.
    expect(r[0]).not.toBe('Incline Barbell Bench Press');
    expect(r).toHaveLength(3);
  });

  it('returns everything for an empty query', () => {
    expect(searchExercises('', names, (s) => s)).toHaveLength(names.length);
    expect(searchExercises('   ', names, (s) => s)).toHaveLength(names.length);
  });
});
