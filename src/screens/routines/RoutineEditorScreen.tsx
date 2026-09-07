import {
  useFocusEffect,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MuscleMap } from '@/components/MuscleMap';
import { ActionSheet } from '@/components/ActionSheet';
import { PromptModal } from '@/components/PromptModal';
import { RestPickerSheet } from '@/components/RestPickerSheet';
import { Body, Button, Caption, Card, H1, H2, Pill, Row } from '@/components/ui';
import { RoutineSetRow, COL_BADGE, COL_WEIGHT, COL_UNIT, COL_REPS } from './RoutineSetRow';
import { exerciseBySlug } from '@/data/exercises';
import {
  saveRoutineDraft,
  type DraftExerciseData,
  type DraftRoutineData,
  type DraftSetData,
} from '@/db/repositories/routines';
import {
  hasDistance,
  hasDuration,
  hasReps,
  hasWeight,
} from '@/domain/types';
import { formatDuration } from '@/domain/units';
import { useRoutine } from '@/hooks/useRoutines';
import type { RootStackParamList } from '@/navigation/types';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { consumePickerResult } from './exercisePickerBridge';
import { getExercise } from '@/db/repositories/exercises';

const TIMER_XML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="8" cy="8.5" r="6.5" stroke="currentColor" stroke-width="1.2"/>
  <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function tempKey(): string {
  return `temp-${Date.now()}-${(_seq += 1)}`;
}

function draftFromRoutine(r: import('@/db/repositories/routines').RoutineData): DraftRoutineData {
  return {
    name: r.name,
    exercises: r.exercises.map((re) => ({
      key: re.id,
      dbId: re.id,
      exerciseId: re.exerciseId,
      exerciseName: re.exerciseName,
      trackingType: re.trackingType,
      artKey: re.artKey,
      primaryMuscles: re.primaryMuscles,
      secondaryMuscles: re.secondaryMuscles,
      supersetGroup: re.supersetGroup,
      restSec: re.restSec,
      notes: re.notes,
      sets: re.sets.map((s) => ({
        key: s.id,
        dbId: s.id,
        setType: s.setType,
        targetWeightKg: s.targetWeightKg,
        targetReps: s.targetReps,
        targetRepsMax: s.targetRepsMax,
        targetDurationSec: s.targetDurationSec,
        targetDistanceM: s.targetDistanceM,
        targetRpe: s.targetRpe,
      })),
    })),
  };
}

/**
 * Build a draft exercise from its DB row (the picker hands over exercise ids,
 * not catalogue slugs — custom exercises have no slug at all). `artKey` is the
 * DB's art key (the catalogue slug for seeded exercises, null for custom), so
 * the editor's muscle art and the persisted routine both resolve correctly.
 */
