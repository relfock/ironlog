/**
 * The live workout logger.
 *
 * WRITE-THROUGH, NOT WRITE-BEHIND. Every change lands in SQLite, because the
 * single worst failure this app can have is losing a session the user already
 * performed. Phones get force-stopped, run out of memory in a cold gym, and get
 * killed by aggressive OEM battery managers mid-set.
 *
 * Two speeds of write, deliberately:
 *  - Completing, adding or deleting a set writes IMMEDIATELY. These are the
 *    actions that represent work actually done.
 *  - Typing in a weight or rep field is debounced (~400 ms). Keystrokes are not
 *    yet facts, and a synchronous write per character would drop frames.
 *
 * Local observable state is updated optimistically so the UI stays responsive,
 * with the database as the durable mirror.
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { getExercise, getRecordBook, upsertRecord } from '@/db/repositories/exercises';
import {
  addExerciseToWorkout,
  addSet,
  deleteSet,
  discardWorkout,
  finishWorkout,
  findInProgressWorkout,
  getPreviousSets,
  loadWorkout,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  reorderWorkoutSets,
  replaceWorkoutExerciseExerciseId,
  startEmptyWorkout,
  startActivityWorkout,
  startWorkoutFromRoutine,
  updateSet,
  updateWorkoutExercise,
  updateWorkoutMeta,
  type FinishResult,
  type WorkoutData,
  type WorkoutExerciseData,
  type WorkoutSetData,
} from '@/db/repositories/workouts';
import { saveWorkoutHeartRateSamples, loadWorkoutHeartRateSamples } from '@/db/repositories/heartRate';
import { startWorkoutKeepAlive, stopWorkoutKeepAlive, onWorkoutTick } from '@/lib/keepAlive';
import { detectPrs, headlinePr, type PrCandidate, type PrKind } from '@/domain/prDetection';
import { setVolumeKg, totalVolumeKg } from '@/domain/volume';
import type { LoggedSet, SetType } from '@/domain/types';
import { setTypeCountsForStats } from '@/domain/types';
import { estimateMaxHr, zoneIndexForHr, zoneSplitSeconds } from '@/domain/heartRateZones';
import { isPlausibleBpm } from '@/domain/heartRate';
import {
  runningCaloriesKcal,
  sessionCaloriesFromHr,
  type CalorieProfile,
} from '@/domain/calories';
import type { HeartRateSample, HeartRateStore } from './HeartRateStore';
import type { SettingsStore } from './SettingsStore';
import type { TimerStore } from './TimerStore';

const FIELD_WRITE_DEBOUNCE_MS = 400;

export type SetField = 'weightKg' | 'reps' | 'durationSec' | 'distanceM' | 'rpe';

export interface PrBanner {
  readonly exerciseName: string;
  readonly pr: PrCandidate;
  readonly at: number;
}

/**
 * The running state of a single cardio (activity) segment.
 *
 * Owned by the store (not the screen) so the stopwatch and its 1 s heart-rate
 * sampling survive navigating away from the activity screen and back — the
 * recorded history is never cleared by a minimise/resume round trip.
 */
export interface CardioRun {
  /** The hr_cardio set this run is recording. */
  setId: string;
  running: boolean;
  paused: boolean;
  /** Clock start, back-dated by any duration already persisted on the set. */
  startedAt: number | null;
  /** Ticks each second while running, to drive re-renders. */
  now: number;
  /** One reading per second (only when a strap/simulator feeds a bpm). */
  samples: HeartRateSample[];
  zoneTotals: number[];
  avgSum: number;
  avgCount: number;
  progressCounter: number;
  zoneCurrent: number | null;
  zoneStartAt: number | null;
}

function toLoggedSet(s: WorkoutSetData): LoggedSet {
  return {
    setType: s.setType,
    weightKg: s.weightKg,
    reps: s.reps,
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    rpe: s.rpe,
    completed: s.completed,
  };
}

export class ActiveWorkoutStore {
  workout: WorkoutData | null = null;
  /** Last completed session per exercise — the ghost text under each set. */
  previousSets = new Map<string, WorkoutSetData[]>();
  /** Cached record books so PR detection does not hit the DB per set. */
  private recordBooks = new Map<string, Map<PrKind, number>>();
  prBanner: PrBanner | null = null;
  saving = false;
  /** The live cardio (activity) segment recorder, or null when idle. */
  cardio: CardioRun | null = null;

  private pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private cardioTickUnsub: (() => void) | null = null;

  private startCardioInterval(): void {
    if (this.cardioTickUnsub !== null) return;
    this.cardioTickUnsub = onWorkoutTick(() => this.cardioTick());
  }

  private stopCardioInterval(): void {
    this.cardioTickUnsub?.();
    this.cardioTickUnsub = null;
  }

