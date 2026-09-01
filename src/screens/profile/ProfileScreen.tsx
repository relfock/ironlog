import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Caption, Card, H1, H2, Row } from '@/components/ui';
import { SettingsRow, SettingsSection } from '@/components/settings';
import { dailyStreak, groupByWeek, weeklyStreak } from '@/domain/streak';
import { formatWeight } from '@/domain/units';
import { useWorkoutHistory } from '@/hooks/useHistory';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

export const ProfileScreen = observer(function ProfileScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const settings = useSettings();
  const { workouts } = useWorkoutHistory(1000);

  const { weekStart, weeklyWorkoutGoal, weightUnit } = settings.values;

  const stats = useMemo(() => {
    const dates = workouts.map((w) => w.startedAt).sort((a, b) => a - b);
    const streak = weeklyStreak(groupByWeek(dates, weekStart), weeklyWorkoutGoal, weekStart);
    return {
      total: workouts.length,
      volume: workouts.reduce((n, w) => n + w.totalVolumeKg, 0),
      sets: workouts.reduce((n, w) => n + w.totalSets, 0),
      prs: workouts.reduce((n, w) => n + w.prCount, 0),
      streakWeeks: streak.currentWeeks,
      days: dailyStreak(dates),
    };
  }, [workouts, weekStart, weeklyWorkoutGoal]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Profile</H1>

        <Card style={{ marginTop: spacing.lg }}>
          <H2>Lifetime</H2>
          <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
            <Stat label="WORKOUTS" value={String(stats.total)} />
            <Stat label="SETS" value={String(stats.sets)} />
            <Stat label="PRs" value={String(stats.prs)} />
          </Row>
          <Row style={{ marginTop: spacing.lg, justifyContent: 'space-between' }}>
            <Stat
              label="TOTAL VOLUME"
              value={`${formatWeight(stats.volume, weightUnit)} ${weightUnit}`}
            />
            <Stat label="WEEK STREAK" value={String(stats.streakWeeks)} />
            <Stat label="DAY STREAK" value={String(stats.days)} />
          </Row>
        </Card>

        <SettingsSection title="Progress">
          <SettingsRow
            label="History"
            description="Calendar, streaks and past workouts"
            onPress={() => navigation.navigate('History')}
          />
          <SettingsRow
            label="Statistics"
            description="Volume, muscle heatmap and distribution"
            onPress={() => navigation.navigate('Statistics')}
          />
          <SettingsRow
            label="Body measurements"
            description="Weight, body fat and circumferences"
            onPress={() => navigation.navigate('Measurements')}
          />
        </SettingsSection>

        <SettingsSection title="App">
          <SettingsRow
            label="Workout settings"
            description="Timers, RPE, plate calculator and more"
            onPress={() => navigation.navigate('WorkoutSettings')}
          />
          <SettingsRow
            label="General settings"
            description="Units, week start and weekly goal"
            onPress={() => navigation.navigate('Settings')}
          />
          <SettingsRow
            label="Backup and export"
            description="Save your data, or restore from a file"
            onPress={() => navigation.navigate('DataExport')}
          />
          <SettingsRow
            label="Credits and licences"
            description="Exercise artwork attribution"
            onPress={() => navigation.navigate('Credits')}
          />
        </SettingsSection>

        <Caption style={{ marginTop: spacing.xl }}>
          IronLog stores everything on this device. There is no account and nothing is
          uploaded — which also means a backup is the only way to protect your history.
        </Caption>
      </ScrollView>
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

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
