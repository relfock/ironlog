/**
 * Parsing for the Bluetooth SIG "Heart Rate" service (0x180D),
 * Heart Rate Measurement characteristic (0x2A37).
 *
 * This is the format broadcast by Whoop 4.0 in "Broadcast HR" mode and by
 * standard HR straps (Polar H10, Wahoo, ...). Byte layout:
 *
 *   byte 0        flags bitfield
 *   byte 1..      heart rate value (uint8 or uint16 LE, flag bit 0)
 *   optional      energy expended (uint16 LE, flag bit 3)
 *   optional      R-R interval(s), 1/1024 s each (uint16 LE, flag bit 4)
 *
 * Parsing is pure so it unit-tests without a BLE stack.
 */

export interface HeartRateMeasurement {
  /** Beats per minute. */
  bpm: number;
  /** Sensor contact bit when the flag is supported. */
  sensorContact?: boolean;
  /** Total energy expended in joules, when present. */
  energyExpended?: number;
  /** R-R intervals in milliseconds, when present. */
  rrIntervalMs?: number[];
}

const FLAG_VALUE_FORMAT = 0x01;
const FLAG_SENSOR_CONTACT = 0x02;
const FLAG_CONTACT_DETECTED = 0x04;
const FLAG_ENERGY_EXPENDED = 0x08;
const FLAG_RR_INTERVALS = 0x10;

/** 1/1024 of a second (the RR interval unit) in milliseconds. */
const RR_UNIT_MS = 1000 / 1024;

function byteAt(bytes: number[], i: number): number {
  const v = bytes[i];
  if (v === undefined) {
    throw new Error('Heart Rate Measurement truncated');
  }
  return v;
}

export function parseHeartRateMeasurement(bytes: number[]): HeartRateMeasurement {
  if (bytes.length < 2) {
    throw new Error(`Heart Rate Measurement too short: ${bytes.length} bytes`);
  }
  const flags = byteAt(bytes, 0);
  let offset = 1;

  let bpm: number;
  if (flags & FLAG_VALUE_FORMAT) {
    const lo = byteAt(bytes, offset);
    const hi = byteAt(bytes, offset + 1);
    bpm = lo | (hi << 8);
    offset += 2;
  } else {
    bpm = byteAt(bytes, offset);
    offset += 1;
  }

  const result: HeartRateMeasurement = { bpm };

  if (flags & FLAG_SENSOR_CONTACT) {
    result.sensorContact = !!(flags & FLAG_CONTACT_DETECTED);
  }

  if (flags & FLAG_ENERGY_EXPENDED) {
    const lo = byteAt(bytes, offset);
    const hi = byteAt(bytes, offset + 1);
    result.energyExpended = lo | (hi << 8);
    offset += 2;
  }

  if (flags & FLAG_RR_INTERVALS) {
    const rrIntervalMs: number[] = [];
    while (bytes.length - offset >= 2) {
      const lo = byteAt(bytes, offset);
      const hi = byteAt(bytes, offset + 1);
      rrIntervalMs.push((lo | (hi << 8)) * RR_UNIT_MS);
      offset += 2;
    }
    result.rrIntervalMs = rrIntervalMs;
  }

  return result;
}

export interface HeartRateSummary {
  sampleCount: number;
  /** Total wall-clock span from first to last sample, ms. */
  spanMs: number;
  avgBpm: number;
  maxBpm: number;
  minBpm: number;
  /** Seconds spent in HR zone 2 (>= 60% HRmax) and above, best-effort. */
  zone2Sec: number;
}

/**
 * Summary stats for the post-workout card. `maxHr` (or the classic
 * 220 − age) anchors the zone split; falls back to measured max when unknown.
 */
export function summariseHeartRate(
  samples: { recordedAt: number; bpm: number }[],
  maxHr?: number,
): HeartRateSummary | null {
  if (samples.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  let total = 0;
  for (const s of samples) {
    if (s.bpm < min) min = s.bpm;
    if (s.bpm > max) max = s.bpm;
    total += s.bpm;
  }

  const zone2Floor = ((maxHr ?? max) * 0.6) | 0;
  let zone2Sec = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev === undefined || cur === undefined) break;
    const deltaSec = (cur.recordedAt - prev.recordedAt) / 1000;
    if (deltaSec < 0 || deltaSec > 60) continue;
    // Attribute each window to the HR the athlete reached by its end.
    if (cur.bpm >= zone2Floor) zone2Sec += deltaSec;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return null;

  return {
    sampleCount: samples.length,
    spanMs: Math.max(0, last.recordedAt - first.recordedAt),
    avgBpm: Math.round(total / samples.length),
    maxBpm: max,
    minBpm: min,
    zone2Sec,
  };
}