  constructor(
    private readonly settings: SettingsStore,
    private readonly timer: TimerStore,
    private readonly heartRate: HeartRateStore,
  ) {
    makeAutoObservable<this, 'pendingWrites' | 'recordBooks' | 'cardioTickUnsub'>(
      this,
      { pendingWrites: false, recordBooks: false, cardioTickUnsub: false },
      { autoBind: true },
    );
  }

  get isActive(): boolean {
    return this.workout !== null;
  }

  get elapsedSec(): number {
    if (this.workout === null) return 0;
    return Math.max(0, Math.floor((this.timer.now - this.workout.startedAt) / 1000));
  }

  get exercises(): readonly WorkoutExerciseData[] {
    return this.workout?.exercises ?? [];
  }

  /** Live volume, using the same warm-up rule as the finish summary. */
  get totalVolumeKg(): number {
    if (this.workout === null) return 0;
    let total = 0;
    for (const we of this.workout.exercises) {
      total += totalVolumeKg(we.sets.map(toLoggedSet), {
        trackingType: we.trackingType,
        bodyweightKg: this.workout.bodyweightKg,
        countWarmups: this.settings.values.countWarmupsInStats,
      });
    }
    return total;
  }

  get completedSetCount(): number {
    return this.exercises.reduce(
      (n, we) => n + we.sets.filter((s) => s.completed).length,
      0,
    );
  }

