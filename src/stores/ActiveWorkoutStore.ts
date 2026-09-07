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
  startWorkoutFromRoutine,
  updateSet,
  updateWorkoutExercise,
  updateWorkoutMeta,
  type FinishResult,
  type WorkoutData,
  type WorkoutExerciseData,
  type WorkoutSetData,
} from '@/db/repositories/workouts';
import { detectPrs, headlinePr, type PrCandidate, type PrKind } from '@/domain/prDetection';
import { setVolumeKg, totalVolumeKg } from '@/domain/volume';
import type { LoggedSet, SetType } from '@/domain/types';
import { setTypeCountsForStats } from '@/domain/types';
import type { SettingsStore } from './SettingsStore';
import type { TimerStore } from './TimerStore';

const FIELD_WRITE_DEBOUNCE_MS = 400;

export type SetField = 'weightKg' | 'reps' | 'durationSec' | 'distanceM' | 'rpe';

export interface PrBanner {
  readonly exerciseName: string;
  readonly pr: PrCandidate;
  readonly at: number;
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

  private pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly settings: SettingsStore,
    private readonly timer: TimerStore,
  ) {
    makeAutoObservable<this, 'pendingWrites' | 'recordBooks'>(
      this,
      { pendingWrites: false, recordBooks: false },
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
    return true;
  }

  async startEmpty(): Promise<void> {
    const id = await startEmptyWorkout(this.settings.values.bodyweightKg);
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
      durationSec: last?.durationSec ?? null,
      distanceM: last?.distanceM ?? null,
    });
    await this.reload(workout.id);
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
      runInAction(() => {
        this.workout = null;
        this.previousSets.clear();
        this.prBanner = null;
      });
      this.recordBooks.clear();
      this.timer.clearRest();
      this.timer.setNeedsClock(false);
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
    runInAction(() => {
      this.workout = null;
      this.previousSets.clear();
      this.prBanner = null;
    });
    this.recordBooks.clear();
    this.timer.clearRest();
    this.timer.setNeedsClock(false);
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
