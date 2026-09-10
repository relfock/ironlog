import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

/**
 * Keeps the app's JS runtime alive while a workout is in progress so the
 * rest-timer chime and live HR sampling keep running when the app is
 * backgrounded. Backed by a silent Android foreground service; a no-op on
 * iOS/non-Android and when the native module is missing.
 */
const native = (
  Platform.OS === 'android' ? NativeModules.WorkoutKeepAlive : undefined
) as
  | { start: (label: string) => void; stop: () => void; log?: (msg: string) => void }
  | undefined;

export function startWorkoutKeepAlive(label: string): void {
  if (native === undefined) return;
  try {
    native.start(label);
  } catch {
    // Non-fatal: forgetting to keep the process foreground can never crash the
    // workout, it only lets background JS freeze (the pre-Service behaviour).
  }
}

export function stopWorkoutKeepAlive(): void {
  if (native === undefined) return;
  try {
    native.stop();
  } catch {
    // Non-fatal, see startWorkoutKeepAlive.
  }
}

/**
 * A 1 Hz clock driven by the Android foreground service's main-thread
 * ticker rather than by JS `setInterval`.
 *
 * Why: React Native dispatches JS timers from a Choreographer frame callback,
 * and Android stops delivering vsync (and therefore the callback) to a
 * non-visible app — so every `setInterval` silently freezes the moment the
 * workout screen is minimized, no matter what the host lifecycle reports. The
 * module's handler-based ticker runs on the main looper, which Android keeps
 * pumping for foreground-service processes, and its events reach the (still
 * live) JS thread in the background. Stores subs to this instead of timers.
 */
const WORKOUT_TICK_EVENT = 'WorkoutKeepAliveTick';
export type WorkoutTickListener = () => void;

const workoutTickListeners = new Set<WorkoutTickListener>();
let workoutTickEmitter:
  | ReturnType<typeof DeviceEventEmitter.addListener>
  | null = null;

function ensureWorkoutTickEmitter(): void {
  if (workoutTickEmitter !== null) return;
  workoutTickEmitter = DeviceEventEmitter.addListener(WORKOUT_TICK_EVENT, () => {
    for (const listener of workoutTickListeners) {
      try {
        listener();
      } catch {
        // A throwing listener must never take the clock down.
      }
    }
  });
}

/**
 * Register to receive each 1 s workout clock tick. Returns an unsubscribe fn.
 * No-ops to a never-firing unsubscriber off Android.
 */
export function onWorkoutTick(listener: WorkoutTickListener): () => void {
  if (Platform.OS !== 'android' || native === undefined) {
    return () => {};
  }
  ensureWorkoutTickEmitter();
  workoutTickListeners.add(listener);
  return () => {
    workoutTickListeners.delete(listener);
  };
}