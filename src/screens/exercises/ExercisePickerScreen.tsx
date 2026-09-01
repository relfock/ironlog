import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { ExerciseLibrary } from './ExerciseLibrary';
import { addExerciseToRoutine, loadRoutine } from '@/db/repositories/routines';
import type { RootStackParamList } from '@/navigation/types';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';

/**
 * Add-exercise picker. Stays open after a selection so several exercises can be
 * added in one pass, which is how routines actually get built.
 */
export const ExercisePickerScreen = observer(function ExercisePickerScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExercisePicker'>>();
  const active = useActiveWorkout();
  const { mode, targetId } = route.params;

  async function handleSelect(exerciseId: string) {
    if (mode === 'workout') {
      await active.addExercise(exerciseId);
      return;
    }
    const routine = await loadRoutine(targetId);
    await addExerciseToRoutine(targetId, exerciseId, routine?.exercises.length ?? 0);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['bottom']}>
      <ExerciseLibrary
        onSelect={(e) => {
          void handleSelect(e.id).then(() => navigation.goBack());
        }}
        header={
          <Button
            label="+ Create a custom exercise"
            variant="secondary"
            onPress={() => navigation.navigate('CustomExercise')}
            style={{ marginBottom: 8, minHeight: 40 }}
          />
        }
      />
    </SafeAreaView>
  );
});