function buildDraftExercise(
  exercise: import('@/db/repositories/exercises').Exercise,
  key?: string,
  dbId?: string,
): DraftExerciseData {
  const makeSet = (i: number): DraftSetData => ({
    key: `s-${tempKey()}-${i}`,
    setType: 'normal',
    targetWeightKg: null,
    targetReps: null,
    targetRepsMax: null,
    targetDurationSec: null,
    targetDistanceM: null,
    targetRpe: null,
  });
  return {
    key: key ?? tempKey(),
    dbId,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    trackingType: exercise.trackingType,
    artKey: exercise.artKey,
    primaryMuscles: [...exercise.primary],
    secondaryMuscles: [...exercise.secondary],
    supersetGroup: null,
    restSec: null,
    notes: null,
    sets: [makeSet(0), makeSet(1), makeSet(2)],
  };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const RoutineEditorScreen = observer(function RoutineEditorScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'RoutineEditor'>>();
  const routineId = route.params?.routineId;
  const { routine } = useRoutine(routineId);
  const active = useActiveWorkout();

  const [draft, setDraft] = useState<DraftRoutineData | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [restSheetKey, setRestSheetKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; startIndex: number } | null>(null);
  // Bumped on every pan/scroll/layout while dragging so render-time drag
  // geometry (ghost translation, drop line) stays derived from fresh refs.
  const [, setDragFrame] = useState(0);
  const [discardVisible, setDiscardVisible] = useState(false);
  const savedRef = useRef(false);

  // Initialise draft from DB on first load.
  useEffect(() => {
    if (routine !== null && draft === null) {
      setDraft(draftFromRoutine(routine));
    }
  }, [routine]);

  const initialJson = useMemo(
    () => (routine !== null ? JSON.stringify(draftFromRoutine(routine)) : ''),
    [routine],
  );

  const draftJson = useMemo(() => (draft !== null ? JSON.stringify(draft) : ''), [draft]);
  const isDirty = draft !== null && draftJson !== initialJson;

  // ---------------------------------------------------------------------------
  // Dirty guard: confirm on back / Cancel
  // ---------------------------------------------------------------------------

  const pendingActionRef = useRef<(() => void) | null>(null);

  const closeDiscard = useCallback(() => {
    pendingActionRef.current = null;
    setDiscardVisible(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    const go = pendingActionRef.current;
    pendingActionRef.current = null;
    setDiscardVisible(false);
    go?.();
  }, []);

  const openDiscard = useCallback((afterDiscard: () => void) => {
    pendingActionRef.current = afterDiscard;
    setDiscardVisible(true);
  }, []);

  usePreventRemove(isDirty, ({ data }) => {
    if (savedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    openDiscard(() => navigation.dispatch(data.action));
  });

  // ---------------------------------------------------------------------------
  // Sticky header buttons
  // ---------------------------------------------------------------------------

  const handleCancel = useCallback(() => {
    if (!isDirty) {
      navigation.goBack();
      return;
    }
    openDiscard(() => navigation.goBack());
  }, [isDirty, navigation, openDiscard]);

  const handleUpdate = useCallback(async () => {
    if (draft === null || routineId === undefined) return;
    await saveRoutineDraft(routineId, draft);
    savedRef.current = true;
    navigation.goBack();
  }, [draft, routineId, navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={handleCancel} hitSlop={10} accessibilityLabel="Cancel">
          <Text style={{ color: palette.accent, fontSize: fontSize.md, fontWeight: '600' }}>
            Cancel
          </Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={handleUpdate}
          disabled={!isDirty}
          hitSlop={10}
          accessibilityLabel="Update routine"
          style={[
            styles.headerUpdate,
            isDirty
              ? { backgroundColor: palette.accent }
              : { backgroundColor: palette.surface },
          ]}
        >
          <Text
            style={{ color: isDirty ? palette.accentText : palette.textMuted, fontSize: fontSize.sm, fontWeight: '800' }}
          >
            Update
          </Text>
        </Pressable>
      ),
    });
  }, [handleCancel, handleUpdate, isDirty, palette, navigation]);

  // ---------------------------------------------------------------------------
  // Consume exercise-picker results on focus
  // ---------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      const result = consumePickerResult();
      if (result === null || draft === null) return;
      if (result.action === 'add') {
        void (async () => {
          const rows: DraftExerciseData[] = [];
          for (const id of result.exerciseIds) {
            const exercise = await getExercise(id);
            if (exercise !== null) rows.push(buildDraftExercise(exercise));
          }
          if (rows.length === 0) return;
          setDraft((d) => (d === null ? d : { ...d, exercises: [...d.exercises, ...rows] }));
        })();
        return;
      }
      const key = result.draftExerciseKey;
      const id = result.newExerciseId;
      if (key === undefined || id === undefined) return;
      void getExercise(id).then((exercise) => {
        if (exercise === null) return;
        setDraft((d) =>
          d === null
            ? d
            : {
                ...d,
                exercises: d.exercises.map((e) =>
                  e.key === key ? buildDraftExercise(exercise, e.key, e.dbId) : e,
                ),
              },
        );
      });
    }, [draft]),
  );

  // ---------------------------------------------------------------------------
  // Draft mutation helpers
  // ---------------------------------------------------------------------------

  const patchExercise = useCallback(
    (key: string, patch: Partial<DraftExerciseData>) => {
      setDraft((d) =>
        d === null
          ? d
          : { ...d, exercises: d.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) },
      );
    },
    [],
  );

  const removeExercise = useCallback((key: string) => {
    Alert.alert('Remove exercise?', 'This will be removed from the routine.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setDraft((d) => (d ? { ...d, exercises: d.exercises.filter((e) => e.key !== key) } : d)),
      },
    ]);
  }, []);

  const addSet = useCallback((exerciseKey: string) => {
    setDraft((d) => {
      if (d === null) return d;
      return {
        ...d,
        exercises: d.exercises.map((e) => {
          if (e.key !== exerciseKey) return e;
          const last = e.sets[e.sets.length - 1];
          const ns: DraftSetData = {
            key: tempKey(),
            setType: 'normal',
            targetWeightKg: last?.targetWeightKg ?? null,
            targetReps: last?.targetReps ?? null,
            targetRepsMax: last?.targetRepsMax ?? null,
            targetDurationSec: last?.targetDurationSec ?? null,
            targetDistanceM: last?.targetDistanceM ?? null,
            targetRpe: last?.targetRpe ?? null,
          };
          return { ...e, sets: [...e.sets, ns] };
        }),
      };
    });
  }, []);

  const patchSet = useCallback(
    (exerciseKey: string, setKey: string, patch: Partial<DraftSetData>) => {
      setDraft((d) =>
        d === null
          ? d
          : {
              ...d,
              exercises: d.exercises.map((e) =>
                e.key === exerciseKey
                  ? { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }
                  : e,
              ),
            },
      );
    },
    [],
  );

  const removeSet = useCallback((exerciseKey: string, setKey: string) => {
    setDraft((d) =>
      d === null
        ? d
        : {
            ...d,
            exercises: d.exercises.map((e) =>
              e.key === exerciseKey ? { ...e, sets: e.sets.filter((s) => s.key !== setKey) } : e,
            ),
          },
    );
  }, []);

  const toggleSuperset = useCallback(
    (key: string) => {
      setDraft((d) => {
        if (d === null) return d;
        const idx = d.exercises.findIndex((e) => e.key === key);
        if (idx <= 0) return d;
        const prev = d.exercises[idx - 1];
        const cur = d.exercises[idx];
        if (prev === undefined || cur === undefined) return d;
        if (cur.supersetGroup !== null && cur.supersetGroup === prev.supersetGroup) {
          return {
            ...d,
            exercises: d.exercises.map((e) =>
              e.key === key ? { ...e, supersetGroup: null } : e,
            ),
          };
        }
        const group = prev.supersetGroup ?? idx - 1;
        return {
          ...d,
          exercises: d.exercises.map((e) => {
            if (e.key === key) return { ...e, supersetGroup: group } as DraftExerciseData;
            if (e.key === prev.key) return { ...e, supersetGroup: group } as DraftExerciseData;
            return e as DraftExerciseData;
          }),
        };
      });
    },
    [],
  );

  const moveExercise = useCallback((key: string, delta: number) => {
    setDraft((d) => {
      if (d === null) return d;
      const idx = d.exercises.findIndex((e) => e.key === key);
      if (idx < 0) return d;
      const target = idx + delta;
      if (target < 0 || target >= d.exercises.length) return d;
      const arr = [...d.exercises];
      const [moved] = arr.splice(idx, 1);
      if (moved === undefined) return d;
      arr.splice(target, 0, moved);
      return { ...d, exercises: arr };
    });
  }, []);

  const patchRest = useCallback(
    (key: string, sec: number | null) => {
      patchExercise(key, { restSec: sec });
    },
    [patchExercise],
  );

  // ---------------------------------------------------------------------------
  // Drag-and-drop reorder
  // ---------------------------------------------------------------------------

  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const containerTopRef = useRef(0);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);
  const positionsRef = useRef(new Map<string, { top: number; height: number }>());
  const dragKeyRef = useRef<string | null>(null);
  const dragStartIndexRef = useRef(0);
  /** Finger-anchored ghost top (container space) captured when the drag begins. */
  const grabScreenTopRef = useRef(0);
  /** Latest pan dy; kept in a ref so render-time geometry can read it. */
  const dragDyRef = useRef(0);

  const reorderExercise = useCallback((key: string, to: number) => {
    setDraft((d) => {
      if (d === null) return d;
      const from = d.exercises.findIndex((e) => e.key === key);
      if (from < 0) return d;
      const arr = [...d.exercises];
      const [moved] = arr.splice(from, 1);
      if (moved === undefined) return d;
      const target = Math.max(0, Math.min(arr.length, to));
      arr.splice(target, 0, moved);
      return { ...d, exercises: arr };
    });
  }, []);

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

    const d = draft;
    if (d === null) return;
    const pos = positionsRef.current.get(key);
    if (pos === undefined) return;
    // Screen-space position (relative to the scroll container), pinned to the
    // finger so the compaction reflow and auto-scroll can't move it.
    const ghostMid = grabScreenTopRef.current + dy + pos.height / 2;
    const n = d.exercises.length;
    let target = 0;
    for (const o of d.exercises) {
      if (o.key === key) continue;
      const op = positionsRef.current.get(o.key);
      if (op === undefined) continue;
      const oMid = op.top - scrollYRef.current + op.height / 2;
      if (oMid < ghostMid) target += 1;
    }
    target = Math.max(0, Math.min(n - 1, target));
    if (target !== dragStartIndexRef.current) {
      reorderExercise(key, target);
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
    const d = draft;
    if (d === null || dragKeyRef.current === null) return null;
    const key = dragKeyRef.current;
    const pos = positionsRef.current.get(key);
    if (pos === undefined) return null;
    const ghostMid = grabScreenTopRef.current + dragDyRef.current + pos.height / 2;
    let target = 0;
    for (const o of d.exercises) {
      if (o.key === key) continue;
      const op = positionsRef.current.get(o.key);
      if (op === undefined) continue;
      const oMid = op.top - scrollYRef.current + op.height / 2;
      if (oMid < ghostMid) target += 1;
    }
    return Math.max(0, Math.min(d.exercises.length - 1, target));
  })();

  // Vertical offset applied to the dragged card so the compact title strip
  // stays pinned under the finger while the list reflows to compact rows and
  // while auto-scroll moves the content.
  const dragKeyNow = dragKeyRef.current;
  const dragTranslate = (() => {
    if (dragKeyNow === null) return 0;
    const pos = positionsRef.current.get(dragKeyNow);
    if (pos === undefined) return 0;
    return grabScreenTopRef.current + dragDyRef.current - (pos.top - scrollYRef.current);
  })();

  const dragLineTop = (() => {
    const d = draft;
    if (d === null || dragKeyRef.current === null || dragInsert === null) return null;
    const key = dragKeyRef.current;
    const start = dragStartIndexRef.current;
    const pos = positionsRef.current.get(key);
    if (pos === undefined) return null;
    if (dragInsert === start) return null;
    const dir = dragInsert > start ? 1 : -1;
    const neighbour = d.exercises[dragInsert];
    if (neighbour === undefined) return null;
    const np = positionsRef.current.get(neighbour.key);
    if (np === undefined) return null;
    const y = dir > 0 ? np.top + np.height : np.top;
    return y - scrollYRef.current;
  })();

  // ---------------------------------------------------------------------------
  // Start workout
  // ---------------------------------------------------------------------------

  const start = useCallback(async () => {
    if (routineId === undefined) return;
    if (active.isActive) {
      Alert.alert('A workout is already in progress', 'Finish or discard it first.');
      return;
    }
    await active.startFromRoutine(routineId);
    navigation.navigate('ActiveWorkout');
  }, [active, navigation, routineId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (draft === null || routine === null) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Caption>Loading…</Caption>
      </ScrollView>
    );
  }

  return (
    <>
      <View style={styles.screen}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onLayout={(e) => {
            viewportHRef.current = e.nativeEvent.layout.height;
            // Screen-space top of the scroll area, used for edge auto-scroll.
            (scrollRef.current as unknown as {
              measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
            }).measureInWindow?.((_x, y) => {
              containerTopRef.current = y;
            });
          }}
          onContentSizeChange={(_w, h) => {
            contentHRef.current = h;
          }}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
            // Keep ghost/drop-line geometry fresh while auto-scrolling a drag.
            if (dragKeyRef.current !== null) setDragFrame((t) => t + 1);
          }}
        >
          <Pressable onPress={() => setRenaming(true)} accessibilityLabel="Rename routine">
            <Row style={{ justifyContent: 'space-between' }}>
              <H1 style={{ flex: 1 }}>{draft.name}</H1>
              <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
                Rename
              </Text>
            </Row>
          </Pressable>

          <Caption style={{ marginTop: 2 }}>
            {draft.exercises.length} exercise{draft.exercises.length === 1 ? '' : 's'}
          </Caption>

          {draft.exercises.length === 0 ? (
            <Card style={{ marginTop: spacing.xl }}>
              <H2>Add your first exercise</H2>
              <Body muted style={{ marginTop: spacing.xs }}>
                Each exercise gets three working sets by default. Set target weights and rep ranges
                now, or leave them blank and fill them in as you train.
              </Body>
            </Card>
          ) : (
            draft.exercises.map((de, index) => (
              <RoutineExerciseCard
                key={de.key}
                draftExercise={de}
                compact={drag !== null}
                dragging={dragKeyRef.current === de.key}
                dragTranslate={dragTranslate}
                panHandlers={dragPan.panHandlers}
                onLayoutCard={(top, height) => {
                  positionsRef.current.set(de.key, { top, height });
                  if (dragKeyRef.current !== null) setDragFrame((t) => t + 1);
                }}
                onDragStart={() => beginDrag(de.key, index)}
                onPatch={(p) => patchExercise(de.key, p)}
                onRemove={() => removeExercise(de.key)}
                onAddSet={() => addSet(de.key)}
                onPatchSet={(setKey, p) => patchSet(de.key, setKey, p)}
                onRemoveSet={(setKey) => removeSet(de.key, setKey)}
                onMove={(delta) => moveExercise(de.key, delta)}
                onToggleSuperset={() => toggleSuperset(de.key)}
                onOpenRest={() => setRestSheetKey(de.key)}
                onOpenMenu={() => setMenuKey(de.key)}
                menuVisible={menuKey === de.key}
                onCloseMenu={() => setMenuKey(null)}
                restVisible={restSheetKey === de.key}
                onCloseRest={() => setRestSheetKey(null)}
                onPatchRest={(sec) => patchRest(de.key, sec)}
                routineId={routine.id}
              />
            ))
          )}

          <Button
            label="Add exercise"
            variant={draft.exercises.length === 0 ? 'primary' : 'secondary'}
            onPress={() =>
              navigation.navigate('ExercisePicker', {
                mode: 'routine',
                targetId: routine.id,
                draft: true,
              })
            }
            style={{ marginTop: spacing.lg }}
          />

          {draft.exercises.length > 0 ? (
            <Button
              label="Start this routine"
              onPress={() => void start()}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
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

      <PromptModal
        visible={renaming}
        title="Routine name"
        initialValue={draft.name}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          setRenaming(false);
          if (name.trim().length === 0) return;
          setDraft((d) => (d ? { ...d, name: name.trim() } : d));
        }}
      />

      <ActionSheet
        visible={discardVisible}
        title="Discard changes?"
        position="center"
        onClose={closeDiscard}
        actions={[
          { key: 'discard', label: 'Discard changes', destructive: true, onPress: confirmDiscard },
          { key: 'cancel', label: 'Cancel', onPress: closeDiscard },
        ]}
      />
    </>
  );
});

