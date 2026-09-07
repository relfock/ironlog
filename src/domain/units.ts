/**
 * The one and only place unit conversion is allowed to happen.
 * Storage is always kg / metres; these functions bridge to what the user sees.
 */
import type { DistanceUnit, WeightUnit } from './types';

export const LB_PER_KG = 2.20462262185;
const KM_PER_MI = 1.609344;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** Convert a stored kg value into the unit the user is working in. */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg);
}

/** Convert user input in `unit` back to canonical kg. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}

export function metresToDistance(m: number, unit: DistanceUnit): number {
  return unit === 'km' ? m / 1000 : m / 1000 / KM_PER_MI;
}

export function distanceToMetres(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value * 1000 : value * KM_PER_MI * 1000;
}

/**
 * Round to a step (e.g. 2.5 kg, 5 lb). Uses a small epsilon nudge because
 * binary floating point makes exact-half cases like 2.675/0.05 round down.
 */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const scaled = value / step;
  const rounded = Math.round(scaled + Number.EPSILON * Math.abs(scaled));
  return stripFloatNoise(rounded * step);
}

/** Kill accumulated float noise like 47.500000000000004. */
export function stripFloatNoise(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Format a weight for display: no trailing zeros, at most 2 decimals.
 * 100 -> "100", 102.5 -> "102.5", 47.62 -> "47.62"
 */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const v = fromKg(kg, unit);
  return trimNumber(v, 2);
}

export function trimNumber(v: number, maxDecimals: number): string {
  const fixed = v.toFixed(maxDecimals);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/**
 * Format an axis tick with enough precision to distinguish it from its
 * neighbours. A fixed 1 decimal printed "0.1" for every tick on a chart whose
 * values were all around 0.08, so the axis carried no information.
 */
export function formatAxisTick(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return `${Math.round(value / 1000)}k`;
  if (magnitude >= 10) return String(Math.round(value));
  if (magnitude >= 1) return trimNumber(value, 1);
  return trimNumber(value, 2);
}

/** "1:05:03" / "5:03" / "0:09" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Compact form for summaries: "1h 5m", "45m", "30s" */
export function formatDurationCompact(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Format milliseconds into human-readable recovery time: "2 days 4 hours". */
export function formatRecoveryTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec <= 0) return 'Recovered';
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    return m === 1 ? '1 min left' : `${m} mins left`;
  }
  const totalHours = Math.floor(totalSec / 3600);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  const dPart = days > 0 ? `${days}d ` : '';
  const hPart = hours > 0 ? `${hours}h` : (days === 0 ? '0h' : '');

  return `${dPart}${hPart} left`.trim();
}
