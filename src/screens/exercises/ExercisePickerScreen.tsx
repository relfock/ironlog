import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';
import {
  addExerciseToRoutine,
  loadRoutine,
  replaceRoutineExercise,
} from '@/db/repositories/routines';
import { replaceWorkoutExerciseExerciseId } from '@/db/repositories/workouts';
import type { RootStackParamList } from '@/navigation/types';
import { pushPickerResult } from '@/screens/routines/exercisePickerBridge';
import { ExerciseLibrary } from './ExerciseLibrary';

/**
 * Hevy-style add-exercise picker: Cancel | Add Exercise | Create header, rows
 * toggle a multi-select, and the bottom bar commits everything at once.
 */
export const ExercisePickerScreen = observer(function ExercisePickerScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExercisePicker'>>();
  const active = useActiveWorkout();
  const { mode, targetId, replaceRoutineExerciseId, replaceWorkoutExerciseId, draft, replaceDraftKey } = route.params;
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = useCallback(
    (id: string) => {
      if (mode === 'replace') {
        setSelected([id]);
      } else {
        setSelected((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));
      }
    },
    [mode],
  );

  async function commit(ids: string[]) {
    if (draft) {
      if (mode === 'replace') {
        const key = replaceDraftKey;
        const id = ids[0];
        if (key === undefined || id === undefined) return;
        pushPickerResult({ action: 'replace', draftExerciseKey: key, newExerciseId: id });
      } else {
        pushPickerResult({ action: 'add', exerciseIds: ids });
      }
      return;
    }

    if (mode === 'replace') {
      const id = ids[0];
      if (id === undefined) return;
      if (replaceWorkoutExerciseId !== undefined) {
        const isActive = active.workout?.id === targetId;
        await replaceWorkoutExerciseExerciseId(replaceWorkoutExerciseId, id);
        if (isActive) await active.replaceExercise(replaceWorkoutExerciseId, id);
      } else if (replaceRoutineExerciseId !== undefined) {
        await replaceRoutineExercise(replaceRoutineExerciseId, id);
      }
    } else if (mode === 'workout') {
      for (const id of ids) await active.addExercise(id);
    } else {
      const routine = await loadRoutine(targetId);
      const base = routine?.exercises.length ?? 0;
      let i = 0;
      for (const id of ids) {
        await addExerciseToRoutine(targetId, id, base + i);
        i++;
      }
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={[styles.headerLink, { color: palette.accent }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]}>
          {mode === 'replace' ? 'Replace Exercise' : 'Add Exercise'}
        </Text>
        {mode !== 'replace' ? (
          <Pressable
            onPress={() => navigation.navigate('CustomExercise')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Create"
          >
            <Text style={[styles.headerLink, { color: palette.accent }]}>Create</Text>
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ExerciseLibrary
        selectable
        onPress={(e) => toggle(e.id)}
        selectedIds={selected}
        onAddSelection={(ids) => {
          void commit(ids).then(() => navigation.goBack());
        }}
        onCreateCustom={() => navigation.navigate('CustomExercise')}
        autoFocus
      />
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  headerLink: { fontSize: fontSize.md, fontWeight: '600' },
});