import { resetUuidv7State, timestampFromUuidv7, uuidv7 } from './uuidv7';

/** Deterministic "random" bytes so ids are reproducible. */
function fixedBytes(fill: number): (n: number) => Uint8Array {
  return (n: number) => new Uint8Array(n).fill(fill);
}

/** Counting bytes, to prove rand_b actually varies. */
function countingBytes(): (n: number) => Uint8Array {
  let next = 0;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      out[i] = next % 256;
      next += 1;
    }
    return out;
  };
}

beforeEach(() => resetUuidv7State());

describe('uuidv7 format', () => {
  it('matches the canonical UUID shape', () => {
    const id = uuidv7(1_700_000_000_000, fixedBytes(0));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(id).toHaveLength(36);
  });

  it('sets version 7', () => {
    const id = uuidv7(1_700_000_000_000, fixedBytes(0xff));
    // First character of the third group is the version nibble.
    expect(id.split('-')[2]![0]).toBe('7');
  });

  it('sets the RFC 9562 variant (10xx)', () => {
    const id = uuidv7(1_700_000_000_000, fixedBytes(0xff));
    const variantNibble = Number.parseInt(id.split('-')[3]![0]!, 16);
    // Top two bits must be 10, i.e. the nibble is 8, 9, a or b.
    expect(variantNibble & 0b1100).toBe(0b1000);
  });

  it('does not let the variant bits depend on the random input', () => {
    for (const fill of [0x00, 0x0f, 0x55, 0xaa, 0xff]) {
      resetUuidv7State();
      const id = uuidv7(1_700_000_000_000, fixedBytes(fill));
      const nibble = Number.parseInt(id.split('-')[3]![0]!, 16);
      expect(nibble & 0b1100).toBe(0b1000);
      expect(id.split('-')[2]![0]).toBe('7');
    }
  });
});

describe('timestamp encoding', () => {
  it('round-trips the millisecond timestamp', () => {
    for (const ts of [0, 1, 1_700_000_000_000, Date.now(), 2 ** 48 - 1]) {
      resetUuidv7State();
      const id = uuidv7(ts, fixedBytes(0));
      expect(timestampFromUuidv7(id)).toBe(ts);
    }
  });

  it('handles timestamps above 32 bits', () => {
    // The bug this guards: `ts >>> 24` truncates Date.now() to 32 bits.
    const ts = 1_770_000_000_000; // ~2026
    const id = uuidv7(ts, fixedBytes(0));
    expect(timestampFromUuidv7(id)).toBe(ts);
    expect(timestampFromUuidv7(id)).toBeGreaterThan(2 ** 32);
  });

  it('returns null for a malformed id', () => {
    expect(timestampFromUuidv7('nope')).toBeNull();
    expect(timestampFromUuidv7('')).toBeNull();
  });
});

describe('ordering — the reason v7 was chosen', () => {
  it('sorts chronologically as plain strings', () => {
    const ids = [
      uuidv7(1_700_000_000_000, countingBytes()),
      uuidv7(1_700_000_001_000, countingBytes()),
      uuidv7(1_700_000_002_000, countingBytes()),
      uuidv7(1_800_000_000_000, countingBytes()),
    ];
    expect([...ids].sort()).toEqual(ids);
  });

  it('is strictly increasing WITHIN a millisecond', () => {
    // Random rand_a would order these ~50/50; the counter makes it certain.
    const same = 1_700_000_000_000;
    const rnd = countingBytes();
    const ids = Array.from({ length: 500 }, () => uuidv7(same, rnd));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never emits a decreasing id when the clock goes backwards', () => {
    const rnd = countingBytes();
    const forward = uuidv7(1_700_000_005_000, rnd);
    // NTP correction jumps the clock back five seconds.
    const backward = uuidv7(1_700_000_000_000, rnd);
    expect(backward > forward).toBe(true);
  });

  it('stays monotonic across a counter overflow in one millisecond', () => {
    const same = 1_700_000_000_000;
    const rnd = countingBytes();
    const ids = Array.from({ length: 4200 }, () => uuidv7(same, rnd));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('uniqueness', () => {
  it('produces no collisions over many ids', () => {
    const rnd = countingBytes();
    let t = 1_700_000_000_000;
    const ids = Array.from({ length: 5000 }, (_, i) => {
      if (i % 7 === 0) t += 1;
      return uuidv7(t, rnd);
    });
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('input validation', () => {
  it('rejects a short random buffer instead of emitting a malformed id', () => {
    expect(() => uuidv7(1_700_000_000_000, () => new Uint8Array(8))).toThrow(
      /16 random bytes/,
    );
  });

  it('clamps a negative or fractional timestamp', () => {
    expect(timestampFromUuidv7(uuidv7(-5, fixedBytes(0)))).toBe(0);
    resetUuidv7State();
    expect(timestampFromUuidv7(uuidv7(1234.9, fixedBytes(0)))).toBe(1234);
  });
});
