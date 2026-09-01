/**
 * UUID version 7 — RFC 9562.
 *
 * Written by hand rather than taken from the `uuid` package because that
 * package reaches for the global `crypto.getRandomValues()`, which Hermes does
 * not provide. Using it produced a hard launch failure:
 * "crypto.getRandomValues() not supported". The alternatives were a native
 * polyfill module or ~40 lines of well-tested bit manipulation; this is the
 * latter.
 *
 * v7 rather than v4 because the first 48 bits are a big-endian millisecond
 * timestamp, so ids sort chronologically as strings. Rows then insert at the
 * end of the B-tree instead of scattering across it, `ORDER BY id` is a usable
 * proxy for creation order, and ids remain merge-safe across devices — which an
 * autoincrement integer is not, and that property is what makes the schema
 * sync-ready.
 *
 * Layout:
 *   0-5   unix_ts_ms   48 bits, big-endian
 *   6     version (7) in the high nibble, then 4 bits of rand_a
 *   7     rand_a       remaining 8 bits (used here as a monotonic counter)
 *   8     variant (10) in the top 2 bits, then 6 bits of rand_b
 *   9-15  rand_b       remaining 56 bits
 */

/** Injectable for testing; production passes expo-crypto's getRandomBytes. */
export type RandomBytes = (byteCount: number) => Uint8Array;

const HEX: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

/**
 * Monotonic guard.
 *
 * Two ids generated in the same millisecond would otherwise order randomly,
 * since rand_a is random. The spec's "replace leftmost random bits with an
 * increasing counter" method (RFC 9562 §6.2 method 1) is used instead, so ids
 * from one process are strictly increasing even within a millisecond.
 */
let lastMs = -1;
let counter = 0;

/** 12 bits of rand_a are used as the counter. */
const COUNTER_MAX = 0x0fff;

export function uuidv7(nowMs: number, randomBytes: RandomBytes): string {
  const ts = Math.max(0, Math.floor(nowMs));

  if (ts === lastMs) {
    counter += 1;
    if (counter > COUNTER_MAX) {
      // Overflowed the counter inside one millisecond (4096 ids). Rather than
      // wrap and emit a smaller id, borrow from the next millisecond — still
      // monotonic, and at most a 1 ms drift.
      lastMs = ts + 1;
      counter = 0;
      return uuidv7Internal(lastMs, counter, randomBytes);
    }
  } else if (ts > lastMs) {
    lastMs = ts;
    counter = 0;
  } else {
    // Clock went backwards (NTP correction, manual change). Never emit a
    // decreasing id: keep the previous millisecond and carry on counting.
    counter += 1;
    if (counter > COUNTER_MAX) {
      lastMs += 1;
      counter = 0;
    }
    return uuidv7Internal(lastMs, counter, randomBytes);
  }

  return uuidv7Internal(ts, counter, randomBytes);
}

function uuidv7Internal(
  ts: number,
  count: number,
  randomBytes: RandomBytes,
): string {
  const b = randomBytes(16);
  if (b.length < 16) {
    throw new Error(`uuidv7 needs 16 random bytes, received ${b.length}`);
  }

  // 48-bit big-endian timestamp. Division rather than `>>>` for the high bytes:
  // Date.now() exceeds 32 bits, and bitwise operators would truncate it.
  b[0] = Math.floor(ts / 2 ** 40) & 0xff;
  b[1] = Math.floor(ts / 2 ** 32) & 0xff;
  b[2] = Math.floor(ts / 2 ** 24) & 0xff;
  b[3] = Math.floor(ts / 2 ** 16) & 0xff;
  b[4] = Math.floor(ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;

  // Version 7 in the high nibble; low nibble carries the counter's top 4 bits.
  b[6] = 0x70 | ((count >>> 8) & 0x0f);
  b[7] = count & 0xff;

  // RFC 9562 variant: top two bits are 10.
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;

  let s = '';
  for (let i = 0; i < 16; i += 1) {
    s += HEX[b[i] ?? 0];
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-';
  }
  return s;
}

/** Recover the creation time encoded in a v7 id. Useful for debugging. */
export function timestampFromUuidv7(id: string): number | null {
  const hex = id.replace(/-/g, '');
  if (hex.length !== 32) return null;
  const ts = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(ts) ? ts : null;
}

/** Reset the monotonic state. Tests only. */
export function resetUuidv7State(): void {
  lastMs = -1;
  counter = 0;
}
