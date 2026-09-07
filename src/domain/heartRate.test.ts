import {
  parseHeartRateMeasurement,
  summariseHeartRate,
} from './heartRate';

describe('parseHeartRateMeasurement', () => {
  it('throws on an empty payload', () => {
    expect(() => parseHeartRateMeasurement([])).toThrow(/too short/);
  });

  it('throws on a single flag byte with no value', () => {
    expect(() => parseHeartRateMeasurement([0x00])).toThrow(/too short/);
  });

  it('parses a uint8 bpm', () => {
    const m = parseHeartRateMeasurement([0x00, 128]);
    expect(m.bpm).toBe(128);
    expect(m.sensorContact).toBeUndefined();
    expect(m.rrIntervalMs).toBeUndefined();
  });

  it('parses a uint16 bpm little-endian', () => {
    const m = parseHeartRateMeasurement([0x01, 0xe8, 0x03]);
    expect(m.bpm).toBe(1000);
  });

  it('parses uint16 across the 8-bit boundary', () => {
    const m = parseHeartRateMeasurement([0x01, 0xff, 0x00]);
    expect(m.bpm).toBe(255);
  });

  it('reports sensor contact state', () => {
    expect(parseHeartRateMeasurement([0x06, 90]).sensorContact).toBe(true);
    expect(parseHeartRateMeasurement([0x02, 90]).sensorContact).toBe(false);
  });

  it('reads a uint16 energy-expended field after bpm', () => {
    // flags 0x09 = uint16 bpm + energy expended present.
    const m = parseHeartRateMeasurement([0x09, 0x64, 0x00, 0x10, 0x27]);
    expect(m.bpm).toBe(100);
    expect(m.energyExpended).toBe(10000);
  });

  it('parses R-R intervals in milliseconds', () => {
    // flag 0x10, bpm 150, RR 0x01C8 (456/1024 s -> ~445 ms), 0x01C9
    const m = parseHeartRateMeasurement([0x10, 150, 0xc8, 0x01, 0xc9, 0x01]);
    expect(m.bpm).toBe(150);
    expect(m.rrIntervalMs).toBeDefined();
    expect(m.rrIntervalMs?.length).toBe(2);
    expect(m.rrIntervalMs?.[0]).toBeCloseTo((0x01c8 * 1000) / 1024, 0);
    expect(m.rrIntervalMs?.[1]).toBeCloseTo((0x01c9 * 1000) / 1024, 0);
  });

  it('parses a realistic Whoop broadcast packet (uint8 bpm + R-R)', () => {
    const m = parseHeartRateMeasurement([0x10, 0x67, 0x18, 0x01, 0x1a, 0x01]);
    expect(m.bpm).toBe(103);
    expect(m.rrIntervalMs?.length).toBe(2);
    expect(m.rrIntervalMs?.[0]).toBeCloseTo((0x0118 * 1000) / 1024, 0);
  });

  it('throws when a present field runs past the buffer', () => {
    // flags 0x08 = energy expended present, but only one byte remains.
    expect(() => parseHeartRateMeasurement([0x08, 100, 0x10])).toThrow(
      /truncated/,
    );
  });
});

describe('summariseHeartRate', () => {
  const t0 = 1_700_000_000_000;
  const sample = (i: number, bpm: number) => ({ recordedAt: t0 + i * 1000, bpm });

  it('returns null for no samples', () => {
    expect(summariseHeartRate([])).toBeNull();
  });

  it('computes avg/min/max and span', () => {
    const s = summariseHeartRate([
      sample(0, 90),
      sample(1, 100),
      sample(2, 110),
      sample(3, 120),
    ]);
    expect(s).not.toBeNull();
    expect(s?.avgBpm).toBe(105);
    expect(s?.maxBpm).toBe(120);
    expect(s?.minBpm).toBe(90);
    expect(s?.spanMs).toBe(3000);
    expect(s?.sampleCount).toBe(4);
  });

  it('counts time in zone 2 using the anchor max HR', () => {
    // zone2 floor = 140 (>60% of 220). 100 bpm is below, 150 is above.
    const s = summariseHeartRate(
      [sample(0, 100), sample(1, 150), sample(2, 130), sample(3, 160)],
      220,
    );
    expect(s?.zone2Sec).toBe(2); // seconds 0->1 and 2->3 count
  });

  it('falls back to the measured max when no anchor is given', () => {
    const s = summariseHeartRate([
      sample(0, 100),
      sample(1, 100),
      sample(2, 200),
      sample(3, 100),
    ]);
    // zone2 floor = 120; only the window crossing 200 counts.
    expect(s?.zone2Sec).toBe(1);
  });

  it('ignores implausible gaps when totalling zone time', () => {
    const sparse = [
      { recordedAt: t0, bpm: 200 },
      { recordedAt: t0 + 3600_000, bpm: 100 },
      { recordedAt: t0 + 3600_000 + 1000, bpm: 200 },
    ];
    const s = summariseHeartRate(sparse, 220);
    expect(s?.zone2Sec).toBe(1);
  });
});