  get totalSetCount(): number {
    return this.exercises.reduce((n, we) => n + we.sets.length, 0);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Recover an interrupted session. Called on launch — this is the payoff for
   * writing through on every set.
   */
  async resume(): Promise<boolean> {
    const workout = await findInProgressWorkout();
    if (workout === null) return false;
    runInAction(() => {
      this.workout = workout;
    });
    this.timer.setNeedsClock(true);
    await this.hydrateContext();
    if (this.settings.values.heartRateEnabled) this.heartRate.attachWorkout();
    startWorkoutKeepAlive(workout.name);
    return true;
  }

  async startEmpty(): Promise<void> {
    const id = await startEmptyWorkout(this.settings.values.bodyweightKg);
    await this.reload(id);
  }

  /**
   * Start a single-exercise cardio "activity" (elliptical, generic cardio).
   * Creates a `kind='activity'` workout with the given activity loaded as its
   * sole exercise, so the CardioActivityCard renders with the HR stopwatch.
   */
  async startActivity(exerciseId: string, name: string): Promise<void> {
    const id = await startActivityWorkout(exerciseId, name);
    await this.reload(id);
  }

  async startFromRoutine(routineId: string): Promise<void> {
    const id = await startWorkoutFromRoutine(
      routineId,
      this.settings.values.bodyweightKg,
    );
    await this.reload(id);
  }

  private async reload(workoutId: string): Promise<void> {
    const workout = await loadWorkout(workoutId);
    runInAction(() => {
      this.workout = workout;
    });
    // The elapsed-time display only needs a ticking clock while a workout is open.
    this.timer.setNeedsClock(workout !== null);
    await this.hydrateContext();
    if (workout !== null && this.settings.values.heartRateEnabled) {
      this.heartRate.attachWorkout();
    }
    // Opening a workout is the right moment to ask Android to keep the app
    // running while minimized (JS timers — rest chime, live HR sampling —
    // otherwise get frozen as soon as the app leaves the foreground).
    this.settings.requestRunInBackground();
    if (workout !== null) startWorkoutKeepAlive(workout.name);
  }

  /** Load previous-session values and record books for the current exercises. */
  private async hydrateContext(): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;

    const sameRoutineOnly =
      this.settings.values.previousValuesMode === 'same_routine' &&
      workout.routineId !== null;

    for (const we of workout.exercises) {
      if (!this.previousSets.has(we.exerciseId)) {
        const prev = await getPreviousSets(we.exerciseId, {
          routineId: sameRoutineOnly ? workout.routineId : null,
          excludeWorkoutId: workout.id,
        });
        runInAction(() => {
          this.previousSets.set(we.exerciseId, prev);
        });
      }
      if (!this.recordBooks.has(we.exerciseId)) {
        this.recordBooks.set(we.exerciseId, await getRecordBook(we.exerciseId));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  async addExercise(exerciseId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;

    const exercise = await getExercise(exerciseId);
    const weId = await addExerciseToWorkout(
      workout.id,
      exerciseId,
      workout.exercises.length,
      exercise?.defaultRestSec ?? null,
    );
    // One empty set so the row is immediately usable.
    await addSet(weId, 0);
    await this.reload(workout.id);
  }

  async removeExercise(weId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    await removeWorkoutExercise(weId);
    await this.reload(workout.id);
  }

  /**
   * Swap an already-logged exercise for another from the catalogue, keeping its
   * position, rest timer, superset group and every logged set.
   */
  async replaceExercise(weId: string, exerciseId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    await replaceWorkoutExerciseExerciseId(weId, exerciseId);
    await this.reload(workout.id);
  }

  /**
   * Append a set, seeded from the last one in the group. Copying the previous
   * load is what makes logging a straight-sets exercise two taps instead of six.
   */
  async addSetTo(weId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    const we = workout.exercises.find((e) => e.id === weId);
    if (we === undefined) return;

    const last = we.sets[we.sets.length - 1];
    await addSet(weId, we.sets.length, {
      setType: 'normal',
      weightKg: last?.weightKg ?? null,
      reps: last?.reps ?? null,
      // Cardio segments each time their own stopwatch, so a fresh row must not
      // inherit the previous segment's finished duration.
      durationSec:
        we.trackingType === 'hr_cardio' ? null : (last?.durationSec ?? null),
      distanceM: last?.distanceM ?? null,
    });
    await this.reload(workout.id);
  }

  /**
   * Write-through for an in-flight cardio (elliptical) segment. Patches local
   * state at once and debounces one DB write per segment — the same cadence
   * trade-off as field editing, so a stopwatch ticking once a second never
   * hammers SQLite.
   */
  updateCardioProgress(
    setId: string,
    patch: {
      durationSec: number;
      avgBpm: number | null;
      caloriesKcal: number | null;
    },
  ): void {
    this.patchLocalSet(setId, patch);

    const existing = this.pendingWrites.get(setId);
    if (existing !== undefined) clearTimeout(existing);

    this.pendingWrites.set(
      setId,
      setTimeout(() => {
        this.pendingWrites.delete(setId);
        const set = this.findSet(setId);
        if (set === null) return;
        void updateSet(setId, {
          durationSec: set.durationSec,
          avgBpm: set.avgBpm,
          caloriesKcal: set.caloriesKcal,
        });
      }, FIELD_WRITE_DEBOUNCE_MS),
    );
  }

  /**
   * Complete a cardio segment: stamp the final duration, calories and average
   * heart rate onto the set and detect a longest-duration PR. No rest timer —
   * the walk back to the next lift is the rest.
   *
   * The in-card session samples are persisted to the workout's heart-rate
   * history only when the workout HR sampler is not already capturing them
   * (i.e. no strap attached), so the post-workout HR chart still shows the
   * cardio session without double-recording points.
   */
  async completeCardioSession(
    setId: string,
    target: {
      durationSec: number;
      avgBpm: number | null;
      caloriesKcal: number | null;
    },
    samplePoints: { recordedAt: number; bpm: number }[] = [],
  ): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    const found = this.locate(setId);
    if (found === null) return;
    const { we, set } = found;

    this.flushField(setId);

    const durationSec = Math.max(0, Math.round(target.durationSec));
    const now = Date.now();

    // Final values land in local state first so PR detection reads the truth.
    this.patchLocalSet(setId, {
      durationSec,
      avgBpm: target.avgBpm,
      caloriesKcal: target.caloriesKcal,
      completed: true,
      completedAt: now,
    });

    const logged: LoggedSet = { ...toLoggedSet(set), durationSec, completed: true };
    const book = this.recordBooks.get(we.exerciseId) ?? new Map<PrKind, number>();
    const prs = detectPrs(logged, book, {
      trackingType: we.trackingType,
      bodyweightKg: workout.bodyweightKg,
      countWarmups: this.settings.values.countWarmupsInStats,
      formula: this.settings.values.oneRepMaxFormula,
    });

    this.patchLocalSet(setId, { prKinds: prs.map((p) => p.kind) });

    await updateSet(setId, {
      durationSec,
      avgBpm: target.avgBpm,
      caloriesKcal: target.caloriesKcal,
      completed: true,
      completedAt: now,
      prKinds: prs.map((p) => p.kind),
    });

    for (const pr of prs) {
      book.set(pr.kind, pr.value);
      await upsertRecord(we.exerciseId, pr.kind, pr.value, now, setId);
    }
    this.recordBooks.set(we.exerciseId, book);

    const headline = headlinePr(prs);
    if (headline !== null && this.settings.values.prNotificationsEnabled) {
      runInAction(() => {
        this.prBanner = { exerciseName: we.exerciseName, pr: headline, at: now };
      });
    }

    // A cardio activity is the sole heart-rate source for its (single)
    // segment, so its card samples must land regardless of whether the
    // workout-level sampler is running. For strength workouts we keep the
    // guard, since the workout-level sampler already persists the trace.
    const isActivity = workout.kind === 'activity';
    if (samplePoints.length > 0 && (isActivity || !this.heartRateSamplingWorkout)) {
      await saveWorkoutHeartRateSamples(workout.id, samplePoints);
    }

    await this.reload(workout.id);
  }

  /** True while the workout-level HR sampler is storing readings. */
  private get heartRateSamplingWorkout(): boolean {
    return (
      this.settings.values.heartRateEnabled &&
      (this.heartRate.status === 'connected' || this.heartRate.status === 'connecting')
    );
  }

  /**
   * Persist the per-zone seconds for each cardio segment of a finished workout.
   *
   * The whole-workout HR trace is split across the five zones and stored equally
   * on every hr_cardio set under this workout — with one set per activity (the
   * intended shape) that IS the segment's breakdown, and multi-segment sessions
   * still get honest totals. Skips silently when there is nothing to split
   * (no trace or no reliable ceiling), leaving the columns null.
   */
  private async persistZoneSplits(
    workoutId: string,
    trace: readonly { recordedAt: number; bpm: number }[],
  ): Promise<void> {
    const workout = this.workout;
    if (workout === null || trace.length === 0) return;

    const age =
      this.settings.values.birthYear === null
        ? null
        : new Date().getFullYear() - this.settings.values.birthYear;
    const maxHr =
      age === null || age <= 0
        ? null
        : estimateMaxHr(age, this.settings.values.sex);

    const split =
      maxHr === null ? null : zoneSplitSeconds(trace, maxHr, this.settings.zoneSet);
    if (split === null) return;

    const [z0, z1, z2, z3, z4, z5] = [
      Math.round(split[0] ?? 0),
      Math.round(split[1] ?? 0),
      Math.round(split[2] ?? 0),
      Math.round(split[3] ?? 0),
      Math.round(split[4] ?? 0),
      Math.round(split[5] ?? 0),
    ];

    for (const we of workout.exercises) {
      if (we.trackingType !== 'hr_cardio') continue;
      for (const set of we.sets) {
        await updateSet(set.id, {
          zone0Sec: z0,
          zone1Sec: z1,
          zone2Sec: z2,
          zone3Sec: z3,
          zone4Sec: z4,
          zone5Sec: z5,
        });
      }
    }
    void workoutId;
  }

  /**
   * Insert generated warm-up sets ahead of the working sets.
   *
   * Order matters physically: a warm-up logged after the top set is not a
   * warm-up. Warm-ups are appended first (so they get real rows) and the whole
   * exercise is then renumbered with warm-ups first, each group keeping its
   * relative order.
   */
  async addWarmupSets(
    weId: string,
    warmups: readonly { weightKg: number | null; reps: number | null }[],
  ): Promise<void> {
    const workout = this.workout;
    if (workout === null || warmups.length === 0) return;

    const before = workout.exercises.find((e) => e.id === weId);
    if (before === undefined) return;

    let nextOrder = before.sets.length;
    const created: string[] = [];
    for (const w of warmups) {
      const id = await addSet(weId, nextOrder, {
        setType: 'warmup',
        weightKg: w.weightKg,
        reps: w.reps,
      });
      created.push(id);
      nextOrder += 1;
    }

    // Renumber: warm-ups first (in the order generated), then everything else
    // in its existing order.
    const existingIds = before.sets.map((s) => s.id);
    const ordered = [...created, ...existingIds].map((id, i) => ({
      id,
      sortOrder: i,
    }));
    await reorderWorkoutSets(ordered);
    await this.reload(workout.id);
  }

  async removeSet(setId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    this.flushField(setId);
    await deleteSet(setId);
    await this.reload(workout.id);
  }

  async setExerciseRest(weId: string, restSec: number | null): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    await updateWorkoutExercise(weId, { restSec });
    await this.reload(workout.id);
  }

  async setExerciseNotes(weId: string, notes: string | null): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    await updateWorkoutExercise(weId, { notes });
    await this.reload(workout.id);
  }

