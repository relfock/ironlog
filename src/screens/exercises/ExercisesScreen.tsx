import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseLibrary } from './ExerciseLibrary';
import { Button, H1, Row } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export const ExercisesScreen = observer(function ExercisesScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExerciseLibrary'>>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ExerciseLibrary
        initialMuscles={route.params?.muscles}
        onPress={(e) => navigation.navigate('ExerciseDetail', { exerciseId: e.id })}
        header={
          <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <H1>Exercises</H1>
            <Button
              label="+ New"
              variant="secondary"
              onPress={() => navigation.navigate('CustomExercise')}
              style={{ minHeight: 38, paddingHorizontal: spacing.lg }}
            />
          </Row>
        }
      />
    </SafeAreaView>
  );
});
