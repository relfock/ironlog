import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { useRoutines } from '@/hooks/useRoutines';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export const StartWorkoutScreen = observer(function StartWorkoutScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const active = useActiveWorkout();
  const { routines } = useRoutines();

  const guardActive = (): boolean => {
    if (!active.isActive) return false;
    Alert.alert('A workout is already in progress', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open it', onPress: () => navigation.navigate('ActiveWorkout') },
    ]);
    return true;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Start a workout</H1>

        {active.isActive ? (
          <Card style={{ marginTop: spacing.lg }}>
            <H2>Workout in progress</H2>
            <Body muted style={{ marginTop: spacing.xs }}>
              {active.completedSetCount} of {active.totalSetCount} sets completed.
            </Body>
            <Button
              label="Resume workout"
              onPress={() => navigation.navigate('ActiveWorkout')}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        ) : (
          <Card style={{ marginTop: spacing.lg }}>
            <H2>Empty workout</H2>
            <Body muted style={{ marginTop: spacing.xs }}>
              Start with nothing and add exercises as you go.
            </Body>
            <Button
              label="Start empty workout"
              onPress={() => {
                if (guardActive()) return;
                void active.startEmpty().then(() => navigation.navigate('ActiveWorkout'));
              }}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        )}

        <H2 style={{ marginTop: spacing.xl }}>From a routine</H2>
        {routines.length === 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Body muted>
              No routines yet. Build one in the Routines tab, or finish a workout and save
              it as a routine.
            </Body>
            <Button
              label="Go to Routines"
              variant="secondary"
              onPress={() => navigation.navigate('Tabs', { screen: 'Routines' })}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ) : (
          routines.map((r) => (
            <Card
              key={r.id}
              style={{ marginTop: spacing.md }}
              onPress={() => {
                if (guardActive()) return;
                void active
                  .startFromRoutine(r.id)
                  .then(() => navigation.navigate('ActiveWorkout'));
              }}
              accessibilityLabel={`Start ${r.name}`}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <H2>{r.name}</H2>
                  <Caption style={{ marginTop: 2 }}>
                    {r.exerciseCount === 0
                      ? 'No exercises'
                      : r.exerciseNames.slice(0, 3).join(', ')}
                  </Caption>
                </View>
              </Row>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