  /** Move an exercise up or down; `delta` is -1 or +1. */
  async moveExercise(weId: string, delta: number): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    const index = workout.exercises.findIndex((e) => e.id === weId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= workout.exercises.length) return;
    await this.moveExerciseTo(weId, target);
  }

  /**
   * Reorder an exercise to an absolute index. Drag-and-drop from the reorder
   * gesture lands here; like `moveExercise`, superset groups travel with the
   * items they belong to.
   */
  async moveExerciseTo(weId: string, to: number): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    const list = [...workout.exercises];
    const index = list.findIndex((e) => e.id === weId);
    if (index < 0) return;
    const target = Math.max(0, Math.min(list.length - 1, to));
    if (target === index) return;

    const [moved] = list.splice(index, 1);
    if (moved === undefined) return;
    list.splice(target, 0, moved);

    await reorderWorkoutExercises(
      list.map((e, i) => ({ id: e.id, sortOrder: i, supersetGroup: e.supersetGroup })),
    );
    await this.reload(workout.id);
  }

  /**
   * Pair an exercise with the one ABOVE it, or break it out of its group.
   *
   * Only pairing-with-above is offered: it matches how a superset is written on
   * paper and avoids needing a drag-to-group gesture mid-workout.
   */
  async toggleSuperset(weId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    const index = workout.exercises.findIndex((e) => e.id === weId);
    if (index <= 0) return;

    const current = workout.exercises[index];
    const previous = workout.exercises[index - 1];
    if (current === undefined || previous === undefined) return;

    if (current.supersetGroup !== null && current.supersetGroup === previous.supersetGroup) {
      await updateWorkoutExercise(weId, { supersetGroup: null });
    } else {
      const group = previous.supersetGroup ?? index - 1;
      await updateWorkoutExercise(previous.id, { supersetGroup: group });
      await updateWorkoutExercise(weId, { supersetGroup: group });
    }
    await this.reload(workout.id);
  }

  /** Can this exercise be paired with the one above it? */
  canSuperset(weId: string): boolean {
    const workout = this.workout;
    if (workout === null) return false;
    return workout.exercises.findIndex((e) => e.id === weId) > 0;
  }

  async setSetType(setId: string, setType: SetType): Promise<void> {
    this.patchLocalSet(setId, { setType });
    await updateSet(setId, { setType });
  }

  // -------------------------------------------------------------------------
  // Field editing
  // -------------------------------------------------------------------------

  /**
   * Update a numeric field. Local state changes at once so the input stays
   * responsive; the write is debounced per set.
   */
  editField(setId: string, field: SetField, value: number | null): void {
    this.patchLocalSet(setId, { [field]: value } as Partial<WorkoutSetData>);

    const existing = this.pendingWrites.get(setId);
    if (existing !== undefined) clearTimeout(existing);

    this.pendingWrites.set(
      setId,
      setTimeout(() => {
        this.pendingWrites.delete(setId);
        const set = this.findSet(setId);
        if (set === null) return;
        void updateSet(setId, {
          weightKg: set.weightKg,
          reps: set.reps,
          durationSec: set.durationSec,
          distanceM: set.distanceM,
          rpe: set.rpe,
        });
      }, FIELD_WRITE_DEBOUNCE_MS),
    );
  }

  /** Force a pending debounced write out now. */
  flushField(setId: string): void {
    const pending = this.pendingWrites.get(setId);
    if (pending === undefined) return;
    clearTimeout(pending);
    this.pendingWrites.delete(setId);
    const set = this.findSet(setId);
    if (set === null) return;
    void updateSet(setId, {
      weightKg: set.weightKg,
      reps: set.reps,
      durationSec: set.durationSec,
      distanceM: set.distanceM,
      rpe: set.rpe,
    });
  }

  flushAll(): void {
    for (const setId of [...this.pendingWrites.keys()]) this.flushField(setId);
  }

  // -------------------------------------------------------------------------
  // Completing a set — PRs and the rest timer
  // -------------------------------------------------------------------------

  /**
   * Mark a set done. This is the app's hot path: it writes immediately, checks
   * for personal records, and starts the rest timer.
   */
  async completeSet(setId: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;

    const found = this.locate(setId);
    if (found === null) return;
    const { we, set } = found;

    // Cancel any debounce first, so the completed values are the ones stored.
    this.flushField(setId);

    const now = Date.now();
    const logged: LoggedSet = { ...toLoggedSet(set), completed: true };

    const book = this.recordBooks.get(we.exerciseId) ?? new Map<PrKind, number>();
    const prs = detectPrs(logged, book, {
      trackingType: we.trackingType,
      bodyweightKg: workout.bodyweightKg,
      countWarmups: this.settings.values.countWarmupsInStats,
      formula: this.settings.values.oneRepMaxFormula,
    });

    this.patchLocalSet(setId, {
      completed: true,
      completedAt: now,
      prKinds: prs.map((p) => p.kind),
    });

    await updateSet(setId, {
      completed: true,
      completedAt: now,
      prKinds: prs.map((p) => p.kind),
    });

    for (const pr of prs) {
      book.set(pr.kind, pr.value);
      await upsertRecord(we.exerciseId, pr.kind, pr.value, now, setId);
    }

    const sessionLoggedSets = we.sets
      .filter((s) => s.completed && setTypeCountsForStats(s.setType, this.settings.values.countWarmupsInStats))
      .map(toLoggedSet);
    const sessionVol = totalVolumeKg(sessionLoggedSets, {
      trackingType: we.trackingType,
      bodyweightKg: workout.bodyweightKg,
      countWarmups: this.settings.values.countWarmupsInStats,
    });
    if (sessionVol > 0) {
      const prevSessionVol = book.get('best_session_volume') ?? null;
      if (prevSessionVol === null || sessionVol > prevSessionVol) {
        const sessionPr: PrCandidate = {
          kind: 'best_session_volume',
          value: sessionVol,
          previous: prevSessionVol,
        };
        prs.push(sessionPr);
        book.set('best_session_volume', sessionVol);
        await upsertRecord(we.exerciseId, 'best_session_volume', sessionVol, now, null);
      }
    }

    this.recordBooks.set(we.exerciseId, book);

    const headline = headlinePr(prs);
    if (headline !== null && this.settings.values.prNotificationsEnabled) {
      runInAction(() => {
        this.prBanner = { exerciseName: we.exerciseName, pr: headline, at: now };
      });
    }

    // Rest timer: per-exercise override, else the global default.
    const restSec = we.restSec ?? this.settings.values.defaultRestSec;
    if (restSec > 0) this.timer.startRest(restSec);
  }

  async uncompleteSet(setId: string): Promise<void> {
    // PRs are intentionally NOT rolled back here. A record can be beaten by a
    // later session, so recomputing history on an un-tap would be wrong; the
    // records table is rebuilt by `recomputeRecords` when a workout is edited.
    this.patchLocalSet(setId, { completed: false, completedAt: null, prKinds: [] });
    await updateSet(setId, { completed: false, completedAt: null, prKinds: [] });
  }

  async toggleSet(setId: string): Promise<void> {
    const set = this.findSet(setId);
    if (set === null) return;
    if (set.completed) await this.uncompleteSet(setId);
    else await this.completeSet(setId);
  }

  dismissPrBanner(): void {
    runInAction(() => {
      this.prBanner = null;
    });
  }

  // -------------------------------------------------------------------------
  // Supersets
  // -------------------------------------------------------------------------

  /**
   * Next exercise in the same superset, for Hevy's "smart superset scrolling".
   * Wraps around the group so a 3-exercise superset cycles.
   */
  nextInSuperset(weId: string): WorkoutExerciseData | null {
    if (!this.settings.values.smartSupersetScrolling) return null;
    const workout = this.workout;
    if (workout === null) return null;

    const current = workout.exercises.find((e) => e.id === weId);
    if (current === undefined || current.supersetGroup === null) return null;

    const group = workout.exercises.filter(
      (e) => e.supersetGroup === current.supersetGroup,
    );
    if (group.length < 2) return null;

    const idx = group.findIndex((e) => e.id === weId);
    return group[(idx + 1) % group.length] ?? null;
  }

  // -------------------------------------------------------------------------
  // Finish / discard
  // -------------------------------------------------------------------------

  async finish(): Promise<FinishResult | null> {
    const workout = this.workout;
    if (workout === null) return null;

    this.flushAll();
    runInAction(() => {
      this.saving = true;
    });

    try {
      const result = await finishWorkout(workout.id, {
        countWarmups: this.settings.values.countWarmupsInStats,
        durationSec: this.elapsedSec,
      });

      // The cardio card is the sole HR source for an activity, so it already
      // persisted its own samples in completeCardioSession; skip the redundant
      // workout-level buffer save here to avoid a doubled trace. For strength
      // workouts the workout-level sampler remains the authority.
      if (
        this.settings.values.heartRateEnabled &&
        workout.kind !== 'activity'
      ) {
        const samples = this.heartRate.detachWorkout();
        if (samples.length > 0) {
          await saveWorkoutHeartRateSamples(workout.id, samples);
        }
      } else if (workout.kind === 'activity') {
        this.heartRate.detachWorkout();
      }

      // Persist the per-zone time-in-zone breakdown for every cardio segment.
      // The split is derived once, from the workout's persisted HR trace, so a
      // segment finished without a strap still gets its minutes (the trace was
      // saved by completeCardioSession). This is the "persist at finish" model:
      // the detail screen reads columns back instead of recomputing.
      if (workout.exercises.some((we) => we.trackingType === 'hr_cardio')) {
        const trace = await loadWorkoutHeartRateSamples(workout.id);
        await this.persistZoneSplits(workout.id, trace);
      }

      runInAction(() => {
        this.workout = null;
        this.previousSets.clear();
        this.prBanner = null;
      });
      this.recordBooks.clear();
      this.timer.clearRest();
      this.timer.setNeedsClock(false);
      this.clearCardio();
      stopWorkoutKeepAlive();
      return result;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  async discard(): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    for (const id of [...this.pendingWrites.keys()]) {
      const t = this.pendingWrites.get(id);
      if (t !== undefined) clearTimeout(t);
    }
    this.pendingWrites.clear();

    await discardWorkout(workout.id);
    this.heartRate.detachWorkout();
    runInAction(() => {
      this.workout = null;
      this.previousSets.clear();
      this.prBanner = null;
    });
    this.recordBooks.clear();
    this.timer.clearRest();
    this.timer.setNeedsClock(false);
    this.clearCardio();
    stopWorkoutKeepAlive();
  }

  async rename(name: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    runInAction(() => {
      this.workout = { ...workout, name };
    });
    await updateWorkoutMeta(workout.id, { name });
  }

  async setNotes(notes: string): Promise<void> {
    const workout = this.workout;
    if (workout === null) return;
    runInAction(() => {
      this.workout = { ...workout, notes };
    });
    await updateWorkoutMeta(workout.id, { notes });
  }

  // -------------------------------------------------------------------------
  // Cardio (activity) recording — store-owned so the stopwatch and its 1 s
  // HR sampling survive screen navigation (Minimise / back never pauses the
  // segment, and returning never clears the recorded history).
  // -------------------------------------------------------------------------

  get cardioRunning(): boolean {
    return this.cardio !== null && this.cardio.running && !this.cardio.paused;
  }

  get cardioElapsedSec(): number {
    const run = this.cardio;
    if (run === null) return 0;
    if (run.running && !run.paused && run.startedAt !== null) {
      return Math.max(0, Math.floor((run.now - run.startedAt) / 1000));
    }
    const set = this.findSet(run.setId);
    return set?.durationSec ?? 0;
  }

  get cardioSamples(): readonly HeartRateSample[] {
    return this.cardio?.samples ?? [];
  }

  get cardioAvgBpm(): number | null {
    const run = this.cardio;
    if (run === null || run.avgCount === 0) return null;
    return Math.round(run.avgSum / run.avgCount);
  }

  get cardioZoneTotals(): readonly number[] {
    return this.cardio?.zoneTotals ?? [0, 0, 0, 0, 0, 0];
  }

  get cardioDwellSec(): number | null {
    const run = this.cardio;
    if (run === null) return null;
    if (run.zoneCurrent === null || run.zoneStartAt === null) return null;
    return Math.max(0, Math.floor((run.now - run.zoneStartAt) / 1000));
  }

  /** True while `setId` is the segment currently being recorded. */
  cardioIsOn(setId: string): boolean {
    return this.cardio?.setId === setId;
  }

  /**
   * Start or resume the cardio segment on `setId`.
   *
   * A resume of the same segment keeps every accumulated sample; a fresh start
   * begins a new sample run but back-dates the clock by any duration already
   * persisted on the set, so the stopwatch never restarts from zero.
   */
  cardioStart(setId: string): void {
    const existing = this.cardio;
    if (existing !== null && existing.setId === setId) {
      if (existing.running && !existing.paused) return;
      const baseSec = this.findSet(setId)?.durationSec ?? 0;
      this.patchCardio({
        running: true,
        paused: false,
        startedAt: Date.now() - baseSec * 1000,
        now: Date.now(),
      });
      this.startCardioInterval();
      return;
    }
    const baseSec = this.findSet(setId)?.durationSec ?? 0;
    this.patchCardio({
      setId,
      running: true,
      paused: false,
      startedAt: Date.now() - baseSec * 1000,
      now: Date.now(),
      samples: [],
      zoneTotals: [0, 0, 0, 0, 0, 0],
      avgSum: 0,
      avgCount: 0,
      progressCounter: 0,
      zoneCurrent: null,
      zoneStartAt: null,
    });
    this.startCardioInterval();
  }

  /** Pause the segment without dropping its samples; persists progress. */
  cardioPause(): void {
    const run = this.cardio;
    if (run === null || !run.running || run.paused) return;
    this.stopCardioInterval();
    const at = Date.now();
    const elapsed = Math.max(0, Math.floor((at - (run.startedAt ?? at)) / 1000));
    const avg = run.avgCount > 0 ? Math.round(run.avgSum / run.avgCount) : null;
    const kcal = runningCaloriesKcal(elapsed, avg, this.cardioProfile);
    this.writeCardioProgress(run.setId, {
      durationSec: elapsed,
      avgBpm: avg,
      caloriesKcal: kcal,
    });
    this.patchCardio({ running: false, paused: true, now: at });
  }

  /** Resume a paused segment, keeping its samples. */
  cardioResume(): void {
    const run = this.cardio;
    if (run === null || run.running) return;
    this.cardioStart(run.setId);
  }

  /** Complete the recorded segment, persisting its full 1 s trace. */
  async cardioFinish(): Promise<void> {
    const run = this.cardio;
    if (run === null) return;
    this.stopCardioInterval();
    const set = this.findSet(run.setId);
    if (set === null) {
      this.patchCardio(null);
      return;
    }
    const elapsed = this.cardioElapsedSec;
    const avg = run.avgCount > 0 ? Math.round(run.avgSum / run.avgCount) : null;
    const kcal =
      sessionCaloriesFromHr(run.samples, this.cardioProfile) ??
      runningCaloriesKcal(elapsed, avg, this.cardioProfile);
    const samples = run.samples;
    this.patchCardio(null);
    await this.completeCardioSession(
      run.setId,
      { durationSec: elapsed, avgBpm: avg, caloriesKcal: kcal },
      samples,
    );
  }

  /** Stop any recording when the workout ends for any reason. */
  clearCardio(): void {
    this.stopCardioInterval();
    this.patchCardio(null);
  }

  // -------------------------------------------------------------------------
  // Cardio internals
  // -------------------------------------------------------------------------

  private get cardioProfile(): CalorieProfile {
    return {
      sex: this.settings.values.sex,
      age:
        this.settings.values.birthYear === null
          ? null
          : new Date().getFullYear() - this.settings.values.birthYear,
      bodyweightKg: this.settings.values.bodyweightKg,
    };
  }

  private get cardioMaxHr(): number | null {
    const age =
      this.settings.values.birthYear === null
        ? null
        : new Date().getFullYear() - this.settings.values.birthYear;
    if (age === null || age <= 0) return null;
    return estimateMaxHr(age, this.settings.values.sex);
  }

  private cardioTick(): void {
    const run = this.cardio;
    if (run === null || !run.running || run.paused) {
      this.stopCardioInterval();
      return;
    }
    const bpm = this.heartRate.liveBpm;
    const at = Date.now();

    if (bpm !== null && bpm > 0 && isPlausibleBpm(bpm)) {
      run.samples = [...run.samples, { recordedAt: at, bpm }];
      run.avgSum += bpm;
      run.avgCount += 1;
    }

    // Time-in-zone: restart the dwell clock on a zone change, otherwise credit
    // the tick to the zone currently occupied. The 1 s samples are saved
    // wholesale at Finish — full resolution for the post-workout HR chart.
    const maxHr = this.cardioMaxHr;
    const idx =
      bpm !== null && bpm > 0 && isPlausibleBpm(bpm) && maxHr !== null
        ? zoneIndexForHr(bpm, maxHr, this.settings.zoneSet)
        : null;
    if (idx !== run.zoneCurrent) {
      run.zoneCurrent = idx;
      run.zoneStartAt = idx === null ? null : at;
    } else if (idx !== null && run.zoneStartAt !== null) {
      run.zoneTotals[idx] = (run.zoneTotals[idx] ?? 0) + 1;
    }

    // Persist progress every ~5 s so a crash cannot lose a finished minute.
    run.progressCounter += 1;
    if (run.progressCounter % 5 === 0) {
      const elapsed = Math.max(0, Math.floor((at - (run.startedAt ?? at)) / 1000));
      const avg = run.avgCount > 0 ? Math.round(run.avgSum / run.avgCount) : null;
      const kcal = runningCaloriesKcal(elapsed, avg, this.cardioProfile);
      this.updateCardioProgress(run.setId, {
        durationSec: elapsed,
        avgBpm: avg,
        caloriesKcal: kcal,
      });
    }

    run.now = at;
  }

  private patchCardio(patch: Partial<CardioRun> | null): void {
    runInAction(() => {
      if (patch === null) {
        this.cardio = null;
        return;
      }
      if (this.cardio === null) {
        this.cardio = {
          setId: '',
          running: false,
          paused: false,
          startedAt: null,
          now: Date.now(),
          samples: [],
          zoneTotals: [0, 0, 0, 0, 0, 0],
          avgSum: 0,
          avgCount: 0,
          progressCounter: 0,
          zoneCurrent: null,
          zoneStartAt: null,
          ...patch,
        };
      } else {
        this.cardio = { ...this.cardio, ...patch };
      }
    });
  }

  /** Immediate progress write (pause/finish path), clearing any debounce. */
  private writeCardioProgress(
    setId: string,
    patch: { durationSec: number; avgBpm: number | null; caloriesKcal: number | null },
  ): void {
    const pending = this.pendingWrites.get(setId);
    if (pending !== undefined) {
      clearTimeout(pending);
      this.pendingWrites.delete(setId);
    }
    this.patchLocalSet(setId, patch);
    void updateSet(setId, {
      durationSec: patch.durationSec,
      avgBpm: patch.avgBpm,
      caloriesKcal: patch.caloriesKcal,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  previousFor(exerciseId: string, setIndex: number): WorkoutSetData | null {
    const prev = this.previousSets.get(exerciseId);
    return prev?.[setIndex] ?? null;
  }

  setVolume(we: WorkoutExerciseData, set: WorkoutSetData): number {
    return setVolumeKg(toLoggedSet(set), {
      trackingType: we.trackingType,
      bodyweightKg: this.workout?.bodyweightKg ?? null,
      countWarmups: this.settings.values.countWarmupsInStats,
    });
  }

  private locate(
    setId: string,
  ): { we: WorkoutExerciseData; set: WorkoutSetData } | null {
    const workout = this.workout;
    if (workout === null) return null;
    for (const we of workout.exercises) {
      const set = we.sets.find((s) => s.id === setId);
      if (set !== undefined) return { we, set };
    }
    return null;
  }

  private findSet(setId: string): WorkoutSetData | null {
    return this.locate(setId)?.set ?? null;
  }

  /** Immutable local patch so MobX sees a new object and re-renders. */
  private patchLocalSet(setId: string, patch: Partial<WorkoutSetData>): void {
    const workout = this.workout;
    if (workout === null) return;

    runInAction(() => {
      this.workout = {
        ...workout,
        exercises: workout.exercises.map((we) => {
          if (!we.sets.some((s) => s.id === setId)) return we;
          return {
            ...we,
            sets: we.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
          };
        }),
      };
    });
  }
}
