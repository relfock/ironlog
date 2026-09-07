/**
 * Rest-timer and elapsed-time clock.
 *
 * The store holds an observable `now` that ticks once a second purely to drive
 * re-renders. It is NEVER the source of truth for how much rest is left — that
 * is always computed from timestamps in src/domain/restTimer.ts. So if the OS
 * throttles or freezes JS timers while the phone is in a pocket, the countdown
 * is still correct the instant the app is foregrounded.
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import restDing from '../../assets/rest-ding.wav';
import {
  adjust,
  isExpired,
  pause,
  progress,
  remainingSec,
  resume,
  startRestTimer,
  type RestTimerState,
} from '@/domain/restTimer';

export class TimerStore {
  /** Ticks each second to drive re-renders. Not a source of truth. */
  now = Date.now();
  rest: RestTimerState | null = null;
  /**
   * Set while a workout is open, so the elapsed-time display advances.
   *
   * Without this the clock ticked once a second for the whole life of the app,
   * re-rendering every observer even on an idle Home screen — pure battery
   * waste on a phone, and it also kept the UI permanently non-idle (which broke
   * uiautomator-driven testing). Now the interval still fires but does no state
   * change unless something actually needs the time.
   */
  needsClock = false;
  /** Set once when the current timer hits zero, so we alert exactly once. */
  private firedFor: RestTimerState | null = null;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  onExpire: (() => void) | null = null;

  /** Lazily-created "rest done" chime; kept so it can be replayed. */
  private ding: AudioPlayer | null = null;
  private dingReady: Promise<void> | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => {
      // No observer needs the current time: skip the state change entirely so
      // nothing re-renders.
      if (!this.needsClock && this.rest === null) return;
      runInAction(() => {
        this.now = Date.now();
      });
      this.checkExpiry();
    }, 1000);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setNeedsClock(needed: boolean): void {
    runInAction(() => {
      this.needsClock = needed;
      if (needed) this.now = Date.now();
    });
  }

  /** Recompute immediately, e.g. on returning from background. */
  sync(): void {
    runInAction(() => {
      this.now = Date.now();
    });
    this.checkExpiry();
  }

  startRest(durationSec: number): void {
    if (durationSec <= 0) {
      this.clearRest();
      return;
    }
    runInAction(() => {
      this.rest = startRestTimer(durationSec, Date.now());
      this.firedFor = null;
    });
  }

  clearRest(): void {
    runInAction(() => {
      this.rest = null;
      this.firedFor = null;
    });
  }

  adjustRest(deltaSec: number): void {
    if (this.rest === null) return;
    runInAction(() => {
      this.rest = adjust(this.rest!, deltaSec, Date.now());
      // Extending a finished timer should be able to alert again.
      this.firedFor = null;
    });
  }

  togglePause(): void {
    if (this.rest === null) return;
    const now = Date.now();
    runInAction(() => {
      this.rest =
        this.rest!.pausedAtMs === null
          ? pause(this.rest!, now)
          : resume(this.rest!, now);
    });
  }

  get restRemainingSec(): number | null {
    return this.rest === null ? null : remainingSec(this.rest, this.now);
  }

  get restProgress(): number {
    return this.rest === null ? 0 : progress(this.rest, this.now);
  }

  get restIsPaused(): boolean {
    return this.rest?.pausedAtMs !== null && this.rest !== null;
  }

  get hasRest(): boolean {
    return this.rest !== null && !isExpired(this.rest, this.now);
  }

  private checkExpiry(): void {
    const rest = this.rest;
    if (rest === null) return;
    if (!isExpired(rest, Date.now())) return;
    if (this.firedFor === rest) return;

    runInAction(() => {
      this.firedFor = rest;
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    this.playDing();
    this.onExpire?.();
  }

  private ensureDing(): Promise<void> {
    if (this.dingReady !== null) return this.dingReady;
    this.dingReady = (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        this.ding = createAudioPlayer(restDing);
        this.ding.volume = 1;
      } catch {
        // Falling back to haptics alone is fine.
        this.ding = null;
      }
    })();
    return this.dingReady;
  }

  private playDing(): void {
    void this.ensureDing().then(() => {
      if (this.ding === null) return;
      try {
        void this.ding.seekTo(0);
        this.ding.play();
      } catch {
        // No-op: the timer already fired, a silent rest just isn't announced.
      }
    });
  }
}
