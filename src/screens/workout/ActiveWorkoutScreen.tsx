import { StackActions, useNavigation } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionSheet } from '@/components/ActionSheet';
import { PlateCalculatorSheet } from '@/components/PlateCalculatorSheet';
import { PrBanner } from '@/components/PrBanner';
import { PromptModal } from '@/components/PromptModal';
import { RestTimerBar } from '@/components/RestTimerBar';
import { HeartRateSheet } from '@/components/HeartRateSheet';
import { Body, Button, Caption, EmptyState, Row } from '@/components/ui';
import {
  CardioActivityCard,
  type CardioActivityCardHandle,
} from '@/components/CardioActivityCard';
import { WorkoutExerciseCard } from './WorkoutExerciseCard';
import { formatDuration, formatWeight } from '@/domain/units';
import { useActiveWorkout, useHeartRate, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * The live logger.
 *
 * `useKeepAwake` is conditional on the user's preference — Hevy's "Keep awake
 * during workout" — because a phone that sleeps between sets makes logging
 * genuinely annoying, but forcing it on drains a battery for people who don't
 * want it.
 */
export const ActiveWorkoutScreen = observer(function ActiveWorkoutScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const active = useActiveWorkout();
  const settings = useSettings();
  const heartRate = useHeartRate();
  const [plateTarget, setPlateTarget] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  const [editing, setEditing] = useState<'name' | 'notes' | null>(null);
  const [hrOpen, setHrOpen] = useState(false);
  // Which confirmation the header's Finish button is asking about. Rendered as
  // the app's designed centred dialog (ActionSheet), not the platform alert.
  const [finishSheet, setFinishSheet] = useState<'activity' | 'workout' | 'empty' | null>(null);

  // A pure activity session (kind === 'activity') has no strength logging —
  // single cardio segment, no notes, no add-exercise, and the live card gets
  // the whole screen.
  const isActivity = active.workout?.kind === 'activity';
  const activityCardRef = useRef<CardioActivityCardHandle>(null);

  useKeepAwakeIfEnabled(settings.values.keepAwake);

  // ---------------------------------------------------------------------------
  // Drag-and-drop reorder (same anchored-ghost pattern as the routine editor)
  // ---------------------------------------------------------------------------
  const [, setDragFrame] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const containerTopRef = useRef(0);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);
  const positionsRef = useRef(new Map<string, { top: number; height: number }>());
  const dragKeyRef = useRef<string | null>(null);
  const dragStartIndexRef = useRef(0);
  const grabScreenTopRef = useRef(0);
  const dragDyRef = useRef(0);
  const [drag, setDrag] = useState<{ key: string; startIndex: number } | null>(null);

  const beginDrag = useCallback((key: string, startIndex: number) => {
    dragKeyRef.current = key;
    dragStartIndexRef.current = startIndex;
    const pos = positionsRef.current.get(key);
    grabScreenTopRef.current = pos !== undefined ? pos.top - scrollYRef.current : 0;
    dragDyRef.current = 0;
    setDrag({ key, startIndex });
  }, []);

  const dragMoveRef = useRef<(dy: number, moveY: number) => void>(() => {});
  const dragEndRef = useRef<(dy: number) => void>(() => {});

  dragMoveRef.current = (dy: number, moveY: number) => {
    const key = dragKeyRef.current;
    if (key === null) return;
    dragDyRef.current = dy;
    setDragFrame((t) => t + 1);

    const scrollNow = scrollYRef.current;
    const vTop = containerTopRef.current;
    const vBot = vTop + viewportHRef.current;
    if (viewportHRef.current <= 0) return;
    const edge = 90;
    const maxScroll = Math.max(0, contentHRef.current - viewportHRef.current);
    let target = scrollNow;
    if (moveY < vTop + edge) {
      target = scrollNow - (vTop + edge - moveY) * 1.4;
    } else if (moveY > vBot - edge) {
      target = scrollNow + (moveY - (vBot - edge)) * 1.4;
    }
    target = Math.max(0, Math.min(maxScroll, target));
    if (Math.abs(target - scrollNow) > 0.5) {
      scrollRef.current?.scrollTo({ y: target, animated: false });
      scrollYRef.current = target;
    }
  };

  dragEndRef.current = (dy: number) => {
    const key = dragKeyRef.current;
    if (key === null) return;
    dragKeyRef.current = null;
    dragDyRef.current = 0;
    setDrag(null);
    setDragFrame((t) => t + 1);

    const list = active.exercises;
    if (list.length === 0) return;
    const pos = positionsRef.current.get(key);
    if (pos === undefined) return;
    const ghostMid = grabScreenTopRef.current + dy + pos.height / 2;
    let target = 0;
    for (const o of list) {
      if (o.id === key) continue;
      const op = positionsRef.current.get(o.id);
      if (op === undefined) continue;
      const oMid = op.top - scrollYRef.current + op.height / 2;
      if (oMid < ghostMid) target += 1;
    }
    target = Math.max(0, Math.min(list.length - 1, target));
    if (target !== dragStartIndexRef.current) {
      void active.moveExerciseTo(key, target);
    }
  };

  const dragPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: () => dragKeyRef.current !== null,
        onPanResponderMove: (_e, g) => dragMoveRef.current(g.dy, g.moveY),
        onPanResponderRelease: (_e, g) => dragEndRef.current(g.dy),
        onPanResponderTerminate: (_e, g) => dragEndRef.current(g.dy),
      }),
    [],
  );

  // Target insertion slot while dragging, mapped to a screen-space drop line.
  const dragInsert = (() => {
    if (dragKeyRef.current === null) return null;
    const key = dragKeyRef.current;
    const pos = positionsRef.current.get(key);
    if (pos === undefined) return null;
    const ghostMid = grabScreenTopRef.current + dragDyRef.current + pos.height / 2;
    let target = 0;
    for (const o of active.exercises) {
      if (o.id === key) continue;
      const op = positionsRef.current.get(o.id);
      if (op === undefined) continue;
      const oMid = op.top - scrollYRef.current + op.height / 2;
      if (oMid < ghostMid) target += 1;
    }
    return Math.max(0, Math.min(active.exercises.length - 1, target));
  })();

  const dragKeyNow = dragKeyRef.current;
  const dragTranslate = (() => {
    if (dragKeyNow === null) return 0;
    const pos = positionsRef.current.get(dragKeyNow);
    if (pos === undefined) return 0;
    return grabScreenTopRef.current + dragDyRef.current - (pos.top - scrollYRef.current);
  })();

  const dragLineTop = (() => {
    if (dragKeyRef.current === null || dragInsert === null) return null;
    const key = dragKeyRef.current;
    const start = dragStartIndexRef.current;
    const pos = positionsRef.current.get(key);
    if (pos === undefined) return null;
    if (dragInsert === start) return null;
    const dir = dragInsert > start ? 1 : -1;
    const neighbour = active.exercises[dragInsert];
    if (neighbour === undefined) return null;
    const np = positionsRef.current.get(neighbour.id);
    if (np === undefined) return null;
    const y = dir > 0 ? np.top + np.height : np.top;
    return y - scrollYRef.current;
  })();

  const openPlates = useCallback((weightKg: number | null) => {
    setPlateTarget(weightKg);
    setPlateOpen(true);
  }, []);

  const confirmFinish = useCallback(() => {
    setFinishSheet(active.completedSetCount === 0 ? 'empty' : 'workout');
  }, [active]);

  const confirmDiscard = useCallback(() => {
    void active.discard().then(() => navigation.goBack());
  }, [active, navigation]);

  const discardAndClose = useCallback(() => {
    setFinishSheet(null);
    confirmDiscard();
  }, [confirmDiscard]);

  const finishAndClose = useCallback(() => {
    const id = active.workout?.id;
    setFinishSheet(null);
    if (id === undefined) {
      void active.finish().then(() => navigation.goBack());
      return;
    }
    void active.finish().then(() =>
      navigation.dispatch(StackActions.replace('WorkoutDetail', { workoutId: id })),
    );
  }, [active, navigation]);

  // A cardio activity's Finish lives in the header only (no redundant button
  // in the card). It completes the in-flight segment with its live data, then
  // finishes the workout — after an explicit confirmation.
  const finishActivity = useCallback(() => setFinishSheet('activity'), []);

  const finishActivityAndClose = useCallback(() => {
    const id = active.workout?.id;
    setFinishSheet(null);
    void (async () => {
      await activityCardRef.current?.completeSegment();
      await active.finish();
      if (id === undefined) {
        navigation.goBack();
        return;
      }
      navigation.dispatch(StackActions.replace('WorkoutDetail', { workoutId: id }));
    })();
  }, [active, navigation]);

  if (!active.isActive) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]}>
        <EmptyState
          title="No workout in progress"
          message="Start one from the Home tab or a routine."
          action={{ label: 'Close', onPress: () => navigation.goBack() }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]} edges={['top']}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderBottomColor: palette.border },
        ]}
      >
        <Row style={styles.headRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Minimise workout"
            hitSlop={10}
          >
            <Text style={{ color: palette.accent, fontSize: fontSize.md, fontWeight: '700' }}>
              Minimise
            </Text>
          </Pressable>

          {isActivity ? (
            <Pressable
              onPress={() => setEditing('name')}
              accessibilityRole="button"
              accessibilityLabel={`Workout name: ${active.workout?.name ?? ''}. Tap to rename.`}
              style={styles.activityTitleWrap}
            >
              <Text
                numberOfLines={1}
                style={[styles.activityTitle, { color: palette.text }]}
              >
                {active.workout?.name ?? 'Workout'}
              </Text>
            </Pressable>
          ) : null}

          <Button
            label="Finish"
            onPress={isActivity ? finishActivity : confirmFinish}
            style={styles.finish}
          />
        </Row>

        {!isActivity ? (
          <>
            <Pressable
              onPress={() => setEditing('name')}
              accessibilityRole="button"
              accessibilityLabel={`Workout name: ${active.workout?.name ?? ''}. Tap to rename.`}
              style={{ marginTop: spacing.sm }}
            >
              <Text
                numberOfLines={1}
                style={{ color: palette.text, fontSize: fontSize.lg, fontWeight: '700' }}
              >
                {active.workout?.name ?? 'Workout'}
              </Text>
            </Pressable>

            <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
              <Stat label="DURATION" value={formatDuration(active.elapsedSec)} />
              <Stat
                label="VOLUME"
                value={`${formatWeight(active.totalVolumeKg, settings.values.weightUnit)} ${settings.values.weightUnit}`}
              />
              <Stat label="SETS" value={`${active.completedSetCount}/${active.totalSetCount}`} />
            </Row>
          </>
        ) : null}

        {!isActivity && settings.values.heartRateEnabled ? (
          <Pressable
            onPress={() => setHrOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={
              heartRate.liveBpm !== null
                ? `Heart rate ${heartRate.liveBpm} beats per minute. Tap to change monitor.`
                : heartRate.status === 'reconnecting'
                  ? 'Heart-rate connection lost. Tap to manage the monitor.'
                  : 'Heart rate. Tap to connect a monitor.'
            }
            style={[
              styles.hrPill,
              {
                borderColor: palette.border,
                backgroundColor: heartRate.connected ? palette.surfaceRaised : palette.surface,
              },
            ]}
          >
            <View
              style={[
                styles.hrDot,
                {
                  backgroundColor: heartRate.connected
                    ? palette.success
                    : heartRate.status === 'reconnecting'
                      ? palette.accent
                      : palette.textFaint,
                },
              ]}
            />
            <Text style={{ color: palette.text, fontSize: fontSize.sm, fontWeight: '700' }}>
              {heartRate.liveBpm !== null
                ? `${heartRate.liveBpm} bpm`
                : heartRate.connected
                  ? 'Heart rate monitor connected'
                  : heartRate.status === 'reconnecting'
                    ? 'Reconnecting…'
                    : 'Heart rate'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!isActivity ? (
        <>
          <RestTimerBar />
          <PrBanner />
        </>
      ) : null}

      {isActivity ? (
        <View style={styles.screen}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            {active.exercises.map((we) => (
              <CardioActivityCard
                key={we.id}
                ref={activityCardRef}
                we={we}
                fullscreen
              />
            ))}
          </ScrollView>
        </View>
      ) : (
        <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.screen}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onLayout={(e) => {
              viewportHRef.current = e.nativeEvent.layout.height;
              (
                scrollRef.current as unknown as {
                  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
                }
              ).measureInWindow?.((_x, y) => {
                containerTopRef.current = y;
              });
            }}
            onContentSizeChange={(_w, h) => {
              contentHRef.current = h;
            }}
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
              if (dragKeyRef.current !== null) setDragFrame((t) => t + 1);
            }}
          >
            {active.exercises.length === 0 ? (
              <EmptyState
                title="Add your first exercise"
                message="Pick something from the library to start logging."
                action={{
                  label: 'Add exercise',
                  onPress: () =>
                    navigation.navigate('ExercisePicker', {
                      mode: 'workout',
                      targetId: 'active',
                    }),
                }}
              />
            ) : (
              active.exercises.map((we, index) => (
                <WorkoutExerciseCard
                  key={we.id}
                  we={we}
                  compact={drag !== null}
                  dragging={dragKeyRef.current === we.id}
                  dragTranslate={dragTranslate}
                  panHandlers={dragPan.panHandlers}
                  onLayoutCard={(top, height) => {
                    positionsRef.current.set(we.id, { top, height });
                    if (dragKeyRef.current !== null) setDragFrame((t) => t + 1);
                  }}
                  onDragStart={() => beginDrag(we.id, index)}
                  onRequestPlateCalculator={openPlates}
                />
              ))
            )}

            {active.exercises.length > 0 ? (
              <Button
                label="Add exercise"
                variant="secondary"
                onPress={() =>
                  navigation.navigate('ExercisePicker', { mode: 'workout', targetId: 'active' })
                }
                style={{ marginTop: spacing.sm }}
              />
            ) : null}

            <Pressable
              onPress={() => setEditing('notes')}
              accessibilityRole="button"
              accessibilityLabel="Workout notes"
              style={{ marginTop: spacing.lg }}
            >
              <Caption>WORKOUT NOTES</Caption>
              <Body muted style={{ marginTop: 2 }}>
                {active.workout?.notes !== null &&
                active.workout?.notes !== undefined &&
                active.workout.notes.length > 0
                  ? active.workout.notes
                  : 'Tap to add a note about this session.'}
              </Body>
            </Pressable>
          </ScrollView>

          {dragLineTop !== null ? (
            <View
              pointerEvents="none"
              style={[
                styles.dropLine,
                { top: dragLineTop, backgroundColor: palette.accent },
              ]}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
      )}

      <PlateCalculatorSheet
        visible={plateOpen}
        targetKg={plateTarget}
        onClose={() => setPlateOpen(false)}
      />

      <HeartRateSheet visible={hrOpen} onClose={() => setHrOpen(false)} />

      <PromptModal
        visible={editing === 'name'}
        title="Workout name"
        initialValue={active.workout?.name ?? ''}
        onCancel={() => setEditing(null)}
        onSubmit={(name) => {
          setEditing(null);
          if (name.trim().length === 0) return;
          void active.rename(name.trim());
        }}
      />

      <PromptModal
        visible={editing === 'notes'}
        title="Workout notes"
        initialValue={active.workout?.notes ?? ''}
        placeholder="How did it go?"
        onCancel={() => setEditing(null)}
        onSubmit={(notes) => {
          setEditing(null);
          void active.setNotes(notes);
        }}
      />

      <ActionSheet
        visible={finishSheet !== null}
        position="center"
        title={
          finishSheet === 'activity'
            ? 'Finish activity?'
            : finishSheet === 'empty'
              ? 'No sets completed'
              : 'Finish workout?'
        }
        message={
          finishSheet === 'activity'
            ? `${formatDuration(active.elapsedSec)} tracked so far.`
            : finishSheet === 'empty'
              ? 'Finish anyway and save an empty workout, or keep going?'
              : `${active.completedSetCount} set${active.completedSetCount === 1 ? '' : 's'} completed.`
        }
        actions={
          finishSheet === 'empty'
            ? [
                { key: 'keep-going', label: 'Keep going', onPress: () => setFinishSheet(null) },
                {
                  key: 'discard',
                  label: 'Discard workout',
                  destructive: true,
                  onPress: discardAndClose,
                },
              ]
            : [
                { key: 'cancel', label: 'Cancel', onPress: () => setFinishSheet(null) },
                {
                  key: 'discard',
                  label: 'Discard workout',
                  destructive: true,
                  onPress: discardAndClose,
                },
                {
                  key: 'finish',
                  label: 'Finish',
                  onPress: finishSheet === 'activity' ? finishActivityAndClose : finishAndClose,
                },
              ]
        }
        onClose={() => setFinishSheet(null)}
      />
    </SafeAreaView>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View>
      <Caption>{label}</Caption>
      <Text
        style={{
          color: palette.text,
          fontSize: fontSize.lg,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const KEEP_AWAKE_TAG = 'ironlog-workout';

/**
 * Conditional keep-awake.
 *
 * `useKeepAwake` cannot be switched off — it holds the lock for the component's
 * whole lifetime — so the imperative API is used instead, keyed on the
 * preference. Deactivation is best-effort: on Android it rejects if the Activity
 * has already gone away, which is harmless and must not surface as an unhandled
 * rejection.
 */
function useKeepAwakeIfEnabled(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let released = false;

    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

    return () => {
      if (released) return;
      released = true;
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // Activity already gone; nothing to release.
      }
    };
  }, [enabled]);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headRow: { justifyContent: 'space-between', alignItems: 'center' },
  finish: { minHeight: 38, paddingHorizontal: spacing.xl },
  activityTitleWrap: {
    position: 'absolute',
    left: 92,
    right: 92,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  dropLine: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    height: 2,
    borderRadius: 2,
  },
  hrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  hrDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
