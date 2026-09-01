import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseLibrary } from './ExerciseLibrary';
import { Button, H1, Row } from '@/components/ui';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export const ExercisesScreen = observer(function ExercisesScreen() {
  const palette = usePalette();
  const navigation = useNavigation();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ExerciseLibrary
        onSelect={(e) => navigation.navigate('ExerciseDetail', { exerciseId: e.id })}
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