// ---------------------------------------------------------------------------
// RoutineExerciseCard
// ---------------------------------------------------------------------------

const RoutineExerciseCard = observer(function RoutineExerciseCard({
  draftExercise: de,
  onPatch,
  onRemove,
  onAddSet,
  onPatchSet,
  onRemoveSet,
  onMove,
  onToggleSuperset,
  onOpenRest,
  onOpenMenu,
  menuVisible,
  onCloseMenu,
  restVisible,
  onCloseRest,
  onPatchRest,
  dragging,
  compact,
  dragTranslate,
  panHandlers,
  onLayoutCard,
  onDragStart,
  routineId,
}: {
  draftExercise: DraftExerciseData;
  onPatch: (p: Partial<DraftExerciseData>) => void;
  onRemove: () => void;
  onAddSet: () => void;
  onPatchSet: (setKey: string, p: Partial<DraftSetData>) => void;
  onRemoveSet: (setKey: string) => void;
  onMove: (delta: number) => void;
  onToggleSuperset: () => void;
  onOpenRest: () => void;
  onOpenMenu: () => void;
  menuVisible: boolean;
  onCloseMenu: () => void;
  restVisible: boolean;
  onCloseRest: () => void;
  onPatchRest: (sec: number | null) => void;
  dragging: boolean;
  /** Title-only strip mode while a reorder drag is active. */
  compact: boolean;
  dragTranslate: number;
  panHandlers: import('react-native').GestureResponderHandlers;
  onLayoutCard: (top: number, height: number) => void;
  onDragStart: () => void;
  routineId: string;
}) {
  const palette = usePalette();
  const navigation = useNavigation();

  const regions = useMemo(() => exerciseBySlug(de.artKey)?.regions ?? null, [de.artKey]);

  const repsMode: 'single' | 'range' = de.sets.some((s) => s.targetRepsMax !== null)
    ? 'range'
    : 'single';

  const toggleRepsMode = () => {
    if (repsMode === 'single') {
      // Switch to range: fill repsMax = reps for each set that has reps.
      onPatch({
        sets: de.sets.map((s) => ({
          ...s,
          targetRepsMax: s.targetReps ?? s.targetRepsMax,
        })),
      });
    } else {
      onPatch({
        sets: de.sets.map((s) => ({ ...s, targetRepsMax: null })),
      });
    }
  };

  let working = 0;
  const rows = de.sets.map((s) => {
    if (s.setType === 'normal') working += 1;
    return { set: s, workingIndex: working };
  });

  const showRestTitle =
    de.restSec === null ? 'Rest Timer: OFF' : `Rest Timer: ${formatDuration(de.restSec)}`;

  return (
    <View
      onLayout={(e) => {
        const l = e.nativeEvent.layout;
        onLayoutCard(l.y, l.height);
      }}
      style={[
        styles.cardWrap,
        dragging && styles.cardDragging,
        dragging ? { transform: [{ translateY: dragTranslate }] } : null,
      ]}
    >
      <Card style={compact ? styles.compactCard : undefined}>
        {/* The title row is ALWAYS mounted: while dragging, its wrapper view
            owns the pan responder, so unmounting it would kill the gesture.
            Compact mode just hides everything below the title. */}
        <Row style={[styles.titleRow, compact && styles.titleRowCompact]}>
          <MuscleMap
            regions={regions}
            primary={de.primaryMuscles as import('@/domain/types').Muscle[]}
            secondary={de.secondaryMuscles as import('@/domain/types').Muscle[]}
            size={compact ? 34 : 54}
          />
          <View style={{ flex: 1 }} {...panHandlers}>
            <Pressable
              style={{ alignSelf: 'stretch' }}
              onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: de.exerciseId })}
              onLongPress={onDragStart}
              accessibilityLabel={`${de.exerciseName} details. Long press to reorder.`}
            >
              <Text
                numberOfLines={1}
                style={[styles.exerciseTitle, { color: palette.accent }]}
              >
                {de.exerciseName}
              </Text>
              {!compact && de.supersetGroup !== null ? (
                <Pill label={`SUPERSET ${de.supersetGroup + 1}`} tone={palette.accent} />
              ) : null}
            </Pressable>
          </View>
          {!compact ? (
            <Pressable onPress={onOpenMenu} hitSlop={10} accessibilityLabel="Menu">
              <Text style={{ color: palette.textMuted, fontSize: fontSize.xl }}>⋮</Text>
            </Pressable>
          ) : (
            <Text style={{ color: palette.textFaint, fontSize: fontSize.xl }}>⋯</Text>
          )}
        </Row>

        {!compact ? (
          <>
            {/* Column headers */}
            <Row style={[styles.headerRow, { borderBottomColor: palette.border }]}>
              <View style={styles.badgeSpacer}>
                <Caption style={{ textAlign: 'center' }}>SET</Caption>
              </View>
              {hasWeight(de.trackingType) ? (
                <View style={styles.weightHeader}>
                  <Caption style={{ textAlign: 'center' }}>KG</Caption>
                </View>
              ) : null}
              {hasReps(de.trackingType) ? (
                <Pressable
                  onPress={toggleRepsMode}
                  style={[
                    styles.repsHeader,
                    !(
                      hasWeight(de.trackingType) ||
                      hasDistance(de.trackingType) ||
                      hasDuration(de.trackingType)
                    ) && styles.repsHeaderFill,
                  ]}
                >
                  <Caption style={{ textAlign: 'center' }}>
                    {repsMode === 'single' ? 'REPS' : 'REP RANGE'}{' '}
                    <Text style={{ fontSize: fontSize.xs }}>▼</Text>
                  </Caption>
                </Pressable>
              ) : null}
              {hasDistance(de.trackingType) ? (
                <View style={styles.unitHeader}>
                  <Caption style={{ textAlign: 'center' }}>DIST</Caption>
                </View>
              ) : null}
              {hasDuration(de.trackingType) ? (
                <View style={styles.unitHeader}>
                  <Caption style={{ textAlign: 'center' }}>TIME</Caption>
                </View>
              ) : null}
            </Row>

            {/* Set rows */}
            {rows.map(({ set, workingIndex }) => (
              <RoutineSetRow
                key={set.key}
                draftExercise={de}
                draftSet={set}
                workingIndex={workingIndex}
                onPatchSet={onPatchSet}
                onRemoveSet={onRemoveSet}
                repsMode={repsMode}
              />
            ))}

            <Pressable
              onPress={onAddSet}
              accessibilityRole="button"
              accessibilityLabel="Add planned set"
              style={[styles.addSet, { borderColor: palette.border }]}
            >
              <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
                + Add set
              </Text>
            </Pressable>

            {/* Rest timer row */}
            <Pressable
              onPress={onOpenRest}
              accessibilityRole="button"
              accessibilityLabel={showRestTitle}
              style={({ pressed }) => [
                styles.restRow,
                { borderTopColor: palette.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <SvgXml
                xml={TIMER_XML}
                width={16}
                height={16}
                color={palette.accent}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
                {showRestTitle}
              </Text>
            </Pressable>

            {/* Exercise menu */}
            <ActionSheet
              visible={menuVisible}
              title={de.exerciseName}
              onClose={onCloseMenu}
              actions={[
                {
                  key: 'superset',
                  label:
                    de.supersetGroup !== null ? 'Remove from superset' : 'Superset with above',
                  onPress: () => {
                    onCloseMenu();
                    onToggleSuperset();
                  },
                },
                { key: 'up', label: 'Move up', onPress: () => { onCloseMenu(); onMove(-1); } },
                { key: 'down', label: 'Move down', onPress: () => { onCloseMenu(); onMove(1); } },
                {
                  key: 'details',
                  label: 'Exercise details',
                  onPress: () => {
                    onCloseMenu();
                    navigation.navigate('ExerciseDetail', { exerciseId: de.exerciseId });
                  },
                },
                {
                  key: 'replace',
                  label: 'Replace exercise',
                  onPress: () => {
                    onCloseMenu();
                    navigation.navigate('ExercisePicker', {
                      mode: 'replace',
                      targetId: routineId,
                      replaceDraftKey: de.key,
                      draft: true,
                    });
                  },
                },
                {
                  key: 'remove',
                  label: 'Remove',
                  destructive: true,
                  onPress: () => {
                    onCloseMenu();
                    onRemove();
                  },
                },
              ]}
            />

            {/* Rest timer picker */}
            <RestPickerSheet
              visible={restVisible}
              title={`Rest timer — ${de.exerciseName}`}
              valueSec={de.restSec}
              onSelect={onPatchRest}
              onClose={onCloseRest}
            />
          </>
        ) : null}
      </Card>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  cardWrap: { marginTop: spacing.md },
  cardDragging: { zIndex: 10, elevation: 10, opacity: 0.97 },
  titleRow: { alignItems: 'flex-start' },
  titleRowCompact: { alignItems: 'center' },
  compactCard: { paddingVertical: spacing.sm },
  exerciseTitle: { fontSize: fontSize.md, fontWeight: '700' },
  dropLine: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    height: 2,
    borderRadius: 2,
  },
  headerUpdate: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSet: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    marginTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badgeSpacer: { width: COL_BADGE },
  weightHeader: { flex: 1, minWidth: COL_WEIGHT },
  repsHeader: { width: COL_REPS },
  repsHeaderFill: { flex: 1, minWidth: COL_REPS },
  unitHeader: { flex: 1, minWidth: COL_UNIT },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
