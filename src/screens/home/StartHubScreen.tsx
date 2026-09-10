import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * The "Start" tab: a launcher into the two training modes.
 *
 *   • Strength Trainer — the routine catalogue (pick a routine or build one).
 *   • Activity — non-strength cardio sessions (elliptical, generic cardio).
 */
export const StartHubScreen = observer(function StartHubScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const active = useActiveWorkout();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Start</H1>

        <Card style={{ marginTop: spacing.lg }}>
          <H2>💪 Strength Trainer</H2>
          <Body muted style={{ marginTop: spacing.xs }}>
            Follow a routine or track sets, reps and weight for strength training.
          </Body>
          <Button
            label="Open Strength Trainer"
            onPress={() => navigation.navigate('StrengthTrainer')}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <H2>🏃 Activity</H2>
          <Body muted style={{ marginTop: spacing.xs }}>
            Track cardio by heart rate — elliptical, or a generic cardio session.
          </Body>
          {active.isActive ? (
            <Button
              label="Resume activity"
              variant="secondary"
              onPress={() => navigation.navigate('ActiveWorkout')}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <Button
              label="Start an activity"
              onPress={() => navigation.navigate('Activities')}
              style={{ marginTop: spacing.md }}
            />
          )}
        </Card>

        {active.isActive ? (
          <Caption style={{ marginTop: spacing.md, textAlign: 'center' }}>
            A session is in progress — {active.completedSetCount} of {active.totalSetCount}{' '}
            segments completed.
          </Caption>
        ) : null}

        <Row style={{ marginTop: spacing.xl, justifyContent: 'center' }}>
          <Caption>Everything is stored on this device.</Caption>
        </Row>
      </ScrollView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
